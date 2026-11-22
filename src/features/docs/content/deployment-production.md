The repository ships local demo Compose files, not a hardened production stack. This page
is the checklist for running RealmStack for real; **Self-hosting** has the concrete files
and commands.

## Recommended topology

```text
player client / game server
          │ HTTPS
          ▼
  TLS reverse proxy (same origin)
     │                 │
     ▼                 ▼
 static dashboard    API instance 1..N
                       │  DATABASE_URL
                       ▼
                 PgBouncer (transaction mode)
                       │
                       ▼
               PostgreSQL primary
                       │
                       └── optional read replica
                       optional Redis (rank projection)
```

- Serve the dashboard and API on the same origin behind TLS, or point `VITE_API_URL` at an
  API origin the browser can reach.
- Run one or more stateless API instances. Sessions are JWTs; bans and credential caches
  sync between instances.
- PostgreSQL is the source of truth. Redis is optional and only a rank projection.
- Keep the API on a private network; only the proxy is public.

## Required changes from the demo

1. Set `APP_ENV=production` and `DEMO_MODE=false`.
2. Set a random `JWT_SECRET` of at least 32 characters (`openssl rand -base64 48`). The API
   refuses to start with a placeholder value. Rotating it signs everyone out.
3. Use strong PostgreSQL credentials and TLS (`sslmode=require` or stricter).
4. Set `TRUSTED_PROXIES` to the proxy addresses that may supply `X-Forwarded-For`; leave it
   empty if no proxy is trusted.
5. Set `DATABASE_DIRECT_URL` if `DATABASE_URL` goes through PgBouncer.
6. Set `AI_ENCRYPTION_KEY` only if you want the assistant, and store it like any other
   secret.
7. Set `REDIS_URL` on every instance or none; configure `maxmemory-policy noeviction`.
8. Set quotas appropriate for each tenant (`project_quotas`) or global defaults.
9. Set `VITE_API_URL` at build time if the dashboard is not same-origin.
10. Back up the database and test a restore before importing real players.

## TLS and the dashboard cookie

The dashboard refresh cookie is httpOnly, `SameSite=Strict`, path `/v1/auth`, and `Secure`
unless `APP_ENV=local`. Serve the dashboard over HTTPS so the cookie is sent only over TLS.
The player and dashboard access tokens are bearer tokens; do not log them or put them in
URLs.

## Connections and pooling

- Use PgBouncer in transaction mode with `max_prepared_statements` on PgBouncer 1.21+.
- Do not switch pgx to `exec` or simple protocol: JSON arguments are encoded by Go type and
  writes fail.
- Size pools explicitly per API instance; leave headroom for migrations and maintenance.
- Migrations and `realmstack-admin` commands need a direct connection because they take a
  session advisory lock or long transactions.

## Read replicas

`DATABASE_REPLICA_URL` serves reads that tolerate lag: leaderboard ranks and goal progress.
Every write, claim and accept uses the primary. Do not route authentication or idempotency
lookups to a replica.

## Redis

Redis is optional. When enabled:

- every API instance must have it;
- it must not evict;
- a board is served from Redis only after a full replay;
- a Redis outage falls back to PostgreSQL and leaves changes in the outbox;
- run `realmstack-admin rebuild-projection` after enabling it on existing data.

## Migrations at startup

The API applies pending SQL migrations on startup under an advisory lock, so several
instances can start together. For controlled deployments:

1. Take a backup.
2. Run `realmstack-admin migrate` (or start one instance) before the rest.
3. Watch the health check and logs.
4. Roll out the remaining instances.

Never edit an already-applied migration; the runner records files and silently skips edits.

## Backups and restore

- Use PostgreSQL physical backups or a managed service with point-in-time recovery.
- Include the database volume or managed snapshot in your retention policy.
- Test a restore into a separate database and run the API against it.
- Derived tables (`leaderboard_best_scores`, `player_goal_totals`, the Redis projection) can
  be rebuilt from the ledgers, but they are not a substitute for a database backup.
- The local `db-data` volume is not a backup.

## Health and monitoring

- `GET /healthz` is the liveness/readiness endpoint.
- Logs are structured JSON with request IDs. Ship them to your log platform.
- Alert on 5xx rate, database connection saturation, PgBouncer wait time, replication lag,
  Redis evictions and disk usage.
- Watch partition creation: maintenance creates future monthly partitions. If it stops,
  ledger inserts eventually fail.
- Watch idempotency-record growth and refresh-token cleanup.

## Security checklist

- No demo credentials or demo seed in production.
- Server credentials are issued per environment and stored only on your game server.
- Rotate and revoke credentials that may have leaked; revocation propagates within the
  cache TTL.
- Rate limits and quotas are enabled; `TRUSTED_PROXIES` is correct.
- The AI base URL guard stays on unless you intentionally run a local model server.
- Player passwords are never logged; the API uses a dummy hash for unknown emails.
- Projects are archived, not deleted, so deletion is not an authorization shortcut.
- The dashboard is for administrators only. Players use the game client.

Validate the topology in your own environment and run the load suite on the hardware you
intend to use. See **Scaling and load testing** and **Known limits**.
