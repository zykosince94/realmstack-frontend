RealmStack cannot observe what happens inside your game. Your trusted server reports
game-world events as **stats** and **flags**. **Achievements** are passive goals evaluated
from those reports and the existing economy, XP and score ledgers.

![An achievement editor open beside the card grid](/screenshots/achievements.png)

## Stats and flags

Definitions live in the configuration draft's `stats` array.

```json
[
  { "key": "enemies_defeated", "name": "Enemies defeated", "kind": "counter" },
  { "key": "met_the_mentor", "name": "Met the mentor", "kind": "flag" }
]
```

| Kind | Write | Read |
|---|---|---|
| `counter` | Increment by a positive amount; values never decrease | Current total and ledger sum |
| `flag` | Set only; flags are never cleared | Whether it is set |

Only a trusted server credential or the dashboard may write. A player can read their own
values; the server can read any player in its environment.

```bash
curl -s "http://localhost:8080/v1/server/players/$PLAYER_ID/stats/enemies_defeated/increment" \
  -H 'X-Server-Credential: rs_demo.realmstack-local-server-secret' \
  -H 'Idempotency-Key: match-981-enemies' \
  -H 'Content-Type: application/json' \
  -d '{"amount":3,"reason":"combat","reference":"match-981"}'

curl -s "http://localhost:8080/v1/server/players/$PLAYER_ID/flags/met_the_mentor/set" \
  -H 'X-Server-Credential: rs_demo.realmstack-local-server-secret' \
  -H 'Idempotency-Key: dialogue-mentor-1'
```

Every write creates an immutable `stat_transactions` row. Increments must be positive.
Using a counter as a flag (or the reverse) is `422 WRONG_STAT_KIND`.

## The closed condition set

Achievements and quests accept 1–5 conditions from this set. Each type accepts only its own
fields. Unknown types or fields are rejected with a field-level error.

| Type | Fields | Semantics |
|---|---|---|
| `xp_total` | `target` | API-sourced XP in the window |
| `level_reached` | `target` | Pinned curve + API XP (state; window ignored) |
| `item_granted` | `item_key?`, `target` | Granted quantity; omitted key means any item |
| `item_consumed` | `item_key?`, `target` | Consumed quantity |
| `currency_earned` | `currency_key`, `target` | Credited amount |
| `currency_spent` | `currency_key`, `target` | Spent amount |
| `leaderboard_score` | `leaderboard_key`, `target` | Best score in the window/season; direction decides at-least/at-most |
| `stat` | `stat_key`, `target` | Sum of counter increments |
| `flag` | `flag_key` | Flag is set (state; window ignored) |

Achievement windows are all-time. Quest windows start at acceptance (or the period start)
and end at the earlier of the period end and the availability-window end. See **Core
concepts** for the window model.

## Achievements

An achievement is permanent and passive: it completes as soon as its conditions are met,
without the player accepting it. Each player can claim it once.

```json
{
  "key": "troll_slayer",
  "name": "Troll Slayer",
  "description": "Defeat 100 trolls.",
  "hidden": false,
  "conditions": [
    { "type": "stat", "stat_key": "enemies_defeated", "target": 100 }
  ],
  "rewards": {
    "items": [{ "item_key": "iron_sword", "quantity": 1 }],
    "currencies": [{ "currency_key": "gems", "amount": 10 }],
    "xp": 50
  },
  "claimable_by": "player"
}
```

| Field | Meaning |
|---|---|
| `hidden` | While incomplete, the player sees only the key and status; server and dashboard reads are unmasked |
| `conditions` | 1–5 conditions, all must be met |
| `rewards` | Any combination of item grants, currency credits and XP |
| `claimable_by` | `player` or `server`; choose `server` when conditions depend on player-submitted data such as scores |

### Status

Status precedence is `claimed` → `completed` → `in_progress`. It is derived on read; no
progress is stored.

### Claim

```bash
curl -s http://localhost:8080/v1/players/me/achievements/troll_slayer/claim \
  -H "Authorization: Bearer $PLAYER_TOKEN" \
  -H 'Idempotency-Key: claim-troll-slayer-1'
```

The claim algorithm:

1. Check idempotency.
2. Lock the player row.
3. Evaluate the conditions.
4. Reject if already claimed (`409 ALREADY_CLAIMED`) or nothing is complete
   (`422 NOT_COMPLETED`). A player token on a `server` policy is `403 CLAIM_NOT_ALLOWED`.
5. Apply every reward with the normal stack and balance rules, writing ledger rows tagged
   with the goal source.
6. Insert the claim row.
7. Save the idempotency result and commit.

If any reward fails (for example a full stack), the entire claim rolls back. Rewards paid
by the claim use `source='achievement'`, so they do not count toward other goals.

The dashboard ignores the claim policy for admin claims: it acts like the trusted server.
The server route can claim either policy.

## Validation

Publishing checks the whole configuration. It rejects:

- unknown condition types and fields that do not belong to the type
- references to unknown items, currencies, leaderboards, stats or flags
- a counter used as a flag, or a flag used as a counter
- non-positive targets and unreachable levels
- rewards above an item's `max_stack`
- duplicate keys
- unknown reward shapes

A single achievement edited through its definition route is shape-checked there; the
references (and quest prerequisite cycles) are checked by validate and publish. Errors are
reported as JSON paths such as `achievements[2].conditions[0].stat_key`.

## Claim statistics

`GET /v1/projects/{projectId}/environments/{envId}/achievements/stats` returns claim counts
per published achievement. It contains no player identifiers. The dashboard shows these
numbers beside the achievement list.

## Related

- **Stats and flags** are written by the trusted server.
- **Quests** share this condition set and reward application.
- **Core concepts** explains why claims use a different ledger source.
