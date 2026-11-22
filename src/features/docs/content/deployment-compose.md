Two Compose stacks are provided. They share host port 8080, so run one at a time. Every
port is bound to `127.0.0.1`; none of these files is a production deployment. For a host
you control, see **Self-hosting**.

## Full stack (dashboard + API + PostgreSQL)

Owned by `realmstack-frontend/`. It builds the API from the sibling backend folder.

```sh
cd realmstack-frontend
cp .env.example .env
docker compose up -d --build --wait
```

| Service | Container | Host port |
|---|---|---|
| `db` | `realmstack-db-1` | `127.0.0.1:5434` |
| `api` | `realmstack-api-1` | `127.0.0.1:8080` |
| `web` | `realmstack-web-1` | `127.0.0.1:5174` |

Images: `realmstack-api:local`, `realmstack-web:local`. Volume: `realmstack_db-data`
(PostgreSQL data).

The dashboard's Vite server proxies `/v1` to the API, so the browser only talks to the web
port. Open <http://localhost:5174>.

### Environment overrides

`.env` values used by the Compose file:

| Variable | Default |
|---|---|
| `POSTGRES_DB` | `realmstack` |
| `POSTGRES_USER` | `realmstack` |
| `POSTGRES_PASSWORD` | `local-dev-only` |
| `POSTGRES_PORT` | `5434` |
| `JWT_SECRET` | local demo value |
| `DEMO_MODE` | `true` |
| `API_PORT` | `8080` |
| `WEB_PORT` | `5174` |
| `AI_ENCRYPTION_KEY` | empty (AI off) |
| `AI_ALLOW_PRIVATE_URLS` | `false` |

Each is a local demo default. Change `JWT_SECRET` and database credentials before any
shared environment.

## Backend-only stack

Owned by `realmstack-backend/`. It runs PostgreSQL and the API, without a dashboard.

```sh
cd realmstack-backend
docker compose up -d --build --wait
```

Containers: `realmstack-backend-db-1`, `realmstack-backend-api-1`. API:
<http://localhost:8080>. The API image is shared with the full stack. This stack seeds
demo data at startup because it sets `APP_ENV=local` and `DEMO_MODE=true`.

## Test stack

```sh
cd realmstack-backend
docker compose -f docker-compose.test.yml run --rm test
docker compose -f docker-compose.test.yml down
```

This runs the full Go suite against PostgreSQL 17. Integration tests use their own schema
per test, so the stack does not need a volume reset between runs.

## Load-test stack

```sh
cd realmstack-backend/loadtest
docker compose up -d --build db pgbouncer1 pgbouncer2 pgbouncer3 redis api1 api2 api3
docker compose run --rm seed
docker compose run --rm k6
docker compose run --rm verify
docker compose --profile tools down -v
```

This is a separate project (`realmstack-load`) and database volume. It seeds 500,000
players and generates millions of ledger rows. Keep it on a drive with room to spare, and
delete the volume when you are done. It never touches the demo stack.

## Demo data and resets

The local seed requires **both** `APP_ENV=local` and `DEMO_MODE=true`. It creates the demo
project, published content, demo players, a cloud save, AI history and 20 crowd players
with a month of sessions. It never overwrites your draft and publishes version 1 only on an
empty database.

To reset the full demo database:

```sh
docker compose down -v
docker compose up --build
```

> `down -v` deletes the local database volume and everything in it.

## Port conflicts

Host port 8080 is commonly occupied on a developer machine. Set `API_PORT` in the
frontend `.env` or the backend Compose environment to another port. The two stacks both
publish 8080, so `docker compose down` one before starting the other.

## Related

- **Configuration reference** for every backend variable.
- **Production checklist** for a real deployment.
- **Scaling and load testing** for the profile and method.
