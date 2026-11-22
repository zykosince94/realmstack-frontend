import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockApi } from "../../test/mockApi";
import { base, liveConfig, openScreen, routes, signIn } from "../../test/fixtures";

describe("Inventory & economy", () => {
  it("adds item and currency definitions to the draft", async () => {
    const server = mockApi(routes({
      [`GET ${base}/configurations/draft`]: { body: liveConfig },
      [`GET ${base}/configurations/published`]: { body: { version: 3, config: liveConfig, published_at: "2026-11-01T00:00:00Z" } },
      [`POST ${base}/items`]: (request) => ({ status: 201, body: request.body }),
      [`POST ${base}/currencies`]: (request) => ({ status: 201, body: request.body }),
    }));
    const user = await signIn();
    await openScreen(user, "Inventory & economy");
    expect(await screen.findByText("health_potion")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Item key"), "mana_potion");
    await user.type(screen.getByLabelText("Item name"), "Mana Potion");
    await user.type(screen.getByLabelText("Category"), "consumable");
    await user.clear(screen.getByLabelText("Max stack"));
    await user.type(screen.getByLabelText("Max stack"), "50");
    await user.click(screen.getByRole("button", { name: /add metadata/i }));
    await user.type(screen.getByLabelText("Metadata key 1"), "slot");
    await user.type(screen.getByLabelText("Metadata value 1"), "weapon");
    await user.click(screen.getByRole("button", { name: /add metadata/i }));
    await user.type(screen.getByLabelText("Metadata key 2"), "healing");
    await user.type(screen.getByLabelText("Metadata value 2"), "25");
    await user.click(screen.getByRole("button", { name: /add item/i }));
    await waitFor(() => expect(server.find("POST", `${base}/items`)).toHaveLength(1));
    expect(server.find("POST", `${base}/items`)[0].body).toEqual({
      key: "mana_potion",
      name: "Mana Potion",
      category: "consumable",
      stackable: true,
      max_stack: 50,
      metadata: { slot: "weapon", healing: 25 },
    });

    await user.type(screen.getByLabelText("Currency key"), "gems");
    await user.type(screen.getByLabelText("Currency name"), "Gems");
    await user.click(screen.getByRole("button", { name: /add currency/i }));
    await waitFor(() => expect(server.find("POST", `${base}/currencies`)).toHaveLength(1));
    expect(server.find("POST", `${base}/currencies`)[0].body).toEqual({ key: "gems", name: "Gems" });
  });
});
