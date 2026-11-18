import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, mockApi, type Handler } from "../../test/mockApi";
import { base, liveConfig, openScreen, routes, signIn } from "../../test/fixtures";

const summary = (n: number) => ({ id: `00000000-0000-0000-0000-00000000000${n}`, display_name: `Player ${n}`, email: `p${n}@example.test`, external_player_key: null, created_at: "2026-11-10T10:00:00Z", total_xp: n * 100, level: n });
const ana = { ...summary(1), display_name: "Ana Stormblade", email: "ana@example.test" };
const player = `${base}/players/${ana.id}`;

function playerRoutes(extra: Record<string, Handler> = {}) {
  return routes({
    [`GET ${base}/players`]: (r) => {
      const search = r.query.get("search") ?? "";
      if (search) return { body: [ana].filter((p) => p.display_name.toLowerCase().includes(search.toLowerCase())) };
      return r.query.get("cursor") === "page-2"
        ? { body: [summary(3)] }
        : { body: [ana, summary(2)], meta: { next_cursor: "page-2" } };
    },
    [`GET ${player}`]: { body: { ...ana, metadata: { platform: "steam" }, last_session_at: "2026-11-17T09:00:00Z", active_sessions: 2 } },
    [`GET ${player}/progression`]: { body: { total_xp: 120, level: 2, version: 1, thresholds: [100, 300, 700] } },
    [`GET ${player}/currency`]: { body: [{ currency_key: "credits", name: "Credits", balance: 4200 }, { currency_key: "gems", name: "Gems", balance: 15 }] },
    [`GET ${player}/inventory`]: { body: [{ item_key: "iron_sword", name: "Iron Sword", category: "weapon", quantity: 1, metadata: { slot: "weapon" }, equipped_slot: "weapon" }] },
    [`GET ${player}/achievements`]: { body: [{ key: "first_blood", hidden: false, status: "completed", claimable_by: "player", claimed_at: null, name: "First Blood", description: "", conditions: [], rewards: {}, progress: [{ type: "stat", current: 1, target: 1, met: true, has_value: true }] }] },
    [`GET ${player}/quests`]: { body: [{ key: "into_the_mine", name: "Into the Mine", description: "", chain: "Main Story", repeat: "none", auto_accept: false, claimable_by: "player", requires_quests: [], requires_achievements: [], status: "active", period_key: "", accepted_at: null, auto_accepted: false, current_stage: 1, stages: [{ key: "enter", name: "Enter the mine", conditions: [], rewards: {}, progress: null, complete: true, claimed: false }, { key: "clear", name: "Defeat 5 enemies", conditions: [], rewards: {}, progress: null, complete: false, claimed: false }], rewards: {}, completion_claimed: false, claimable: { stages: [], completion: false }, locked_by: { quests: [], achievements: [] }, available_from: null, available_until: null, resets_at: null, expires_at: null }] },
    [`GET ${player}/stats`]: { body: { counters: [{ key: "enemies_defeated", name: "Enemies defeated", value: 7 }], flags: [{ key: "met_the_mentor", name: "Met the mentor", set: true }] } },
    [`GET ${player}/transactions`]: { body: [{ id: "t1", operation: "credit", amount: 100, balance: 4200, currency_key: "credits", item_key: null, reason: "first_blood", reference: "", source: "claim", created_at: "2026-11-17T08:00:00Z" }] },
    ...extra,
  });
}

async function openPlayers() {
  const user = await signIn();
  await openScreen(user, "Players");
  return user;
}

describe("Players", () => {
  it("lists the environment's players and searches them", async () => {
    const server = mockApi(playerRoutes());
    const user = await openPlayers();
    const list = await screen.findByRole("list", { name: "Players" });
    expect(within(list).getByText("Ana Stormblade")).toBeInTheDocument();
    expect(within(list).getByText("Player 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Select a player" })).toBeInTheDocument();
    // The next page is appended; the last page has no cursor, so the button goes away.
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await within(list).findByText("Player 3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Search players"), "storm");
    await waitFor(() => expect(server.find("GET", `${base}/players`).some((r) => r.query.get("search") === "storm")).toBe(true));
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Players" })).queryByText("Player 2")).not.toBeInTheDocument());
    // One request for the finished word, not one per keystroke.
    expect(server.find("GET", `${base}/players`).filter((r) => r.query.get("search")).length).toBe(1);

    await user.clear(screen.getByLabelText("Search players"));
    await user.type(screen.getByLabelText("Search players"), "nobody");
    expect(await screen.findByText("No players match “nobody”.")).toBeInTheDocument();
  });

  it("shows a player's profile, balances and every data tab", async () => {
    mockApi(playerRoutes());
    const user = await openPlayers();
    await user.click(await screen.findByRole("button", { name: /Ana Stormblade/ }));
    const detail = await screen.findByRole("region", { name: "Player Ana Stormblade" });
    expect(await within(detail).findByText("4,200")).toBeInTheDocument();
    expect(within(detail).getByText("120 XP · 180 to next")).toBeInTheDocument();
    expect(within(detail).getByText("Active sessions").parentElement).toHaveTextContent("Active sessions2");

    expect(await within(detail).findByRole("table", { name: "Inventory" })).toHaveTextContent("Iron Sword");
    await user.click(within(detail).getByRole("tab", { name: /Achievements/ }));
    expect(await within(detail).findByRole("table", { name: "Achievements" })).toHaveTextContent("First Blood");
    await user.click(within(detail).getByRole("tab", { name: /Quests/ }));
    expect(await within(detail).findByRole("table", { name: "Quests" })).toHaveTextContent("2/2 · Defeat 5 enemies");
    await user.click(within(detail).getByRole("tab", { name: /Stats/ }));
    expect(await within(detail).findByRole("table", { name: "Stats and flags" })).toHaveTextContent("Enemies defeated");
    await user.click(within(detail).getByRole("tab", { name: /Economy/ }));
    const ledger = await within(detail).findByRole("table", { name: "Economy history" });
    expect(ledger).toHaveTextContent("first_blood");
    expect(ledger).toHaveTextContent("claim");
  });

  it("says so when the environment has no players", async () => {
    mockApi(routes({ [`GET ${base}/players`]: { body: [] } }));
    await openPlayers();
    expect(await screen.findByText("No players have signed up in this environment yet.")).toBeInTheDocument();
  });

  it("keeps the test client separate, for acting as a game", async () => {
    mockApi(routes());
    const user = await signIn();
    await openScreen(user, "Test client");
    expect(await screen.findByRole("heading", { name: "Test client" })).toBeInTheDocument();
    expect(screen.getByText(/simulates a game client/)).toBeInTheDocument();
  });
});

// Players never use the dashboard, so every player-side action of the game is performed here by
// the admin, with the dashboard token, through admin routes scoped to the owned environment.
describe("Players: management actions", () => {
  afterEach(() => vi.restoreAllMocks());

  const publishedWith = (extra: Record<string, unknown>) => ({
    [`GET ${base}/configurations/published`]: { body: { version: 3, config: { ...liveConfig, ...extra }, published_at: "2026-11-01T00:00:00Z" } },
  });
  const done = (extra: Record<string, unknown> = {}) => ({ body: { ok: true, ...extra } });

  async function openPlayer(extra: Record<string, Handler> = {}) {
    const server = mockApi(playerRoutes(extra));
    const user = await openPlayers();
    await user.click(await screen.findByRole("button", { name: /Ana Stormblade/ }));
    const detail = await screen.findByRole("region", { name: "Player Ana Stormblade" });
    return { server, user, detail };
  }
  /** The one request to this player's route, with what every admin action must carry. */
  function only(server: ReturnType<typeof mockApi>, suffix: string) {
    const sent = server.find("POST", `${player}${suffix}`);
    expect(sent).toHaveLength(1);
    expect(sent[0].headers["Authorization"]).toBe("Bearer dash-token");
    expect(sent[0].headers["Idempotency-Key"]).toBeTruthy();
    return sent[0];
  }

  it("grants an item, equips with the item's own slot and consumes after confirmation", async () => {
    const { server, user, detail } = await openPlayer({
      [`GET ${player}/inventory`]: { body: [
        { item_key: "iron_sword", name: "Iron Sword", category: "weapon", quantity: 1, metadata: { slot: "weapon" }, equipped_slot: null },
        { item_key: "health_potion", name: "Health Potion", category: "consumable", quantity: 3, metadata: {}, equipped_slot: null },
      ] },
      [`POST ${player}/items/grant`]: done(),
      [`POST ${player}/inventory/equip`]: done(),
      [`POST ${player}/inventory/consume`]: done(),
    });
    const form = within(detail).getByRole("form", { name: "Grant an item" });
    await user.clear(within(form).getByLabelText("Quantity"));
    await user.type(within(form).getByLabelText("Quantity"), "5");
    await user.type(within(form).getByLabelText("Reason"), "event gift");
    await user.click(within(form).getByRole("button", { name: "Grant" }));
    await waitFor(() => expect(server.find("POST", `${player}/items/grant`)).toHaveLength(1));
    expect(only(server, "/items/grant").body).toEqual({ item_key: "health_potion", quantity: 5, reason: "event gift" });
    expect(await screen.findByText("Granted 5 × health_potion.")).toBeInTheDocument();

    // Only an item that declares a slot can be equipped, and the slot comes from the item.
    expect(within(detail).queryByRole("button", { name: "Equip health_potion" })).not.toBeInTheDocument();
    await user.click(within(detail).getByRole("button", { name: "Equip iron_sword" }));
    await waitFor(() => expect(server.find("POST", `${player}/inventory/equip`)).toHaveLength(1));
    expect(only(server, "/inventory/equip").body).toEqual({ item_key: "iron_sword", slot: "weapon" });

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(within(detail).getByRole("button", { name: "Consume health_potion" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("health_potion"));
    expect(server.find("POST", `${player}/inventory/consume`)).toHaveLength(0);
    confirm.mockReturnValueOnce(true);
    await user.click(within(detail).getByRole("button", { name: "Consume health_potion" }));
    await waitFor(() => expect(server.find("POST", `${player}/inventory/consume`)).toHaveLength(1));
    expect(only(server, "/inventory/consume").body).toMatchObject({ item_key: "health_potion", quantity: 1 });
  });

  it("unequips the slot an item occupies", async () => {
    const { server, user, detail } = await openPlayer({ [`POST ${player}/inventory/unequip`]: done() });
    await user.click(await within(detail).findByRole("button", { name: "Unequip iron_sword" }));
    await waitFor(() => expect(server.find("POST", `${player}/inventory/unequip`)).toHaveLength(1));
    expect(only(server, "/inventory/unequip").body).toEqual({ slot: "weapon" });
  });

  it("credits a balance, and deducts it only after confirmation, reporting a refusal", async () => {
    const { server, user, detail } = await openPlayer({
      [`POST ${player}/currency/credit`]: done({ balance: 4300 }),
      [`POST ${player}/currency/spend`]: apiError(422, "INSUFFICIENT_FUNDS", "Not enough credits."),
    });
    await user.click(within(detail).getByRole("tab", { name: /Economy/ }));
    const form = await within(detail).findByRole("form", { name: "Adjust a balance" });
    await user.click(within(form).getByRole("button", { name: "Credit" }));
    await waitFor(() => expect(server.find("POST", `${player}/currency/credit`)).toHaveLength(1));
    expect(only(server, "/currency/credit").body).toEqual({ currency_key: "credits", amount: 100, reason: "dashboard" });
    expect(await screen.findByText("Credited 100 credits. Balance: 4300.")).toBeInTheDocument();

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(within(form).getByRole("button", { name: "Deduct" }));
    expect(confirm).toHaveBeenCalled();
    expect(server.find("POST", `${player}/currency/spend`)).toHaveLength(0);
    confirm.mockReturnValueOnce(true);
    await user.click(within(form).getByRole("button", { name: "Deduct" }));
    expect(await screen.findByText("Not enough credits.")).toBeInTheDocument();
  });

  it("awards XP and submits a score", async () => {
    const { server, user, detail } = await openPlayer({
      [`POST ${player}/xp/award`]: done(),
      [`POST ${player}/leaderboards/global/scores`]: { status: 201, body: { leaderboard_key: "global", score: 1000 } },
    });
    await user.click(within(detail).getByRole("tab", { name: /Progress/ }));
    expect(await within(detail).findByText(/180 XP to the next level|180 to the next level/)).toBeInTheDocument();
    await user.click(within(within(detail).getByRole("form", { name: "Award XP" })).getByRole("button", { name: "Award" }));
    await waitFor(() => expect(server.find("POST", `${player}/xp/award`)).toHaveLength(1));
    expect(only(server, "/xp/award").body).toEqual({ amount: 100, reason: "dashboard" });

    await user.click(within(within(detail).getByRole("form", { name: "Submit a score" })).getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(server.find("POST", `${player}/leaderboards/global/scores`)).toHaveLength(1));
    expect(only(server, "/leaderboards/global/scores").body).toEqual({ score: 1000 });
  });

  it("increments a counter and sets a flag", async () => {
    const stats = [{ key: "enemies_defeated", name: "Enemies defeated", kind: "counter" }, { key: "met_the_mentor", name: "Met the mentor", kind: "flag" }];
    const { server, user, detail } = await openPlayer({
      ...publishedWith({ stats }),
      [`POST ${player}/stats/enemies_defeated/increment`]: done({ value: 9 }),
      [`POST ${player}/flags/met_the_mentor/set`]: done({ newly_set: false }),
    });
    await user.click(within(detail).getByRole("tab", { name: /Stats/ }));
    const counter = await within(detail).findByRole("form", { name: "Increment a counter" });
    await user.clear(within(counter).getByLabelText("Amount"));
    await user.type(within(counter).getByLabelText("Amount"), "2");
    await user.click(within(counter).getByRole("button", { name: "Increment" }));
    await waitFor(() => expect(server.find("POST", `${player}/stats/enemies_defeated/increment`)).toHaveLength(1));
    expect(only(server, "/stats/enemies_defeated/increment").body).toEqual({ amount: 2, reason: "dashboard" });
    expect(await screen.findByText("enemies_defeated is now 9.")).toBeInTheDocument();

    await user.click(within(within(detail).getByRole("form", { name: "Set a flag" })).getByRole("button", { name: "Set flag" }));
    expect(await screen.findByText("met_the_mentor was already set; flags are set-only.")).toBeInTheDocument();
  });

  it("claims a completed achievement, and only a completed one", async () => {
    const { server, user, detail } = await openPlayer({
      [`GET ${player}/achievements`]: { body: [
        { key: "first_blood", hidden: false, status: "completed", claimable_by: "server", claimed_at: null, name: "First Blood", description: "", conditions: [], rewards: {}, progress: [] },
        { key: "veteran", hidden: false, status: "in_progress", claimable_by: "player", claimed_at: null, name: "Veteran", description: "", conditions: [], rewards: {}, progress: [] },
      ] },
      [`POST ${player}/achievements/first_blood/claim`]: done(),
    });
    await user.click(within(detail).getByRole("tab", { name: /Achievements/ }));
    expect(await within(detail).findByRole("table", { name: "Achievements" })).toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: "Claim veteran" })).not.toBeInTheDocument();
    await user.click(within(detail).getByRole("button", { name: "Claim first_blood" }));
    await waitFor(() => expect(server.find("POST", `${player}/achievements/first_blood/claim`)).toHaveLength(1));
    expect(only(server, "/achievements/first_blood/claim").body).toBeUndefined();
  });

  it("accepts, abandons and claims quests, offering only what the status allows", async () => {
    const quest = (key: string, status: string, extra = {}) => ({
      key, name: key, description: "", chain: null, repeat: "none", auto_accept: false, claimable_by: "player", requires_quests: [], requires_achievements: [],
      status, period_key: "", accepted_at: null, auto_accepted: false, current_stage: null, stages: [], rewards: {}, completion_claimed: false,
      claimable: { stages: [], completion: false }, locked_by: { quests: [], achievements: [] }, available_from: null, available_until: null, resets_at: null, expires_at: null, ...extra,
    });
    const { server, user, detail } = await openPlayer({
      [`GET ${player}/quests`]: { body: [
        quest("fresh", "available"), quest("running", "active"), quest("finished", "completed", { claimable: { stages: [], completion: true } }), quest("gated", "locked"),
      ] },
      [`POST ${player}/quests/fresh/accept`]: done(),
      [`POST ${player}/quests/running/abandon`]: done(),
      [`POST ${player}/quests/finished/claim`]: done(),
    });
    await user.click(within(detail).getByRole("tab", { name: /Quests/ }));
    await within(detail).findByRole("table", { name: "Quests" });
    // The locked quest offers nothing; each other row offers its own action.
    expect(within(detail).queryByRole("button", { name: /gated/ })).not.toBeInTheDocument();
    await user.click(within(detail).getByRole("button", { name: "Accept fresh" }));
    await waitFor(() => expect(server.find("POST", `${player}/quests/fresh/accept`)).toHaveLength(1));
    only(server, "/quests/fresh/accept");

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(within(detail).getByRole("button", { name: "Abandon running" }));
    expect(server.find("POST", `${player}/quests/running/abandon`)).toHaveLength(0);
    confirm.mockReturnValueOnce(true);
    await user.click(within(detail).getByRole("button", { name: "Abandon running" }));
    await waitFor(() => expect(server.find("POST", `${player}/quests/running/abandon`)).toHaveLength(1));

    await user.click(within(detail).getByRole("button", { name: "Claim finished" }));
    await waitFor(() => expect(server.find("POST", `${player}/quests/finished/claim`)).toHaveLength(1));
    expect(await screen.findByText("Claimed the earned rewards of finished.")).toBeInTheDocument();
  });

  it("offers nothing to act on until a configuration is published", async () => {
    const { user, detail } = await openPlayer({ ...publishedWith({ items: [], currencies: [], stats: [], leaderboards: [] }) });
    expect(within(detail).queryByRole("form", { name: "Grant an item" })).not.toBeInTheDocument();
    expect(await within(detail).findByText(/Nothing is published in this environment yet/)).toBeInTheDocument();
    await user.click(within(detail).getByRole("tab", { name: /Economy/ }));
    expect(await within(detail).findByText(/Nothing is published in this environment yet/)).toBeInTheDocument();
  });
});
