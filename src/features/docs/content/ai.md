The AI assistant is optional. A dashboard user brings their own OpenAI-compatible key; the
assistant drafts configuration and a human reviews and publishes it. Every other feature
works with AI disabled.

![The AI assistant generating 10 enchanted swords with the proposal JSON open](/screenshots/ai-assistant.png)

## Enabling it

Set `AI_ENCRYPTION_KEY` to a base64-encoded 32-byte key:

```bash
openssl rand -base64 32
```

Without it, the AI routes answer `503 AI_UNAVAILABLE`. A key that is set but malformed
stops startup, because that is an operator mistake. Changing the key makes stored provider
keys unreadable; users must re-enter them.

Optional limits:

| Variable | Default | Meaning |
|---|---|---|
| `AI_TIMEOUT` | `3m` | Per-generation provider timeout |
| `AI_MAX_OUTPUT_TOKENS` | `32000` | Output token cap |
| `AI_GENERATIONS_PER_MINUTE` | `6` | Per-user, in-process rate limit |
| `AI_MAX_RUNNING_PER_USER` | `2` | Concurrent generations per user |
| `AI_ALLOW_PRIVATE_URLS` | `false` | Allow http/private base URLs for a local model server |

## Provider settings

Settings belong to the dashboard user, not to a project.

| Route | Purpose |
|---|---|
| `GET /v1/ai/settings` | Current provider, model and `key_last4`; never the key |
| `PUT /v1/ai/settings` | Save provider, model and optional API key |
| `DELETE /v1/ai/settings` | Remove the stored settings and key |
| `POST /v1/ai/settings/test` | Re-check the saved key and model |

```json
{
  "provider": "openai_compatible",
  "base_url": "https://openrouter.ai/api/v1",
  "model": "nvidia/nemotron-3.5-super-vl:free",
  "api_key": "sk-..."
}
```

For `openai`, the base URL is fixed. For `openai_compatible`, the user supplies a base URL
that implements Chat Completions (OpenRouter, Together, Groq, vLLM, Ollama and others).
Omit `api_key` to change only the model.

The key is encrypted with AES-256-GCM using the user ID as additional authenticated data.
It is write-only: responses expose only the last four characters. A stored key is kept
only for its provider and base URL; changing either requires entering the key again.

Saving settings runs a provider check first and stores nothing if it fails. The check is
`GET /key` where the service has one, then `GET /models`, at no token cost. Error messages
say what to do without repeating the provider's text, which could echo part of a key.

### Why the base URL is restricted

The URL is user input, so the server would otherwise call any address a user typed. It must
be `https`, with no credentials, query or fragment, and must not resolve to a private,
loopback, link-local or carrier-grade-NAT address. The check repeats on the address
actually dialled after DNS, and redirects are never followed. A local model server needs
the operator to set `AI_ALLOW_PRIVATE_URLS=true`, which also allows `http`.

## Generations

Generations are environment-scoped:

```http
POST /v1/projects/{projectId}/environments/{envId}/ai/generations
Authorization: Bearer <dashboard token>
Content-Type: application/json

{
  "operation": "quests",
  "params": { "brief": "A mining village mystery", "count": 3, "quest_type": "story", "stage_count": 3 },
  "merge_policy": "add"
}
```

The call answers `202` with a generation ID. Poll
`GET .../ai/generations/{id}` for status.

| Operation | Output |
|---|---|
| `items` | Item definitions |
| `economy` | Currencies plus advisory prices |
| `progression` | Versioned cumulative XP thresholds |
| `achievements` | Achievement definitions and any stats/flags they need |
| `quests` | Quest definitions, stages, prerequisites and rewards |
| `explain` | An explanation grounded in the supplied draft |
| `tests` | Candidate positive and negative test cases |

`merge_policy: add` refuses keys that already exist; `replace` overwrites them.

Generation status:

| Status | Meaning |
|---|---|
| `valid` | The proposal merged and passed `CheckConfig` |
| `invalid` | Field errors; never applied |
| `answered` | An explain/tests answer |
| `failed` | Provider failure, with a code such as `AI_RATE_LIMITED`, `AI_OUTPUT_TRUNCATED`, `AI_REFUSED` or `AI_TIMEOUT` |

The proposal is decoded strictly (unknown fields rejected), merged into a copy of the
draft, and checked with the same rules publish uses.

## Apply is human approval, not publishing

`POST .../ai/generations/{id}/apply` merges a `valid` proposal into the **draft** after
re-validating it against the current draft. It never publishes.

- `409 DRAFT_CHANGED` if the proposal no longer fits the draft.
- `409 ALREADY_APPLIED` if it was already applied.
- `422 NOT_APPLICABLE` if the generation is not valid.

`POST .../discard` closes a finished generation. Publishing remains a separate, explicit
step in Project settings.

## What the model sees

The prompt is built only from the draft through an allow-list in `buildContext`: keys,
names, kinds, conditions and rewards, with item metadata reduced to the slot. No player,
ledger, credential, email or live economy data is sent. Logs record operation, status, token
usage and duration, never keys, prompts or outputs.

## Operational notes

- Generations run in the background because a provider call can take minutes; the HTTP
  write timeout is 30 seconds.
- A generation running when the process exits is marked failed with
  `ABANDONED_BY_RESTART` on the next start. Graceful shutdown waits for running
  generations within its grace period.
- The model list in the dashboard is a suggestion. Any model ID is accepted; Test key
  checks it against the provider.

## Draft-only proposals

AI output is stored in `ai_generations`. Applying an approved proposal edits the single
editable draft; it does not create a configuration version. Version numbering and the
published configuration stay untouched until a person publishes.

## Related

- **Configuration** in Core concepts.
- **Security model** for key encryption and SSRF defence.
- **Project settings** in the dashboard houses the provider form.
