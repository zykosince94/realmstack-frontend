# RealmStack workspace and frontend

This repository contains the RealmStack React + TypeScript developer dashboard and local full-stack Compose setup. The Go API lives in the sibling `realmstack-backend/` Git repository.

## Workspace layout

Keep the two repositories as sibling folders:

```text
Game Backend Projects/
├── RealmStack-MVP-Specification.html   # workspace reference, not in either app repo
├── realmstack-backend/                 # independent Go Git repository
└── realmstack-frontend/                # this React Git repository
```

The workspace root is intentionally not a Git repository. This repository owns the integrated Compose file and its demo environment example. The engineering guides live in the workspace-level `study/` folder, outside both repositories. The Compose file builds the API from the sibling backend folder, so clone both repositories into the layout above before starting the whole demo.

## Run the full local demo

Prerequisites: Docker Desktop and both sibling repositories.

```powershell
Copy-Item .env.example .env
docker compose up -d --build --wait
```

The stack is the Compose project `realmstack`: containers `realmstack-db-1`, `realmstack-api-1` and `realmstack-web-1` (list them with `docker compose ps`), images `realmstack-api:local` and `realmstack-web:local`, and the database volume `realmstack_db-data`. All ports are bound to `127.0.0.1`.

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

## Code layout

```text
src/main.tsx                 React root + TanStack Query provider
src/app/                     App shell (sign-in, project/environment selection, navigation), workspace context, query client
src/api/generated/schema.ts  generated from ../realmstack-backend/api/openapi.yaml; never edit by hand
src/api/client.ts            typed openapi-fetch client, unwrap(), authHeaders(), idempotencyKey()
src/api/errors.ts            ApiError (status, code, field errors, token), describeError, isExpiredSession
src/api/types.ts             friendly aliases for generated types
src/hooks/queries.ts         query keys and hooks (draft, validation, published, credentials, achievement/quest stats, player data)
src/hooks/useMediaQuery.ts   media-query hook (the quest editor's narrow-screen fallback)
src/components/ui.tsx        shared presentational pieces
src/lib/config.ts            pure helpers (select keys, slots, thresholds, conditions, field-error mapping)
src/lib/quests.ts            pure quest-graph helpers (loop checks, connect/disconnect, chain lanes, dagre layout, editor_layout)
src/features/<screen>/       one folder per screen: overview, players, economy, progression,
                             leaderboards, stats, achievements, quests, settings, auth, projects
src/features/test-client/    the Test client: registers or signs in a demo player the way a game client does (a way to create players to manage)
src/features/players/        Players: directory, profile and every player-side action (PlayerTabs); hooks/playerActions.ts holds the admin calls
src/features/goals/          condition builder and reward picker shared by achievements and quests
src/features/ai-config/      AI assistant: generate, review, apply, publish (lazy-loaded); AIProviderPanel is the provider/key form shown in Project settings
src/lib/ai.ts                pure helpers for the AI screen (operations, params, proposal rows)
src/test/                    fetch mock, shared fixtures, renderApp(), React Flow/matchMedia stand-ins for jsdom
```

**Request and response types are generated, never hand-written.** After the backend changes `api/openapi.yaml`, regenerate and commit the result:

```powershell
npm run generate:api   # reads ../realmstack-backend/api/openapi.yaml
```

The generated file is committed so this repository builds on its own (CI cannot see the backend repository). TypeScript then flags every call that no longer matches the contract.

Server data lives in the TanStack Query cache, keyed by project and environment (`src/hooks/queries.ts`); a mutation refreshes what it changed by invalidating those keys. Local form state stays in `useState`.

The Quests screen is loaded lazily (`React.lazy` in `src/app/App.tsx`): React Flow (`@xyflow/react`), `@dagrejs/dagre` and `@dnd-kit` ship in a separate chunk that downloads only when the screen opens. Node positions are saved in the draft's `editor_layout.quests`; publishing ignores them.

## Repositories and learning guides

- Backend repo: `../realmstack-backend/` — run Go tests with `go test ./...` and `go vet ./...`.
- Frontend study guide: `../study/realmstack-frontend-guide.html` when using the original workspace.
- Backend study guide: `../study/realmstack-backend-guide.html` when using the original workspace.
- RealmStack MVP reference: [`../RealmStack-MVP-Specification.html`](../RealmStack-MVP-Specification.html) when working in the original workspace.

The demo includes project/environment management, a Players screen where an admin looks players up and manages them (grant items, credit or deduct currency, award XP, submit scores, increment stats and set flags, claim achievements, accept, abandon and claim quests; players never use the dashboard, so no feature screen has player panels) and a separate Test client that registers a demo player the way a game client does, inventory/economy, progression, leaderboards, stats & flags, achievements (card grid, side-panel editor with condition builder and reward picker, inline validation issues, claim statistics, and a player preview with Claim), quests (React Flow canvas with chain lanes, drag-to-connect prerequisites with loop prevention, auto-arrange, minimap; side panel with drag-to-reorder stages; issue bar; player preview with Accept, Abandon and Claim; a list on narrow screens), an optional AI assistant (your own OpenAI or OpenAI-compatible key, set in Project settings; proposals are validated, applied to the draft only after confirmation, then published), version history with restore and per-version export, and configuration import/export as JSON in Project settings. Sessions survive a reload (an httpOnly refresh cookie), and the demo seeds an AI assistant history covering every operation and outcome. The Unity sample is not included yet. To enable AI in the Compose stack, set `AI_ENCRYPTION_KEY` in `.env` (see `.env.example`). This is a local learning/MVP environment, not a production deployment; configure real secrets, HTTPS, backups, monitoring and abuse protection before external use.
