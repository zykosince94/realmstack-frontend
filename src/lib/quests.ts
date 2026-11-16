import dagre from "@dagrejs/dagre";
import type { Config, QuestDefinition } from "../api/types";

// Pure helpers behind the quest editor: the prerequisite graph, chain lanes, layout
// and the draft's editor_layout. Kept free of React so they are unit-tested directly.

export type Position = { x: number; y: number };
/** Quest node positions by quest key, saved in the draft's editor_layout.quests. */
export type QuestLayout = Record<string, Position>;

// Canvas geometry. Lanes are horizontal bands, one per chain plus "No chain" last.
export const NODE_WIDTH = 230;
export const NODE_HEIGHT = 118;
export const LANE_HEIGHT = 170;
export const LANE_PADDING = 26;
const COLUMN_GAP = 90;

/** Distinct chain labels in first-seen order. */
export function chainsOf(quests: QuestDefinition[]): string[] {
  const out: string[] = [];
  for (const q of quests) {
    if (q.chain && !out.includes(q.chain)) out.push(q.chain);
  }
  return out;
}

/** Lane labels: every chain, then "" for quests without one. */
export function lanesOf(quests: QuestDefinition[]): string[] {
  return [...chainsOf(quests), ""];
}

export function laneTop(index: number): number {
  return index * LANE_HEIGHT;
}

/** The lane a node belongs to when its top-left corner is at y (by its vertical centre). */
export function laneIndexForY(y: number, laneCount: number): number {
  const index = Math.floor((y + NODE_HEIGHT / 2) / LANE_HEIGHT);
  return Math.max(0, Math.min(laneCount - 1, index));
}

/**
 * True when `dependent` requiring `prerequisite` would close a loop: that is, when the
 * prerequisite already (transitively) requires the dependent, or they are the same.
 * The backend rejects cycles at publish; the canvas refuses them as they are drawn.
 */
export function wouldCreateCycle(quests: QuestDefinition[], prerequisite: string, dependent: string): boolean {
  if (prerequisite === dependent) return true;
  const requires = new Map(quests.map((q) => [q.key, q.requires_quests ?? []]));
  const seen = new Set<string>();
  const stack = [prerequisite];
  while (stack.length) {
    const key = stack.pop()!;
    if (key === dependent) return true;
    if (seen.has(key)) continue;
    seen.add(key);
    stack.push(...(requires.get(key) ?? []));
  }
  return false;
}

/** Adds a prerequisite edge, or explains why it cannot be added. */
export function connect(quests: QuestDefinition[], prerequisite: string, dependent: string): { quests: QuestDefinition[] } | { error: string } {
  const target = quests.find((q) => q.key === dependent);
  if (!target || !quests.some((q) => q.key === prerequisite)) return { error: "Both quests must be in the draft." };
  if ((target.requires_quests ?? []).includes(prerequisite)) return { error: `${dependent} already requires ${prerequisite}.` };
  if (wouldCreateCycle(quests, prerequisite, dependent)) return { error: `${dependent} cannot require ${prerequisite}: prerequisites cannot form a loop.` };
  return { quests: quests.map((q) => q.key === dependent ? { ...q, requires_quests: [...(q.requires_quests ?? []), prerequisite] } : q) };
}

/** Removes a prerequisite edge. */
export function disconnect(quests: QuestDefinition[], prerequisite: string, dependent: string): QuestDefinition[] {
  return quests.map((q) => q.key === dependent ? { ...q, requires_quests: (q.requires_quests ?? []).filter((k) => k !== prerequisite) } : q);
}

/**
 * Lays quests out left to right by prerequisite depth (dagre), each in its chain's
 * lane. Quests that would overlap in a lane are pushed right.
 */
export function autoLayout(quests: QuestDefinition[]): QuestLayout {
  const lanes = lanesOf(quests);
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 30, ranksep: COLUMN_GAP, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const q of quests) g.setNode(q.key, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const q of quests) {
    for (const req of q.requires_quests ?? []) {
      if (g.hasNode(req)) g.setEdge(req, q.key);
    }
  }
  dagre.layout(g);
  const layout: QuestLayout = {};
  const occupied = new Map<number, number[]>(); // lane → x positions taken
  const ordered = [...quests].sort((a, b) => g.node(a.key).x - g.node(b.key).x);
  for (const q of ordered) {
    const lane = lanes.indexOf(q.chain ?? "");
    const taken = occupied.get(lane) ?? [];
    let x = Math.round(g.node(q.key).x - NODE_WIDTH / 2);
    while (taken.some((t) => Math.abs(t - x) < NODE_WIDTH + 20)) x += NODE_WIDTH + 40;
    taken.push(x);
    occupied.set(lane, taken);
    layout[q.key] = { x, y: laneTop(lane) + LANE_PADDING };
  }
  return layout;
}

/**
 * Where each quest's node is drawn: its saved position, snapped into its chain's lane
 * when the chain changed elsewhere (the side panel); unsaved quests get the
 * auto-layout position.
 */
export function placeNodes(quests: QuestDefinition[], saved: QuestLayout): QuestLayout {
  const lanes = lanesOf(quests);
  const fallback = autoLayout(quests);
  const out: QuestLayout = {};
  for (const q of quests) {
    const lane = lanes.indexOf(q.chain ?? "");
    const p = saved[q.key] ?? fallback[q.key];
    out[q.key] = laneIndexForY(p.y, lanes.length) === lane ? p : { x: p.x, y: laneTop(lane) + LANE_PADDING };
  }
  return out;
}

function isPosition(value: unknown): value is Position {
  return typeof value === "object" && value !== null && typeof (value as Position).x === "number" && typeof (value as Position).y === "number";
}

/** Reads editor_layout.quests from a draft, ignoring anything malformed. */
export function layoutOf(config: Config | undefined): QuestLayout {
  const raw = (config?.editor_layout as { quests?: unknown } | undefined)?.quests;
  if (typeof raw !== "object" || raw === null) return {};
  return Object.fromEntries(Object.entries(raw).filter(([, p]) => isPosition(p))) as QuestLayout;
}

/** A copy of the draft with new quests and node positions (layout limited to existing quests). */
export function withQuests(config: Config, quests: QuestDefinition[], layout: QuestLayout): Config {
  const keys = new Set(quests.map((q) => q.key));
  const kept = Object.fromEntries(Object.entries(layout).filter(([k]) => keys.has(k)).map(([k, p]) => [k, { x: Math.round(p.x), y: Math.round(p.y) }]));
  const editorLayout = typeof config.editor_layout === "object" && config.editor_layout !== null ? config.editor_layout : {};
  return { ...config, quests, editor_layout: { ...editorLayout, quests: kept } };
}

/** Moves an item (a stage, or its drag id) from one index to another. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Availability windows are UTC. A datetime-local input has no zone, so the editor
 * shows and reads the UTC wall-clock time and labels the field "(UTC)".
 */
export function toUTCInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
}

export function fromUTCInput(value: string): string | null {
  return value ? new Date(`${value}:00Z`).toISOString().replace(".000Z", "Z") : null;
}

/** "Daily · resets at 00:00 UTC" style summary of when a quest runs. */
export function scheduleSummary(q: Pick<QuestDefinition, "repeat" | "available_from" | "available_until">): string {
  const parts: string[] = [];
  if (q.repeat === "daily") parts.push("Daily");
  if (q.repeat === "weekly") parts.push("Weekly");
  if (q.available_from || q.available_until) parts.push("Event window");
  return parts.join(" · ");
}
