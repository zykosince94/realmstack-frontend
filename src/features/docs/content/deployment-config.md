The API reads configuration from environment variables. A malformed required value stops
startup rather than failing later; optional integrations are off by default.

## Core

| Variable | Default | Notes |
|---|---|---|
| `APP_ENV` | `production` | `local` disables Secure cookies and allows the demo seed |
| `HTTP_ADDR` | `:8080` | Listen address |
| `JWT_SECRET` | — | Required, at least 32 characters. Startup fails if it is shorter, repetitive, or still a placeholder from an example file (placeholders are accepted only when `APP_ENV=local`) |
| `ACCESS_TOKEN_TTL` | `15m` | Player and dashboard access tokens |
| `REFRESH_TOKEN_TTL` | `720h` (30 days) | Player and dashboard refresh tokens |
| `BODY_LIMIT_BYTES` | `1048576` | 1 MiB request body limit |
| `DEMO_MODE` | `false` | Seeds only when `APP_ENV=local` too |
| `TRUSTED_PROXIES` | empty | Comma-separated proxies allowed to supply `X-Forwarded-For` |
| `AUTH_RATE_LIMIT_PER_MINUTE` | `30` | Per IP and auth route |
| `BCRYPT_COST` | `10` | Cost for new hashes; stored hashes keep theirs |

## Database

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://realmstack:realmstack@localhost:5432/realmstack?sslmode=disable` | Request path; may point at PgBouncer in transaction mode |
| `DATABASE_DIRECT_URL` | unset | PostgreSQL directly; used by migrations and maintenance |
| `DATABASE_REPLICA_URL` | unset | Lag-tolerant reads (leaderboard ranks, goal progress) |

With PgBouncer, use transaction mode with `max_prepared_statements` (1.21+). Do not use
`default_query_exec_mode=exec` or simple protocol: arguments are then encoded by Go type,
and JSON arguments are sent as `bytea`.

Migrations take a session advisory lock, which a transaction-mode pooler cannot keep. Set
`DATABASE_DIRECT_URL` when `DATABASE_URL` goes through PgBouncer.

## Quotas and caches

| Variable | Default | Notes |
|---|---|---|
| `QUOTA_REQUESTS_PER_MINUTE` | `0` (built-in 1,200,000) | Default when no `project_quotas` row |
| `QUOTA_WRITES_PER_MINUTE` | `0` (built-in 600,000) | Every batch entry counts |
| `QUOTA_MAX_BATCH_ENTRIES` | `0` (built-in 500) | Batch size limit |
| `CREDENTIAL_CACHE_TTL` | `30s` | Server-credential lookup cache; at most 60s |
| `BAN_SYNC_INTERVAL` | `5s` | How often an instance reads other instances' ban changes |
| `MAINTENANCE_INTERVAL` | `1h` | Partition creation, idempotency purge, token cleanup |

Per-project `project_quotas` rows override the global defaults. Rate-limit counters are
shared through PostgreSQL (or Redis for the optional projection); per-instance quota
counters fold into the shared row every 250 ms, so a burst can overshoot by one interval.

## Redis (optional)

| Variable | Default | Notes |
|---|---|---|
| `REDIS_URL` | unset | Enables the leaderboard rank projection |

Set it on every API instance or on none. Redis must not evict
(`maxmemory-policy noeviction`). After enabling it on an existing deployment, run
`realmstack-admin rebuild-projection`.

## AI assistant (optional)

| Variable | Default | Notes |
|---|---|---|
| `AI_ENCRYPTION_KEY` | unset | Base64 32-byte key; unset disables AI |
| `AI_TIMEOUT` | `3m` | Provider timeout |
| `AI_MAX_OUTPUT_TOKENS` | `32000` | Output cap |
| `AI_GENERATIONS_PER_MINUTE` | `6` | Per user, in process |
| `AI_MAX_RUNNING_PER_USER` | `2` | Concurrent generations |
| `AI_ALLOW_PRIVATE_URLS` | `false` | Allow http/private base URLs for a local model server |

Generate the key with `openssl rand -base64 32`. Changing it makes stored provider keys
unreadable; users re-enter them.

## Frontend

`VITE_*` values are public browser configuration. Never put a secret in them.

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_URL` | same origin | API base URL when the dashboard is not proxied with the API |
| `VITE_API_PROXY_TARGET` | `http://localhost:8080` | Dev-server proxy target for `/v1` |
| `VITE_DEMO_MODE` | false | Shows demo credentials on the sign-in page outside `npm run dev` |

`VITE_API_URL` is compiled into the bundle. Changing it requires a rebuild.

## Compose-only variables

The integrated stack uses `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`,
`POSTGRES_PORT`, `JWT_SECRET`, `DEMO_MODE`, `API_PORT`, `WEB_PORT`, `AI_ENCRYPTION_KEY` and
`AI_ALLOW_PRIVATE_URLS`. See `realmstack-frontend/.env.example`.

## Minimal production example

```dotenv
APP_ENV=production
HTTP_ADDR=:8080
DATABASE_URL=postgres://realmstack:<password>@pgbouncer:6432/realmstack?sslmode=require
DATABASE_DIRECT_URL=postgres://realmstack:<password>@postgres:5432/realmstack?sslmode=require
DATABASE_REPLICA_URL=postgres://realmstack:<password>@postgres-replica:5432/realmstack?sslmode=require
JWT_SECRET=<at-least-32-random-characters>
TRUSTED_PROXIES=10.0.0.10
DEMO_MODE=false
# Optional:
# REDIS_URL=redis://redis:6379/0
# AI_ENCRYPTION_KEY=<base64-32-byte-key>
```

Do not commit a real `.env`. Use your platform's secret store.
