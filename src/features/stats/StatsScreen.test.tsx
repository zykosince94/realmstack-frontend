import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockApi } from "../../test/mockApi";
import { base, liveConfig, openScreen, routes, signIn } from "../../test/fixtures";

const config = { ...liveConfig, stats: [{ key: "trolls_defeated", name: "Trolls defeated", kind: "counter" }, { key: "met_elder", name: "Met the elder", kind: "flag" }] };

describe("Stats & flags", () => {
  it("adds a definition to the draft", async () => {
    const server = mockApi(routes({
      [`GET ${base}/configurations/draft`]: { body: config },
      [`GET ${base}/configurations/published`]: { body: { version: 2, config, published_at: "2026-11-16T00:00:00Z" } },
      [`POST ${base}/stats`]: (request) => ({ status: 201, body: request.body }),
    }));
    const user = await signIn();
    await openScreen(user, "Stats & flags");
    expect(await screen.findByText("trolls_defeated")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Key"), "chests_opened");
    await user.type(screen.getByLabelText("Name"), "Chests opened");
    await user.click(screen.getByRole("button", { name: /add to draft/i }));
    await waitFor(() => expect(server.find("POST", `${base}/stats`)).toHaveLength(1));
    expect(server.find("POST", `${base}/stats`)[0].body).toEqual({ key: "chests_opened", name: "Chests opened", kind: "counter" });

    // Writing a player's values is a Players task: no credential or player fields here.
    expect(screen.queryByLabelText("Server credential")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Increment counter" })).not.toBeInTheDocument();
  });
});
