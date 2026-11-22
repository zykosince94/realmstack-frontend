These routes need no dashboard or server credential. They either take a public environment
identifier or a player token.

## Selecting the tenant

Registration and login accept the public environment identifier as:

- `public_environment_id` in the JSON body,
- the legacy alias `environment_id` in the body, or
- the `X-Public-Environment` header.

The value is the environment's `public_id`, for example `pub_realmstack_demo_dev`. An
internal environment UUID is not accepted. The public ID is not a secret and grants no
authorization by itself; it only selects which tenant to authenticate against.

Leaderboard reads accept `?environment_id=<public_id>`. A player token can read the same
board and then also receives that player's rank.

## Registration and login

| Method | Path | Rate limited |
|---|---|---|
| `POST` | `/v1/players/register` | Yes, per IP and route |
| `POST` | `/v1/players/login` | Yes, per IP and route |
| `POST` | `/v1/players/refresh` | Yes |

```bash
curl -s http://localhost:8080/v1/players/register \
  -H 'Content-Type: application/json' \
  -d '{
    "public_environment_id": "pub_realmstack_demo_dev",
    "email": "new.player@example.com",
    "password": "A-long-player-password",
    "display_name": "New Player"
  }'
```

The response contains the player, a short-lived access token and an opaque refresh token.
Store the refresh token securely and rotate it through `/v1/players/refresh`.

A banned player gets `403 PLAYER_BANNED` at login only after a correct password, so a ban is
not revealed to someone who only knows the email. The same code is returned at refresh and
on every player-token request, with the reason and expiry in `details`.

## Leaderboard read

```bash
curl -s 'http://localhost:8080/v1/leaderboards/global?environment_id=pub_realmstack_demo_dev&limit=10'
```

```json
{
  "key": "global",
  "entries": [
    { "player_id": "...", "display_name": "Rookie Pilot", "score": 18450, "rank": 1, "submitted_at": "..." }
  ]
}
```

With a player token:

```bash
curl -s 'http://localhost:8080/v1/leaderboards/global?limit=10' \
  -H "Authorization: Bearer $PLAYER_TOKEN"
```

The response adds `player_rank` and `player_score`. `limit` bounds the top-N scan; the
rank is one indexed count. A board outside its season or inactive is returned as
`422 LEADERBOARD_CLOSED` on submission; reads of an unknown or unpublished board are
`404`.

## Score submission

Score submission is a player route, so it is authenticated even though the board read is
public:

```bash
curl -s http://localhost:8080/v1/leaderboards/global/scores \
  -H "Authorization: Bearer $PLAYER_TOKEN" \
  -H 'Idempotency-Key: score-2026-11-22-1' \
  -H 'Content-Type: application/json' \
  -d '{"score": 18450}'
```

The response is `201` with `leaderboard_key`, `score` and `submitted_at`. The score is an
integer bounded to ±(2^53−1). The best score and earliest tie-break are maintained in the
same transaction.

## Archived projects

Archiving a project stops server credentials, player registration/login/refresh and public
leaderboard reads. An already-issued player access token remains valid until it expires
(up to 15 minutes), a deliberate bounded grace period.

## Health

`GET /healthz` is public and returns a small status envelope. It is suitable for a load
balancer or container health check.
