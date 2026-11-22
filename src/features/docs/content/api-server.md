Trusted server routes are for your game backend, never for a shipped client. They use one
environment-scoped credential:

```http
X-Server-Credential: <prefix.secret>
```

The credential selects the project and environment. A player outside that environment is
`404`. The credential is shown once when issued and stored only as a hash; revoke it if it
leaks.

## Player writes

| Method | Path | Body |
|---|---|---|
| `POST` | `/v1/server/players/{playerId}/items/grant` | `{item_key, quantity, reason?, reference?}` |
| `POST` | `/v1/server/players/{playerId}/currency/credit` | `{currency_key, amount, reason?, reference?}` |
| `POST` | `/v1/server/players/{playerId}/xp/award` | `{amount, reason?, reference?}` |
| `POST` | `/v1/server/players/{playerId}/stats/{statKey}/increment` | `{amount, reason?, reference?}` |
| `POST` | `/v1/server/players/{playerId}/flags/{flagKey}/set` | Optional `{reason?, reference?}` |

Every write needs `Idempotency-Key`. Amounts and quantities must be positive. These are the
only ways to move trusted value: a player token cannot grant, credit, award XP, increment a
stat or set a flag.

```bash
curl -s "http://localhost:8080/v1/server/players/$PLAYER_ID/items/grant" \
  -H 'X-Server-Credential: rs_demo.realmstack-local-server-secret' \
  -H 'Idempotency-Key: match-981-reward-1' \
  -H 'Content-Type: application/json' \
  -d '{"item_key":"plasma_rifle","quantity":1,"reason":"match_reward","reference":"match-981"}'
```

## Player reads and claims

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/server/players/{playerId}/stats` | Counters and flags |
| `GET` | `/v1/server/players/{playerId}/achievements` | Unmasked progress |
| `POST` | `/v1/server/players/{playerId}/achievements/{key}/claim` | Claim any completed achievement |
| `GET` | `/v1/server/players/{playerId}/quests` | Unmasked quest log |
| `POST` | `/v1/server/players/{playerId}/quests/{key}/accept` | Accept for the player |
| `POST` | `/v1/server/players/{playerId}/quests/{key}/claim` | Claim any completed quest rewards |

The server claim routes ignore the claim policy. Use them when conditions depend on data
the player submits, such as leaderboard scores, and set `claimable_by: "server"` so the
player cannot self-claim. A server token can read achievements and quests unmasked,
including hidden achievements.

The server route set does not include inventory, currency or progression reads. Use the
player routes for those, or the dashboard for support.

## Cloud saves

| Method | Path |
|---|---|
| `GET` | `/v1/server/players/{playerId}/saves` |
| `GET` | `/v1/server/players/{playerId}/saves/{slot}` |
| `PUT` | `/v1/server/players/{playerId}/saves/{slot}` |
| `DELETE` | `/v1/server/players/{playerId}/saves/{slot}?expected_version=n` |

Writes require `Idempotency-Key` and may send `expected_version`. See **Cloud saves**.

## Batch writes

`POST /v1/server/batch` applies many writes across any players in the credential's
environment in one request. It is the recommended path for reporting a match result.

```json
{
  "entries": [
    {
      "type": "grant",
      "idempotency_key": "match-981-grant-p1",
      "player_id": "00000000-0000-0000-0000-000000000001",
      "item_key": "plasma_rifle",
      "quantity": 1,
      "reason": "match_reward",
      "reference": "match-981"
    },
    {
      "type": "credit",
      "idempotency_key": "match-981-credit-p1",
      "player_id": "00000000-0000-0000-0000-000000000001",
      "currency_key": "credits",
      "amount": 250,
      "reason": "match_reward",
      "reference": "match-981"
    },
    {
      "type": "xp",
      "idempotency_key": "match-981-xp-p1",
      "player_id": "00000000-0000-0000-0000-000000000001",
      "amount": 120,
      "reason": "match_complete",
      "reference": "match-981"
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `type` | `grant`, `credit`, `xp`, `stat` or `flag` |
| `idempotency_key` | Required per entry, 1–200 characters |
| `player_id` | Target player in the credential's environment |
| `item_key` / `quantity` | For `grant` |
| `currency_key` / `amount` | For `credit` |
| `amount` | For `xp` and `stat` |
| `stat_key` / `flag_key` | For `stat` / `flag` |
| `reason` / `reference` | Optional ledger metadata |

Each entry runs in its own savepoint with the normal idempotency algorithm. One failing
entry does not roll back the others. Entries for the same player apply in request order.
The HTTP status is `200` when the batch was accepted; each result has its own status:

```json
{
  "applied": 2,
  "results": [
    { "index": 0, "idempotency_key": "...", "type": "grant", "status": 201, "data": {} },
    { "index": 1, "idempotency_key": "...", "type": "credit", "status": 422, "error": { "code": "INSUFFICIENT_FUNDS", "message": "..." } }
  ]
}
```

Limits: the project's `max_batch_entries` (default 500) and the write quota. A batch that
is too large is `422 BATCH_SIZE`; an exhausted quota is `429 QUOTA_EXCEEDED`. Every entry
counts as a write.

## Errors

| Code | Status |
|---|---|
| `IDEMPOTENCY_KEY_REQUIRED` | 400 |
| `NOT_FOUND` | 404 (player outside the environment, or unknown definition) |
| `WRONG_STAT_KIND` | 422 |
| `STACK_LIMIT` / `BALANCE_LIMIT` | 422 |
| `PROGRESSION_NOT_PUBLISHED` | 422 |
| `CLAIM_NOT_ALLOWED` | 403 |
| `ALREADY_CLAIMED` / `NOT_COMPLETED` | 409 / 422 |
| `QUOTA_EXCEEDED` | 429 |
