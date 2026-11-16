import { describe, expect, it, vi } from "vitest";
import { api, ApiError, describeError, isExpiredSession } from "./api";
import { apiError, mockApi } from "./test/mockApi";

describe("api", () => {
  it("unwraps the data envelope and sends auth, JSON and custom headers", async () => {
    const server = mockApi({ "POST /v1/thing": { body: { ok: true } } });
    const result = await api<{ ok: boolean }>("/v1/thing", "POST", { token: "t1", body: { a: 1 }, headers: { "Idempotency-Key": "k" } });
    expect(result).toEqual({ ok: true });
    const [request] = server.requests;
    expect(request.headers.Authorization).toBe("Bearer t1");
    expect(request.headers["Content-Type"]).toBe("application/json");
    expect(request.headers["Idempotency-Key"]).toBe("k");
    expect(request.body).toEqual({ a: 1 });
  });

  it("throws ApiError with status, code, message and the token used", async () => {
    mockApi({ "GET /v1/fail": apiError(422, "INSUFFICIENT_FUNDS", "Not enough Credits.") });
    const error = await api("/v1/fail", "GET", { token: "t2" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: "INSUFFICIENT_FUNDS", message: "Not enough Credits.", token: "t2" });
  });

  it("keeps field-level errors from the error details", async () => {
    mockApi({ "POST /v1/publish": { status: 422, body: { error: { code: "INVALID_CONFIGURATION", message: "The configuration is invalid.", details: { errors: [{ field: "items[0].key", message: "is invalid" }] } } } } });
    const error = await api("/v1/publish", "POST").catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "INVALID_CONFIGURATION", fieldErrors: [{ field: "items[0].key", message: "is invalid" }] });
  });

  it("reports invalid JSON responses clearly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>gateway error</html>", { status: 502 })));
    await expect(api("/v1/x")).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
  });
});

describe("isExpiredSession", () => {
  const expired = new ApiError("A valid access token is required.", 401, "UNAUTHORIZED", "dash");
  it("is true only for a 401 UNAUTHORIZED on the given dashboard token", () => {
    expect(isExpiredSession(expired, "dash")).toBe(true);
  });
  it("ignores 401s for other tokens, such as a demo player's", () => {
    expect(isExpiredSession(new ApiError("x", 401, "UNAUTHORIZED", "player"), "dash")).toBe(false);
  });
  it("ignores other 401 codes and other errors", () => {
    expect(isExpiredSession(new ApiError("x", 401, "INVALID_CREDENTIALS", "dash"), "dash")).toBe(false);
    expect(isExpiredSession(new ApiError("x", 403, "UNAUTHORIZED", "dash"), "dash")).toBe(false);
    expect(isExpiredSession(new Error("boom"), "dash")).toBe(false);
    expect(isExpiredSession(expired, "")).toBe(false);
  });
});

describe("describeError", () => {
  it("appends up to five field errors and counts the rest", () => {
    const errors = Array.from({ length: 7 }, (_, i) => ({ field: `items[${i}].key`, message: "is invalid" }));
    const text = describeError(new ApiError("The configuration is invalid.", 422, "INVALID_CONFIGURATION", undefined, errors), "x");
    expect(text).toBe("The configuration is invalid. items[0].key is invalid; items[1].key is invalid; items[2].key is invalid; items[3].key is invalid; items[4].key is invalid; and 2 more.");
  });
  it("falls back for non-errors and keeps plain messages", () => {
    expect(describeError("boom", "fallback")).toBe("fallback");
    expect(describeError(new Error("plain"), "fallback")).toBe("plain");
  });
});
