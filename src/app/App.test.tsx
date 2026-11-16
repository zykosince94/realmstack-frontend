import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { apiError, mockApi } from "../test/mockApi";
import { base, liveConfig, openScreen, project, routes, signIn } from "../test/fixtures";
import { renderApp } from "../test/render";


describe("App", () => {
  it("signs in and shows the overview with the live version", async () => {
    mockApi(routes());
    await signIn();
    expect(await screen.findByText("Published v3")).toBeInTheDocument();
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
  });

  it("shows no error on the overview for a project with nothing published", async () => {
    mockApi(routes({
      [`GET ${base}/configurations/draft`]: { body: { items: [], currencies: [], progression: [100], leaderboards: [] } },
      [`GET ${base}/configurations/published`]: { body: { version: null, config: null, published_at: null } },
    }));
    await signIn();
    expect(await screen.findByText("Not published yet")).toBeInTheDocument();
    expect(document.querySelector(".notice.error")).toBeNull();
  });

  it("returns to sign-in when the dashboard session expires", async () => {
    mockApi(routes({ "GET /v1/projects/p1/environments": apiError(401, "UNAUTHORIZED", "A valid access token is required.") }));
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText("Your session expired. Please sign in again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("sends the visible dropdown choice and the item's own slot", async () => {
    const server = mockApi(routes({
      "POST /v1/server/players/player-1/items/grant": { body: { owned: 1 } },
      "POST /v1/players/me/inventory/equip": { body: { slot: "weapon", item_key: "iron_sword" } },
    }));
    const user = await signIn();
    await openScreen(user, "Players");
    await user.click(screen.getByRole("button", { name: "Register player" }));
    await screen.findByText("Player registered and signed in.");

    await openScreen(user, "Inventory & economy");
    await user.type(await screen.findByLabelText("Server credential"), "rs_test.secret");
    // Only items with a metadata.slot are offered for equipping, with the slot filled in.
    const equipSelect = await screen.findByRole("combobox", { name: "Item to equip" });
    expect(within(equipSelect).getAllByRole("option").map((o) => o.textContent)).toEqual(["Iron Sword"]);
    expect(screen.getByDisplayValue("weapon")).toHaveAttribute("readonly");

    await user.click(screen.getByRole("button", { name: "Grant item" }));
    await waitFor(() => expect(server.find("POST", "/v1/server/players/player-1/items/grant")).toHaveLength(1));
    const grant = server.find("POST", "/v1/server/players/player-1/items/grant")[0];
    expect(grant.body).toEqual({ item_key: "health_potion", quantity: 1 });
    expect(grant.headers["X-Server-Credential"]).toBe("rs_test.secret");
    expect(grant.headers["Idempotency-Key"]).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Equip item" }));
    await waitFor(() => expect(server.find("POST", "/v1/players/me/inventory/equip")).toHaveLength(1));
    expect(server.find("POST", "/v1/players/me/inventory/equip")[0].body).toEqual({ item_key: "iron_sword", slot: "weapon" });
  });

  it("asks for confirmation before revoking a credential", async () => {
    const server = mockApi(routes({ "POST /v1/credentials/c1/revoke": { body: { revoked: true } } }));
    const user = await signIn();
    await openScreen(user, "Project settings");
    const revoke = await screen.findByRole("button", { name: "Revoke" });

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(revoke);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("rs_abc123"));
    expect(server.find("POST", "/v1/credentials/c1/revoke")).toHaveLength(0);

    confirm.mockReturnValueOnce(true);
    await user.click(revoke);
    expect(await screen.findByText("Revoked rs_abc123.")).toBeInTheDocument();
    expect(server.find("POST", "/v1/credentials/c1/revoke")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
  });

  it("never saves progression over a draft that failed to load", async () => {
    const server = mockApi(routes({ [`GET ${base}/configurations/draft`]: apiError(500, "INTERNAL_ERROR", "An unexpected error occurred.") }));
    const user = await signIn();
    await openScreen(user, "Progression");
    expect(await screen.findByText("Loading draft…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publish configuration/i })).toBeDisabled();
    expect(server.find("PUT", `${base}/configurations/draft`)).toHaveLength(0);
  });

  it("validates thresholds before saving and saves only the thresholds", async () => {
    const server = mockApi(routes({ [`PUT ${base}/progression`]: (request) => ({ body: request.body }) }));
    const user = await signIn();
    await openScreen(user, "Progression");
    const input = await screen.findByLabelText("Level thresholds");
    expect(input).toHaveValue("100, 300");

    await user.clear(input);
    await user.type(input, "100, 50");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText(/strictly increasing/)).toBeInTheDocument();
    expect(server.find("PUT", `${base}/progression`)).toHaveLength(0);

    await user.clear(input);
    await user.type(input, "100, 250, 600");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(server.find("PUT", `${base}/progression`)).toHaveLength(1));
    expect(server.find("PUT", `${base}/progression`)[0].body).toEqual({ thresholds: [100, 250, 600] });
    // The whole draft is never rewritten from this screen.
    expect(server.find("PUT", `${base}/configurations/draft`)).toHaveLength(0);
  });

  it("saves unsaved thresholds before publishing from Progression", async () => {
    const server = mockApi(routes({
      [`PUT ${base}/progression`]: (request) => ({ body: request.body }),
      [`POST ${base}/configurations/publish`]: { status: 201, body: { version: 4, progression_version: 2, progression_version_created: true } },
    }));
    const user = await signIn();
    await openScreen(user, "Progression");
    const input = await screen.findByLabelText("Level thresholds");
    await user.clear(input);
    await user.type(input, "100, 400");
    await user.click(screen.getByRole("button", { name: /publish configuration/i }));
    expect(await screen.findByText(/Published configuration version 4/)).toBeInTheDocument();
    const order = server.requests.filter((r) => r.method !== "GET").map((r) => `${r.method} ${r.path}`);
    expect(order.slice(-2)).toEqual([`PUT ${base}/progression`, `POST ${base}/configurations/publish`]);
  });

  it("publishes exactly what is in the settings editor", async () => {
    const server = mockApi(routes({
      [`PUT ${base}/configurations/draft`]: (request) => ({ body: request.body }),
      [`POST ${base}/configurations/publish`]: { status: 201, body: { version: 5 } },
    }));
    const user = await signIn();
    await openScreen(user, "Project settings");
    const editor = await screen.findByLabelText("Configuration draft (JSON)");
    await waitFor(() => expect((editor as HTMLTextAreaElement).value).toContain("health_potion"));
    const edited = { ...liveConfig, currencies: [{ key: "gems", name: "Gems" }] };
    await user.clear(editor);
    await user.click(editor);
    await user.paste(JSON.stringify(edited));
    await user.click(screen.getByRole("button", { name: /save & publish/i }));
    expect(await screen.findByText("Saved and published configuration version 5.")).toBeInTheDocument();
    const writes = server.requests.filter((r) => r.method !== "GET" && r.path.startsWith(base));
    expect(writes.map((r) => `${r.method} ${r.path}`)).toEqual([`PUT ${base}/configurations/draft`, `POST ${base}/configurations/publish`]);
    expect(writes[0].body).toEqual(edited);
  });

  it("shows field-level errors when publishing fails validation", async () => {
    mockApi(routes({
      [`PUT ${base}/configurations/draft`]: (request) => ({ body: request.body }),
      [`POST ${base}/configurations/publish`]: {
        status: 422,
        body: { error: { code: "INVALID_CONFIGURATION", message: "The configuration is invalid.", details: { errors: [{ field: "progression[1]", message: "must be greater than progression[0]" }] } } },
      },
    }));
    const user = await signIn();
    await openScreen(user, "Project settings");
    await user.click(await screen.findByRole("button", { name: /save & publish/i }));
    expect(await screen.findByText("The configuration is invalid. progression[1] must be greater than progression[0].")).toBeInTheDocument();
  });

  it("asks for confirmation before archiving a project", async () => {
    const server = mockApi(routes({ "PATCH /v1/projects/p1": { body: { ...project, status: "archived" } } }));
    const user = await signIn();
    await openScreen(user, "Project settings");
    const archive = await screen.findByRole("button", { name: "Archive project" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(archive);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Star Forge"));
    expect(server.find("PATCH", "/v1/projects/p1")).toHaveLength(0);

    confirm.mockReturnValueOnce(true);
    await user.click(archive);
    await waitFor(() => expect(server.find("PATCH", "/v1/projects/p1")).toHaveLength(1));
    expect(server.find("PATCH", "/v1/projects/p1")[0].body).toEqual({ status: "archived" });
    expect(await screen.findByText(/Project archived/)).toBeInTheDocument();
  });
});
