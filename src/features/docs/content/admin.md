Players never use the dashboard. A project owner manages them from the **Players** screen,
using dashboard-token admin routes. Those routes run the same handlers and transaction
functions as the game, so the same validation, atomic updates, ledgers and goal evaluation
apply.

## Finding a player

```http
GET /v1/projects/{projectId}/environments/{envId}/players?search=rookie&limit=25&cursor=...
Authorization: Bearer <dashboard token>
```

- Newest first, cursor-paginated.
- `search` matches part of the display name, email or external key (case-insensitive), or
  a whole player ID.
- `?banned=true` lists only players with a ban in force.
- A player outside the owned environment is `404`, including a valid UUID from another
  tenant.

The detail route returns identity, metadata, a session summary and the ban in force. It
never returns a password or token material.

## Inspecting a player

These reuse the game's read handlers:

| Route | Data |
|---|---|
| `GET .../players/{playerId}/inventory` | Item stacks and equipment |
| `GET .../players/{playerId}/currency` | Balances |
| `GET .../players/{playerId}/transactions` | Economy history |
| `GET .../players/{playerId}/progression` | XP and level |
| `GET .../players/{playerId}/stats` | Counters and flags |
| `GET .../players/{playerId}/achievements` | Progress and status, unmasked |
| `GET .../players/{playerId}/quests` | Quest log, unmasked |
| `GET .../players/{playerId}/saves` and `.../saves/{slot}` | Cloud saves |
| `GET .../players/{playerId}/bans` | Ban history |

Hidden achievements are shown unmasked to admins, as they are to a trusted server. The
dashboard is an administrative view, not a player view.

## Performing actions

| Action | Admin route |
|---|---|
| Grant item | `POST .../players/{playerId}/items/grant` |
| Consume item | `POST .../players/{playerId}/inventory/consume` |
| Equip | `POST .../players/{playerId}/inventory/equip` |
| Unequip | `POST .../players/{playerId}/inventory/unequip` |
| Credit currency | `POST .../players/{playerId}/currency/credit` |
| Spend currency | `POST .../players/{playerId}/currency/spend` |
| Award XP | `POST .../players/{playerId}/xp/award` |
| Increment stat | `POST .../players/{playerId}/stats/{statKey}/increment` |
| Set flag | `POST .../players/{playerId}/flags/{flagKey}/set` |
| Claim achievement | `POST .../players/{playerId}/achievements/{key}/claim` |
| Accept quest | `POST .../players/{playerId}/quests/{key}/accept` |
| Abandon quest | `POST .../players/{playerId}/quests/{key}/abandon` |
| Claim quest | `POST .../players/{playerId}/quests/{key}/claim` |
| Submit score | `POST .../players/{playerId}/leaderboards/{key}/scores` |
| Write/delete a save | `PUT|DELETE .../players/{playerId}/saves/{slot}` |

Every write needs an `Idempotency-Key`, in the `admin` namespace. A dashboard action never
replays or conflicts with a player's or server's key. Claims use the server variants, so an
admin can claim a goal whatever its claim policy. Writes carry ledger source `api`, so
goals see them.

The UI confirms destructive actions: consume, deduct, abandon, delete a save, ban, replace
a ban and lift a ban.

## Bans

```http
POST .../players/{playerId}/ban
Idempotency-Key: ban-1
Content-Type: application/json

{ "reason": "Cheating in ranked", "expires_at": "2026-12-01T00:00:00Z" }
```

- Omit `expires_at` for a permanent ban.
- The reason (1–500 characters) is shown to the player.
- Banning a banned player replaces the ban; the earlier row is kept.
- A ban revokes every refresh token in the same transaction.
- `POST .../ban/lift` takes an optional `{"note":"..."}` and answers `422 NOT_BANNED` when
  there is no ban in force.
- `GET .../bans` returns the history with a derived `status`: `active`, `expired`,
  `lifted` or `replaced`.

Enforcement happens at login (after a correct password), refresh and every player-token
request. The trusted server and the dashboard can still act on a banned player. Scores
stay on leaderboards.

Each API instance keeps the bans in force in memory. A change is visible on the issuing
instance at once and on other instances within `BAN_SYNC_INTERVAL` (default 5 seconds).
Expiry needs no job.

## Cloud saves

The Saves tab lists slots, shows a JSON editor keyed by `slot:version`, sends
`expected_version`, and confirms deletion. It uses the game's save handlers, so the slot
limit, 256 KiB limit and conflict behaviour are identical.

## Activity

The environment-level **Dashboard** shows CCU and DAU derived from session issuance. It
contains counts only, never player identifiers.

## What is not included

- There is no separate audit log. Ledger rows and their `reason` are the record of what
  happened.
- There is no "sign this player out without banning them" action.
- Only the dashboard can ban; a server credential cannot.
- Admin corrective grants count toward goals because they use source `api`.

## Related

- **Players and sessions** for the player-facing identity model.
- **Cloud saves** and **Moderation and bans** for the feature rules.
- **API reference → Dashboard routes** for exact paths and parameters.
