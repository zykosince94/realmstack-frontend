Every failure uses the same envelope:

```json
{
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "The player does not have enough currency.",
    "details": {}
  },
  "meta": { "request_id": "6f1c..." }
}
```

`code` is stable and safe to branch on. `message` is human-readable and may change.
`details` carries machine-readable context.

## Validation details

Validation failures are `422` and put field errors in `details.errors`:

```json
{
  "error": {
    "code": "INVALID_CONFIGURATION",
    "message": "The configuration is invalid.",
    "details": {
      "errors": [
        { "field": "quests[1].requires_quests[0]", "message": "Creates a prerequisite cycle." },
        { "field": "achievements[2].conditions[0].stat_key", "message": "Unknown stat." }
      ]
    }
  },
  "meta": { "request_id": "..." }
}
```

The `field` is a JSON path into the submitted body. A dashboard maps it to the matching
input. The path uses array indexes, for example `items[2].max_stack`.

| Code | Used by |
|---|---|
| `VALIDATION_ERROR` | Single definitions, body fields, amounts, save bodies |
| `INVALID_CONFIGURATION` | Whole-draft validate and publish, AI proposal apply |
| `INVALID_REQUEST` | Malformed JSON, unknown fields, invalid definition JSON |

## Status semantics

| Status | When |
|---|---|
| `400` | Malformed JSON, invalid format, missing required `Idempotency-Key` |
| `401` | Missing, invalid or expired authentication |
| `403` | Authenticated but not allowed, wrong claim policy, banned player |
| `404` | Missing, or outside the caller's tenant scope |
| `409` | Idempotency conflict or conflicting state |
| `422` | Business validation failure |
| `429` | Rate limit or quota exceeded |
| `500` | Unexpected failure; internals are logged, not returned |

A `404` is deliberately used for an existing resource from another tenant. The API never
confirms whether a UUID exists elsewhere.

## Common codes

### Request and authentication

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | No valid access token or server credential |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `INVALID_REFRESH_TOKEN` | 401 | Unknown, expired or malformed refresh token |
| `REFRESH_TOKEN_REUSE` | 401 | A rotated token was reused; the family is revoked |
| `SESSION_REUSE` | 401 | A rotated dashboard cookie was reused; sign in again |
| `PLAYER_BANNED` | 403 | Ban in force; `details.reason`, `details.expires_at` |
| `RATE_LIMITED` | 429 | Authentication or AI rate limit; honour `Retry-After` |
| `QUOTA_EXCEEDED` | 429 | Project request/write quota exhausted |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Mutation without `Idempotency-Key` |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key, different payload |
| `INVALID_REQUEST` | 400 | Malformed body or unknown fields |
| `INTERNAL_ERROR` | 500 | Unexpected failure |

### Configuration

| Code | Status | Meaning |
|---|---|---|
| `NOT_FOUND` | 404 | Definition or draft entry not found |
| `CONFLICT` | 409 | A definition with that key already exists |
| `VALIDATION_ERROR` | 422 | Invalid definition or body |
| `INVALID_CONFIGURATION` | 422 | Whole configuration is invalid |

### Inventory and economy

| Code | Status | Meaning |
|---|---|---|
| `STACK_LIMIT` | 422 | Grant would exceed `max_stack` |
| `INSUFFICIENT_ITEMS` | 422 | Not enough items to consume |
| `ITEM_NOT_OWNED` | 422 | Equip/unequip target is not owned |
| `ITEM_NOT_EQUIPPABLE` | 422 | Item has no equipment slot |
| `INVALID_SLOT` | 422 | Slot does not match the item |
| `INSUFFICIENT_FUNDS` | 422 | Balance would go below zero |
| `BALANCE_LIMIT` | 422 | Balance would exceed the supported range |
| `WRONG_STAT_KIND` | 422 | Counter used as a flag or the reverse |
| `PROGRESSION_NOT_PUBLISHED` | 422 | XP award before any progression version |

### Leaderboards

| Code | Status | Meaning |
|---|---|---|
| `NOT_FOUND` | 404 | Board is not published or not in scope |
| `LEADERBOARD_CLOSED` | 422 | Board is outside its season or inactive |
| `VALIDATION_ERROR` | 422 | Score is outside ±(2^53−1) or not an integer |

### Achievements and quests

| Code | Status | Meaning |
|---|---|---|
| `CLAIM_NOT_ALLOWED` | 403 | Claim policy requires the server |
| `ALREADY_CLAIMED` | 409 | Already claimed (per period for quests) |
| `NOT_COMPLETED` | 422 | Conditions are not met |
| `REWARD_UNAVAILABLE` | 422 | A reward cannot be paid (for example a full stack); the claim rolls back |
| `QUEST_LOCKED` | 422 | Prerequisites are incomplete |
| `QUEST_NOT_AVAILABLE` | 422 | Not available yet or not acceptable |
| `QUEST_EXPIRED` | 422 | Availability window closed |
| `QUEST_ALREADY_ACTIVE` | 409 | Already accepted |
| `QUEST_NOT_ACTIVE` | 422 | Abandon/claim without an active quest |

### Saves and bans

| Code | Status | Meaning |
|---|---|---|
| `SAVE_VERSION_CONFLICT` | 409 | `expected_version` is stale; `details.current_version` |
| `SAVE_TOO_LARGE` | 422 | Compacted JSON exceeds 256 KiB |
| `SAVE_SLOT_LIMIT` | 422 | Creating more than 10 slots |
| `NOT_FOUND` | 404 | Slot or ban history target not found |
| `NOT_BANNED` | 422 | Lift with no ban in force |

### Batch

| Code | Status | Meaning |
|---|---|---|
| `BATCH_SIZE` | 422 | More entries than the project allows |
| `RETRY` | 409 (per entry) | The entry conflicted with a concurrent write; retry with the same key |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 (per entry) | Entry has no key |

### AI

| Code | Status | Meaning |
|---|---|---|
| `AI_UNAVAILABLE` | 503 | Deployment has no `AI_ENCRYPTION_KEY` |
| `AI_NOT_CONFIGURED` | 409 | User has not saved a provider key |
| `AI_KEY_UNREADABLE` | 409 | Stored key cannot be decrypted (encryption key changed) |
| `AI_KEY_REJECTED` | 422 | Provider rejected the key |
| `AI_MODEL_NOT_FOUND` | 422 | Provider does not offer the model |
| `RATE_LIMITED` | 429 | Per-user AI generation limit |
| `DRAFT_CHANGED` | 409 | Proposal no longer applies to the current draft |
| `ALREADY_APPLIED` | 409 | Generation was already applied |
| `NOT_APPLICABLE` | 422 | Generation is not valid or not applicable |

A finished generation may also record `AI_RATE_LIMITED`, `AI_OUTPUT_TRUNCATED`,
`AI_REFUSED`, `AI_TIMEOUT` or `ABANDONED_BY_RESTART` as its failure code.

## Handling errors

1. Branch on `code`, not `message`.
2. Show `details.errors` beside the matching fields when present.
3. On `401`, refresh once (dashboard cookie or player refresh token) and retry the request.
   Do not treat a player-token `401` as an expired dashboard session.
4. On `409 IDEMPOTENCY_CONFLICT`, do not reuse the key; the earlier request had a different
   payload.
5. On `429`, respect `Retry-After` and add jitter.
6. Always include `meta.request_id` in support reports.
