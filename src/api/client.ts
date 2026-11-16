import createClient from "openapi-fetch";
import type { paths } from "./generated/schema";
import { toApiError } from "./errors";

function apiBase(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured) return configured;
  // Same origin: in development Vite proxies /v1 to the API.
  return typeof window !== "undefined" ? window.location.origin : "http://localhost";
}

/**
 * The typed API client generated from the backend's OpenAPI contract. Paths, path
 * parameters, query strings, request bodies and the Idempotency-Key header are all
 * checked at compile time. fetch is looked up on each call (not captured once), so
 * tests can replace it.
 */
export const client = createClient<paths>({ baseUrl: apiBase(), fetch: (request) => globalThis.fetch(request) });

/** Credentials for one call: a dashboard or player token, or a trusted server credential. */
export type Auth = { token?: string; serverCredential?: string };

export function authHeaders(auth: Auth = {}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (auth.serverCredential) headers["X-Server-Credential"] = auth.serverCredential;
  return headers;
}

type Envelope<T> = { data?: { data: T }; error?: unknown; response: Response };

/**
 * Awaits an openapi-fetch call and returns the envelope's `data`, or throws an ApiError
 * that keeps the status, error code, field errors and which token was used (so a
 * player-token 401 is never mistaken for an expired dashboard session).
 */
export async function unwrap<T>(call: Promise<Envelope<T>>, token?: string): Promise<T> {
  const result = await call;
  if (!result.response.ok || result.error !== undefined) throw toApiError(result.error, result.response.status, token);
  if (!result.data) throw toApiError("", result.response.status, token);
  return result.data.data;
}

/** A fresh key for one logical mutation; reuse it only when retrying that mutation. */
export function idempotencyKey(): string {
  return crypto.randomUUID();
}
