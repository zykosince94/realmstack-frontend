A quest is an active, staged goal. The player accepts it, works through ordered stages and
claims rewards. One model covers story quests, side quests, repeatable quests and timed
event quests.

![The quest canvas with the quest editor open beside the graph](/screenshots/quests.png)

## Definition

```json
{
  "key": "into_the_mine",
  "name": "Into the Mine",
  "description": "Find the ore and bring it back.",
  "chain": "Main Story",
  "requires_quests": ["the_awakening"],
  "requires_achievements": [],
  "repeat": "none",
  "auto_accept": false,
  "claimable_by": "player",
  "available_from": null,
  "available_until": null,
  "stages": [
    {
      "key": "enter",
      "name": "Enter the old mine",
      "conditions": [{ "type": "flag", "flag_key": "entered_the_mine" }],
      "rewards": { "currencies": [{ "currency_key": "credits", "amount": 50 }] }
    },
    {
      "key": "ore",
      "name": "Collect iron ore",
      "conditions": [{ "type": "item_granted", "item_key": "iron_ore", "target": 5 }]
    },
    {
      "key": "return",
      "name": "Return to the blacksmith",
      "conditions": [{ "type": "flag", "flag_key": "returned_to_mentor" }]
    }
  ],
  "rewards": { "items": [{ "item_key": "iron_sword", "quantity": 1 }], "xp": 200 }
}
```

| Field | Meaning |
|---|---|
| `chain` | Optional label for grouping in the dashboard canvas |
| `requires_quests` | Quests that must count as completed |
| `requires_achievements` | Achievements that must be complete (a claim time, when present, also anchors the window) |
| `stages` | 1–20 ordered stages; each has 1–5 conditions and optional rewards |
| `rewards` | Optional completion rewards |
| `claimable_by` | `player` or `server` |
| `auto_accept` | Becomes active without an accept call |
| `repeat` | `none`, `daily` or `weekly` |
| `available_from` / `available_until` | Optional UTC window |

A required quest counts as completed when its completion reward was claimed in any period,
or, for a non-repeating quest, as soon as it is complete.

## Lifecycle and status

Status precedence, first match wins:

1. `claimed` — the completion reward was claimed this period
2. `locked` — a required quest or achievement is not completed
3. `upcoming` — before the availability window
4. `expired` — the window closed and the quest is not complete
5. `completed` — every stage is complete
6. `active` — accepted and in progress
7. `available` — can be accepted

Accepting is allowed only while the quest is available and inside its window. A locked,
upcoming or expired quest is refused with the matching `422` code (`QUEST_LOCKED`,
`QUEST_NOT_AVAILABLE`, `QUEST_EXPIRED`). Accepting an already active quest is
`409 QUEST_ALREADY_ACTIVE`.

Auto-accept quests become active without a call. Their counting window starts when they
became available: the latest of the publish time, the period start, `available_from`, and
the recorded claim times of their prerequisites. A prerequisite that completed without a
claim has no recorded time, so the window starts at the latest of the other anchors.

Abandoning an active quest returns it to `available` and keeps already claimed rewards.
Accepting again sets a new acceptance time, so progress restarts. Stage rewards already
claimed in the same period are not paid again.

## Counting windows and periods

A quest evaluates in `[from, until)`:

- `from` is the acceptance time, or later, the start of the current repeat period.
- `until` is the earlier of the period end and `available_until`.

Counted conditions count ledger activity in that window, whichever stage is current.
Stages still complete strictly in order: stage `n` is complete when its conditions are met
and stages `1…n−1` are complete. When a step must happen after an earlier step, report it
with a flag rather than relying on ordering of unrelated ledger rows.

| Repeat | Period key | Reset |
|---|---|---|
| `none` | empty | Never |
| `daily` | `YYYY-MM-DD` | 00:00 UTC |
| `weekly` | `YYYY-Www` (ISO week) | Monday 00:00 UTC |

Acceptances and claims are unique per player, quest and period.

## Claims

```bash
curl -s http://localhost:8080/v1/players/me/quests/into_the_mine/accept \
  -H "Authorization: Bearer $PLAYER_TOKEN" \
  -H 'Idempotency-Key: accept-into-the-mine-1'

curl -s http://localhost:8080/v1/players/me/quests/into_the_mine/claim \
  -H "Authorization: Bearer $PLAYER_TOKEN" \
  -H 'Idempotency-Key: claim-into-the-mine-1'
```

A claim pays every earned but unclaimed stage reward plus the completion reward in one
idempotent transaction. Each stage reward is stored with its stage index; the completion
reward uses index `-1`. One claim per stage and completion reward per player per period.

- `409 ALREADY_CLAIMED` when the completion reward was already claimed this period.
- `422 NOT_COMPLETED` when no earned reward is waiting.
- `422 QUEST_NOT_ACTIVE` when claiming before accepting.
- `403 CLAIM_NOT_ALLOWED` for a player claiming a `server` policy.

Reward ledger rows use `source='quest'`, so they do not count toward other goals. If any
reward fails, the whole claim rolls back.

The dashboard's admin claim ignores the claim policy; the server route can claim either
policy.

## Validation

Publishing rejects:

- unknown or self prerequisites
- prerequisite cycles across quests (reported on the edge that closes the loop)
- empty quests or more than 20 stages
- duplicate stage keys
- unknown condition references (the same closed set as achievements)
- invalid windows (`available_from` not before `available_until`)
- unknown `repeat` values
- rewards above an item's `max_stack`

Once a quest has acceptances or claims, its `repeat` is fixed and its existing stages must
stay first and in order. New stages may be appended. Use a new quest key if the history
would change meaning.

## Player log

`GET /v1/players/me/quests` returns every quest with its status, current stage, per-stage
condition progress, claimable rewards, and `resets_at` / `expires_at` where relevant. The
server route returns the same unmasked log for any player in scope.

## Dashboard

The **Quests** screen is a React Flow canvas: custom nodes, chain lanes, drag-to-connect
prerequisites with cycle prevention, auto-arrange, minimap, zoom/pan, and a side panel for
stages, conditions, rewards, repeat, window and auto-accept. Node positions persist in the
draft's `editor_layout`; publishing ignores it. A player's quest status and the Accept,
Abandon and Claim actions are under **Players**, not on the canvas.

## Related

- **Stats, flags and achievements** for the shared condition set and claim engine.
- **Core concepts** for the UTC period model.
- **API reference** for exact routes and responses.
