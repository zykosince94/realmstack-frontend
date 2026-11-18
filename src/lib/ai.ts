import type { AIGeneration, AIOperation, AIParams, AIProposal, Config } from "../api/types";

// Pure helpers for the AI assistant screen, kept out of components so they are
// unit-tested directly.

export type ParamField = keyof AIParams;

export const operations: { id: AIOperation; label: string; description: string; fields: ParamField[] }[] = [
  { id: "items", label: "Items", description: "New item definitions for the catalog.", fields: ["brief", "count"] },
  { id: "economy", label: "Economy", description: "Currencies with sources and sinks, plus advisory item prices.", fields: ["brief", "count"] },
  { id: "progression", label: "Progression", description: "A cumulative XP curve. Replaces the draft's thresholds.", fields: ["brief", "levels", "pacing"] },
  { id: "achievements", label: "Achievements", description: "Achievements (and any stats or flags they need) from the closed condition set.", fields: ["brief", "count"] },
  { id: "quests", label: "Quests", description: "Quests with ordered stages, prerequisites and rewards.", fields: ["brief", "count", "quest_type", "stage_count"] },
  { id: "explain", label: "Explain", description: "Ask a question about the current configuration.", fields: ["question"] },
  { id: "tests", label: "Test ideas", description: "Positive and negative test cases a QA engineer should check.", fields: ["brief"] },
];

export function operationLabel(id: string): string {
  return operations.find((o) => o.id === id)?.label ?? id;
}

/** Whether an operation proposes definitions (as opposed to answering a question). */
export function generates(op: string): boolean {
  return op !== "explain" && op !== "tests";
}

/** Model IDs offered as suggestions for OpenAI; any ID the provider accepts can be typed. */
export const suggestedModels = ["gpt-6.1-sol", "gpt-6.1-terra", "gpt-5.5", "gpt-5.4-mini"];

export type ProviderId = "openai" | "openai_compatible";

export const providerLabels: Record<ProviderId, string> = { openai: "OpenAI", openai_compatible: "OpenAI-compatible" };

/** Narrows what the API returned to a provider this screen knows. */
export function asProvider(value: string | null | undefined): ProviderId {
  return value === "openai_compatible" ? "openai_compatible" : "openai";
}

/** The host of a base URL for display (the full URL can be long); the input if it does not parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Whether saving would send the stored key somewhere new. The server refuses to keep a
 * stored key for a different provider or base URL, so the form then requires the key.
 */
export function destinationChanged(saved: { provider: string | null; base_url: string | null }, provider: ProviderId, baseUrl: string): boolean {
  return asProvider(saved.provider) !== provider || (provider === "openai_compatible" && (saved.base_url ?? "") !== baseUrl.trim().replace(/\/+$/, ""));
}

/** Only the fields the operation uses, without empty values. */
export function paramsFor(op: AIOperation, params: AIParams): AIParams {
  const fields = operations.find((o) => o.id === op)?.fields ?? [];
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = params[field];
    if (value !== undefined && value !== "" && !(typeof value === "number" && Number.isNaN(value))) out[field] = value;
  }
  return out as AIParams;
}

export type ProposalRow = { collection: string; key: string; name: string; change: "new" | "replaces" };

const collections = ["items", "currencies", "stats", "achievements", "quests"] as const;

/** One row per proposed definition, marking whether it is new or replaces a draft definition. */
export function proposalRows(proposal: AIProposal | null | undefined, draft: Config | undefined): ProposalRow[] {
  if (!proposal) return [];
  const rows: ProposalRow[] = [];
  for (const collection of collections) {
    const existing = new Set(((draft?.[collection] ?? []) as { key: string }[]).map((d) => d.key));
    for (const def of (proposal[collection] ?? []) as { key: string; name: string }[]) {
      rows.push({ collection, key: def.key, name: def.name, change: existing.has(def.key) ? "replaces" : "new" });
    }
  }
  if (proposal.progression?.length) {
    rows.push({ collection: "progression", key: "thresholds", name: `${proposal.progression.length + 1} levels: ${proposal.progression.join(", ")}`, change: "replaces" });
  }
  return rows;
}

export type TestCase = { name: string; kind: "positive" | "negative"; description: string; steps: string[]; expected: string };

/** The answer of an explain (text) or tests (cases) generation, typed. */
export function answerOf(g: Pick<AIGeneration, "operation" | "answer">): { text?: string; cases?: TestCase[] } {
  if (g.operation === "explain" && typeof g.answer === "string") return { text: g.answer };
  if (g.operation === "tests" && Array.isArray(g.answer)) return { cases: g.answer as TestCase[] };
  return {};
}

/** "1,200 in · 340 out" */
export function usageLabel(usage: AIGeneration["usage"]): string {
  return `${usage.input_tokens.toLocaleString("en-US")} tokens in · ${usage.output_tokens.toLocaleString("en-US")} out`;
}
