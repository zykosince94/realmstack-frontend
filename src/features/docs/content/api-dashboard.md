All routes on this page use a dashboard user token:

```http
Authorization: Bearer <access_token>
```

Project and environment ownership is checked by middleware. A valid UUID the user does not
own is `404`, as is a player outside the owned environment.

## Authentication

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/auth/register` | Create a dashboard user |
| `POST` | `/v1/auth/login` | Sign in; returns an access token and sets the refresh cookie |
| `POST` | `/v1/auth/refresh` | Rotate the refresh cookie; returns a new access token |
| `POST` | `/v1/auth/logout` | Revoke the session and clear the cookie |

```json
{ "email": "admin@realmstack.local", "password": "RealmStackLocal!2026" }
```

## Projects and environments

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/projects` | List owned projects; `?include_archived=true` includes archived |
| `POST` | `/v1/projects` | Create a project and its default environment |
| `GET` | `/v1/projects/{projectId}` | Read a project |
| `PATCH` | `/v1/projects/{projectId}` | Update name/slug, or set `status` to `archived`/`active` |
| `GET` | `/v1/projects/{projectId}/environments` | List environments |
| `POST` | `/v1/projects/{projectId}/environments` | Create `{ "name": "production" }` |

Projects are archived, never deleted. Runtime entry points require `status='active'`.
Archiving keeps all data and stops server credentials, player registration/login/refresh
and public leaderboard reads. Already-issued player access tokens run out within their
15-minute lifetime.

## Server credentials

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/projects/{projectId}/environments/{envId}/credentials` | List metadata (prefix, created, revoked) |
| `POST` | `/v1/projects/{projectId}/environments/{envId}/credentials` | Issue a credential; the secret is returned once |
| `POST` | `/v1/credentials/{id}/revoke` | Revoke a credential |

Only a hash is stored. A revoked credential stops working on that instance immediately and
on other instances within `CREDENTIAL_CACHE_TTL` (at most 60 seconds).

## Configuration

| Method | Path | Purpose |
|---|---|---|
| `GET` | `.../configurations/draft` | Read the editable draft |
| `PUT` | `.../configurations/draft` | Replace the draft |
| `POST` | `.../configurations/validate` | Validate a supplied body, or the stored draft when empty |
| `POST` | `.../configurations/publish` | Validate and publish an immutable version |
| `GET` | `.../configurations/versions` | List published versions |
| `GET` | `.../configurations/published` | Read the live configuration |
| `POST` | `.../configurations/versions/{version}/rollback` | Republish an earlier version as a new one |

The draft shape:

```json
{
  "items": [],
  "currencies": [],
  "progression": [100, 300, 700, 1500],
  "leaderboards": [],
  "stats": [],
  "achievements": [],
  "quests": [],
  "editor_layout": {}
}
```

Definition edits are available individually and update only the draft:

| Method | Path |
|---|---|
| `GET` / `POST` | `.../{items|currencies|leaderboards|stats|achievements|quests}` |
| `GET` / `PUT` / `DELETE` | `.../{items|currencies|leaderboards|stats|achievements|quests}/{key}` |
| `GET` / `PUT` | `.../progression` |

Bodies are validated and unknown fields are rejected. A single achievement or quest is
shape-checked on its definition route; references and quest prerequisite cycles are checked
by validate and publish.

Validation and publish failures return field paths:

```json
{
  "error": {
    "code": "INVALID_CONFIGURATION",
    "message": "The configuration is invalid.",
    "details": {
      "errors": [
        { "field": "achievements[2].conditions[0].stat_key", "message": "Unknown stat." }
      ]
    }
  },
  "meta": { "request_id": "..." }
}
```

## Player management

| Method | Path | Purpose |
|---|---|---|
| `GET` | `.../players?search=&limit=&cursor=&banned=true` | Searchable, cursor-paginated directory |
| `GET` | `.../players/{playerId}` | Profile, metadata, session summary, ban in force |
| `GET` | `.../players/{playerId}/inventory` | Inventory |
| `GET` | `.../players/{playerId}/currency` | Balances |
| `GET` | `.../players/{playerId}/transactions` | Economy history |
| `GET` | `.../players/{playerId}/progression` | XP and level |
| `GET` | `.../players/{playerId}/stats` | Counters and flags |
| `GET` | `.../players/{playerId}/achievements` | Progress, unmasked |
| `GET` | `.../players/{playerId}/quests` | Quest log, unmasked |
| `GET` | `.../players/{playerId}/saves` | Save slot summaries |
| `GET` | `.../players/{playerId}/saves/{slot}` | One save with data |
| `GET` | `.../players/{playerId}/bans` | Ban history |

Writes on behalf of a player:

| Method | Path |
|---|---|
| `POST` | `.../players/{playerId}/items/grant` |
| `POST` | `.../players/{playerId}/inventory/consume` |
| `POST` | `.../players/{playerId}/inventory/equip` |
| `POST` | `.../players/{playerId}/inventory/unequip` |
| `POST` | `.../players/{playerId}/currency/credit` |
| `POST` | `.../players/{playerId}/currency/spend` |
| `POST` | `.../players/{playerId}/xp/award` |
| `POST` | `.../players/{playerId}/stats/{statKey}/increment` |
| `POST` | `.../players/{playerId}/flags/{flagKey}/set` |
| `POST` | `.../players/{playerId}/achievements/{key}/claim` |
| `POST` | `.../players/{playerId}/quests/{key}/accept` |
| `POST` | `.../players/{playerId}/quests/{key}/abandon` |
| `POST` | `.../players/{playerId}/quests/{key}/claim` |
| `POST` | `.../players/{playerId}/leaderboards/{key}/scores` |
| `PUT` | `.../players/{playerId}/saves/{slot}` |
| `DELETE` | `.../players/{playerId}/saves/{slot}?expected_version=n` |

Every write needs an `Idempotency-Key`. Admin claims ignore the claim policy. Writes use
ledger source `api`.

## Bans

| Method | Path | Purpose |
|---|---|---|
| `POST` | `.../players/{playerId}/ban` | Ban or replace a ban |
| `POST` | `.../players/{playerId}/ban/lift` | Lift the ban in force |
| `GET` | `.../players/{playerId}/bans` | History |

```json
{ "reason": "Cheating in ranked", "expires_at": "2026-12-01T00:00:00Z" }
```

Omit `expires_at` for a permanent ban. A ban revokes every refresh token in the same
transaction.

## Activity and statistics

| Method | Path | Purpose |
|---|---|---|
| `GET` | `.../activity` | CCU (24 h, 15-minute buckets) and DAU (30 UTC days) |
| `GET` | `.../achievements/stats` | Claim counts per published achievement |
| `GET` | `.../quests/stats` | Acceptance, abandon and claim counts per published quest |

These contain no player identifiers.

## AI assistant

AI routes answer `503 AI_UNAVAILABLE` when the deployment has no `AI_ENCRYPTION_KEY`.

### Per user

| Method | Path |
|---|---|
| `GET` / `PUT` / `DELETE` | `/v1/ai/settings` |
| `POST` | `/v1/ai/settings/test` |

### Per environment

| Method | Path |
|---|---|
| `GET` / `POST` | `.../ai/generations` |
| `GET` | `.../ai/generations/{id}` |
| `POST` | `.../ai/generations/{id}/apply` |
| `POST` | `.../ai/generations/{id}/discard` |

Applying a generation edits the draft only; it never publishes.

## Health

`GET /healthz` is public and returns `{"data":{"status":"ok"},"meta":{"request_id":"..."}}`.
