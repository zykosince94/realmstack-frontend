The features share a small set of ideas. Understanding these once makes the rest of the
API predictable.

## Tenancy: projects and environments

A **project** is one game. It owns one or more **environments**, typically `development`
and `production`. Configuration, credentials, players, ledgers and leaderboards are all
scoped to one environment. A player in one project or environment is invisible to every
other project and environment.

There are two environment identifiers:

| Identifier | What it is | Where it is used |
|---|---|---|
| `public_id` | A non-secret string such as `pub_realmstack_demo_dev` | Client registration/login and public leaderboard reads |
| `id` | The internal UUID | Dashboard routes and server credentials |

The public ID selects a tenant; it is not proof of authorization. Never ship a server
credential in a game client. A server credential is an environment-scoped secret of the
form `prefix.secret`; only a hash is stored and the secret is shown once.

Scope is always resolved from the authenticated principal:

- Dashboard user token: the projects the user owns.
- Player token: the player's project and environment.
- Server credential: the credential's project and environment.
- Public registration/login: the environment named by `public_environment_id`.

Malformed UUID path parameters return `404`. An existing UUID from another tenant also
returns `404`; the API never confirms that it exists elsewhere.

## Configuration: draft, validate, publish

Each environment has exactly one editable **draft** and any number of immutable published
**versions**.

```text
edit definition routes ──► draft ── validate ──► publish ──► immutable version
                                                                  │
                                                       runtime reads only this
```

- Definition edits change only the draft. They do not affect players until published.
- `POST .../configurations/validate` checks a supplied body, or the stored draft when the
  body is empty, without saving.
- `POST .../configurations/publish` validates the whole draft and writes a version with
  `created_by`. A publish is all-or-nothing.
- A new **progression version** is created only when the XP thresholds changed.
- Rollback republishes an earlier version as a new version. History is never rewritten.
- Removed definitions are deactivated, not deleted. Existing ledger rows still reference
  them.

Some changes are refused once history depends on them: the direction or season of a
leaderboard with scores, a stat switching between counter and flag after values exist, and
an accepted quest changing `repeat` or reordering its existing stages. Use a new key for a
new meaning.

The draft may contain `editor_layout`, which stores quest-canvas positions. Publishing
ignores it.

## Idempotency

Every mutation that moves value or changes player state requires an `Idempotency-Key`
header. The platform computes a hash from the authenticated actor, route and normalized
payload, then stores the result in the same transaction as the change.

- Same key + same payload → the stored result is replayed with its original status.
- Same key + different payload → `409 IDEMPOTENCY_CONFLICT`.
- Keys are namespaced by actor kind (`player`, `server`, `admin`) and target player, so a
  dashboard action cannot replay or conflict with a game server or player key.
- Failed validation does not store a result; fix the request and retry.
- Idempotency records expire after 30 days. A key replayed after expiry is treated as new,
  so do not retry a write after more than 30 days.
- In `POST /v1/server/batch`, each entry carries its own key and runs in its own savepoint.

Generate a fresh key per logical action. Reuse it only when retrying that same action.

## Ledgers and state

Balances, item stacks, XP and score submissions are current state. Every change also
writes an immutable row to a ledger:

| Ledger | What it records |
|---|---|
| `economy_transactions` | Grants, consumes, credits, spends, balance after |
| `xp_transactions` | XP awards and their amounts |
| `stat_transactions` | Counter increments and flag sets |
| `score_submissions` | Every accepted score |
| `quest_claims` / `achievement_claims` | Exactly what was claimed, when and by whom |

Database triggers reject `UPDATE` and `DELETE` on these ledgers. Corrections are
compensating rows, never edits. Balances and stacks are changed with one atomic conditional
statement, so concurrent spends cannot drive a balance below zero and a stack cannot
exceed its limit.

Every ledger row carries a `source`: `api`, `achievement` or `quest`. Goal evaluation
counts only `source='api'` rows, so a reward paid by one claim cannot complete another
goal. Dashboard management writes use `api` as well.

## The goal engine

Achievements and quests share one deterministic evaluator. Progress is derived on read
from the published definitions, the immutable ledgers, the player's pinned progression,
acceptance records and the current time. Progress is never stored.

Conditions come from a closed set. There are no scripts, expressions or custom code.

| Condition | Fields | Counts |
|---|---|---|
| `xp_total` | `target` | API-sourced XP in the window |
| `level_reached` | `target` | Pinned curve + API-sourced XP (state, window ignored) |
| `item_granted` | `item_key` (optional), `target` | Granted quantity in the window; omitted key means any item |
| `item_consumed` | `item_key` (optional), `target` | Consumed quantity in the window |
| `currency_earned` | `currency_key`, `target` | Credited amount in the window |
| `currency_spent` | `currency_key`, `target` | Spent amount in the window |
| `leaderboard_score` | `leaderboard_key`, `target` | Best score in the window and season; direction decides at-least/at-most |
| `stat` | `stat_key`, `target` | Sum of counter increments in the window |
| `flag` | `flag_key` | Flag is set (state, window ignored) |

Every evaluation has a counting window `[from, until)`:

- Achievements count all time.
- Quests count from acceptance, or the later start of the current repeat period, until
  the earlier of the period end and the availability-window end.

Flags are set-only and XP only grows, so state conditions never revert. `level_reached`
uses the player's pinned curve and API-awarded XP, which is why claim XP never completes
another level goal.

## Quests: state versus goals

A quest moves through `locked → available → active → completed → claimed`, with `upcoming`
and `expired` for windowed quests. Status precedence is: `claimed`, `locked`, `upcoming`,
`expired`, `completed`, `active`, `available`.

- A quest is **locked** while a required quest or achievement is incomplete.
- **Accepting** is allowed only while the quest is available and inside its window.
- **Abandoning** returns it to available, keeps already claimed rewards, and accepting
  again restarts progress from a new acceptance time.
- **Stages complete strictly in order.** A counted condition still counts everything in
  the window, whichever stage is current. When a step must happen after an earlier step,
  report it with a flag.
- **Claims** pay every earned but unclaimed stage reward plus the completion reward in one
  transaction. Each stage reward and the completion reward can be claimed once per period.

## Time

All timestamps are UTC RFC3339. Windows and seasons are start-inclusive, end-exclusive.
Daily quests reset at 00:00 UTC and use a `YYYY-MM-DD` period key. Weekly quests reset at
Monday 00:00 UTC and use an ISO week key such as `2026-W47`. Non-repeating quests use an
empty period key.

The server uses one clock for token expiry, seasons, quest windows and the timestamps it
stores, so comparisons stay consistent. Tests can replace that clock.

## Responses and errors

Success and failure share an envelope:

```json
{ "data": {}, "meta": { "request_id": "..." } }
```

```json
{
  "error": { "code": "INSUFFICIENT_FUNDS", "message": "...", "details": {} },
  "meta": { "request_id": "..." }
}
```

Validation failures are `422` with `details.errors` as a list of
`{ "field": "achievements[2].conditions[0].stat_key", "message": "..." }`. The field is a
JSON path, so a dashboard can place the message next to the input. Some configuration
failures use `INVALID_CONFIGURATION`; single-definition edits use `VALIDATION_ERROR`.

| Status | Meaning |
|---|---|
| `400` | Malformed JSON or an invalid field format |
| `401` | Missing, invalid or expired authentication |
| `403` | Authenticated but not allowed (wrong claim policy, banned player) |
| `404` | Missing, or outside the caller's tenant scope |
| `409` | Idempotency conflict or conflicting state (already claimed, save version) |
| `422` | Business validation failure (insufficient funds, stack limit, not completed) |
| `429` | Rate limit or quota exceeded; honour `Retry-After` |
| `500` | Unexpected failure; the response never leaks internals |

## Authentication styles

| Style | Header / selector | Used by |
|---|---|---|
| Dashboard user | `Authorization: Bearer <user JWT>` | Project and configuration routes, player management, bans, activity |
| Player | `Authorization: Bearer <player JWT>` | `/v1/players/me/...`, score submission |
| Server | `X-Server-Credential: <prefix.secret>` | Grants, credits, XP, stats/flags, trusted claims, batch, server saves |
| Public | `environment_id` query or `X-Public-Environment` header | Player registration/login, leaderboard reads |

Dashboard access tokens last 15 minutes. The dashboard keeps its refresh token in an
httpOnly, rotating cookie (`rs_dashboard_refresh`) and renews silently. Player access
tokens are also short-lived; the player client holds the opaque refresh token and rotates
it at `/v1/players/refresh`. Reusing a rotated refresh token revokes its whole family.
