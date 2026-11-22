Cloud saves let a player continue on another device. Each player has a small set of named
JSON slots, and every write carries a version so two devices cannot silently overwrite each
other.

## Limits

| Limit | Value |
|---|---|
| Slots per player | 10 |
| Size per save | 256 KiB, measured as compacted JSON |
| Request body | 1 MiB (the API-wide limit) |
| Slot name | `^[a-z0-9][a-z0-9_-]{0,62}$` |
| Data | Any JSON value except `null` |

These are constants in the backend, not per-project settings. A save is state, not a
ledger: earlier versions are not kept.

## Versions and optimistic concurrency

Every write replaces the slot and increments `version`. The first write creates version 1.

`expected_version` tells the server which version the client last saw:

| `expected_version` | Meaning |
|---|---|
| Omitted | Last write wins |
| `0` | The slot must not exist yet; used to create |
| `n > 0` | The slot must currently be version `n` |

A mismatch is refused with `409 SAVE_VERSION_CONFLICT` and the current version in
`details.current_version`, so the game can decide how to merge. This is what prevents two
devices from clobbering each other.

## Routes

The same handlers serve three callers:

| Caller | Base route |
|---|---|
| Player | `/v1/players/me/saves` |
| Trusted server | `/v1/server/players/{playerId}/saves` |
| Dashboard | `/v1/projects/{projectId}/environments/{envId}/players/{playerId}/saves` |

| Method | Path | Result |
|---|---|---|
| `GET` | `.../saves` | Slot summaries, no data; `meta.max_slots`, `meta.max_bytes` |
| `GET` | `.../saves/{slot}` | Summary plus `data` |
| `PUT` | `.../saves/{slot}` | `201` created, `200` replaced; returns the summary |
| `DELETE` | `.../saves/{slot}?expected_version=n` | Removes the slot |

Writes require `Idempotency-Key`. The stored idempotency result is the summary, not the
data, so a replay returns the same summary without resending the save.

## Example

```bash
curl -s -X PUT http://localhost:8080/v1/players/me/saves/slot1 \
  -H "Authorization: Bearer $PLAYER_TOKEN" \
  -H 'Idempotency-Key: save-slot1-v3' \
  -H 'Content-Type: application/json' \
  -d '{
    "data": { "chapter": 3, "position": { "x": 12, "y": -4 }, "inventory": ["torch"] },
    "expected_version": 2
  }'
```

```json
{
  "slot": "slot1",
  "version": 3,
  "size_bytes": 74,
  "created_at": "2026-11-01T10:00:00Z",
  "updated_at": "2026-11-22T12:00:00Z"
}
```

A stale write:

```json
{
  "error": {
    "code": "SAVE_VERSION_CONFLICT",
    "message": "The save was changed by another device.",
    "details": { "current_version": 3 }
  },
  "meta": { "request_id": "..." }
}
```

Other failures:

| Code | Status | When |
|---|---|---|
| `SAVE_TOO_LARGE` | 422 | Compacted JSON exceeds 256 KiB |
| `SAVE_SLOT_LIMIT` | 422 | Creating an eleventh slot |
| `VALIDATION_ERROR` | 422 | Invalid slot name, null data, or invalid `expected_version` |
| `NOT_FOUND` | 404 | Reading or deleting a slot that does not exist |

## Trust model

Saves are client-authoritative when the client writes them. A game that must not trust its
client should write saves only from its server, using the server routes. The dashboard can
read and repair saves through the same handlers, which is useful for support.

## Dashboard

The Players screen's **Saves** tab lists slots, shows a JSON editor keyed by
`slot:version`, sends `expected_version` with writes, and confirms deletion. Writes are
idempotent and versioned exactly like the game routes.

## Related

- **Player management** for the dashboard tab.
- **API reference → Player routes** for exact request shapes.
