RealmStack assumes a hostile network and an untrusted game client. The server enforces
tenancy, value and state; the client is not trusted with secrets or authoritative writes.

## Tokens and credentials

| Secret | Storage | Lifetime |
|---|---|---|
| Dashboard password | bcrypt hash | Until changed |
| Player password | bcrypt hash | Until changed |
| Dashboard access token | Memory in the browser | 15 minutes |
| Dashboard refresh token | httpOnly, `SameSite=Strict` cookie | 30 days, rotating |
| Player access token | Client memory | 15 minutes |
| Player refresh token | Client secure storage | 30 days, rotating |
| Server credential | Only a hash in the database | Until revoked |

- Passwords use bcrypt (`BCRYPT_COST`, default 10). Login uses a dummy hash for unknown
  emails so response timing does not reveal whether an account exists.
- Refresh tokens are stored as hashes. Reuse of a rotated token revokes its whole family.
- Server credential secrets are shown once and stored as hashes. Only the prefix is listed
  afterwards.
- Access tokens are HS256 JWTs signed with `JWT_SECRET`. Rotating the secret signs everyone
  out. The verifier always computes HS256, so the token header cannot downgrade the
  algorithm.

## Tenancy

Every project-owned row carries `project_id` and `environment_id`. Scope comes from the
authenticated principal, never from a request body.

- Dashboard routes check project ownership.
- Server routes resolve the credential's environment; a player outside it is `404`.
- Admin player routes resolve the owned environment; a player outside it is `404`.
- Composite foreign keys link rows to their tenant so a mismatched join fails in the
  database, not only in a handler.
- UUIDs are not authorization. A valid UUID from another tenant is indistinguishable from a
  missing one.

Cross-tenant and cross-environment cases are covered by integration tests for each resource
family.

## Idempotency

Idempotency records are scoped by actor kind (`player`, `server`, `admin`) and target
player, and the request hash covers the route and normalized payload. Replaying a key
returns the stored result; a different payload is `409`. Failed validation stores nothing.
Records expire after 30 days.

## Ledger integrity

Economy, XP, score, stat and claim ledgers are append-only. Database triggers reject
`UPDATE` and `DELETE`. Corrections are compensating rows. Goal evaluation counts only
`source='api'` rows, so rewards paid by another goal cannot cascade.

## Rate limits and size limits

- Registration, login, refresh and AI generation are rate limited.
- Per-project request, write and batch quotas return `429` with `Retry-After`.
- Request bodies are limited to 1 MiB by default.
- `TRUSTED_PROXIES` controls which proxies may supply `X-Forwarded-For`; leave it empty if
  no proxy is trusted.
- Score values are bounded to ±(2^53−1).

## Secrets in logs

Structured logs include request IDs, operation names, status and durations. They do not
include passwords, tokens, provider keys, prompts or generated outputs. Do not add
request-body logging without redaction.

## AI-specific security

- Provider keys are encrypted at rest with AES-256-GCM using `AI_ENCRYPTION_KEY`, with the
  user ID as additional authenticated data. They are write-only: responses show only the
  last four characters.
- A stored key is sent only to the provider and base URL it was saved with. Changing either
  requires re-entering the key.
- A user-supplied base URL must be `https` and public. Private, loopback, link-local and
  carrier-grade-NAT addresses are refused, the check repeats on the dialled IP, and
  redirects are not followed. `AI_ALLOW_PRIVATE_URLS=true` is the deliberate exception for
  a local model server.
- The prompt is built only from the draft through an allow-list. No player, ledger,
  credential, email or live economy data is sent.
- AI output is a proposal. Strict decoding rejects unknown fields, `CheckConfig` validates
  it, apply edits only the draft, and publishing remains a human action.

## What is not included

- No MFA, social login or password reset flow.
- No separate audit log; ledger rows and their `reason` are the record.
- No session revocation without a ban.
- No server-credential ban.
- No anti-cheat; scores are the game server's responsibility.
- No encryption at rest beyond provider keys; use encrypted database volumes.
- No CSRF token on the dashboard because the refresh cookie is `SameSite=Strict` and the
  access token is a bearer header. If you change the cookie policy, add CSRF protection.

## Reporting a vulnerability

Do not open a public issue with exploit details. Report it privately through the
repository's **Security** tab (see `SECURITY.md`), and include the affected route, a minimal
reproduction, and the request ID if available.
