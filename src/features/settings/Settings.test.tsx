import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { apiError, mockApi } from "../../test/mockApi";
import { base, liveConfig, openScreen, routes, signIn } from "../../test/fixtures";
import { readFileText } from "../../lib/config";

async function openSettings() {
  const user = await signIn();
  await openScreen(user, "Project settings");
  await screen.findByRole("button", { name: "Export JSON" });
  return user;
}

/** Captures what downloadJSON hands the browser. */
function captureDownloads() {
  const blobs: Blob[] = [];
  const names: string[] = [];
  URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return "blob:test"; });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
  return { blobs, names };
}

const file = (name: string, content: unknown) => new File([typeof content === "string" ? content : JSON.stringify(content)], name, { type: "application/json" });
const chooseFile = (f: File) => fireEvent.change(screen.getByLabelText("Configuration file to import"), { target: { files: [f] } });

describe("configuration import and export", () => {
  it("exports the saved draft as a RealmStack configuration file", async () => {
    mockApi(routes());
    const downloads = captureDownloads();
    const user = await openSettings();
    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(downloads.names).toEqual(["star-forge-development-draft.json"]);
    const exported = JSON.parse(await readFileText(downloads.blobs[0]));
    expect(exported).toMatchObject({ format: "realmstack.configuration", version: 1, source: { project: "Star Forge", slug: "star-forge", environment: "development" }, config: liveConfig });
    expect(await screen.findByText("Exported star-forge-development-draft.json.")).toBeInTheDocument();
  });

  it("exports a published version from the history", async () => {
    mockApi(routes());
    const downloads = captureDownloads();
    const user = await openSettings();
    await user.click(await screen.findByRole("button", { name: "Export version 3" }));
    expect(downloads.names).toEqual(["star-forge-development-v3.json"]);
    expect(JSON.parse(await readFileText(downloads.blobs[0])).source.configuration_version).toBe(3);
  });

  it("imports a file into the draft after confirmation, never publishing", async () => {
    const server = mockApi(routes({ [`PUT ${base}/configurations/draft`]: (r) => ({ body: r.body }) }));
    await openSettings();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    const imported = { ...liveConfig, currencies: [...liveConfig.currencies, { key: "tokens", name: "Tokens" }] };
    chooseFile(file("backup.json", { format: "realmstack.configuration", version: 1, config: imported }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0]).toMatch(/Replace the draft with backup\.json/);
    expect(server.find("PUT", `${base}/configurations/draft`)).toHaveLength(0);

    confirm.mockReturnValueOnce(true);
    chooseFile(file("backup.json", imported));
    expect(await screen.findByText(/Imported backup\.json into the draft/)).toBeInTheDocument();
    expect(server.find("PUT", `${base}/configurations/draft`)[0].body).toMatchObject({ currencies: imported.currencies });
    expect(server.find("POST", `${base}/configurations/publish`)).toHaveLength(0);
  });

  it("refuses a file that is not a configuration and reports server validation errors", async () => {
    mockApi(routes({ [`PUT ${base}/configurations/draft`]: apiError(422, "VALIDATION_ERROR", "The configuration is invalid.", { errors: [{ field: "items[0].key", message: "is required" }] }) }));
    await openSettings();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    chooseFile(file("notes.json", { format: "something-else" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The file is not a RealmStack configuration export.");
    expect(confirm).not.toHaveBeenCalled();

    chooseFile(file("broken.json", liveConfig));
    expect(await screen.findByText(/The configuration is invalid/)).toBeInTheDocument();
  });
});
