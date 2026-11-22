Inventory and economy are separate services that share the same guarantees: definitions
come from the published configuration, every change is idempotent, and every change writes
an immutable ledger row in the same transaction.

![The inventory and economy catalog with the item metadata map and currency editors](/screenshots/catalog.png)

## Definitions

Project admins edit definitions in the configuration draft, then publish.

### Items

| Field | Meaning |
|---|---|
| `key` | Stable catalog key, unique per environment |
| `name` | Display name |
| `category` | Free-form grouping shown in the dashboard |
| `stackable` | Whether repeated grants share one stack |
| `max_stack` | Maximum quantity in one stack; grants that would exceed it are refused |
| `metadata` | Item-specific JSON; the dashboard uses `metadata.slot` for equipment |

An item can be equipped only if it declares a slot in `metadata.slot`. A slot holds at
most one item. The dashboard's add-item form edits metadata as key/value rows; values are
parsed as JSON when possible, so numbers, booleans and nested objects keep their type.

```json
{
  "key": "health_potion",
  "name": "Health Potion",
  "category": "consumable",
  "stackable": true,
  "max_stack": 99,
  "metadata": { "healing": 50 }
}
```

### Currencies

| Field | Meaning |
|---|---|
| `key` | Stable catalog key |
| `name` | Display name |
| `active` | Whether runtime routes may use it |

Balances are integer minor units and can never be negative.

## Item operations

![A player's inventory and balances in the Players screen](/screenshots/player-inventory.png)

| Operation | Who | Request | Effect |
|---|---|---|---|
| Grant | Server or dashboard | `{item_key, quantity, reason?, reference?}` | Adds to a stack, up to `max_stack` |
| Consume | Player or dashboard | `{item_key, quantity, reason?, reference?}` | Removes quantity; refused if not owned |
| Equip | Player or dashboard | `{item_key, slot}` | Moves an owned item into a slot |
| Unequip | Player or dashboard | `{slot}` | Clears a slot |

Routes:

```text
POST /v1/server/players/{playerId}/items/grant
POST /v1/players/me/inventory/consume
POST /v1/players/me/inventory/equip
POST /v1/players/me/inventory/unequip
```

The dashboard uses the equivalent admin routes under
`/v1/projects/{projectId}/environments/{envId}/players/{playerId}/...` and the same
handlers.

All writes require an `Idempotency-Key`. Balances and stacks change in one conditional SQL
statement, so concurrent operations cannot overspend or over-stack.

Common failures:

| Code | Status | When |
|---|---|---|
| `STACK_LIMIT` | 422 | The grant would exceed `max_stack` |
| `INSUFFICIENT_ITEMS` | 422 | The player does not own enough to consume |
| `ITEM_NOT_OWNED` | 422 | Equip/unequip target is not owned |
| `ITEM_NOT_EQUIPPABLE` | 422 | The item has no equipment slot |
| `INVALID_SLOT` | 422 | The requested slot is not the item's slot |
| `NOT_FOUND` | 404 | The item key is not published in this environment |

## Currency operations

| Operation | Who | Request | Effect |
|---|---|---|---|
| Credit | Server or dashboard | `{currency_key, amount, reason?, reference?}` | Adds to the balance |
| Spend | Player or dashboard | `{currency_key, amount, reason?, reference?}` | Subtracts; refused below zero |
| Balances | Player or dashboard | — | Current balances |
| History | Player or dashboard | `?limit=&cursor=` | Newest-first ledger rows |

```bash
curl -s "http://localhost:8080/v1/server/players/$PLAYER_ID/currency/credit" \
  -H 'X-Server-Credential: rs_demo.realmstack-local-server-secret' \
  -H 'Idempotency-Key: reward-2026-11-22-1' \
  -H 'Content-Type: application/json' \
  -d '{"currency_key":"credits","amount":250,"reason":"match_reward","reference":"match-981"}'
```

```bash
curl -s http://localhost:8080/v1/players/me/currency/spend \
  -H "Authorization: Bearer $PLAYER_TOKEN" \
  -H 'Idempotency-Key: shop-order-77' \
  -H 'Content-Type: application/json' \
  -d '{"currency_key":"credits","amount":250,"reason":"shop_purchase","reference":"shop-order-77"}'
```

The spend is one atomic `UPDATE ... WHERE balance >= amount RETURNING`. If no row is
returned, the response is `422 INSUFFICIENT_FUNDS`. A credit that would exceed the
supported balance range is `422 BALANCE_LIMIT`.

## The economy ledger

`economy_transactions` records every item and currency movement:

- player and environment scope
- currency or item definition
- operation (`grant`, `consume`, `credit`, `spend`, `equip`, `unequip`)
- quantity and balance after (where it applies)
- reference and reason
- `source`: `api`, `achievement` or `quest`

The ledger is append-only: database triggers reject `UPDATE` and `DELETE`. A correction is
a compensating row with its own reason. Goal evaluation counts only `source='api'` rows, so
a reward paid by an achievement or quest never completes another goal.

Dashboard management writes also use `source='api'`, so a corrective grant still counts
toward goals. If a correction must not count, the current model has no separate source for
it.

## Example: a complete purchase

```bash
# The game server grants the item after a purchase.
curl -s "http://localhost:8080/v1/server/players/$PLAYER_ID/items/grant" \
  -H 'X-Server-Credential: rs_demo.realmstack-local-server-secret' \
  -H 'Idempotency-Key: purchase-77-item' -H 'Content-Type: application/json' \
  -d '{"item_key":"health_potion","quantity":3,"reason":"shop_purchase","reference":"order-77"}'

# The player equips an item they own.
curl -s http://localhost:8080/v1/players/me/inventory/equip \
  -H "Authorization: Bearer $PLAYER_TOKEN" \
  -H 'Idempotency-Key: equip-sword-1' -H 'Content-Type: application/json' \
  -d '{"item_key":"iron_sword","slot":"weapon"}'
```

## Related

- **Core concepts** for idempotency, ledgers and `source`.
- **Achievements** for item/currency conditions and reward claims.
- **API reference** for exact request and response fields.
