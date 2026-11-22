import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { apiError, mockApi } from "../../test/mockApi";
import { activity, base, routes, signIn } from "../../test/fixtures";

describe("Dashboard", () => {
  it("is the landing screen and leads with player activity", async () => {
    mockApi(routes());
    await signIn();
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveClass("active");
    const panel = await screen.findByRole("region", { name: "Player activity" });
    expect(await within(panel).findByText("Online now")).toBeInTheDocument();
    // The headline numbers.
    expect(within(panel).getByText("Online now").parentElement).toHaveTextContent("6");
    expect(within(panel).getByText("Peak online").parentElement).toHaveTextContent("8");
    expect(within(panel).getByText("Active today").parentElement).toHaveTextContent("12");
    // Two charts, each named; one measure per axis.
    expect(within(panel).getByRole("group", { name: /^Concurrent players, last 24 hours\. Now 6\./ })).toBeInTheDocument();
    expect(within(panel).getByRole("group", { name: /^Daily active players, last 30 days\. Today so far 12\./ })).toBeInTheDocument();
  });

  it("reads values with the keyboard and on hover, and offers a table view", async () => {
    mockApi(routes());
    await signIn();
    const panel = await screen.findByRole("region", { name: "Player activity" });
    const ccu = await within(panel).findByRole("group", { name: /^Concurrent players/ });
    // Focus starts at the latest window; the arrow keys step back through time.
    fireEvent.focus(ccu);
    expect(within(ccu).getByRole("status")).toHaveTextContent(/^6 online/);
    fireEvent.keyDown(ccu, { key: "ArrowLeft" });
    expect(within(ccu).getByRole("status")).toHaveTextContent(new RegExp(`^${activity.ccu[94].players} online`));
    fireEvent.blur(ccu);
    expect(within(ccu).queryByRole("status")).not.toBeInTheDocument();

    // A column's whole slot is its hover target.
    const dau = within(panel).getByRole("group", { name: /^Daily active players/ });
    const slots = dau.querySelectorAll("rect");
    expect(slots).toHaveLength(30);
    fireEvent.pointerEnter(slots[0]);
    expect(within(dau).getByRole("status")).toHaveTextContent(new RegExp(`^${activity.dau[0].players} active`));
    fireEvent.pointerLeave(slots[0]);
    expect(within(dau).queryByRole("status")).not.toBeInTheDocument();

    // Every value is reachable without hovering.
    expect(within(panel).getByRole("table", { name: "Concurrent players by 15 minutes", hidden: true }).querySelectorAll("tbody tr")).toHaveLength(96);
    expect(within(panel).getByRole("table", { name: "Daily active players", hidden: true }).querySelectorAll("tbody tr")).toHaveLength(30);
  });

  it("says so when nobody has played yet", async () => {
    const quiet = { ...activity, ccu_now: 0, ccu_peak_24h: 0, dau_today: 0, ccu: activity.ccu.map((p) => ({ ...p, players: 0 })), dau: activity.dau.map((p) => ({ ...p, players: 0 })) };
    mockApi(routes({ [`GET ${base}/activity`]: { body: quiet } }));
    await signIn();
    expect(await screen.findByText(/No player sessions in this environment yet/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /^Concurrent players/ })).not.toBeInTheDocument();
  });

  it("reports a failed load and keeps the rest of the dashboard", async () => {
    mockApi(routes({ [`GET ${base}/activity`]: apiError(500, "INTERNAL_ERROR", "An unexpected error occurred.") }));
    await signIn();
    expect(await screen.findByText("Activity could not be loaded.")).toBeInTheDocument();
    expect(screen.getByText("Published v3")).toBeInTheDocument();
  });
});
