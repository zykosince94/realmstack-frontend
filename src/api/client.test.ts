import { describe, expect, it, vi } from "vitest";
import { authHeaders, client, unwrap } from "./client";
import { ApiError, describeError, isExpiredSession } from "./errors";
import { apiError, mockApi } from "../test/mockApi";

describe("typed client", () => {
  it("sends auth, idempotency and JSON body, and unwraps the envelope", async () => {
    const server = mockApi({ "POST /v1/players/me/currency/spend": { body: { currency_key: "credits", operation: "spend", amount: 5, balance: 10 } } });
    const result = await unwrap(client.POST("/v1/players/me/currency/spend", { headers: authHeaders({ token: "t1" }), params: { header: { "Idempotency-Key": "k" } }, body: { currency_key: "credits", amount: 5 } }), "t1");
    expect(result.balance).toBe(10);
    const [request] = server.requests;
    expect(request.headers.Authorization).toBe("Bearer t1");
    expect(request.headers["Content-Type"]).toContain("application/json");
    expect(request.headers["Idempotency-Key"]).toBe("k");
    expect(request.body).toEqual({ currency_key: "credits", amount: 5 });
  });

  it("throws ApiError with status, code, message, field errors and the token used", async () => {
    mockApi({ "POST /v1/projects/p/environments/e/configurations/publish": apiError(422, "INVALID_CONFIGURATION", "The configuration is invalid.", { errors: [{ field: "items[0].key", message: "is invalid" }] }) });
    const error = await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/configurations/publish", { params: { path: { projectId: "p", envId: "e" } }, headers: authHeaders({ token: "t2" }) }), "t2").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: "INVALID_CONFIGURATION", token: "t2", fieldErrors: [{ field: "items[0].key", message: "is invalid" }] });
  });

  it("reports non-JSON error responses clearly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>gateway error</html>", { status: 502 })));
    await expect(unwrap(client.GET("/healthz"))).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
  });

  it("adds the server credential header for trusted calls", () => {
    expect(authHeaders({ serverCredential: "rs_x.secret" })).toEqual({ "X-Server-Credential": "rs_x.secret" });
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
