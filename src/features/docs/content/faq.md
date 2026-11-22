## Do players use the dashboard?

No. The dashboard is for project owners and administrators. Players use the game client and
the player API. Every player action an administrator needs is under **Players**, using
dashboard-token admin routes that run the same game handlers.

## How do I create my first player?

Use the dashboard's **Test client** (it registers or signs in a demo player the way a game
client does), or call `POST /v1/players/register` with the public environment ID. Then find
the player under **Players**.

## Why is a resource I know exists returning 404?

It is outside your tenant scope. The API returns `404` rather than `403` for another
project's or environment's UUID so it does not confirm existence. Check the project,
environment and credential you are using.

## Why did my idempotent retry return 409?

The key was reused with a different payload. The request hash covers the route, actor and
normalized body. Use a fresh key for a new action; reuse a key only for a retry of the exact
same request.

## I published an item but grants say it does not exist.

Check that you published the environment you are calling. Runtime routes read only the
published configuration, not the draft. `NOT_FOUND` means the item is not published in that
environment.

## How do I change the XP curve without changing existing players?

Publish new thresholds. Each player is pinned to the progression version active at their
first XP award, so existing players keep their curve and level. New players start on the new
version. Migrating existing players to a new curve is not supported.

## How do I reset a player?

There is no reset API. Ledgers are append-only and claims are permanent. For a test player,
register a new one. For a production correction, use compensating ledger rows with a clear
`reason`; do not try to edit history.

## Can I delete a project?

No. Projects are archived, never deleted, so history and ledgers stay intact. Archiving
keeps all data and stops runtime entry points. It can be reactivated.

## Can my game server ban a player?

No. Only the dashboard can ban. The server can still act on a banned player for settlement
or corrections. Use the dashboard for moderation.

## Are cloud saves authoritative?

The client writes them, so they are client-authoritative unless your game writes saves only
from its server. Saves are state, not a ledger: earlier versions are not kept. Use
`expected_version` to prevent silent overwrites.

## Why do the activity numbers differ from real presence?

Activity is derived from session issuance, not a presence system. A player counts as online
in a window in which they logged in, registered or refreshed. The approximation depends on
clients refreshing roughly every 14 minutes and is bounded by refresh-token retention.

## Why can a player not see a hidden achievement?

Hidden achievements are masked until completed. The player sees only the key and status.
The server and dashboard see the full definition and progress.

## Where is the API contract?

`realmstack-backend/api/openapi.yaml`. The documentation sidebar offers a downloadable copy
at `/openapi.yaml`. The frontend's TypeScript client is generated from the same file, so a
route change without a contract update fails the backend test suite.

## Can I run the whole thing locally?

Yes. See **Local Docker Compose**. The full stack is `docker compose up -d --build --wait`
from `realmstack-frontend/`. Demo credentials and seed data are documented there.

## Does the AI assistant publish changes?

No. It proposes definitions, validates them, and applies an approved proposal to the draft.
Publishing is a separate human action in Project settings.

## Can I have more than two environments?

A new project creates `development` and `production` by default and supports creating
environments through the API. Configuration and credentials are scoped per environment.

## What license is the project under?

Apache License 2.0. See `LICENSE` and `NOTICE` in either repository.
