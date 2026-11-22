# Contributing to the RealmStack dashboard

Thanks for helping. Bug reports, documentation fixes and focused pull requests are welcome.
For anything larger than a fix, open an issue first so we can agree on the approach.

## Set up

You need Node 22 or newer.

```sh
npm ci
npm run lint && npm run typecheck && npm test && npm run build
npm run dev          # http://localhost:5173, proxies /v1 to http://localhost:8080
```

Lint must stay at zero warnings. To run against a real API, start the full demo stack with
`docker compose up -d --build --wait` (it builds the API from the `realmstack-backend`
repository, which must be cloned next to this one).

## Conventions

- **Never hand-write API types.** After a backend contract change run `npm run generate:api`
  (regenerates `src/api/generated/schema.ts`) and `npm run sync:openapi` (refreshes the
  downloadable `public/openapi.yaml`); `npm run check:openapi` verifies the copy. Call the API
  only through the typed `client` and `unwrap`.
- **Server data lives in TanStack Query**, keyed by project and environment. Invalidate what a
  mutation changed.
- **Player actions live only in the Players screen.** Configuration screens never carry
  player state or server credentials.
- **Every screen has loading, empty, success and error states.** Destructive actions ask for
  confirmation and are tested. Field errors from the API are shown next to their inputs.
- **Documentation is Markdown** under `src/features/docs/content/`. Update the page that
  describes a behaviour you change, and the API reference when routes change.
- `VITE_*` values are public. Never put a secret in them.
- Add tests with the change (Vitest and Testing Library), keep pull requests small, and use
  conventional commit subjects (`feat:`, `fix:`, `docs:`, `chore:`).
- Retake the screenshots in `public/screenshots/` when a change alters a screen they show.

## License

By contributing you agree that your contribution is licensed under the Apache License 2.0,
the same license as the project.
