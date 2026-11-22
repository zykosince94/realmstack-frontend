import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi } from "../../test/mockApi";
import { openScreen, routes, signIn } from "../../test/fixtures";
import { renderApp } from "../../test/render";

describe("Documentation entry points", () => {
  it("opens the dashboard Documentation screen from the sidebar", async () => {
    mockApi(routes());
    const user = await signIn();
    await openScreen(user, "Documentation");
    expect(await screen.findByRole("heading", { name: "Documentation", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Documentation categories" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What is RealmStack?", level: 1 })).toBeInTheDocument();
  });

  it("opens the dashboard Documentation screen from the account menu", async () => {
    mockApi(routes());
    const user = await signIn();
    expect(screen.queryByRole("button", { name: "Read the docs" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Documentation" }));
    expect(await screen.findByRole("heading", { name: "Documentation", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Documentation categories" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What is RealmStack?", level: 1 })).toBeInTheDocument();
  });

  it("opens the public page from the sign-in form and returns to sign-in", async () => {
    mockApi(routes());
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: "Read the documentation" }));
    expect(await screen.findByRole("heading", { name: "Build on RealmStack" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/docs");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("opens the public page directly from #/docs", async () => {
    window.location.hash = "#/docs";
    mockApi(routes());
    renderApp();
    expect(await screen.findByRole("heading", { name: "Build on RealmStack" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Feature guides" })).toBeInTheDocument();
  });
});
