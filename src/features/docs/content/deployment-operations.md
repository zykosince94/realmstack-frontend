Operational commands live in `realmstack-admin`. They use `DATABASE_DIRECT_URL` when set,
otherwise `DATABASE_URL`, because rebuilds take table locks and migrations need a session
advisory lock.

```bash
realmstack-admin migrate
realmstack-admin maintenance
realmstack-admin rebuild-leaderboards
realmstack-admin rebuild-projection
realmstack-admin rebuild-goal-totals
realmstack-admin verify
realmstack-admin seed-load -players 500000 -out loadtest/data/tenant.json
```

## Migrations

- SQL files are numbered and applied in order on API startup, under an advisory lock.
- Never edit an applied migration. The runner records the file and skips it, so an edit
  silently never reaches an existing database. Add a new numbered file instead.
- DDL is idempotent where possible. A release that contains a destructive migration says so
  in its release notes; take a backup before you upgrade.
- A migration that recreates tables may require resetting the local demo volume
  (`docker compose down -v`, which deletes its data).
- Run migrations before rolling out a new API version. The API also runs them at startup.

## Maintenance

`maintenance` (and the API's periodic loop, `MAINTENANCE_INTERVAL`) does:

- create monthly partitions ahead of time
- purge expired idempotency records (30 days)
- purge expired player and dashboard refresh tokens
- clear old rate-limit windows

Run it on a schedule if the API's built-in loop is disabled, or call
`realmstack-admin maintenance` from your job runner. It is safe to run alongside live
traffic.

## Rebuilds and verification

Derived data can be recomputed from source data:

| Command | Recomputes |
|---|---|
| `rebuild-leaderboards` | `leaderboard_best_scores` from `score_submissions`; replays Redis when configured |
| `rebuild-projection` | Every board into the Redis rank projection |
| `rebuild-goal-totals` | `player_goal_totals` from the ledgers |
| `verify` | Compares best scores, goal totals and Redis with a recomputation; exits non-zero on a difference |

Run `verify` after a rebuild and during an incident review. A mismatch means the
same-transaction writer or a rebuild is wrong; do not paper over it.

## Upgrades

1. Read the release notes and migration list.
2. Back up the database (and test the restore path).
3. Run `realmstack-admin migrate` against a direct connection.
4. Deploy the new API instances; keep the old ones until health checks pass.
5. Run `realmstack-admin verify`.
6. Smoke-test login, a player read, a server grant and a score submission.

API instances are stateless apart from in-memory caches (credentials, bans). A rolling
restart is safe; bans and credentials resync within their intervals.

## Rollback

There are two different rollbacks:

- **Configuration rollback** republishes an earlier configuration version as a new version.
  It does not rewrite history. Use the dashboard or
  `POST .../configurations/versions/{version}/rollback`.
- **Application rollback** redeploys the previous image. Check that its migrations are
  compatible with the current schema. A destructive migration may make an older image
  unable to run; this is why migrations need a release note.

## Incident playbooks

### Redis is down

Ranks fall back to PostgreSQL. The outbox keeps changes until Redis returns. Do not start
new instances without `REDIS_URL` while others have it; the optional projection must be
configured consistently.

### A credential leaked

Revoke it in Project settings. The issuing instance drops the cache immediately; others
within `CREDENTIAL_CACHE_TTL` (at most 60 seconds). Rotate the game server's secret.

### A player must be stopped now

Ban from the dashboard. The ban revokes refresh tokens and is enforced on the next
player-token request on the issuing instance; other instances within
`BAN_SYNC_INTERVAL`. Server and dashboard actions still work.

### AI generations are stuck

They run in-process. A restart marks running generations failed with
`ABANDONED_BY_RESTART`. Graceful shutdown waits within its grace period. No cleanup job is
needed.

### Partitions are missing

Run `realmstack-admin maintenance`. If ledger inserts are already failing, create the
missing months and re-run. Do not edit old partitions.

## Monitoring

- Structured JSON logs include `request_id`; correlate client reports with it.
- Watch 5xx, 429, database saturation, PgBouncer wait time, replica lag, Redis evictions and
  disk.
- `pg_stat_statements` is enabled in the load-test database; use it to find slow queries.
- The dashboard activity chart is not a monitoring system; use real metrics for alerts.

## Related

- **Production checklist** for topology and secrets.
- **Scaling and load testing** for capacity and the k6 profile.
- **Configuration reference** for variables used above.
