import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { apiError, mockApi } from "../../test/mockApi";
import { base, liveConfig, openScreen, routes, signIn } from "../../test/fixtures";

const config = {
  ...liveConfig,
  stats: [{ key: "trolls_defeated", name: "Trolls defeated", kind: "counter" }, { key: "talked_to_elder", name: "Talked to the elder", kind: "flag" }],
  achievements: [
    { key: "troll_slayer", name: "Troll Slayer", description: "Defeat 3 trolls.", conditions: [{ type: "stat", stat_key: "trolls_defeated", target: 3 }], rewards: { currencies: [{ currency_key: "credits", amount: 10 }], xp: 50 }, claimable_by: "player" },
    { key: "secret_room", name: "Secret Room", hidden: true, conditions: [{ type: "flag", flag_key: "talked_to_elder" }], rewards: {}, claimable_by: "player" },
  ],
};

function achievementRoutes(overrides = {}) {
  return routes({
    [`GET ${base}/configurations/draft`]: { body: config },
    [`GET ${base}/configurations/published`]: { body: { version: 4, config, published_at: "2026-11-16T00:00:00Z" } },
    [`POST ${base}/configurations/validate`]: { body: { valid: true, errors: [] } },
    [`GET ${base}/achievements/stats`]: { body: [{ key: "troll_slayer", name: "Troll Slayer", hidden: false, claims: 7, claimed_by_player: 7, claimed_by_server: 0 }] },
    ...overrides,
  });
}

describe("Achievements", () => {
  it("shows a card per draft achievement with conditions, rewards, badges and claim counts", async () => {
    mockApi(achievementRoutes());
    const user = await signIn();
    await openScreen(user, "Achievements");
    const card = (await screen.findByRole("button", { name: "Edit Troll Slayer" })).closest("article")!;
    expect(within(card).getByText("Counter trolls_defeated reaches 3")).toBeInTheDocument();
    expect(within(card).getByText(/10 credits · 50 XP · 7 claims/)).toBeInTheDocument();
    const secret = screen.getByRole("button", { name: "Edit Secret Room" });
    expect(within(secret).getByText(/hidden/)).toBeInTheDocument();
  });

  it("builds a new achievement with the condition builder and shows save errors inline", async () => {
    const server = mockApi(achievementRoutes({
      [`POST ${base}/achievements`]: (request: { body: unknown }) => {
        const body = request.body as { name: string };
        return body.name === "Bad"
          ? apiError(422, "VALIDATION_ERROR", "The definition is invalid.", { errors: [{ field: "achievement.conditions[0].target", message: "must be a positive integer" }] })
          : { status: 201, body: request.body };
      },
    }));
    const user = await signIn();
    await openScreen(user, "Achievements");
    await user.click(await screen.findByRole("button", { name: /new achievement/i }));
    const editor = screen.getByRole("complementary", { name: "Achievement editor" });
    await user.type(within(editor).getByLabelText("Key"), "elder_friend");
    await user.type(within(editor).getByLabelText("Name"), "Bad");
    // Switch condition 1 to a flag condition: the builder drops the target field.
    await user.selectOptions(within(editor).getByLabelText("Condition 1 type"), "flag");
    expect(within(editor).getByLabelText("Flag")).toHaveValue("talked_to_elder");
    expect(within(editor).queryByLabelText("Target")).not.toBeInTheDocument();
    await user.click(within(editor).getByRole("button", { name: "Add to draft" }));
    // The server's field error appears next to the field it names.
    expect(await within(editor).findByText("conditions[0].target: must be a positive integer")).toBeInTheDocument();

    await user.clear(within(editor).getByLabelText("Name"));
    await user.type(within(editor).getByLabelText("Name"), "Elder Friend");
    await user.click(within(editor).getByRole("button", { name: "Add to draft" }));
    await waitFor(() => expect(server.find("POST", `${base}/achievements`)).toHaveLength(2));
    expect(server.find("POST", `${base}/achievements`)[1].body).toEqual({
      key: "elder_friend", name: "Elder Friend", description: "", hidden: false, claimable_by: "player",
      conditions: [{ type: "flag", flag_key: "talked_to_elder" }], rewards: {},
    });
    expect(await screen.findByText(/Saved Elder Friend to the draft/)).toBeInTheDocument();
  });

  it("lists draft validation issues and opens the offending achievement", async () => {
    mockApi(achievementRoutes({
      [`POST ${base}/configurations/validate`]: { body: { valid: false, errors: [{ field: "achievements[0].conditions[0].stat_key", message: "references unknown counter \"trolls\"" }] } },
    }));
    const user = await signIn();
    await openScreen(user, "Achievements");
    expect(await screen.findByText("1 validation issue in the draft")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "achievements[0].conditions[0].stat_key" }));
    const editor = screen.getByRole("complementary", { name: "Achievement editor" });
    const counter = within(editor).getByLabelText(/Counter/);
    expect(counter).toHaveAttribute("aria-invalid", "true");
    expect(within(editor).getByText(/references unknown counter/)).toBeInTheDocument();
  });

  it("asks before deleting an achievement from the draft", async () => {
    const server = mockApi(achievementRoutes({ [`DELETE ${base}/achievements/troll_slayer`]: { body: { deleted: true, key: "troll_slayer" } } }));
    const user = await signIn();
    await openScreen(user, "Achievements");
    await user.click(await screen.findByRole("button", { name: "Edit Troll Slayer" }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("troll_slayer"));
    expect(server.find("DELETE", `${base}/achievements/troll_slayer`)).toHaveLength(0);
    confirm.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(server.find("DELETE", `${base}/achievements/troll_slayer`)).toHaveLength(1));
  });
});
