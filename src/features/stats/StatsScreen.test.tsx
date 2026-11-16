import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockApi } from "../../test/mockApi";
import { base, liveConfig, openScreen, routes, signIn } from "../../test/fixtures";

const config = { ...liveConfig, stats: [{ key: "trolls_defeated", name: "Trolls defeated", kind: "counter" }, { key: "met_elder", name: "Met the elder", kind: "flag" }] };

describe("Stats & flags", () => {
  it("adds a definition to the draft and writes values as the trusted server", async () => {
    const server = mockApi(routes({
      [`GET ${base}/configurations/draft`]: { body: config },
      [`GET ${base}/configurations/published`]: { body: { version: 2, config, published_at: "2026-11-16T00:00:00Z" } },
      [`POST ${base}/stats`]: (request) => ({ status: 201, body: request.body }),
      "GET /v1/players/me/stats": { body: { counters: [{ key: "trolls_defeated", name: "Trolls defeated", value: 4 }], flags: [{ key: "met_elder", name: "Met the elder", set: false }] } },
      "POST /v1/server/players/player-1/stats/trolls_defeated/increment": { body: { stat_key: "trolls_defeated", incremented: 2, value: 6 } },
      "POST /v1/server/players/player-1/flags/met_elder/set": { body: { flag_key: "met_elder", set: true, newly_set: true } },
    }));
    const user = await signIn();
    await openScreen(user, "Stats & flags");
    expect(await screen.findByText("trolls_defeated")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Key"), "chests_opened");
    await user.type(screen.getByLabelText("Name"), "Chests opened");
    await user.click(screen.getByRole("button", { name: /add to draft/i }));
    await waitFor(() => expect(server.find("POST", `${base}/stats`)).toHaveLength(1));
    expect(server.find("POST", `${base}/stats`)[0].body).toEqual({ key: "chests_opened", name: "Chests opened", kind: "counter" });

    // Server test actions need a demo player and a server credential.
    expect(screen.getByText(/Sign in a player in Players and add a server credential/)).toBeInTheDocument();
    await openScreen(user, "Players");
    await user.click(screen.getByRole("button", { name: "Register player" }));
    await screen.findByText("Player registered and signed in.");
    await openScreen(user, "Inventory & economy");
    await user.type(await screen.findByLabelText("Server credential"), "rs_test.secret");
    await openScreen(user, "Stats & flags");

    expect(await screen.findByText("4")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "2");
    await user.click(screen.getByRole("button", { name: "Increment counter" }));
    expect(await screen.findByText("trolls_defeated is now 6.")).toBeInTheDocument();
    const increment = server.find("POST", "/v1/server/players/player-1/stats/trolls_defeated/increment")[0];
    expect(increment.headers["X-Server-Credential"]).toBe("rs_test.secret");
    expect(increment.body).toEqual({ amount: 2, reason: "dashboard_test" });

    await user.click(screen.getByRole("button", { name: "Set flag" }));
    expect(await screen.findByText("Set met_elder.")).toBeInTheDocument();
  });
});
