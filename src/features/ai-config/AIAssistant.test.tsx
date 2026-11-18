import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { apiError, mockApi } from "../../test/mockApi";
import { base, openScreen, routes, signIn } from "../../test/fixtures";

const providers = ["openai", "openai_compatible"];
const configured = { configured: true, provider: "openai", model: "gpt-5.5", key_last4: "1234", base_url: null, updated_at: "2026-11-16T00:00:00Z", providers };
const unconfigured = { configured: false, provider: null, model: null, key_last4: null, base_url: null, updated_at: null, providers };
const openRouter = { configured: true, provider: "openai_compatible", model: "nvidia/nemotron-3.5-super-vl:free", key_last4: "5432", base_url: "https://openrouter.ai/api/v1", updated_at: "2026-11-17T00:00:00Z", providers };

function generation(overrides: Record<string, unknown> = {}) {
  return {
    id: "g1", operation: "items", params: { brief: "wizards" }, merge_policy: "add", provider: "openai", model: "gpt-5.5", status: "valid",
    proposal: { items: [{ key: "magic_wand", name: "Magic Wand", category: "weapon", stackable: false, max_stack: 1, metadata: { slot: "weapon" } }, { key: "health_potion", name: "Big Potion", category: "consumable", stackable: true, max_stack: 99, metadata: {} }] },
    answer: null, notes: "Two items for a wizard game.", errors: [], error: null, usage: { input_tokens: 1200, output_tokens: 340 },
    created_at: "2026-11-16T10:00:00Z", finished_at: "2026-11-16T10:00:20Z", applied_at: null, appliable: true, ...overrides,
  };
}

async function openAI() {
  const user = await signIn();
  await openScreen(user, "AI assistant");
  return user;
}

/** The provider and key live in Project settings, not on the AI screen. */
async function openProviderSettings() {
  const user = await signIn();
  await openScreen(user, "Project settings");
  await screen.findByRole("heading", { name: "AI provider" });
  return user;
}

describe("AI assistant", () => {
  it("points to Project settings until a provider is connected, then shows which one is used", async () => {
    let settings: Record<string, unknown> = unconfigured;
    mockApi(routes({ "GET /v1/ai/settings": () => ({ body: settings }), [`GET ${base}/ai/generations`]: { body: [] } }));
    const user = await openAI();
    expect(await screen.findByText("Connect an AI provider to start")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Proposals appear here for review" })).toBeInTheDocument();
    // The settings form is not on this screen any more; the button opens it.
    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open settings/i }));
    expect(await screen.findByRole("heading", { name: "AI provider" })).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toBeInTheDocument();

    settings = openRouter;
    await openScreen(user, "AI assistant");
    expect(await screen.findByText("nvidia/nemotron-3.5-super-vl:free")).toBeInTheDocument();
    expect(screen.queryByText("Connect an AI provider to start")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /provider settings/i })).toBeInTheDocument();
  });

  it("saves an OpenAI-compatible provider with a base URL and shows server field errors", async () => {
    let settings: Record<string, unknown> = unconfigured;
    let reject = true;
    const server = mockApi(routes({
      "GET /v1/ai/settings": () => ({ body: settings }),
      "PUT /v1/ai/settings": () => {
        if (reject) return apiError(422, "VALIDATION_ERROR", "The AI settings are invalid.", { errors: [{ field: "base_url", message: "must use https" }] });
        settings = openRouter;
        return { body: openRouter };
      },
      [`GET ${base}/ai/generations`]: { body: [] },
    }));
    const user = await openProviderSettings();
    // OpenAI has no base URL; the compatible provider asks for one.
    expect(screen.queryByLabelText(/^Base URL/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Model")).toHaveValue("gpt-6.1-sol");
    await user.selectOptions(screen.getByLabelText("Provider"), "openai_compatible");
    // OpenAI's suggested model is not carried over to another provider.
    expect(screen.getByLabelText("Model")).toHaveValue("");
    await user.type(screen.getByLabelText(/^Base URL/), "http://openrouter.ai/api/v1");
    await user.type(screen.getByLabelText("Model"), "nvidia/nemotron-3.5-super-vl:free");
    await user.type(screen.getByLabelText("API key"), "sk-or-v1-SECRETVALUE5432");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("must use https")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Base URL/)).toHaveAttribute("aria-invalid", "true");
    expect(server.find("PUT", "/v1/ai/settings")[0].body).toEqual({ provider: "openai_compatible", model: "nvidia/nemotron-3.5-super-vl:free", base_url: "http://openrouter.ai/api/v1", api_key: "sk-or-v1-SECRETVALUE5432" });

    reject = false;
    await user.clear(screen.getByLabelText(/^Base URL/));
    await user.type(screen.getByLabelText(/^Base URL/), "https://openrouter.ai/api/v1");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("OpenAI-compatible (openrouter.ai) · nvidia/nemotron-3.5-super-vl:free · key ending 5432")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("SECRETVALUE");
  });

  it("shows why the provider refused a save and keeps what was typed", async () => {
    const server = mockApi(routes({
      "GET /v1/ai/settings": { body: unconfigured },
      "PUT /v1/ai/settings": apiError(422, "AI_KEY_REJECTED", "openrouter.ai rejected the API key. Check that the API key field holds your key, not the model ID."),
      [`GET ${base}/ai/generations`]: { body: [] },
    }));
    const user = await openProviderSettings();
    await user.selectOptions(screen.getByLabelText("Provider"), "openai_compatible");
    await user.type(screen.getByLabelText(/^Base URL/), "https://openrouter.ai/api/v1");
    await user.type(screen.getByLabelText("Model"), "nvidia/nemotron-3.5-super-vl:free");
    await user.type(screen.getByLabelText("API key"), "wrong-key-wrong-key-wrong");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(server.find("PUT", "/v1/ai/settings")).toHaveLength(1));
    expect(await screen.findByText(/rejected the API key/)).toBeInTheDocument();
    // Nothing was saved, and the form still holds the values so the user can fix them.
    expect(screen.queryByText(/key ending/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Model")).toHaveValue("nvidia/nemotron-3.5-super-vl:free");
    expect(screen.getByLabelText(/^Base URL/)).toHaveValue("https://openrouter.ai/api/v1");
  });

  it("requires the key again when the provider or base URL changes, but not for a new model", async () => {
    mockApi(routes({ "GET /v1/ai/settings": { body: openRouter }, [`GET ${base}/ai/generations`]: { body: [] } }));
    const user = await openProviderSettings();
    const key = await screen.findByLabelText("API key");
    expect(key).not.toBeRequired();
    expect(key).toHaveAttribute("placeholder", "Stored key ends in 5432; leave blank to keep it");
    // A different model on the same destination keeps the stored key.
    await user.clear(screen.getByLabelText("Model"));
    await user.type(screen.getByLabelText("Model"), "meta-llama/llama-3.3-70b-instruct");
    expect(key).not.toBeRequired();
    // A different base URL would send the stored key somewhere new.
    await user.clear(screen.getByLabelText(/^Base URL/));
    await user.type(screen.getByLabelText(/^Base URL/), "https://api.groq.com/openai/v1");
    expect(key).toBeRequired();
    expect(key).toHaveAttribute("placeholder", expect.stringContaining("changed"));
    // So would switching provider.
    await user.clear(screen.getByLabelText(/^Base URL/));
    await user.type(screen.getByLabelText(/^Base URL/), "https://openrouter.ai/api/v1/");
    expect(key).not.toBeRequired(); // a trailing slash is the same destination
    await user.selectOptions(screen.getByLabelText("Provider"), "openai");
    expect(key).toBeRequired();
  });

  it("explains that AI is off when the deployment has no encryption key, without an error", async () => {
    mockApi(routes({ "GET /v1/ai/settings": apiError(503, "AI_UNAVAILABLE", "The AI assistant is not enabled.") }));
    await openAI();
    expect(await screen.findByRole("heading", { name: "AI is turned off on this deployment" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("saves a write-only key, tests it and asks before removing it", async () => {
    let settings: Record<string, unknown> = unconfigured;
    const server = mockApi(routes({
      "GET /v1/ai/settings": () => ({ body: settings }),
      "PUT /v1/ai/settings": () => { settings = configured; return { body: configured }; },
      "POST /v1/ai/settings/test": { body: { ok: true, provider: "openai", model: "gpt-5.5" } },
      "DELETE /v1/ai/settings": () => { settings = unconfigured; return { body: { deleted: true } }; },
      [`GET ${base}/ai/generations`]: { body: [] },
    }));
    const user = await openProviderSettings();
    await user.clear(screen.getByLabelText("Model"));
    await user.type(screen.getByLabelText("Model"), "gpt-5.5");
    await user.type(screen.getByLabelText("API key"), "sk-proj-SECRETVALUE1234");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(server.find("PUT", "/v1/ai/settings")).toHaveLength(1));
    expect(server.find("PUT", "/v1/ai/settings")[0].body).toEqual({ provider: "openai", model: "gpt-5.5", api_key: "sk-proj-SECRETVALUE1234" });
    expect(await screen.findByText("OpenAI · gpt-5.5 · key ending 1234")).toBeInTheDocument();
    // The key field is cleared and the key never appears on screen.
    expect(screen.getByLabelText("API key")).toHaveValue("");
    expect(document.body.textContent).not.toContain("SECRETVALUE");

    await user.click(screen.getByRole("button", { name: /re-check saved key/i }));
    expect(await screen.findByText("The key works and gpt-5.5 is reachable.")).toBeInTheDocument();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: /remove key/i }));
    expect(server.find("DELETE", "/v1/ai/settings")).toHaveLength(0);
    confirm.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: /remove key/i }));
    await waitFor(() => expect(server.find("DELETE", "/v1/ai/settings")).toHaveLength(1));
  });

  it("generates, polls, reviews, applies after confirmation, then publishes", async () => {
    let polls = 0;
    let status = "valid";
    const server = mockApi(routes({
      "GET /v1/ai/settings": { body: configured },
      [`GET ${base}/ai/generations`]: () => ({ body: polls ? [generation({ status })] : [] }),
      [`POST ${base}/ai/generations`]: { status: 202, body: generation({ status: "running", proposal: null, notes: "", finished_at: null, appliable: false }) },
      [`GET ${base}/ai/generations/g1`]: () => { polls++; return { body: polls < 2 ? generation({ status: "running", proposal: null, notes: "" }) : generation({ status }) }; },
      [`POST ${base}/ai/generations/g1/apply`]: () => { status = "applied"; return { body: generation({ status: "applied", applied_at: "2026-11-16T10:01:00Z", appliable: false }) }; },
      [`POST ${base}/configurations/publish`]: { status: 201, body: { version: 4, published_at: "2026-11-16T10:02:00Z", progression_version: 1, progression_version_created: false } },
    }));
    const user = await openAI();
    await user.type(await screen.findByLabelText("Brief"), "wizards");
    await user.type(screen.getByLabelText("How many"), "2");
    await user.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(server.find("POST", `${base}/ai/generations`)).toHaveLength(1));
    expect(server.find("POST", `${base}/ai/generations`)[0].body).toEqual({ operation: "items", params: { brief: "wizards", count: 2 }, merge_policy: "add" });
    expect(await screen.findByText(/Generating… this can take a minute/)).toBeInTheDocument();

    // Polling picks up the finished proposal.
    const table = await screen.findByRole("table", { name: "Proposed definitions" }, { timeout: 4000 });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).getByText("magic_wand")).toBeInTheDocument();
    expect(within(rows[1]).getByText("new")).toBeInTheDocument();
    expect(within(rows[2]).getByText("replaces")).toBeInTheDocument(); // health_potion is in the draft
    expect(screen.getByText("Two items for a wizard game.")).toBeInTheDocument();
    expect(screen.getByText(/1,200 tokens in · 340 out/)).toBeInTheDocument();

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: "Apply to draft" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Apply 2 proposed definitions to the draft? Nothing goes live until you publish."));
    expect(server.find("POST", `${base}/ai/generations/g1/apply`)).toHaveLength(0);
    confirm.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Apply to draft" }));
    await waitFor(() => expect(server.find("POST", `${base}/ai/generations/g1/apply`)).toHaveLength(1));
    expect(await screen.findByText(/Applied to the draft. Publish when you are ready/)).toBeInTheDocument();

    confirm.mockReturnValueOnce(true);
    await user.click(await screen.findByRole("button", { name: "Publish draft" }));
    await waitFor(() => expect(server.find("POST", `${base}/configurations/publish`)).toHaveLength(1));
    expect(await screen.findByText("Published configuration version 4.")).toBeInTheDocument();
  });

  it("shows why an invalid proposal was rejected and offers no Apply", async () => {
    mockApi(routes({
      "GET /v1/ai/settings": { body: configured },
      [`GET ${base}/ai/generations`]: { body: [generation({ id: "g2", status: "invalid", appliable: false, errors: [{ field: "achievements[0].rewards.items[0].item_key", message: "references unknown item \"no_such_item\"" }] })] },
      [`GET ${base}/ai/generations/g2`]: { body: generation({ id: "g2", status: "invalid", appliable: false, errors: [{ field: "achievements[0].rewards.items[0].item_key", message: "references unknown item \"no_such_item\"" }] }) },
    }));
    const user = await openAI();
    await user.click(await screen.findByRole("button", { name: /Items\s*invalid/ }));
    expect(await screen.findByText(/This proposal can't be applied: 1 validation issue/)).toBeInTheDocument();
    expect(screen.getByText(/references unknown item/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply to draft" })).not.toBeInTheDocument();
  });

  it("asks a question about the configuration and shows the answer", async () => {
    const server = mockApi(routes({
      "GET /v1/ai/settings": { body: configured },
      [`GET ${base}/ai/generations`]: { body: [] },
      [`POST ${base}/ai/generations`]: { status: 202, body: generation({ operation: "explain", status: "answered", proposal: null, answer: "The potion heals 50.", notes: "", appliable: false }) },
      [`GET ${base}/ai/generations/g1`]: { body: generation({ operation: "explain", status: "answered", proposal: null, answer: "The potion heals 50.", notes: "", appliable: false }) },
    }));
    const user = await openAI();
    const picker = await screen.findByRole("radiogroup", { name: "What to generate" });
    await user.click(within(picker).getByRole("radio", { name: "Explain" }));
    expect(within(picker).getByRole("radio", { name: "Explain" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByLabelText("If a key already exists")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Question"), "What does the potion do?");
    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(await screen.findByText("The potion heals 50.")).toBeInTheDocument();
    expect(server.find("POST", `${base}/ai/generations`)[0].body).toEqual({ operation: "explain", params: { question: "What does the potion do?" }, merge_policy: "add" });
    expect(screen.queryByRole("button", { name: "Apply to draft" })).not.toBeInTheDocument();
  });
});

describe("Version history", () => {
  it("asks before restoring an earlier version", async () => {
    const server = mockApi(routes({
      [`GET ${base}/configurations/versions`]: { body: [
        { id: "v3", version: 3, config: {}, published_at: "2026-11-03T00:00:00Z" },
        { id: "v2", version: 2, config: {}, published_at: "2026-11-02T00:00:00Z" },
      ] },
      [`POST ${base}/configurations/versions/2/rollback`]: { status: 201, body: { version: 4, published_at: "2026-11-16T00:00:00Z", progression_version: 1, progression_version_created: false, rolled_back_from: 2 } },
    }));
    const user = await signIn();
    await openScreen(user, "Project settings");
    expect(await screen.findByText("LIVE")).toBeInTheDocument();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: /restore/i }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Restore version 2?"));
    expect(server.find("POST", `${base}/configurations/versions/2/rollback`)).toHaveLength(0);
    confirm.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: /restore/i }));
    expect(await screen.findByText("Restored version 2 as version 4.")).toBeInTheDocument();
  });
});
