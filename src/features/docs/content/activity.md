The dashboard's **Dashboard** screen shows who is playing: online now, the 24-hour peak,
active today, a concurrent-players chart and a daily-active-players chart. The data is an
approximation derived from session issuance, not a real presence system.

## Endpoint

```http
GET /v1/projects/{projectId}/environments/{envId}/activity
Authorization: Bearer <dashboard token>
```

```json
{
  "generated_at": "2026-11-22T12:00:00Z",
  "bucket_minutes": 15,
  "ccu_now": 6,
  "ccu_peak_24h": 8,
  "dau_today": 12,
  "ccu": [
    { "at": "2026-11-22T09:45:00Z", "players": 4 }
  ],
  "dau": [
    { "date": "2026-10-24", "players": 10 }
  ]
}
```

| Field | Meaning |
|---|---|
| `ccu` | 96 complete 15-minute windows over the last 24 hours |
| `dau` | 30 UTC days, oldest first |
| `ccu_now` | Players in the rolling last 15 minutes |
| `ccu_peak_24h` | Highest bucket in the 24-hour window |
| `dau_today` | Players active today (UTC) |
| `bucket_minutes` | 15 |

The CCU series ends at the last complete bucket, not the current partial one. `ccu_now` is
a separate rolling window.

## How it is derived

Every player login, registration and refresh inserts a `refresh_tokens` row. A running
game refreshes roughly every 14 minutes because access tokens live 15 minutes. The
activity query counts a player as online in a window in which a session was issued for
them, and as active on a UTC day on which one was.

This needs no extra tracking and no client instrumentation.

## Limits of the approximation

- It depends on clients refreshing on schedule. A client that refreshes late appears in a
  later bucket; a client that stops refreshing disappears.
- History is bounded by refresh-token retention. Maintenance deletes tokens a day after
  expiry, so `REFRESH_TOKEN_TTL` (default 30 days) bounds the DAU window.
- The query scans the window's token rows. Migration 015 adds the index that makes this
  practical, but it is still heavy for a very large tenant. The read uses the configured
  read replica.
- A real presence system could replace the source without changing the response shape.

## No player identifiers

The response contains counts only. It never returns player IDs, emails or display names.
The dashboard charts add a table view and a keyboard/hover readout for accessibility.

## Related

- **Deployment → Configuration** for `REFRESH_TOKEN_TTL`.
- **Deployment → Operations** for the maintenance job.
- **Known limits** for the activity approximation.
