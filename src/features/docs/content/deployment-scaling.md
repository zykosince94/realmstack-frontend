The scale layer is built for many API instances sharing one PostgreSQL database. A
reference profile is about 1M registered players, 100k concurrent, about 5k trusted writes
per second at peak, and a login surge of about 100k players in 10 minutes.

The load-test suite seeds 500,000 players and models 100k online as request rates, not
virtual users. Measure on the hardware you intend to use; results depend on it.

## What the scale layer includes

- `leaderboard_best_scores` maintained in the submission transaction; index-based top-N and
  rank; rebuild from submissions.
- `player_goal_totals` maintained with ledger writes; achievements read totals; rebuild from
  ledgers.
- `POST /v1/server/batch` with per-entry savepoints and idempotency.
- Monthly partitions for economy, XP, stat and score ledgers; idempotency expiry and purge.
- Shared rate limits and per-project quotas with `429` and `Retry-After`.
- Optional Redis rank projection with a transactional outbox and PostgreSQL fallback.
- Credential and ban caches; write pipelining; explicit pool sizing.

## Load-test scenarios

| Scenario | Rate at `SCALE=1` | What it does |
|---|---|---|
| `server_writes` | 4,500/s | Grant, credit, XP and stat writes across 100,000 sampled players |
| `batch_writes` | 10/s | 50-entry batches (500 more writes/s) |
| `score_submits` | 150/s | Player score submissions |
| `leaderboard_top` | 400/s | Top 100 of a 500,000-player board |
| `leaderboard_rank` | 400/s | A player's rank (`limit=1`) |
| `player_reads` | 2,000/s | Inventory, currency, progression, achievements and quests |
| `login_surge` | 167/s | Player login at bcrypt cost 10 |

The steady mix is about 7,500 requests/s. Pass criteria: p95 under 150 ms for writes, under
50 ms for top-100 and rank, under 1% failed requests. k6 enforces thresholds and exits
non-zero on failure.

## Run it

```bash
cd realmstack-backend/loadtest
docker compose up -d --build db pgbouncer1 pgbouncer2 pgbouncer3 redis api1 api2 api3
docker compose run --rm seed
docker compose run --rm k6
docker compose run --rm verify
docker compose --profile tools down -v
```

Useful variables: `SCALE` multiplies every rate (`0.5` for a quick run), `DURATION` is the
steady phase, `SCENARIOS` runs a subset, `BASE_URLS` overrides the API instances. The seed
writes `data/tenant.json`; keep it because it holds the load-tenant credential. Results and
data are git-ignored.

The database volume grows quickly: millions of ledger rows and a lot of WAL. Remove it with
`down -v` afterwards and keep Docker's disk image on a roomy drive.

## Topology

PostgreSQL 17, three API instances, one PgBouncer per API instance (transaction mode,
`max_prepared_statements=1000`), Redis for the rank projection, and k6. Migrations and
maintenance use a direct database connection.

Run k6 on separate hardware from the database when you want a result that says something
about the platform. A single host saturates CPU and measures the host, not the design.
Compare several scales; a healthy system shows flat latency until a resource saturates.

## Design notes

- PgBouncer is single-threaded and its cost is per network round trip. The supported shape
  is one PgBouncer per API instance, plus write pipelining.
- Concurrent batches could deadlock if they locked players in opposite orders, so entries
  are grouped by player ID and locked in one global order.
- Counting rows ahead of a player is expensive for a mid-table rank. That is why the
  optional Redis projection exists.
- Leaderboard reads use one pipelined batch instead of three round trips.
- A small player sample causes row-lock collisions in a load test, so the suite samples
  100,000 players.
- The `exec`/simple protocol breaks JSON arguments. Use prepared statements with
  PgBouncer 1.21+.

## Correctness under scale

`realmstack-admin verify` and the integration suite compare best scores, goal totals and the
Redis projection with a recomputation from the ledgers. Run `verify` after a load test
(`docker compose run --rm verify`) and after a rebuild.

## Capacity notes

- Per-instance quota counters fold into the shared row every 250 ms, so a burst across
  instances can overshoot by one interval. That is a deliberate trade-off.
- Scores are bounded to ±(2^53−1) so the Redis projection orders them exactly.
- Redis must not evict. A single-node projection is the supported shape.

## Related

- **Production checklist** for topology and secrets.
- **Operations** for rebuild and verify commands.
- **Known limits** for capacity limits.
