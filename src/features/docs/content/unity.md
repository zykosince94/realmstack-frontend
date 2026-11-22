This page describes the integration shape a thin C# wrapper should follow; the HTTP
contract is the same one in the API reference.

## Principles

- The client uses a **player access token**, never a server credential.
- The client may submit scores and spend/equip/consume, but grants, credits, XP awards,
  stat/flag writes and server-policy claims happen on your trusted backend.
- Treat the API as authoritative. Do not let the client decide that a purchase or reward
  succeeded before the response says so.
- Store the refresh token in platform-secure storage. Do not put it in a scene, a public
  `PlayerPrefs` value, or version control.
- Keep the access token in memory and refresh before it expires.

## A minimal session flow

1. `POST /v1/players/login` (or register) with the public environment ID.
2. Keep `access_token` in memory and `refresh_token` in secure storage.
3. Before expiry, `POST /v1/players/refresh` with the refresh token; replace both tokens.
4. On `401`, try one refresh, then sign in again. On `403 PLAYER_BANNED`, show
   `details.reason` and `details.expires_at` and stop.
5. On `429`, wait for `Retry-After` plus jitter.

## C# request helper

Unity's `UnityWebRequest` is enough. This example uses `Newtonsoft.Json` (available as a
Unity package) because it handles nested JSON better than `JsonUtility`.

```csharp
using System;
using System.Collections;
using System.Text;
using Newtonsoft.Json;
using UnityEngine;
using UnityEngine.Networking;

public sealed class RealmStackClient
{
    private readonly string api = "https://api.example.com";
    public string AccessToken { get; private set; }

    public IEnumerator Login(string publicEnvironmentId, string email, string password,
                             Action<string> onAccessToken, Action<string> onError)
    {
        var body = JsonConvert.SerializeObject(new {
            public_environment_id = publicEnvironmentId,
            email,
            password
        });
        using var request = new UnityWebRequest($"{api}/v1/players/login", "POST");
        request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
        request.downloadHandler = new DownloadHandlerBuffer();
        request.SetRequestHeader("Content-Type", "application/json");

        yield return request.SendWebRequest();

        if (request.result != UnityWebRequest.Result.Success)
        {
            onError(request.downloadHandler.text);
            yield break;
        }

        var response = JsonConvert.DeserializeObject<Envelope<PlayerSession>>(request.downloadHandler.text);
        AccessToken = response.data.access_token;
        onAccessToken(AccessToken);
        // Persist response.data.refresh_token in secure storage, not PlayerPrefs.
    }

    public IEnumerator Get(string path, Action<string> onJson, Action<string> onError)
    {
        using var request = UnityWebRequest.Get($"{api}{path}");
        request.SetRequestHeader("Authorization", $"Bearer {AccessToken}");
        yield return request.SendWebRequest();
        if (request.result != UnityWebRequest.Result.Success) onError(request.downloadHandler.text);
        else onJson(request.downloadHandler.text);
    }

    public IEnumerator Post(string path, object payload, string idempotencyKey,
                            Action<string> onJson, Action<string> onError)
    {
        var body = JsonConvert.SerializeObject(payload);
        using var request = new UnityWebRequest($"{api}{path}", "POST");
        request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
        request.downloadHandler = new DownloadHandlerBuffer();
        request.SetRequestHeader("Content-Type", "application/json");
        request.SetRequestHeader("Authorization", $"Bearer {AccessToken}");
        request.SetRequestHeader("Idempotency-Key", idempotencyKey);
        yield return request.SendWebRequest();
        if (request.result != UnityWebRequest.Result.Success) onError(request.downloadHandler.text);
        else onJson(request.downloadHandler.text);
    }
}

[Serializable] public sealed class PlayerSession
{
    public string access_token;
    public string refresh_token;
}

[Serializable] public sealed class Envelope<T>
{
    public T data;
}
```

The real response also has `meta.request_id` and `player`; add fields as needed. Use a
source generator or a typed DTO layer if you prefer; do not guess fields, copy them from
`openapi.yaml`.

## Idempotency keys

Generate one key per logical action:

```csharp
string Key() => Guid.NewGuid().ToString("N");
```

Reuse the same key only when retrying that exact request. If a network error leaves the
outcome unknown, retry with the same key and payload. A different payload with the same key
is `409 IDEMPOTENCY_CONFLICT`.

## Recommended call sequence

```text
Login
  → GET /v1/players/me
  → GET /v1/players/me/inventory
  → GET /v1/players/me/currency
  → GET /v1/players/me/progression
  → GET /v1/players/me/achievements
  → GET /v1/players/me/quests

Gameplay:
  → POST spend / consume / equip       (player token, idempotency key)
  → POST score                          (player token)

Your backend:
  → grant / credit / XP / stat / flag   (server credential)
  → server-policy claims
```

A hidden achievement appears masked until it is complete. Do not rely on the client to
unmask it.

## Cloud saves

Read the slot first, keep its `version`, then write with `expected_version`. On
`409 SAVE_VERSION_CONFLICT`, read `details.current_version`, decide whether to merge, and
retry with the new version. If the game trusts its client, the player can overwrite saves;
if not, write saves only from your server.

## Error handling

Parse the error envelope once and expose `code`, `message`, `details` and `request_id`.

| Situation | Action |
|---|---|
| `401 UNAUTHORIZED` / `INVALID_REFRESH_TOKEN` | Refresh once, then sign in |
| `401 REFRESH_TOKEN_REUSE` | Sign in again; the family is revoked |
| `403 PLAYER_BANNED` | Show reason and expiry; do not retry |
| `403 CLAIM_NOT_ALLOWED` | The claim belongs to your server |
| `409 ALREADY_CLAIMED` | Refresh local state; it was already paid |
| `409 SAVE_VERSION_CONFLICT` | Merge and retry with `current_version` |
| `422 NOT_COMPLETED` / `QUEST_LOCKED` | Not an error to retry; refresh progress |
| `429` | Honour `Retry-After`, add jitter |
| `5xx` | Retry with backoff, but reuse the idempotency key |

## Related

- **Players and sessions** for the identity model.
- **API reference** for every route.
- **Cloud saves** for version semantics.
- **Security model** for what must stay on the server.
