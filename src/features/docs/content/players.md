A player belongs to exactly one project and environment. Identity is unique within that
environment, not globally. The same email may be a different player in another tenant.

![A player profile with balances, management tabs and stats and flags open](/screenshots/players.png)

## Registration and login

`POST /v1/players/register` and `POST /v1/players/login` are public routes. They select
the tenant with a **public environment identifier**, supplied as
`public_environment_id`, the legacy alias `environment_id`, or the
`X-Public-Environment` header. Internal environment UUIDs are not accepted here.

| Field | Notes |
|---|---|
| `public_environment_id` | Non-secret environment selector, for example `pub_realmstack_demo_dev` |
| `email` | Player email; normalized for uniqueness within the environment |
| `password` | Stored as a bcrypt hash; login uses a dummy hash for unknown emails to reduce timing leaks |
| `display_name` | Optional at registration; defaults are applied |

Registration and login are rate limited per IP and route. A successful call returns:

```json
{
  "player": { "id": "...", "email": "...", "display_name": "..." },
  "access_token": "<short-lived JWT>",
  "refresh_token": "<opaque token>",
  "token_type": "Bearer",
  "expires_in": 900
}
```

The access token is a bearer JWT. Send it on player routes:

```http
Authorization: Bearer <access_token>
```

Dashboard access tokens are a different token kind and cannot call player self-service
routes. Server credentials are never accepted as player tokens.

## Refresh rotation

`POST /v1/players/refresh` takes `{"refresh_token":"..."}` and returns a new access token
and a new refresh token. Refresh tokens are stored only as hashes. Each token belongs to a
family; if a revoked token is reused, the whole family is revoked and the call answers
`401 REFRESH_TOKEN_REUSE`. That is the reuse-detection behaviour that protects a stolen
token.

Clients should:

1. Store the refresh token in platform-secure storage, not in version control.
2. Refresh before the access token expires (for example one minute early).
3. Serialize refresh calls so two devices do not rotate the same token concurrently.
4. Treat `REFRESH_TOKEN_REUSE` as "sign in again"; the old family is gone.

A banned player is refused at login (only after a correct password), at refresh, and on
every route that accepts a player token. See **Moderation and bans** below.

## Profile

`GET /v1/players/me` returns the player's profile. `PATCH /v1/players/me` updates
`display_name` and metadata. Profiles never expose the password hash or token material.

The profile is player-owned data. A game should treat metadata as display data, not as
authoritative progression: grants, currency, XP, stats and claims go through their own
routes.

## Player access

A player token can read and change only the player's own state:

- inventory and currency balances
- own transaction history and progression
- own stats and flags
- own achievements and quest log
- own cloud saves
- spend currency, consume and equip items
- accept, abandon and claim quests with claim policy `player`
- claim achievements with claim policy `player`
- submit a score

A player token cannot grant items, credit currency, award XP, increment a counter, set a
flag, claim a server-policy goal, or act on another player. Those require a trusted server
credential or the dashboard's player-management routes.

## Moderation and bans

Only the dashboard can ban. A ban has a reason (shown to the player), an optional
`expires_at` (omit for permanent), and a dashboard user as `created_by`.

```http
POST /v1/projects/{projectId}/environments/{envId}/players/{playerId}/ban
Authorization: Bearer <dashboard token>
Idempotency-Key: ban-2026-11-22-1
Content-Type: application/json

{ "reason": "Cheating in ranked", "expires_at": "2026-12-01T00:00:00Z" }
```

- Banning a banned player replaces the ban in force; the earlier row is kept as history.
- A ban revokes every refresh token in the same transaction.
- `POST .../ban/lift` ends the ban in force and answers `422 NOT_BANNED` when there is
  none.
- `GET .../bans` returns the history with a derived `status`: `active`, `expired`,
  `lifted` or `replaced`.
- The player list has a `banned` flag and `?banned=true`; the profile includes the ban in
  force.

Enforcement returns:

```json
{
  "error": {
    "code": "PLAYER_BANNED",
    "message": "This player account is banned.",
    "details": { "reason": "Cheating in ranked", "expires_at": "2026-12-01T00:00:00Z" }
  },
  "meta": { "request_id": "..." }
}
```

The trusted game server and the dashboard can still act on a banned player, for example to
settle a match or correct a balance. Existing leaderboard scores stay visible. An expired
ban stops applying without a job because expiry is compared on every check.

## Player management

Players never use the dashboard. Project owners manage them from the dashboard's
**Players** screen, which uses dashboard-token admin routes. Those routes run the same
handlers and transaction functions as the game, so every rule (balance, stack, claim,
idempotency) holds. See the **Player management** guide for the full list.

## Related

- **Inventory and economy** for spends, grants and balances.
- **Cloud saves** for versioned JSON slots.
- **Player management** for dashboard actions and the ban UI.
- **API reference → Player routes** for every request shape.
