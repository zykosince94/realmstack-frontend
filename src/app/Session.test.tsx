import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, mockApi } from "../test/mockApi";
import { base, environment, openScreen, routes, signIn } from "../test/fixtures";
import { renderApp } from "../test/render";

const session = { access_token: "restored-token", user: { id: "u1", email: "admin@realmstack.local" }, token_type: "Bearer", expires_in: 900 };

describe("dashboard session", () => {
  it("resumes the session after a reload without the sign-in form", async () => {
    const server = mockApi(routes({ "POST /v1/auth/refresh": { body: session } }));
    renderApp();
    expect(await screen.findByRole("heading", { name: "Star Forge" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
    // The restored access token is the one used for API calls.
    await waitFor(() => expect(server.find("GET", "/v1/projects")[0]?.headers.Authorization).toBe("Bearer restored-token"));
  });

  it("returns to the screen that was open before the reload", async () => {
    sessionStorage.setItem("realmstack.ui", JSON.stringify({ screen: "settings" }));
    mockApi(routes({ "POST /v1/auth/refresh": { body: session } }));
    renderApp();
    expect(await screen.findByRole("heading", { name: "Project settings" })).toBeInTheDocument();
  });

  it("ignores a remembered screen that does not exist", async () => {
    sessionStorage.setItem("realmstack.ui", JSON.stringify({ screen: "nope" }));
    mockApi(routes({ "POST /v1/auth/refresh": { body: session } }));
    renderApp();
    expect(await screen.findByRole("heading", { name: "Star Forge" })).toBeInTheDocument();
  });

  it("tries the refresh cookie once when a request says the token expired", async () => {
    let refreshed = false;
    const server = mockApi(routes({
      "POST /v1/auth/refresh": () => (refreshed ? { body: session } : apiError(401, "NO_SESSION")),
      "GET /v1/projects/p1/environments": (r) => (r.headers.Authorization === "Bearer restored-token" ? { body: [environment] } : apiError(401, "UNAUTHORIZED")),
    }));
    const user = userEvent.setup();
    renderApp();
    await screen.findByLabelText("Email address");
    // Signed in, but the first request finds the token expired; the cookie still works.
    refreshed = true;
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("heading", { name: "Star Forge" })).toBeInTheDocument();
    expect(screen.queryByText("Your session expired. Please sign in again.")).not.toBeInTheDocument();
    expect(server.find("POST", "/v1/auth/refresh")).toHaveLength(2); // on load, then after the 401
  });

  it("ends the server session on sign-out", async () => {
    const server = mockApi(routes());
    const user = await signIn();
    await user.click(screen.getAllByTitle("Sign out")[0]);
    expect(await screen.findByLabelText("Email address")).toBeInTheDocument();
    await waitFor(() => expect(server.find("POST", "/v1/auth/logout")).toHaveLength(1));
  });
});

describe("notices and footer", () => {
  it("lets errors be dismissed and clears notices when the screen changes", async () => {
    mockApi(routes({ [`GET ${base}/credentials`]: apiError(500, "INTERNAL_ERROR", "Credential store is down.") }));
    const user = await signIn();
    await openScreen(user, "Project settings");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/credential/i);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("fades success notices on their own", async () => {
    mockApi(routes());
    await signIn();
    expect(await screen.findByText("Welcome back.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Welcome back.")).not.toBeInTheDocument(), { timeout: 6000 });
  }, 10000);

  it("clears the previous screen's notice when another screen opens", async () => {
    mockApi(routes());
    const user = await signIn();
    expect(await screen.findByText("Welcome back.")).toBeInTheDocument();
    await openScreen(user, "Test client");
    expect(screen.queryByText("Welcome back.")).not.toBeInTheDocument();
  });

  it("credits the developer on the sign-in page and in the dashboard", async () => {
    mockApi(routes());
    const user = userEvent.setup();
    renderApp();
    expect(await screen.findByText(/Developed by Rishabh Pandey/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://zykosince94.github.io" })).toHaveAttribute("href", "https://zykosince94.github.io");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("heading", { name: "Star Forge" });
    expect(screen.getByRole("link", { name: "https://zykosince94.github.io" })).toHaveAttribute("rel", "noreferrer");
  });
});
