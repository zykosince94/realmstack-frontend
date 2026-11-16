export type Definition = Record<string, unknown>;

export type Config = {
  items?: Definition[];
  currencies?: Definition[];
  progression?: number[];
  leaderboards?: Definition[];
  [key: string]: unknown;
};

/** The live configuration. `version` is null when nothing has been published yet. */
export type Published = { version: number | null; config: Config | null; published_at: string | null };

export function asArray<T>(value: T[] | { data?: T[]; items?: T[] } | undefined | null): T[] {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.data)) return value.data;
  if (value && Array.isArray(value.items)) return value.items;
  return [];
}

export function keysOf(definitions: Definition[] | undefined): string[] {
  return asArray(definitions).map((row) => String(row.key ?? "")).filter(Boolean);
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
export function itemSlot(item: Definition): string | null {
  const metadata = item.metadata as Record<string, unknown> | undefined;
  return typeof metadata?.slot === "string" && metadata.slot ? metadata.slot : null;
}

export function equippableItems(items: Definition[] | undefined): Definition[] {
  return asArray(items).filter((item) => itemSlot(item) !== null);
}

/** Validates progression input: positive, strictly increasing integers for levels 2+. */
export function parseThresholds(text: string): number[] | null {
  const parsed = text.split(",").map((value) => Number(value.trim()));
  const valid = parsed.length > 0 && parsed.every((value, index) => Number.isInteger(value) && value > 0 && (index === 0 || value > parsed[index - 1]));
  return valid ? parsed : null;
}
