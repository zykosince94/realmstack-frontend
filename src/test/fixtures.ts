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

export function routes(overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    "POST /v1/auth/login": { body: { access_token: "dash-token", user: { id: "u1", email: "admin@realmstack.local" } } },
    "GET /v1/projects": { body: [project] },
    "GET /v1/projects/p1/environments": { body: [environment] },
    [`GET ${base}/configurations/draft`]: { body: liveConfig },
    [`GET ${base}/configurations/published`]: { body: { version: 3, config: liveConfig, published_at: "2026-11-01T00:00:00Z" } },
    [`GET ${base}/configurations/versions`]: { body: [{ id: "v3", version: 3, config: liveConfig, published_at: "2026-11-01T00:00:00Z" }] },
    [`GET ${base}/credentials`]: { body: [{ id: "c1", key_prefix: "rs_abc123", created_at: "2026-11-01T00:00:00Z" }] },
    "POST /v1/players/register": { status: 201, body: { player: { id: "player-1", display_name: "Rookie Pilot" }, access_token: "player-token", refresh_token: "r" } },
    "GET /v1/players/me/inventory": { body: [] },
    "GET /v1/players/me/currency": { body: [] },
    "GET /v1/players/me/transactions": { body: [] },
    ...overrides,
  };
}

export async function signIn() {
  const user = userEvent.setup();
  renderApp();
  // In development builds the demo credentials are prefilled.
  expect(screen.getByLabelText("Email address")).toHaveValue("admin@realmstack.local");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  await screen.findByRole("heading", { name: "Star Forge" });
  return user;
}

export async function openScreen(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("button", { name: label }));
}
