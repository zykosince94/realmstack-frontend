This page takes you from a clean checkout to a running dashboard and your first API
calls. It assumes Docker Desktop; running from source is covered at the end.

## 1. Start the full demo

From `realmstack-frontend/` (it builds the API from the sibling backend folder):

```sh
cp .env.example .env
docker compose up -d --build --wait
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:5174 |
| API | http://localhost:8080 |
| Health check | http://localhost:8080/healthz |
| PostgreSQL | `127.0.0.1:5434` |

The stack is the Compose project `realmstack`; containers are `realmstack-db-1`,
`realmstack-api-1` and `realmstack-web-1`. Ports are bound to loopback.

The local seed is enabled only when `APP_ENV=local` and `DEMO_MODE=true`:

| Purpose | Value |
|---|---|
| Dashboard login | `admin@realmstack.local` / `RealmStackLocal!2026` |
| Clean-workspace login | `admin` / `RealmStackLocal!2026` (no projects) |
| Player login | `player@realmstack.local` / `PlayerLocal!2026` |
| Public environment ID | `pub_realmstack_demo_dev` |
| Demo server credential | `rs_demo.realmstack-local-server-secret` |

These are demo-only values. Never reuse them outside a disposable local environment.

> The seed publishes version 1 only on an empty database and never overwrites your draft.
> To start over with fresh demo content, run `docker compose down -v`. This deletes the
> demo database.

If host port 8080 is already in use, set `API_PORT` (for example `API_PORT=8090`) in
`.env`. The dashboard proxies `/v1` to the API inside Compose, so the browser still only
needs the web port.

## 2. Publish something

1. Sign in to the dashboard.
2. Pick the demo project and the **development** environment.
3. Open **Project settings** and note the public environment ID and any server
   credentials.
4. Open **Inventory & economy**, **Progression**, **Stats & flags**, **Achievements** and
   **Quests** to see the seeded configuration.
5. Publishing is explicit: edits change the draft only. Use **Publish configuration** in
   Project settings when the draft is valid.

Runtime routes read only the published configuration. A player cannot receive an item
that exists only in the draft.

## 3. Register or sign in a player

The public environment identifier selects the tenant. Internal UUIDs are not accepted for
registration or login.

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

The response contains a player object, a short-lived `access_token` and an opaque
`refresh_token`. Send the access token as `Authorization: Bearer <token>`.

```bash
curl -s http://localhost:8080/v1/players/login \
  -H 'Content-Type: application/json' \
  -d '{
    "public_environment_id": "pub_realmstack_demo_dev",
    "email": "player@realmstack.local",
    "password": "PlayerLocal!2026"
  }'
```

The dashboard's **Test client** does the same thing: it registers or signs in a demo
player the way a game client would, so you have players to manage under **Players**.

![The Test client for registering or signing in a demo player](/screenshots/test-client.png)

## 4. Make a trusted write

Only a server credential may grant items, credit currency, award XP, increment stats or
set flags. The demo credential is valid only in the local stack.

```bash
PLAYER_ID='<player id from login>'

curl -s "http://localhost:8080/v1/server/players/$PLAYER_ID/items/grant" \
  -H 'X-Server-Credential: rs_demo.realmstack-local-server-secret' \
  -H 'Idempotency-Key: starter-sword-1' \
  -H 'Content-Type: application/json' \
  -d '{"item_key":"iron_sword","quantity":1,"reason":"new_player","reference":"starter"}'
```

Every write in this documentation needs its own `Idempotency-Key`. Reusing a key with the
same payload returns the original result; reusing it with a different payload is a `409`.

Read the player's inventory back with their access token:

```bash
curl -s http://localhost:8080/v1/players/me/inventory \
  -H "Authorization: Bearer $PLAYER_TOKEN"
```

## 5. Try the rest of the loop

```bash
# Credit currency (server)
curl -s "http://localhost:8080/v1/server/players/$PLAYER_ID/currency/credit" \
  -H 'X-Server-Credential: rs_demo.realmstack-local-server-secret' \
  -H 'Idempotency-Key: welcome-credits-1' -H 'Content-Type: application/json' \
  -d '{"currency_key":"credits","amount":250,"reason":"welcome"}'

# Award XP (server)
curl -s "http://localhost:8080/v1/server/players/$PLAYER_ID/xp/award" \
  -H 'X-Server-Credential: rs_demo.realmstack-local-server-secret' \
  -H 'Idempotency-Key: first-xp-1' -H 'Content-Type: application/json' \
  -d '{"amount":120,"reason":"tutorial"}'

# Submit a score (player)
curl -s http://localhost:8080/v1/leaderboards/global/scores \
  -H "Authorization: Bearer $PLAYER_TOKEN" \
  -H 'Idempotency-Key: score-1' -H 'Content-Type: application/json' \
  -d '{"score":18450}'

# Read the board (public scope)
curl -s 'http://localhost:8080/v1/leaderboards/global?environment_id=pub_realmstack_demo_dev&limit=10'
```

Achievements evaluate from the ledgers, so an achievement whose conditions are now met
shows as `completed` and can be claimed exactly once. Quests must be accepted before
their windows start counting. Use **Players** in the dashboard to inspect both and to
perform every action without a player token.

## 6. Run from source

Backend (Go 1.27 and PostgreSQL 17):

```sh
cd realmstack-backend
cp .env.example .env
# Set JWT_SECRET to at least 32 random characters.
go run ./cmd/api
```

Frontend (Node 22+):

```sh
cd realmstack-frontend
npm ci
npm run dev
```

Vite serves the dashboard on `:5173` and proxies `/v1` to `VITE_API_PROXY_TARGET`
(default `http://localhost:8080`). For a different API origin, set that variable in
`.env.local`.

## 7. Where to go next

- **Core concepts** explains drafts, publishing, idempotency and UTC windows.
- **Feature guides** cover the rules behind each service.
- **API reference** has every route and error code.
- **Deployment** covers configuration and production.
- The OpenAPI contract can be downloaded from the API reference sidebar.
