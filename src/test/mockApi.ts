import { vi } from "vitest";

/** meta is merged into the success envelope's meta (e.g. { next_cursor } for pagination). */
export type MockResponse = { status?: number; body?: unknown; meta?: Record<string, unknown> };
export type Handler = MockResponse | ((request: RecordedRequest) => MockResponse);
export type RecordedRequest = { method: string; path: string; query: URLSearchParams; headers: Record<string, string>; body: unknown };

/** "x-server-credential" → "X-Server-Credential", so tests read headers the way they are written. */
function canonical(name: string): string {
  return name.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("-");
}

/**
 * Replaces fetch with an in-memory API. Routes are keyed "METHOD /path" (query string
 * ignored). Successful bodies are wrapped in the API's {data} envelope automatically.
 * Accepts both fetch(url, init) and fetch(Request), which the generated client uses.
 */
export function mockApi(routes: Record<string, Handler>) {
  const requests: RecordedRequest[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const request = input instanceof Request ? input : new Request(new URL(String(input), "http://localhost"), init);
    const url = new URL(request.url);
    const text = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, name) => { headers[canonical(name)] = value; });
    const recorded: RecordedRequest = { method: request.method.toUpperCase(), path: url.pathname, query: url.searchParams, headers, body: text ? JSON.parse(text) : undefined };
    requests.push(recorded);
    const handler = routes[`${recorded.method} ${url.pathname}`];
    if (!handler) {
      return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: `No mock for ${recorded.method} ${url.pathname}` } }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
    const { status = 200, body, meta } = typeof handler === "function" ? handler(recorded) : handler;
    const payload = status >= 400 ? body : { data: body, meta: { request_id: "test", ...meta } };
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    requests,
    find: (method: string, path: string) => requests.filter((r) => r.method === method && r.path === path),
  };
}

export function apiError(status: number, code: string, message = code, details: Record<string, unknown> = {}) {
  return { status, body: { error: { code, message, details }, meta: { request_id: "test" } } };
}
