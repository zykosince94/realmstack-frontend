Every route is under `/v1`. Requests and responses are JSON, except save `data`, which is
any JSON value. Timestamps are UTC RFC3339.

The machine-readable contract is [`openapi.yaml`](/openapi.yaml), copied from the backend
repository. The API reference below is the human guide; the OpenAPI file is the source of
truth for request and response schemas.

## Base URLs

Local full stack:

```text
Dashboard proxy: http://localhost:5174/v1
API directly:    http://localhost:8080/v1
Health:          http://localhost:8080/healthz
```

In production, serve the dashboard and API on the same origin behind TLS, or set the
dashboard's `VITE_API_URL` to an API origin the browser can reach.

## Response envelope

Success:

```json
{
  "data": {},
  "meta": { "request_id": "6f1c..." }
}
```

Failure:

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

`meta.request_id` is present on every response and is also in the server logs. Include it
when reporting a problem. Some responses add pagination or limit fields to `meta`:
`next_cursor`, `max_slots`, `max_bytes`.

## Authentication

| Principal | Credential | How it is sent |
|---|---|---|
| Dashboard user | Access JWT | `Authorization: Bearer <token>` |
| Player | Access JWT | `Authorization: Bearer <token>` |
| Trusted server | Environment credential | `X-Server-Credential: <prefix.secret>` |
| Public | Public environment ID | `?environment_id=<public_id>` or `X-Public-Environment` |

Dashboard and player tokens are different kinds. A player token cannot call dashboard
routes, and a dashboard token cannot call player self-service routes. A server credential
is environment-scoped and acts on any player in that environment.

Never put a server credential in a shipped game client. Use a player token in the client
and a server credential only on your backend.

### Dashboard session

`POST /v1/auth/login` returns a 15-minute access token and sets an httpOnly, rotating
refresh cookie (`rs_dashboard_refresh`, path `/v1/auth`, `SameSite=Strict`, `Secure` unless
`APP_ENV=local`). `POST /v1/auth/refresh` rotates the cookie and returns a new access token.
Reusing a rotated cookie revokes the sign-in family and answers `401 SESSION_REUSE`.
`POST /v1/auth/logout` revokes the session and clears the cookie.

### Player session

`POST /v1/players/login` (or register) returns a short-lived access token and an opaque
refresh token. Send the refresh token to `POST /v1/players/refresh` to rotate both. Reusing
a revoked token revokes its family (`401 REFRESH_TOKEN_REUSE`).

## Idempotency

Mutating routes that move value or change player state require:

```http
Idempotency-Key: <unique value for this logical action>
```

Rules:

- Same key + same normalized payload → the original result, with its original status.
- Same key + different payload → `409 IDEMPOTENCY_CONFLICT`.
- Keys are namespaced by actor kind and target player. Dashboard, player and server keys
  do not collide.
- Failed validation stores nothing.
- Records expire after 30 days; a later retry is a new operation.
- Batch entries carry their own key.

Generate a UUID per action and reuse it only while retrying that action.

## Pagination

Cursor-paginated lists (player directory, economy history) return rows plus
`meta.next_cursor`. Pass it back as `?cursor=`. `limit` bounds the page size. Do not assume
a total count.

## Time and time zones

- All timestamps are UTC RFC3339, for example `2026-11-22T12:00:00Z`.
- Windows and seasons are start-inclusive, end-exclusive.
- Daily quest periods reset at 00:00 UTC; weekly periods reset Monday 00:00 UTC.
- The server stamps a mutation with the same clock it used for its checks.

## Limits

| Limit | Default | Notes |
|---|---|---|
| Request body | 1 MiB | Larger bodies are refused |
| Auth attempts | 30/minute per IP and route | `AUTH_RATE_LIMIT_PER_MINUTE` |
| Project request quota | 1,200,000/minute | `project_quotas` or env defaults |
| Project write quota | 600,000/minute | Every batch entry counts as a write |
| Batch entries | 500 | `QUOTA_MAX_BATCH_ENTRIES` |
| Score range | ±(2^53−1) | Redis projection exactness |

Rate-limited responses are `429` with `Retry-After`. The codes are `RATE_LIMITED` for
authentication and `QUOTA_EXCEEDED` for project quotas.

## Status codes

| Status | Meaning |
|---|---|
| `200` | Success |
| `201` | Created (player, ban, save create, score submission) |
| `202` | Accepted (AI generation queued) |
| `400` | Malformed JSON or invalid field format |
| `401` | Missing, invalid or expired authentication |
| `403` | Authenticated but not allowed |
| `404` | Missing or outside the caller's tenant scope |
| `409` | Idempotency conflict or conflicting state |
| `422` | Business validation failure |
| `429` | Rate limit or quota exceeded |
| `500` | Unexpected failure; no internals leaked |

See **Errors and status codes** for the code list.

## cURL setup

```bash
API=http://localhost:8080

DASHBOARD_TOKEN=$(curl -s "$API/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@realmstack.local","password":"RealmStackLocal!2026"}' \
  | python -c 'import json,sys;print(json.load(sys.stdin)["data"]["access_token"])')

PLAYER_TOKEN=$(curl -s "$API/v1/players/login" \
  -H 'Content-Type: application/json' \
  -d '{"public_environment_id":"pub_realmstack_demo_dev","email":"player@realmstack.local","password":"PlayerLocal!2026"}' \
  | python -c 'import json,sys;print(json.load(sys.stdin)["data"]["access_token"])')
```

Then:

```bash
curl -s "$API/v1/players/me" -H "Authorization: Bearer $PLAYER_TOKEN"
curl -s "$API/v1/projects" -H "Authorization: Bearer $DASHBOARD_TOKEN"
```

## Versioning

The URL prefix is `/v1`. Breaking changes should introduce a new prefix rather than
silently changing shapes. The OpenAPI document is the contract used by the generated
TypeScript client; the backend's test suite fails when a route and the document disagree
in either direction.
