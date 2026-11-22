RealmStack is a multi-tenant backend for game teams. One shared runtime serves many game
projects: each project is a tenant with its own environments, configuration, players,
economy, progression, leaderboards and live content. You configure the rules in a
dashboard, publish an immutable configuration version, and your game talks to a stable
HTTP API.

The platform is built for the part of a live game that is tedious to rebuild: accounts,
inventory, currency, XP, rankings, achievements, quests, cloud saves and moderation. It
is deliberately not a game server. It does not run matchmaking, realtime play, chat,
payments or anti-cheat.

![The RealmStack dashboard with player activity, concurrent players and daily active players](/screenshots/dashboard.png)

## What is in the box

| Area | What it provides |
|---|---|
| Tenancy | Projects, development/production environments, revocable server credentials |
| Identity | Player registration and login, short-lived access tokens, rotating refresh tokens, profiles |
| Inventory | Item definitions, stack limits, stacks, equipment slots, atomic consume/equip |
| Economy | Currency definitions, non-negative balances, credit/spend, complete ledger |
| Progression | Versioned XP curves, per-player version pinning, level calculation |
| Leaderboards | Higher/lower boards, seasons, best-score ranking, deterministic ties, rank |
| Stats and flags | Server-reported counters and one-off facts with an immutable ledger |
| Achievements | Passive goals over a closed condition set, hidden masking, one-time claims |
| Quests | Ordered stages, chains, prerequisites, daily/weekly periods, windows, claims |
| Cloud saves | Named JSON slots with optimistic version checks |
| Player management | Dashboard lookup, inspection and every game action on a player's behalf |
| Moderation | Bans with a reason, optional expiry, history and session revocation |
| Activity | Concurrent and daily active players derived from session issuance |
| AI assistant | Optional BYOK drafting of configuration proposals; a human publishes |

## The two repositories

```text
Game Backend Projects/
├── realmstack-backend/     Go API, migrations, OpenAPI contract, load tests
└── realmstack-frontend/    React dashboard, docs, integrated Docker Compose
```

The backend owns `api/openapi.yaml`, the contract. The frontend generates its TypeScript
client from it and owns the full-stack Compose file. They are separate Git repositories
with their own CI. Keep them as sibling folders.

## How a request flows

```text
client or dashboard
      │  Authorization: Bearer <player|user token>
      │  or X-Server-Credential: <prefix.secret>
      ▼
Gin middleware ── authenticate ── resolve project + environment scope
      │
      ▼
domain handler ── validate ── Mutate (idempotency + transaction)
      │                           ├── balance / stack / state update
      │                           ├── immutable ledger row
      │                           └── derived tables (best score, goal totals)
      ▼
{ "data": ..., "meta": { "request_id": "..." } }
```

Scope always comes from the authenticated principal, never from a caller-supplied
`project_id` in JSON. A UUID is never authorization on its own. A player outside the
credential's environment is a `404`, not a `403`.

## Reading this documentation

- **Overview** explains the model and gets a project running.
- **Feature guides** describe each service and the rules it enforces.
- **API reference** lists every route, auth style, request shape and error code.
- **Deployment** covers local Compose, configuration, production and operations.
- **Reference** covers security, engine integration, the FAQ and current limits.

The tabs are available inside the dashboard and at the public `#/docs` page. A copy of
the OpenAPI contract is available for download from the sidebar of the API reference.

![The documentation page with search, category tabs, page navigation and the API reference](/screenshots/docs-page.png)

## License

RealmStack is released under the Apache License 2.0. See the `LICENSE` and `NOTICE` files
in either repository.
