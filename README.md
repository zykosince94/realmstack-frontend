# RealmStack workspace and frontend

This repository contains the RealmStack React + TypeScript developer dashboard and local full-stack Compose setup. The Go API lives in the sibling `realmstack-backend/` Git repository.

## Workspace layout

Keep the two repositories as sibling folders:

```text
Game Backend Projects/
├── RealmStack-MVP-Specification.html   # workspace reference, not in either app repo
├── QuestForge-MVP-Specification.html   # workspace reference, not in either app repo
├── realmstack-backend/                 # independent Go Git repository
└── realmstack-frontend/                # this React Git repository
```

The workspace root is intentionally not a Git repository. This repository owns the integrated Compose file and its demo environment example. The engineering guides live in the workspace-level `study/` folder, outside both repositories. The Compose file builds the API from the sibling backend folder, so clone both repositories into the layout above before starting the whole demo.

## Run the full local demo

Prerequisites: Docker Desktop and both sibling repositories.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Open the dashboard at <http://localhost:5174>. The API listens at <http://localhost:8080>; check <http://localhost:8080/healthz> for readiness. Browser API calls are proxied through Vite. PostgreSQL is published on host port 5434 to avoid colliding with an existing local database.

Local-only seed credentials:

- Dashboard: `admin@realmstack.local` / `RealmStackLocal!2026`
- Player: `player@realmstack.local` / `PlayerLocal!2026`
- Demo server credential: `rs_demo.realmstack-local-server-secret`

Do not expose this Compose stack to the internet or use these credentials outside a disposable development environment.

To clear the demo database volume and reseed from scratch:

```powershell
docker compose down -v
docker compose up --build
```

`docker compose down -v` deletes the local demo database. Do not run it if you want to keep current demo data.

## Run only the frontend

```powershell
npm ci
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/v1` requests to `http://localhost:8080` by default; set `VITE_API_PROXY_TARGET` if the API runs elsewhere. `VITE_*` values are shipped to the browser and must never contain server credentials or signing secrets.

Checks (the same ones CI runs in `.github/workflows/ci.yml`):

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

## Repositories and learning guides

- Backend repo: `../realmstack-backend/` — run Go tests with `go test ./...` and `go vet ./...`.
- Frontend study guide: `../study/realmstack-frontend-guide.html` when using the original workspace.
- Backend study guide: `../study/realmstack-backend-guide.html` when using the original workspace.
- RealmStack MVP reference: [`../RealmStack-MVP-Specification.html`](../RealmStack-MVP-Specification.html) when working in the original workspace.

The demo includes project/environment management, player identity, inventory/economy, progression and leaderboards. AI configuration and the Unity sample are not included. This is a local learning/MVP environment, not a production deployment; configure real secrets, HTTPS, backups, monitoring and abuse protection before external use.
