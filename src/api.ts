const API_BASE = import.meta.env.VITE_API_URL ?? "";

export type ApiOptions = {
  token?: string;
  headers?: Record<string, string>;
  body?: unknown;
};

/** One validation problem, addressed by a JSON path such as `items[2].max_stack`. */
export type FieldError = { field: string; message: string };

/** An error response from the API, keeping the HTTP status, error code, field errors and the token used. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly token?: string;
  readonly fieldErrors: FieldError[];

  constructor(message: string, status: number, code: string, token?: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.token = token;
    this.fieldErrors = fieldErrors;
  }
}

/** The error's message followed by up to five field errors, for showing in a notice. */
export function describeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (!(error instanceof ApiError) || error.fieldErrors.length === 0) return error.message;
  const shown = error.fieldErrors.slice(0, 5).map((e) => `${e.field} ${e.message}`);
  const more = error.fieldErrors.length - shown.length;
  return `${error.message} ${shown.join("; ")}${more > 0 ? `; and ${more} more` : ""}.`;
}

/** True when the API rejected `token` itself (expired or invalid), as opposed to any other failure. */
export function isExpiredSession(error: unknown, token: string): boolean {
  return error instanceof ApiError && error.status === 401 && error.code === "UNAUTHORIZED" && error.token === token && token !== "";
}

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
    throw new ApiError(`API returned invalid JSON (${response.status}).`, response.status, "INVALID_RESPONSE", options.token);
  }

  if (!response.ok) {
    const body = payload as { error?: { message?: string; code?: string; details?: { errors?: FieldError[] } } } | undefined;
    const code = body?.error?.code ?? "REQUEST_FAILED";
    const fieldErrors = Array.isArray(body?.error?.details?.errors) ? body.error.details.errors : [];
    throw new ApiError(body?.error?.message ?? code, response.status, code, options.token, fieldErrors);
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
