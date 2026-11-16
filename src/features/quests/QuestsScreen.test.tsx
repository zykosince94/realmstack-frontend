import { screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, mockApi } from "../../test/mockApi";
import { base, liveConfig, openScreen, routes, signIn } from "../../test/fixtures";
import { mockMatchMedia, mockReactFlow } from "../../test/reactFlow";

const flag = (flag_key: string) => [{ type: "flag", flag_key }];
const config = {
  ...liveConfig,
  stats: [{ key: "trolls_defeated", name: "Trolls defeated", kind: "counter" }, { key: "met_mentor", name: "Met the mentor", kind: "flag" }, { key: "entered_mine", name: "Entered the mine", kind: "flag" }],
  achievements: [{ key: "first_blood", name: "First Blood", conditions: [{ type: "stat", stat_key: "trolls_defeated", target: 1 }], rewards: {}, claimable_by: "player" }],
  quests: [
    { key: "awakening", name: "The Awakening", chain: "Main Story", requires_quests: [], requires_achievements: [], claimable_by: "player", repeat: "none", auto_accept: true,
      stages: [{ key: "meet", name: "Meet the mentor", conditions: flag("met_mentor") }], rewards: { currencies: [{ currency_key: "credits", amount: 50 }] } },
    { key: "mine", name: "Into the Mine", chain: "Main Story", requires_quests: ["awakening"], requires_achievements: [], claimable_by: "player", repeat: "none",
      stages: [
        { key: "enter", name: "Enter the mine", conditions: flag("entered_mine") },
        { key: "clear", name: "Defeat 5 trolls", conditions: [{ type: "stat", stat_key: "trolls_defeated", target: 5 }], rewards: { items: [{ item_key: "health_potion", quantity: 2 }] } },
      ], rewards: { xp: 200 } },
    { key: "daily_hunt", name: "Daily Hunt", requires_quests: [], requires_achievements: [], claimable_by: "player", repeat: "daily",
      stages: [{ key: "hunt", name: "Hunt", conditions: [{ type: "stat", stat_key: "trolls_defeated", target: 3 }] }], rewards: {} },
  ],
  editor_layout: { quests: { awakening: { x: 0, y: 26 } } },
};

function questRoutes(overrides = {}) {
  return routes({
    [`GET ${base}/configurations/draft`]: { body: config },
    [`GET ${base}/configurations/published`]: { body: { version: 5, config, published_at: "2026-11-16T00:00:00Z" } },
    [`POST ${base}/configurations/validate`]: { body: { valid: true, errors: [] } },
    [`GET ${base}/quests/stats`]: { body: [{ key: "awakening", name: "The Awakening", chain: "Main Story", repeat: "none", accepted: 4, abandoned: 1, completions_claimed: 3, stage_rewards_claimed: 3 }] },
    [`PUT ${base}/configurations/draft`]: (request: { body: unknown }) => ({ body: request.body }),
    ...overrides,
  });
}

async function openQuests() {
  const user = await signIn();
  await openScreen(user, "Quests");
  return user;
}

beforeAll(() => mockReactFlow());
beforeEach(() => mockMatchMedia(false));

// These tests drive a full React Flow canvas (~2 s each); allow headroom on a busy machine.
describe("Quests", { timeout: 20_000 }, () => {
  it("draws the quest graph with chain lanes, node badges and statistics", async () => {
    mockApi(questRoutes());
    await openQuests();
    const graph = await screen.findByLabelText("Quest graph");
    const node = (await within(graph).findByRole("button", { name: "Edit The Awakening" })).closest(".quest-node") as HTMLElement;
    expect(within(node).getByText("auto")).toBeInTheDocument();
    expect(await within(node).findByText("4 accepted · 3 completed")).toBeInTheDocument();
    expect(within(graph).getByText("Main Story")).toBeInTheDocument();
    expect(within(graph).getByText("No chain")).toBeInTheDocument();
    const daily = within(graph).getByRole("button", { name: "Edit Daily Hunt" }).closest(".quest-node") as HTMLElement;
    expect(within(daily).getByText("daily")).toBeInTheDocument();
  });

  it("edits a quest: reorders stages, blocks prerequisite loops and saves to the draft", async () => {
    const server = mockApi(questRoutes({ [`PUT ${base}/quests/mine`]: (request: { body: unknown }) => ({ body: request.body }) }));
    const user = await openQuests();
    await user.click(await screen.findByRole("button", { name: "Edit The Awakening" }));
    let editor = screen.getByRole("complementary", { name: "Quest editor" });
    // The Awakening cannot require Into the Mine, which already requires it.
    const loop = within(editor).getByRole("checkbox", { name: /Into the Mine/ });
    expect(loop).toBeDisabled();
    expect(within(editor).getByText(/would create a loop/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit Into the Mine" }));
    editor = screen.getByRole("complementary", { name: "Quest editor" });
    expect(within(editor).getByRole("checkbox", { name: "The Awakening" })).toBeChecked();
    await user.click(within(editor).getByRole("button", { name: "Move stage 1 down" }));
    expect(within(editor).getByLabelText("Stage 1 key")).toHaveValue("clear");
    await user.click(within(editor).getByRole("checkbox", { name: "First Blood" }));
    await user.click(within(editor).getByRole("button", { name: "Save to draft" }));
    await waitFor(() => expect(server.find("PUT", `${base}/quests/mine`)).toHaveLength(1));
    const body = server.find("PUT", `${base}/quests/mine`)[0].body as { stages: { key: string; rewards: unknown }[]; requires_achievements: string[] };
    expect(body.stages.map((s) => s.key)).toEqual(["clear", "enter"]);
    expect(body.stages[1].rewards).toEqual({});
    expect(body.requires_achievements).toEqual(["first_blood"]);
    expect(await screen.findByText(/Saved Into the Mine to the draft/)).toBeInTheDocument();
  });

  it("builds a new quest and shows the server's field errors next to the stage fields", async () => {
    const server = mockApi(questRoutes({
      [`POST ${base}/quests`]: (request: { body: unknown }) => (request.body as { name: string }).name === "Bad"
        ? apiError(422, "VALIDATION_ERROR", "The definition is invalid.", { errors: [{ field: "quest.stages[1].key", message: "duplicates stages[0].key" }] })
        : { status: 201, body: request.body },
    }));
    const user = await openQuests();
    await user.click(await screen.findByRole("button", { name: /new quest/i }));
    const editor = screen.getByRole("complementary", { name: "Quest editor" });
    await user.type(within(editor).getByLabelText("Key"), "side_job");
    await user.type(within(editor).getByLabelText("Name"), "Bad");
    await user.selectOptions(within(editor).getByLabelText("Repeat"), "weekly");
    await user.click(within(editor).getByRole("button", { name: "Add stage" }));
    await user.clear(within(editor).getByLabelText("Stage 2 key"));
    await user.type(within(editor).getByLabelText("Stage 2 key"), "stage_1");
    await user.click(within(editor).getByRole("button", { name: "Add to draft" }));
    const stageKey = await within(editor).findByLabelText(/^Stage 2 key/);
    await waitFor(() => expect(stageKey).toHaveAttribute("aria-invalid", "true"));
    expect(within(editor).getByText("duplicates stages[0].key")).toBeInTheDocument();

    await user.clear(stageKey);
    await user.type(stageKey, "stage_2");
    await user.clear(within(editor).getByLabelText("Name"));
    await user.type(within(editor).getByLabelText("Name"), "Side Job");
    await user.click(within(editor).getByRole("button", { name: "Add to draft" }));
    await waitFor(() => expect(server.find("POST", `${base}/quests`)).toHaveLength(2));
    expect(server.find("POST", `${base}/quests`)[1].body).toMatchObject({ key: "side_job", name: "Side Job", repeat: "weekly", stages: [{ key: "stage_1" }, { key: "stage_2" }] });
  });

  it("lists draft issues and opens the offending quest with the field marked", async () => {
    mockApi(questRoutes({
      [`POST ${base}/configurations/validate`]: { body: { valid: false, errors: [{ field: "quests[1].stages[1].conditions[0].stat_key", message: "references unknown counter \"trolls\"" }] } },
    }));
    const user = await openQuests();
    expect(await screen.findByText("1 validation issue in the draft")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Edit Into the Mine" }).closest(".quest-node") as HTMLElement).getByText(/has issues/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "quests[1].stages[1].conditions[0].stat_key" }));
    const stage = within(screen.getByRole("complementary", { name: "Quest editor" })).getByRole("region", { name: "Stage 2" });
    expect(within(stage).getByLabelText(/Counter/)).toHaveAttribute("aria-invalid", "true");
    expect(within(stage).getByText(/references unknown counter/)).toBeInTheDocument();
  });

  it("asks before deleting a quest and removes the prerequisite edges to it", async () => {
    const server = mockApi(questRoutes());
    const user = await openQuests();
    await user.click(await screen.findByRole("button", { name: "Edit The Awakening" }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("mine will no longer require it"));
    expect(server.find("PUT", `${base}/configurations/draft`)).toHaveLength(0);
    confirm.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(server.find("PUT", `${base}/configurations/draft`)).toHaveLength(1));
    const saved = server.find("PUT", `${base}/configurations/draft`)[0].body as typeof config;
    expect(saved.quests.map((q) => q.key)).toEqual(["mine", "daily_hunt"]);
    expect(saved.quests[0].requires_quests).toEqual([]);
    expect(Object.keys(saved.editor_layout.quests)).not.toContain("awakening");
  });

  it("auto-arranges the graph into the draft's editor layout", async () => {
    const server = mockApi(questRoutes());
    const user = await openQuests();
    await user.click(await screen.findByRole("button", { name: /auto-arrange/i }));
    await waitFor(() => expect(server.find("PUT", `${base}/configurations/draft`)).toHaveLength(1));
    const layout = (server.find("PUT", `${base}/configurations/draft`)[0].body as typeof config).editor_layout.quests as Record<string, { x: number; y: number }>;
    expect(Object.keys(layout).sort()).toEqual(["awakening", "daily_hunt", "mine"]);
    expect(layout.awakening.x).toBeLessThan(layout.mine.x);
    expect(layout.awakening.y).toBe(layout.mine.y); // same chain, same lane
    expect(layout.daily_hunt.y).toBeGreaterThan(layout.mine.y); // no chain: the last lane
  });

  it("falls back to a list grouped by chain on narrow screens", async () => {
    mockMatchMedia(true);
    mockApi(questRoutes());
    const user = await openQuests();
    const list = await screen.findByLabelText("Quest list");
    expect(screen.queryByLabelText("Quest graph")).not.toBeInTheDocument();
    expect(within(list).getByRole("heading", { name: "Main Story" })).toBeInTheDocument();
    expect(within(list).getByText(/after awakening/)).toBeInTheDocument();
    await user.click(within(list).getByRole("button", { name: "Edit Daily Hunt" }));
    expect(screen.getByRole("complementary", { name: "Quest editor" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /auto-arrange/i })).not.toBeInTheDocument();
  });

  it("previews the player's quest log and accepts and claims quests", async () => {
    let accepted = false;
    const playerQuest = (key: string, name: string, status: string, extra = {}) => ({
      key, name, description: "", chain: null, repeat: "none", auto_accept: false, claimable_by: "player", requires_quests: [], requires_achievements: [],
      status, period_key: "", accepted_at: null, auto_accepted: false, current_stage: null, stages: [], rewards: {}, completion_claimed: false,
      claimable: { stages: [], completion: false }, locked_by: { quests: [], achievements: [] }, available_from: null, available_until: null, resets_at: null, expires_at: null, ...extra,
    });
    const server = mockApi(questRoutes({
      "GET /v1/players/me/quests": () => ({ body: [
        playerQuest("awakening", "The Awakening", "completed", { claimable: { stages: [], completion: true } }),
        playerQuest("mine", "Into the Mine", accepted ? "active" : "available", accepted ? { current_stage: 0, stages: [{ key: "enter", name: "Enter the mine", conditions: [], rewards: {}, progress: [], complete: false, claimed: false }] } : {}),
        playerQuest("daily_hunt", "Daily Hunt", "locked", { locked_by: { quests: [], achievements: ["first_blood"] } }),
      ] }),
      "POST /v1/players/me/quests/mine/accept": () => { accepted = true; return { body: playerQuest("mine", "Into the Mine", "active") }; },
      "POST /v1/players/me/quests/awakening/claim": { body: { key: "awakening", period_key: "", claimed_by: "player", claimed_at: "2026-11-16T00:00:00Z", paid: [], quest: playerQuest("awakening", "The Awakening", "claimed") } },
    }));
    const user = await signIn();
    await openScreen(user, "Players");
    await user.click(screen.getByRole("button", { name: "Register player" }));
    await screen.findByText("Player registered and signed in.");
    await openScreen(user, "Quests");
    await user.click(await screen.findByRole("button", { name: /player preview/i }));

    const mine = await screen.findByLabelText("Player view of mine");
    expect(within(screen.getByLabelText("Player view of daily_hunt")).getByText("Needs first_blood")).toBeInTheDocument();
    expect((screen.getByRole("button", { name: "Edit Daily Hunt" }).closest(".quest-node") as HTMLElement).className).toContain("status-locked");
    await user.click(within(mine).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(server.find("POST", "/v1/players/me/quests/mine/accept")).toHaveLength(1));
    expect(server.find("POST", "/v1/players/me/quests/mine/accept")[0].headers["Idempotency-Key"]).toBeTruthy();
    expect(await within(screen.getByLabelText("Player view of mine")).findByText("Stage 1/1: Enter the mine")).toBeInTheDocument();

    await user.click(within(screen.getByLabelText("Player view of awakening")).getByRole("button", { name: "Claim" }));
    await waitFor(() => expect(server.find("POST", "/v1/players/me/quests/awakening/claim")).toHaveLength(1));
    expect(await screen.findByText("Claimed the earned rewards of The Awakening.")).toBeInTheDocument();
  });
});
