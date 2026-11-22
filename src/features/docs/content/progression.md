Progression turns cumulative XP into a level. The XP curve is versioned, and each player is
pinned to the version they started on, so publishing a new curve never silently changes an
existing player's displayed level.

## Thresholds

The configuration draft's `progression` array is a list of cumulative XP thresholds for
levels 2 and above. Level 1 starts at 0 XP.

```json
{ "progression": [100, 300, 700, 1500] }
```

| Level | Total XP needed |
|---|---|
| 1 | 0 |
| 2 | 100 |
| 3 | 300 |
| 4 | 700 |
| 5 | 1500 |

Thresholds must be strictly increasing and positive. The dashboard shows a level preview
while editing and rejects invalid curves before publish.

## Version pinning

Publishing a configuration creates a progression version only when the thresholds changed.
A player's progression row is created on their first XP award and pins the progression
version active at that moment.

- Existing players keep their pinned version. Their level does not change because someone
  published a new curve.
- New players start on the newest active version.
- Migrating existing players to a new curve is not supported.
- Each published progression version has an immutable threshold snapshot.

This is why rolling out a rebalance is safe for history, and why changing the meaning of a
curve should usually use a new progression version rather than editing the old one.

## Reading progression

```bash
curl -s http://localhost:8080/v1/players/me/progression \
  -H "Authorization: Bearer $PLAYER_TOKEN"
```

```json
{
  "total_xp": 340,
  "level": 3,
  "version": 1,
  "thresholds": [100, 300, 700, 1500]
}
```

A player with no XP and no pinned version gets `total_xp: 0`, `level: 1`, `version: null`.
The dashboard's player Progress tab shows the same data.

## Awarding XP

Only a trusted server credential or the dashboard may award XP. The player cannot award it
to themselves.

```bash
curl -s "http://localhost:8080/v1/server/players/$PLAYER_ID/xp/award" \
  -H 'X-Server-Credential: rs_demo.realmstack-local-server-secret' \
  -H 'Idempotency-Key: match-981-xp' \
  -H 'Content-Type: application/json' \
  -d '{"amount":120,"reason":"match_complete","reference":"match-981"}'
```

The amount must be positive. The write is idempotent and transactional: the total XP, the
pinned version (created once, on the first award) and the `xp_transactions` ledger row are
committed together. A replay returns the original award; a different payload with the same
key is a `409`.

The response reports the new state:

```json
{
  "total_xp": 460,
  "awarded": 120,
  "level": 3,
  "leveled_up": false,
  "progression_version": 1,
  "progression_version_id": "..."
}
```

If no progression version has ever been published, the award is refused with
`422 PROGRESSION_NOT_PUBLISHED`. Publish the configuration first.

## Ledger and goals

Every award writes an `xp_transactions` row with a `source`. XP awards from the API use
`api`; rewards paid by achievements and quests use their own source.

Goal evaluation counts only API-sourced XP. The `xp_total` condition sums it in a window.
The `level_reached` condition computes the level from the player's pinned curve and
API-sourced XP, so XP paid by a claim never completes another level goal.

## Related

- **Core concepts** for publishing and goal windows.
- **Leaderboards** for competitive ranking.
- **Achievements** for XP-based conditions and XP rewards.
- **API reference** for the exact award and read shapes.
