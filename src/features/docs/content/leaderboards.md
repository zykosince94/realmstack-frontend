A leaderboard ranks one integer score per player. PostgreSQL is the source of truth. An
optional Redis projection can speed up rank reads, but it is never the only record.

## Definition

```json
{
  "key": "global",
  "direction": "higher",
  "season_start": null,
  "season_end": null
}
```

| Field | Meaning |
|---|---|
| `key` | Stable board key, unique per environment |
| `direction` | `higher` (largest wins) or `lower` (smallest wins) |
| `season_start` | Optional inclusive UTC RFC3339 start |
| `season_end` | Optional exclusive UTC end; omit both for an unseasoned board |
| `status` | Active boards accept scores |

Scores are integers bounded to ±(2^53−1). The limit exists because the optional Redis
projection stores scores in a sorted set, whose scores are float64; the database also has a
CHECK constraint.

The direction and season of a board that already has scores cannot change. Start a new
season with a new board key instead.

## Best score and ties

A player's displayed score is their **best accepted score** for the board and season:
maximum for higher-is-better, minimum for lower-is-better.

Ties are deterministic: the earliest submission that achieved the best score ranks first.
The internal `leaderboard_best_scores` table stores the best score, the achieved time and
the submission that produced it, and is updated in the same transaction as the score
submission. It can be rebuilt from `score_submissions`.

## Submit a score

The player submits with a player token. The game server is responsible for score
authenticity; RealmStack is not an anti-cheat system.

```bash
curl -s http://localhost:8080/v1/leaderboards/global/scores \
  -H "Authorization: Bearer $PLAYER_TOKEN" \
  -H 'Idempotency-Key: score-2026-11-22-1' \
  -H 'Content-Type: application/json' \
  -d '{"score": 18450}'
```

The response is `201`:

```json
{ "leaderboard_key": "global", "score": 18450, "submitted_at": "2026-11-22T12:00:00Z" }
```

A lower score than the player's best still records a submission, but it does not change
their best. A board outside its season or inactive answers `422 LEADERBOARD_CLOSED`. An
unknown published board is `404`.

## Read top entries and rank

```bash
curl -s 'http://localhost:8080/v1/leaderboards/global?environment_id=pub_realmstack_demo_dev&limit=10'
```

Public reads use the public environment identifier. A player token may also read the
board, and then the response includes that player's rank and score.

```json
{
  "key": "global",
  "entries": [
    { "player_id": "...", "display_name": "Rookie Pilot", "score": 18450, "rank": 1, "submitted_at": "..." }
  ],
  "player_rank": 4,
  "player_score": 12000
}
```

`limit` bounds the top-N scan. The optional player rank is one indexed count of entries
ahead of the player, using the same ordering as the top-N query. The read is a single
pipelined database batch (board lookup, top-N, player best/rank).

## The optional Redis projection

Set `REDIS_URL` to enable a Redis sorted-set projection of ranks. The projection is fed
through a transactional outbox after commit and is only served for a board after a full
replay from PostgreSQL. If Redis is unreachable, readers fall back to PostgreSQL and the
outbox keeps changes until it returns. Redis is not required for correctness.

Operational rules:

- Set `REDIS_URL` on every API instance or on none.
- Do not let Redis evict (`maxmemory-policy noeviction`, the default without a memory
  limit).
- After running without Redis and then enabling it, run
  `realmstack-admin rebuild-projection`.
- `realmstack-admin verify` compares best scores, goal totals and the Redis projection
  with a recomputation.

## Dashboard

The **Leaderboards** screen edits definitions and shows the current top scores. To submit a
score for a player, use the player's Progress tab under **Players**. Feature screens are
configuration only; player actions live in Players.

## Related

- **Progression** for XP and levels.
- **Achievements** for `leaderboard_score` conditions.
- **Deployment → Scaling** for the projection and load-test profile.
