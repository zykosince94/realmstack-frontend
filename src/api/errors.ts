import type { Schemas } from "./types";

/** One validation problem, addressed by a JSON path such as `items[2].max_stack`. */
export type FieldError = Schemas["FieldError"];

/** An error response from the API, keeping the HTTP status, error code, field errors and the token used. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly token?: string;
  readonly fieldErrors: FieldError[];
  readonly details: Record<string, unknown>;

  constructor(message: string, status: number, code: string, token?: string, fieldErrors: FieldError[] = [], details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.token = token;
    this.fieldErrors = fieldErrors;
    this.details = details;
  }
}

/** Builds an ApiError from a parsed error body (or anything else the server sent). */
export function toApiError(body: unknown, status: number, token?: string): ApiError {
  const error = (body as { error?: { message?: string; code?: string; details?: Record<string, unknown> } } | undefined)?.error;
  const code = error?.code ?? (typeof body === "string" ? "INVALID_RESPONSE" : "REQUEST_FAILED");
  const message = error?.message ?? (code === "INVALID_RESPONSE" ? `API returned invalid JSON (${status}).` : code);
  const details = error?.details ?? {};
  const fieldErrors = Array.isArray(details.errors) ? (details.errors as FieldError[]) : [];
  return new ApiError(message, status, code, token, fieldErrors, details);
}

/** True when the API rejected `token` itself (expired or invalid), as opposed to any other failure. */
export function isExpiredSession(error: unknown, token: string): boolean {
  return error instanceof ApiError && error.status === 401 && error.code === "UNAUTHORIZED" && error.token === token && token !== "";
}

/** The error's message followed by up to five field errors, for showing in a notice. */
export function describeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (!(error instanceof ApiError) || error.fieldErrors.length === 0) return error.message;
  const shown = error.fieldErrors.slice(0, 5).map((e) => `${e.field} ${e.message}`);
  const more = error.fieldErrors.length - shown.length;
  return `${error.message} ${shown.join("; ")}${more > 0 ? `; and ${more} more` : ""}.`;
}
