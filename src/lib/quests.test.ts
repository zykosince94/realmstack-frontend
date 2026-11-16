import { describe, expect, it } from "vitest";
import type { Config, QuestDefinition } from "../api/types";
import { autoLayout, chainsOf, connect, disconnect, fromUTCInput, LANE_HEIGHT, laneIndexForY, lanesOf, layoutOf, moveItem, placeNodes, toUTCInput, withQuests, wouldCreateCycle } from "./quests";
import { emptyConfig } from "./config";

function quest(key: string, requires: string[] = [], chain?: string): QuestDefinition {
  return { key, name: key, chain, requires_quests: requires, claimable_by: "player", repeat: "none", stages: [{ key: "s", name: "S", conditions: [{ type: "flag", flag_key: "x" }] }] };
}

// a → b → c is a chain; d stands alone.
const quests = [quest("a", [], "Main"), quest("b", ["a"], "Main"), quest("c", ["b"], "Main"), quest("d")];

describe("prerequisite graph", () => {
  it("detects loops before they are drawn", () => {
    expect(wouldCreateCycle(quests, "c", "a")).toBe(true); // a would require c, which requires a
    expect(wouldCreateCycle(quests, "a", "a")).toBe(true);
    expect(wouldCreateCycle(quests, "a", "c")).toBe(false); // redundant but not a loop
    expect(wouldCreateCycle(quests, "d", "a")).toBe(false);
  });

  it("connects and disconnects quests, refusing loops and duplicates", () => {
    const added = connect(quests, "d", "a");
    expect("quests" in added && added.quests.find((q) => q.key === "a")?.requires_quests).toEqual(["d"]);
    expect(connect(quests, "c", "a")).toEqual({ error: "a cannot require c: prerequisites cannot form a loop." });
    expect(connect(quests, "a", "b")).toEqual({ error: "b already requires a." });
    expect(disconnect(quests, "a", "b").find((q) => q.key === "b")?.requires_quests).toEqual([]);
  });
});

describe("lanes and layout", () => {
  it("lists chains in first-seen order with a final no-chain lane", () => {
    const mixed = [quest("x", [], "Side"), ...quests];
    expect(chainsOf(mixed)).toEqual(["Side", "Main"]);
    expect(lanesOf(mixed)).toEqual(["Side", "Main", ""]);
  });

  it("maps a node's vertical centre to a lane, clamped to the lanes that exist", () => {
    expect(laneIndexForY(0, 2)).toBe(0);
    expect(laneIndexForY(LANE_HEIGHT, 2)).toBe(1);
    expect(laneIndexForY(-500, 2)).toBe(0);
    expect(laneIndexForY(10 * LANE_HEIGHT, 2)).toBe(1);
  });

  it("auto-arranges prerequisites left to right inside their chain's lane", () => {
    const layout = autoLayout(quests);
    expect(layout.a.x).toBeLessThan(layout.b.x);
    expect(layout.b.x).toBeLessThan(layout.c.x);
    expect(laneIndexForY(layout.a.y, 2)).toBe(0);
    expect(laneIndexForY(layout.d.y, 2)).toBe(1); // no chain: last lane
  });

  it("keeps saved positions but snaps a node into its lane when its chain changed", () => {
    const saved = { a: { x: 500, y: 20 }, d: { x: 40, y: 20 } }; // d saved in lane 0, but has no chain
    const placed = placeNodes(quests, saved);
    expect(placed.a).toEqual({ x: 500, y: 20 });
    expect(placed.d.x).toBe(40);
    expect(laneIndexForY(placed.d.y, 2)).toBe(1);
    expect(placed.b).toBeDefined(); // unsaved quests get a computed position
  });
});

describe("editor_layout", () => {
  it("reads well-formed positions and ignores the rest", () => {
    const config = { ...emptyConfig(), editor_layout: { quests: { a: { x: 1, y: 2 }, bad: { x: "1" } }, other: true } } as Config;
    expect(layoutOf(config)).toEqual({ a: { x: 1, y: 2 } });
    expect(layoutOf(emptyConfig())).toEqual({});
  });

  it("writes quests and rounded positions, dropping layout for removed quests and keeping other layout keys", () => {
    const config = { ...emptyConfig(), editor_layout: { other: true } } as Config;
    const next = withQuests(config, [quest("a")], { a: { x: 1.4, y: 2.6 }, gone: { x: 0, y: 0 } });
    expect(next.quests).toHaveLength(1);
    expect(next.editor_layout).toEqual({ other: true, quests: { a: { x: 1, y: 3 } } });
  });
});

describe("stages and windows", () => {
  it("moves an item and ignores out-of-range moves", () => {
    const stages = ["s1", "s2", "s3"].map((key) => ({ key, name: key, conditions: [] }));
    expect(moveItem(stages, 0, 2).map((s) => s.key)).toEqual(["s2", "s3", "s1"]);
    expect(moveItem(stages, 0, -1)).toBe(stages);
  });

  it("round-trips UTC window inputs", () => {
    expect(toUTCInput("2026-06-01T09:30:00Z")).toBe("2026-06-01T09:30");
    expect(fromUTCInput("2026-06-01T09:30")).toBe("2026-06-01T09:30:00Z");
    expect(toUTCInput(null)).toBe("");
    expect(fromUTCInput("")).toBeNull();
  });
});
