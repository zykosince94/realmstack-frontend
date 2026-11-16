import { vi } from "vitest";

export type MockResponse = { status?: number; body?: unknown };
export type Handler = MockResponse | ((request: RecordedRequest) => MockResponse);
export type RecordedRequest = { method: string; path: string; headers: Record<string, string>; body: unknown };

/**
 * Replaces fetch with an in-memory API. Routes are keyed "METHOD /path" (query string
 * ignored). Successful bodies are wrapped in the API's {data} envelope automatically.
 */
export function mockApi(routes: Record<string, Handler>) {
  const requests: RecordedRequest[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init.method ?? "GET").toUpperCase();
    const request: RecordedRequest = {
      method,
      path: url.pathname,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) {
      return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: `No mock for ${method} ${url.pathname}` } }), { status: 404 });
    }
    const { status = 200, body } = typeof handler === "function" ? handler(request) : handler;
    const payload = status >= 400 ? body : { data: body, meta: { request_id: "test" } };
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    requests,
    find: (method: string, path: string) => requests.filter((r) => r.method === method && r.path === path),
  };
}

export function apiError(status: number, code: string, message = code) {
  return { status, body: { error: { code, message }, meta: { request_id: "test" } } };
}
