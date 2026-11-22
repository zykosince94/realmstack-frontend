These are the known limits of RealmStack, stated so you can plan around them. If one blocks
your use case, open an issue that describes it.

## Product scope

- Players never use the dashboard. It is an administrative tool. All player actions are
  admin routes under **Players**.
- No MFA, social login, cross-game identity, password reset flow or session revocation
  without a ban.
- No separate audit log. Ledger rows and their `reason` are the record.
- No payments, matchmaking, guilds, chat, mail, push notifications, anti-cheat, server
  hosting or arbitrary scripting.
- No encryption at rest beyond the AI provider keys; use encrypted database volumes.
- Branching quests and dialogue choices are not supported.

## Dashboard and tenancy

- Profile metadata is not allow-listed; a player can send arbitrary JSON within the size
  limit.
- Project default environment, enabled modules and user `status` are not modelled.
- Project access tokens remain valid for up to 15 minutes after a project is archived,
  because access tokens are stateless.
- Admin writes carry source `api`, so they count toward goals. A corrective grant that must
  not count has no separate source.
- Hidden achievements are unmasked to administrators and the trusted server.

## Bans

- Only the dashboard can ban; a server credential cannot.
- A banned player's leaderboard scores stay visible. Hiding them would require the Redis
  projection to drop and restore entries.
- Another API instance applies a ban within `BAN_SYNC_INTERVAL` (default 5 seconds).
- After a lift, the player's revoked refresh token answers `REFRESH_TOKEN_REUSE`; the
  client must sign in again.
- Expired bans stop applying without a job because expiry is compared on every check.

## Cloud saves

- No earlier versions are kept. A save is state, not a ledger.
- The slot and size limits are constants, not per-project settings.
- Client-written saves are client-authoritative. A game that must not trust its client
  writes saves only from its server.
- There is no cross-device merge algorithm; the game decides what to do on a version
  conflict.

## Activity

- Derived from refresh-token issuance, not real presence. It depends on clients refreshing
  on schedule.
- History is bounded by `REFRESH_TOKEN_TTL` plus the token purge window.
- The query scans the window's token rows and is heavy for a very large tenant; it uses the
  read replica when configured.
- The CCU series ends at the last complete 15-minute bucket; `ccu_now` is a rolling window.

## AI

- Generations run in-process. A restart marks running generations failed with
  `ABANDONED_BY_RESTART`.
- The AI rate limit is per process, not shared across instances.
- The model list is a suggestion. Any model ID is accepted and checked by Test key.
- An OpenAI-compatible service that does not enforce the JSON Schema produces an `invalid`
  proposal, which is rejected; it never reaches the draft.
- AI proposals merge into the single editable draft; they do not create separate draft
  versions.

## Scale and performance

- Per-instance quota counters can overshoot within one 250 ms interval.
- Redis must not evict and is supported as a single-node projection.
- Scores are bounded to ±(2^53−1) so the Redis projection orders them exactly.
- No benchmark results are published. Run the load-test suite on the hardware you intend to
  use before you size a deployment.
- Maintenance and migrations need a direct database connection; a transaction-mode pooler
  cannot keep a session advisory lock.

## Quests and goals

- Evaluating a player's quest log reads each distinct quest window separately, so a log with
  many engaged quests costs more than one with few.
- Auto-accept anchoring cannot see when an unclaimed prerequisite was completed, because
  no time is recorded. The window starts at the latest known anchor.
- Progress is derived on read; there is no stored progress to query or index.

## API contract

- `api/openapi.yaml` documents every route, but response bodies are not machine-checked
  against the implementation. Report any mismatch you find.
