import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DocsPage } from "./DocsPage";

describe("DocsPage", () => {
  it("renders the first page, tabs, page list and table of contents", () => {
    render(<DocsPage />);
    expect(screen.getByRole("tablist", { name: "Documentation categories" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "What is RealmStack?", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Getting started" })).toBeInTheDocument();
    const toc = screen.getByRole("complementary", { name: "On this page" });
    expect(within(toc).getByRole("button", { name: "What is in the box" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /OpenAPI contract/ })).toHaveAttribute("href", "/openapi.yaml");
  });

  it("switches tabs and pages", async () => {
    const user = userEvent.setup();
    render(<DocsPage />);
    await user.click(screen.getByRole("tab", { name: "API reference" }));
    expect(screen.getByRole("heading", { name: "Auth and conventions", level: 1 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Errors and status codes" }));
    expect(screen.getByRole("heading", { name: "Errors and status codes", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("IDEMPOTENCY_CONFLICT")).toBeInTheDocument();
  });

  it("searches across tabs and opens a result", async () => {
    const user = userEvent.setup();
    render(<DocsPage />);
    await user.type(screen.getByRole("searchbox", { name: "Search documentation" }), "idempotency");
    expect(await screen.findByText(/results?$/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Core concepts/ }));
    expect(screen.getByRole("heading", { name: "Core concepts", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search documentation" })).toHaveValue("");
  });

  it("copies a code block", async () => {
    const user = userEvent.setup();
    render(<DocsPage />);
    const copies = screen.getAllByRole("button", { name: "Copy" });
    await user.click(copies[0]);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});
