const API_BASE = import.meta.env.VITE_API_URL ?? "";

export type ApiOptions = {
  token?: string;
  headers?: Record<string, string>;
  body?: unknown;
};

export async function api<T>(
  path: string,
  method = "GET",
  options: ApiOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const raw = await response.text();
  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : undefined;
  } catch {
    throw new Error(`API returned invalid JSON (${response.status}).`);
  }

  if (!response.ok) {
    const body = payload as { error?: { message?: string; code?: string } } | undefined;
    throw new Error(body?.error?.message ?? body?.error?.code ?? `Request failed (${response.status}).`);
  }

  if (
    payload !== null &&
    typeof payload === "object" &&
    "data" in payload
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export function idempotencyKey(): string {
  return crypto.randomUUID();
}
