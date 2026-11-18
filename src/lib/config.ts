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

/** The "format" of a RealmStack configuration export file. */
export const configFileFormat = "realmstack.configuration";

/**
 * Wraps a configuration for download. The envelope says what the file is and where it
 * came from, so an import can refuse a file that is something else; the configuration
 * itself is exactly what the draft and publish APIs accept.
 */
export function exportConfiguration(config: Config, source: { project: string; slug: string; environment: string; version?: number }, now = new Date()) {
  return {
    format: configFileFormat,
    version: 1,
    exported_at: now.toISOString(),
    source: { project: source.project, slug: source.slug, environment: source.environment, ...(source.version ? { configuration_version: source.version } : {}) },
    config,
  };
}

/**
 * Reads an import file: a RealmStack export, or a bare configuration object (what the
 * JSON editor shows). Throws an Error with a message for the user when the file is not
 * a configuration. Only the shape is checked here; the server validates the contents
 * (references, cycles, reachable levels) when the draft is saved and published.
 */
export function parseConfigurationFile(text: string): Config {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error("The file is not valid JSON."); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("The file does not contain a RealmStack configuration.");
  const file = data as Record<string, unknown>;
  let config = file;
  if ("format" in file) {
    if (file.format !== configFileFormat) throw new Error("The file is not a RealmStack configuration export.");
    if (typeof file.version === "number" && file.version > 1) throw new Error("The file was exported by a newer RealmStack and cannot be imported here.");
    if (!file.config || typeof file.config !== "object") throw new Error("The export file has no configuration in it.");
    config = file.config as Record<string, unknown>;
  }
  for (const key of ["items", "currencies", "progression", "leaderboards"] as const) {
    if (!Array.isArray(config[key])) throw new Error(`The configuration needs an "${key}" list.`);
  }
  for (const key of ["stats", "achievements", "quests"] as const) {
    if (key in config && !Array.isArray(config[key])) throw new Error(`"${key}" must be a list.`);
  }
  return { ...emptyConfig(), ...config } as Config;
}

/** How many definitions a configuration holds (the XP curve counts as one). */
export function definitionCount(config: Config): number {
  return config.items.length + config.currencies.length + config.leaderboards.length + (config.stats?.length ?? 0) +
    (config.achievements?.length ?? 0) + (config.quests?.length ?? 0) + (config.progression.length ? 1 : 0);
}

/** Reads a chosen file as text (FileReader where Blob.text is missing, e.g. older engines). */
export function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsText(file);
  });
}

/** Starts a browser download of a JSON document. */
export function downloadJSON(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
