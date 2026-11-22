import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi } from "../../test/mockApi";
import { routes } from "../../test/fixtures";
import { renderApp } from "../../test/render";

describe("Sign-in page", () => {
  it("lists every feature on one line each, and offers no sign-up", async () => {
    mockApi(routes());
    renderApp();
    const list = await screen.findByRole("list", { name: "Features" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(13);
    expect(list).toHaveTextContent("Cloud saves — versioned save slots that never overwrite silently");
    expect(screen.queryByRole("button", { name: /create an account/i })).not.toBeInTheDocument();
  });

  it("fills the form with either demo account, including the clean-workspace username", async () => {
    const server = mockApi(routes());
    const user = userEvent.setup();
    renderApp();
    const field = await screen.findByLabelText("Email or username");
    expect(field).toHaveValue("admin@realmstack.local");
    await user.click(screen.getByRole("button", { name: "Use admin" }));
    expect(field).toHaveValue("admin");
    await user.click(screen.getByRole("button", { name: /^sign in/i }));
    await waitFor(() => expect(server.find("POST", "/v1/auth/login")).toHaveLength(1));
    expect(server.find("POST", "/v1/auth/login")[0].body).toEqual({ email: "admin", password: "RealmStackLocal!2026" });
  });
});
