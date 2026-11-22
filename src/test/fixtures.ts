import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect } from "vitest";
import { renderApp } from "./render";
import type { Handler } from "./mockApi";

/** Shared dashboard fixtures: one project, one environment, a published catalog. */
export const project = { id: "p1", name: "Star Forge", slug: "star-forge" };
export const environment = { id: "e1", name: "development", public_id: "pub_star" };
export const liveConfig = {
  items: [
    { key: "health_potion", name: "Health Potion", category: "consumable", stackable: true, max_stack: 99, metadata: { healing: 50 } },
    { key: "iron_sword", name: "Iron Sword", category: "weapon", stackable: false, max_stack: 1, metadata: { slot: "weapon" } },
  ],
  currencies: [{ key: "credits", name: "Credits" }],
  progression: [100, 300],
  leaderboards: [{ key: "global", direction: "higher" }],
  stats: [] as unknown[],
  achievements: [] as unknown[],
};
export const base = "/v1/projects/p1/environments/e1";

/** Player activity for the Dashboard: 96 CCU buckets ending at 12:00 UTC (last one 6) and 30 DAU days (last one 12). */
export const activity = (() => {
  const end = Date.parse("2026-11-22T11:45:00Z");
  const ccu = Array.from({ length: 96 }, (_, i) => ({ at: new Date(end - (95 - i) * 15 * 60_000).toISOString(), players: i === 95 ? 6 : (i * 7) % 9 }));
  const dau = Array.from({ length: 30 }, (_, i) => ({ date: new Date(Date.parse("2026-10-24T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10), players: i === 29 ? 12 : 10 + (i % 5) }));
  return { generated_at: "2026-11-22T12:00:00Z", bucket_minutes: 15, ccu_now: 6, ccu_peak_24h: 8, dau_today: 12, ccu, dau };
})();

export function routes(overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    "POST /v1/auth/login": { body: { access_token: "dash-token", user: { id: "u1", email: "admin@realmstack.local" }, token_type: "Bearer", expires_in: 900 } },
    // No saved session by default: the app starts at the sign-in form.
    "POST /v1/auth/refresh": { status: 401, body: { error: { code: "NO_SESSION", message: "There is no dashboard session to resume. Sign in.", details: {} }, meta: { request_id: "test" } } },
    "POST /v1/auth/logout": { body: { signed_out: true } },
    "GET /v1/projects": { body: [project] },
    "GET /v1/projects/p1/environments": { body: [environment] },
    [`GET ${base}/configurations/draft`]: { body: liveConfig },
    [`GET ${base}/configurations/published`]: { body: { version: 3, config: liveConfig, published_at: "2026-11-01T00:00:00Z" } },
    [`GET ${base}/configurations/versions`]: { body: [{ id: "v3", version: 3, config: liveConfig, published_at: "2026-11-01T00:00:00Z" }] },
    [`GET ${base}/credentials`]: { body: [{ id: "c1", key_prefix: "rs_abc123", created_at: "2026-11-01T00:00:00Z" }] },
    [`GET ${base}/activity`]: { body: activity },
    "POST /v1/players/register": { status: 201, body: { player: { id: "player-1", display_name: "Rookie Pilot" }, access_token: "player-token", refresh_token: "r" } },
    "GET /v1/players/me/inventory": { body: [] },
    "GET /v1/players/me/currency": { body: [] },
    "GET /v1/players/me/transactions": { body: [] },
    // Project settings shows the AI provider panel; AI off by default in tests.
    "GET /v1/ai/settings": { body: { configured: false, provider: null, model: null, key_last4: null, base_url: null, updated_at: null, providers: ["openai", "openai_compatible"] } },
    ...overrides,
  };
}

export async function signIn() {
  const user = userEvent.setup();
  renderApp();
  // In development builds the demo credentials are prefilled.
  expect(await screen.findByLabelText("Email address")).toHaveValue("admin@realmstack.local");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  await screen.findByRole("heading", { name: "Star Forge" });
  return user;
}

export async function openScreen(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("button", { name: label }));
}
