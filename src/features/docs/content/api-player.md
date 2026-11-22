Player routes use a player access token:

```http
Authorization: Bearer <player access token>
```

Registration and login are public and select the tenant with a public environment ID.

## Registration and login

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/v1/players/register` | Public | Create a player; rate limited |
| `POST` | `/v1/players/login` | Public | Sign in; rate limited |
| `POST` | `/v1/players/refresh` | Refresh token | Rotate the refresh token |

```json
{
  "public_environment_id": "pub_realmstack_demo_dev",
  "email": "player@example.com",
  "password": "A-long-password",
  "display_name": "Rookie Pilot"
}
```

`environment_id` is accepted as an alias for `public_environment_id`; an internal UUID is
not accepted. The response has `player`, `access_token`, `refresh_token`, `token_type` and
`expires_in`.

```json
{ "refresh_token": "<opaque token>" }
```

Rotation returns a new pair. Reuse of a revoked token is `401 REFRESH_TOKEN_REUSE` and
revokes the family. A banned player is `403 PLAYER_BANNED`.

## Profile

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/players/me` | Read the profile |
| `PATCH` | `/v1/players/me` | Update display name and metadata |

## Inventory

| Method | Path | Body |
|---|---|---|
| `GET` | `/v1/players/me/inventory` | — |
| `GET` | `/v1/players/me/inventory/{itemKey}` | — |
| `POST` | `/v1/players/me/inventory/consume` | `{item_key, quantity, reason?, reference?}` |
| `POST` | `/v1/players/me/inventory/equip` | `{item_key, slot}` |
| `POST` | `/v1/players/me/inventory/unequip` | `{slot}` |

Writes need `Idempotency-Key`. A consume above the owned quantity is
`422 INSUFFICIENT_ITEMS`; equipping an item without a slot is `422 ITEM_NOT_EQUIPPABLE`.

## Economy

| Method | Path | Body / query |
|---|---|---|
| `GET` | `/v1/players/me/currency` | — |
| `POST` | `/v1/players/me/currency/spend` | `{currency_key, amount, reason?, reference?}` |
| `GET` | `/v1/players/me/transactions?limit=&cursor=` | Newest first |

```bash
curl -s http://localhost:8080/v1/players/me/currency/spend \
  -H "Authorization: Bearer $PLAYER_TOKEN" \
  -H 'Idempotency-Key: shop-order-77' \
  -H 'Content-Type: application/json' \
  -d '{"currency_key":"credits","amount":250,"reason":"shop_purchase","reference":"shop-order-77"}'
```

A balance below zero is never written. An insufficient balance is `422 INSUFFICIENT_FUNDS`.

## Progression and stats

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/players/me/progression` | `total_xp`, `level`, `version`, `thresholds` |
| `GET` | `/v1/players/me/stats` | Own counters and flags |

Players cannot award XP or write stats. Those are trusted server routes.

## Achievements

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/players/me/achievements` | Status and per-condition progress |
| `POST` | `/v1/players/me/achievements/{key}/claim` | Claim a completed `player` policy goal |

A hidden achievement still in progress is masked to the player. A claim of a `server`
policy goal is `403 CLAIM_NOT_ALLOWED`; an incomplete goal is `422 NOT_COMPLETED`; a second
claim is `409 ALREADY_CLAIMED`.

## Quests

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/players/me/quests` | Quest log with stage progress |
| `POST` | `/v1/players/me/quests/{key}/accept` | Accept an available quest |
| `POST` | `/v1/players/me/quests/{key}/abandon` | Abandon an active quest |
| `POST` | `/v1/players/me/quests/{key}/claim` | Claim earned stage/completion rewards |

Accept can fail with `409 QUEST_ALREADY_ACTIVE`, `422 QUEST_LOCKED`,
`422 QUEST_NOT_AVAILABLE` or `422 QUEST_EXPIRED`. Abandon requires an active quest
(`422 QUEST_NOT_ACTIVE`). Claim can return `409 ALREADY_CLAIMED` or
`422 NOT_COMPLETED`.

```bash
curl -s http://localhost:8080/v1/players/me/quests/into_the_mine/accept \
  -H "Authorization: Bearer $PLAYER_TOKEN" \
  -H 'Idempotency-Key: accept-into-the-mine-1'
```

## Leaderboards

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/leaderboards/{key}/scores` | Submit `{ "score": 18450 }` |
| `GET` | `/v1/leaderboards/{key}?limit=10` | Top entries plus the caller's rank and score |

A player token on the read includes `player_rank` and `player_score`. Without a token, use
the public environment scope documented in **Public and leaderboard routes**.

## Cloud saves

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/players/me/saves` | Slot summaries; limits in `meta` |
| `GET` | `/v1/players/me/saves/{slot}` | One save with data |
| `PUT` | `/v1/players/me/saves/{slot}` | Create or replace; optional `expected_version` |
| `DELETE` | `/v1/players/me/saves/{slot}?expected_version=n` | Delete |

```json
{ "data": { "chapter": 3 }, "expected_version": 2 }
```

The first write is version 1. A stale `expected_version` is `409 SAVE_VERSION_CONFLICT`
with `details.current_version`. See **Cloud saves**.

## Errors

Every mutation requires `Idempotency-Key`, including `PATCH /v1/players/me`. Reads do
not. Follow the contract in `openapi.yaml`; when in doubt, send a fresh key.

Player routes commonly return:

| Code | Status |
|---|---|
| `INVALID_CREDENTIALS` | 401 |
| `INVALID_REFRESH_TOKEN` | 401 |
| `REFRESH_TOKEN_REUSE` | 401 |
| `PLAYER_BANNED` | 403 |
| `CLAIM_NOT_ALLOWED` | 403 |
| `NOT_FOUND` | 404 |
| `ALREADY_CLAIMED` | 409 |
| `QUEST_ALREADY_ACTIVE` | 409 |
| `SAVE_VERSION_CONFLICT` | 409 |
| `INSUFFICIENT_FUNDS` / `INSUFFICIENT_ITEMS` | 422 |
| `NOT_COMPLETED` / `QUEST_LOCKED` | 422 |
| `VALIDATION_ERROR` | 422 |
