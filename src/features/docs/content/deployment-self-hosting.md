The bundled Compose stack is a local demo: it runs the Vite dev server, binds to loopback and seeds demo credentials. This page is the path for a host you control.

## What you need

| Requirement | Notes |
|---|---|
| Linux host with Docker Engine + Compose | A small VM is enough for the dashboard and API; size the database separately |
| PostgreSQL 17 | Managed service or your own cluster; TLS and point-in-time backups |
| Domain name + TLS | A reverse proxy in front of the web container |
| Persistent storage | PostgreSQL data and backups; the web and API containers are stateless |
| Secrets | `JWT_SECRET`, database credentials, optional Redis and AI keys |

## Topology

```text
client
  │ HTTPS
  ▼
reverse proxy (TLS)
  │
  ▼
realmstack web (nginx, static dashboard + /v1 proxy)
  │
  ▼
realmstack api (Go)
  │
  ├── PostgreSQL 17 (authoritative)
  └── optional Redis (leaderboard rank projection)
```

Only the web container needs a published port. Keep the API on the private Compose network.

## 1. Prepare PostgreSQL

Create a database and a role for the API, enable TLS, and decide your backup/PITR policy. The API runs pending migrations on startup, so the role needs DDL rights for the first deploy.

```dotenv
DATABASE_URL=postgres://realmstack:<password>@db.example.com:5432/realmstack?sslmode=require
DATABASE_DIRECT_URL=postgres://realmstack:<password>@db.example.com:5432/realmstack?sslmode=require
# Optional: a lag-tolerant read replica for leaderboard ranks and goal progress.
# DATABASE_REPLICA_URL=postgres://realmstack:<password>@replica.example.com:5432/realmstack?sslmode=require
```

`DATABASE_DIRECT_URL` is used by migrations and operator commands when `DATABASE_URL` goes through PgBouncer. Use PgBouncer in transaction mode with `max_prepared_statements`; do not switch pgx to simple protocol.

## 2. Build and start

The self-hosting files live in the dashboard repository:

- `docker-compose.selfhost.yml` — API, static web container and optional Redis
- `Dockerfile.selfhost` — multi-stage build of the dashboard into nginx
- `deploy/nginx.conf` — static fallback plus `/v1` and `/healthz` proxy
- `.env.selfhost.example` — the environment template

From `realmstack-frontend/`, with the backend checked out next to it:

```bash
cp .env.selfhost.example .env.selfhost
# Edit .env.selfhost: database URL, JWT secret, trusted proxies, optional Redis/AI.
docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost up -d --build --wait
```

This builds the API from `../realmstack-backend` and the dashboard from the local frontend. The web container serves the SPA and proxies API calls to the API service. PostgreSQL is external to this Compose file; use your provider's console or your own database host.

## 3. First user and project

Create the first dashboard user through the API, then sign in and create a project and environment:

```bash
curl -s https://game.example.com/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@example.com","password":"a-long-dashboard-password"}'
```

In the dashboard:

1. Create the game project.
2. Open the development environment.
3. Add the content you need and publish a configuration version.
4. Issue a server credential for the game backend.
5. Create a player through the Test client or your game client.

## 4. TLS and cookies

Terminate TLS at Caddy, nginx, Traefik or your cloud load balancer and forward to the web container. Set `TRUSTED_PROXIES` to the proxy addresses so rate limits use the client IP, and keep `APP_ENV=production` so the dashboard refresh cookie is `Secure`.

The dashboard and API should share an origin. The supplied nginx config proxies `/v1` to the API; if you use separate origins, set `VITE_API_URL` at build time to the API origin the browser can reach.

## 5. Environment

| Variable | Required | Why |
|---|---|---|
| `JWT_SECRET` | Yes | At least 32 random characters; rotating it signs everyone out |
| `DATABASE_URL` | Yes | Runtime database connection |
| `DATABASE_DIRECT_URL` | Recommended | Direct connection for migrations/maintenance when using PgBouncer |
| `APP_ENV` | Yes | Set `production`; `local` is for the demo |
| `DEMO_MODE` | Yes | Set `false`; the seed runs only with `local` + `true` |
| `TRUSTED_PROXIES` | Recommended | Proxy addresses allowed to supply `X-Forwarded-For` |
| `DATABASE_REPLICA_URL` | Optional | Lag-tolerant reads |
| `REDIS_URL` | Optional | Leaderboard rank projection; set on every instance or none |
| `AI_ENCRYPTION_KEY` | Optional | Base64 32-byte key; leave empty to disable AI |
| `QUOTA_*` | Optional | Defaults for projects without a `project_quotas` row |

See **Configuration reference** for the full list.

## 6. Optional Redis and AI

**Redis** is only a rank projection. The Compose file defines a `redis` service that is off by default (`noeviction`, append-only persistence, no published port). To use it, set `REDIS_URL=redis://redis:6379/0` in `.env.selfhost` and add `--profile redis` to the `docker compose` command. With your own Redis, set `REDIS_URL` on every API instance and configure `maxmemory-policy noeviction`. Run `realmstack-admin rebuild-projection` after enabling it on existing data. A Redis outage falls back to PostgreSQL; the outbox keeps changes until it returns.

**AI** is off unless `AI_ENCRYPTION_KEY` is set. Generate it with `openssl rand -base64 32` and store it like any other secret. Users save their own provider key from Project settings; the key is encrypted at rest and never returned. The base-URL guard refuses private and loopback addresses unless `AI_ALLOW_PRIVATE_URLS=true` is set for a local model server.

## 7. Operations

| Task | How |
|---|---|
| Health | `GET /healthz` through the reverse proxy |
| Migrations | Run automatically on API startup, or `realmstack-admin migrate` |
| Maintenance | `realmstack-admin maintenance` (partitions, idempotency purge, token cleanup) |
| Rebuilds | `realmstack-admin rebuild-leaderboards`, `rebuild-projection`, `rebuild-goal-totals` |
| Verification | `realmstack-admin verify`; exits non-zero on a derived-data mismatch |
| Backups | PostgreSQL snapshots/PITR; test a restore before inviting players |
| Logs | Structured JSON with request IDs; ship to your log platform |
| Capacity | Run the k6 suite on the hardware you intend to use |

See **Operations** and **Production checklist** for the full detail.

## Checklist

- [ ] `APP_ENV=production` and `DEMO_MODE=false`
- [ ] A random `JWT_SECRET` of at least 32 characters
- [ ] PostgreSQL TLS, least-privilege role and tested backups
- [ ] HTTPS in front of the dashboard and API
- [ ] `TRUSTED_PROXIES` matches the actual proxy
- [ ] Quotas sized for each tenant
- [ ] Monitoring for 5xx, database saturation, replication lag and disk
- [ ] Redis present on every instance or absent everywhere
- [ ] AI disabled unless `AI_ENCRYPTION_KEY` is set
- [ ] Demo credentials and demo content removed

## Local demo vs self-hosted

| | Local Compose | Self-hosted |
|---|---|---|
| Dashboard | Vite dev server | Static build served by nginx |
| API | `realmstack-api:local` | `realmstack-api:selfhost` |
| Database | Container + volume | Managed or self-managed PostgreSQL 17 |
| Ports | Loopback | Reverse proxy + TLS |
| Seed | Demo content on an empty database | No demo seed |
| Secrets | Local demo defaults | Secret manager / `.env.selfhost` |
