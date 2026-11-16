import type { Condition, ConditionProgress, ConditionType, Config, FieldError, ItemDefinition } from "../api/types";

/** Keys of definitions, skipping any without one. */
export function keysOf(definitions: ReadonlyArray<{ key?: string }> | undefined): string[] {
  return (definitions ?? []).map((row) => row.key ?? "").filter(Boolean);
}

/**
 * Resolves the value a <select> should use: the current choice if it is still one of
 * the options, otherwise the first option. This keeps the submitted value and the
 * visible option in sync when the option list changes.
 */
export function pickKey(current: string, options: string[]): string {
  return options.includes(current) ? current : options[0] ?? "";
}

/** The equipment slot declared in an item's metadata, if it is equippable. */
export function itemSlot(item: Pick<ItemDefinition, "metadata">): string | null {
  const slot = item.metadata?.slot;
  return typeof slot === "string" && slot ? slot : null;
}

export function equippableItems<T extends Pick<ItemDefinition, "metadata">>(items: T[] | undefined): T[] {
  return (items ?? []).filter((item) => itemSlot(item) !== null);
}

/** Validates progression input: positive, strictly increasing integers for levels 2+. */
export function parseThresholds(text: string): number[] | null {
  const parsed = text.split(",").map((value) => Number(value.trim()));
  const valid = parsed.length > 0 && parsed.every((value, index) => Number.isInteger(value) && value > 0 && (index === 0 || value > parsed[index - 1]));
  return valid ? parsed : null;
}

/** An empty draft, used before the real one loads into an editor. */
export function emptyConfig(): Config {
  return { items: [], currencies: [], progression: [], leaderboards: [], stats: [], achievements: [], quests: [] };
}

/** Human labels for the closed condition set, in the order the condition builder offers them. */
export const conditionTypes: { type: ConditionType; label: string }[] = [
  { type: "stat", label: "Counter reaches" },
  { type: "flag", label: "Flag is set" },
  { type: "item_granted", label: "Items granted" },
  { type: "item_consumed", label: "Items consumed" },
  { type: "currency_earned", label: "Currency earned" },
  { type: "currency_spent", label: "Currency spent" },
  { type: "xp_total", label: "XP earned" },
  { type: "level_reached", label: "Level reached" },
  { type: "leaderboard_score", label: "Leaderboard score" },
];

/**
 * A new condition of `type` with only the fields that type accepts. The backend rejects
 * fields that do not belong to a condition type, so switching type must drop them.
 */
export function defaultCondition(type: ConditionType, keys: { item?: string; currency?: string; leaderboard?: string; stat?: string; flag?: string } = {}): Condition {
  switch (type) {
    case "flag":
      return { type, flag_key: keys.flag ?? "" };
    case "stat":
      return { type, stat_key: keys.stat ?? "", target: 1 };
    case "item_granted":
    case "item_consumed":
      return keys.item ? { type, item_key: keys.item, target: 1 } : { type, target: 1 };
    case "currency_earned":
    case "currency_spent":
      return { type, currency_key: keys.currency ?? "", target: 1 };
    case "leaderboard_score":
      return { type, leaderboard_key: keys.leaderboard ?? "", target: 1 };
    default:
      return { type, target: 1 };
  }
}

/** A one-line description of a condition, e.g. "Counter trolls_defeated ≥ 100". */
export function describeCondition(c: Condition): string {
  switch (c.type) {
    case "flag":
      return `Flag ${c.flag_key || "?"} is set`;
    case "stat":
      return `Counter ${c.stat_key || "?"} reaches ${c.target ?? 0}`;
    case "item_granted":
      return `Granted ${c.target ?? 0} × ${c.item_key || "any item"}`;
    case "item_consumed":
      return `Consumed ${c.target ?? 0} × ${c.item_key || "any item"}`;
    case "currency_earned":
      return `Earned ${c.target ?? 0} ${c.currency_key || "?"}`;
    case "currency_spent":
      return `Spent ${c.target ?? 0} ${c.currency_key || "?"}`;
    case "xp_total":
      return `Earned ${c.target ?? 0} XP`;
    case "level_reached":
      return `Reached level ${c.target ?? 0}`;
    case "leaderboard_score":
      return `Scored ${c.target ?? 0} on ${c.leaderboard_key || "?"}`;
  }
}

/** Progress as a 0–100 percentage for a progress bar. */
export function progressPercent(p: ConditionProgress): number {
  if (p.met) return 100;
  if (!p.has_value || p.target <= 0) return 0;
  return Math.max(0, Math.min(99, Math.floor((p.current / p.target) * 100)));
}

/**
 * Field errors for one definition, keyed by the path inside it. For collection
 * "achievements" and index 2, "achievements[2].conditions[0].stat_key" becomes
 * "conditions[0].stat_key"; errors about the definition as a whole map to "".
 */
export function errorsFor(errors: FieldError[], collection: string, index: number): Record<string, string> {
  const prefix = `${collection}[${index}]`;
  const out: Record<string, string> = {};
  for (const e of errors) {
    if (e.field === prefix) out[""] = e.message;
    else if (e.field.startsWith(prefix + ".")) out[e.field.slice(prefix.length + 1)] = e.message;
  }
  return out;
}

/** Indexes of definitions in `collection` that have at least one field error. */
export function indexesWithErrors(errors: FieldError[], collection: string): Set<number> {
  const out = new Set<number>();
  const pattern = new RegExp(`^${collection}\\[(\\d+)\\]`);
  for (const e of errors) {
    const match = pattern.exec(e.field);
    if (match) out.add(Number(match[1]));
  }
  return out;
}
