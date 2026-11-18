import { describe, expect, it } from "vitest";
import type { Config } from "../api/types";
import { answerOf, asProvider, destinationChanged, generates, hostOf, operationLabel, paramsFor, proposalRows, usageLabel } from "./ai";
import { emptyConfig } from "./config";

describe("AI provider helpers", () => {
  it("narrows unknown providers to OpenAI and shortens base URLs for display", () => {
    expect(asProvider("openai_compatible")).toBe("openai_compatible");
    expect(asProvider("openai")).toBe("openai");
    expect(asProvider(null)).toBe("openai");
    expect(asProvider("acme")).toBe("openai");
    expect(hostOf("https://openrouter.ai/api/v1")).toBe("openrouter.ai");
    expect(hostOf("not a url")).toBe("not a url");
  });

  it("knows when saving would send the stored key to a new destination", () => {
    const openai = { provider: "openai", base_url: null };
    const router = { provider: "openai_compatible", base_url: "https://openrouter.ai/api/v1" };
    expect(destinationChanged(openai, "openai", "")).toBe(false);
    expect(destinationChanged(openai, "openai", "https://ignored.example")).toBe(false);
    expect(destinationChanged(openai, "openai_compatible", "https://openrouter.ai/api/v1")).toBe(true);
    expect(destinationChanged(router, "openai", "")).toBe(true);
    expect(destinationChanged(router, "openai_compatible", "https://openrouter.ai/api/v1")).toBe(false);
    expect(destinationChanged(router, "openai_compatible", " https://openrouter.ai/api/v1/ ")).toBe(false);
    expect(destinationChanged(router, "openai_compatible", "https://api.groq.com/openai/v1")).toBe(true);
  });
});

describe("AI helpers", () => {
  it("sends only the fields an operation uses, without empty values", () => {
    expect(paramsFor("items", { brief: "pirates", count: 4, question: "ignored", levels: 9 })).toEqual({ brief: "pirates", count: 4 });
    expect(paramsFor("progression", { brief: "", levels: Number.NaN, pacing: "steep" })).toEqual({ pacing: "steep" });
    expect(paramsFor("explain", { question: "Why?", brief: "x" })).toEqual({ question: "Why?" });
  });

  it("marks each proposed definition as new or replacing a draft definition", () => {
    const draft = { ...emptyConfig(), items: [{ key: "sword", name: "Sword", category: "", stackable: false, max_stack: 1, metadata: {} }] } as Config;
    const rows = proposalRows({ items: [{ key: "sword", name: "Better Sword", category: "", stackable: false, max_stack: 1, metadata: {} }, { key: "herb", name: "Herb", category: "", stackable: true, max_stack: 9, metadata: {} }], progression: [100, 250] }, draft);
    expect(rows).toEqual([
      { collection: "items", key: "sword", name: "Better Sword", change: "replaces" },
      { collection: "items", key: "herb", name: "Herb", change: "new" },
      { collection: "progression", key: "thresholds", name: "3 levels: 100, 250", change: "replaces" },
    ]);
    expect(proposalRows(null, draft)).toEqual([]);
  });

  it("types explain and test answers, and labels operations and usage", () => {
    expect(answerOf({ operation: "explain", answer: "Because." })).toEqual({ text: "Because." });
    expect(answerOf({ operation: "tests", answer: [{ name: "a", kind: "positive", description: "", steps: [], expected: "" }] }).cases).toHaveLength(1);
    expect(answerOf({ operation: "items", answer: null })).toEqual({});
    expect(generates("quests")).toBe(true);
    expect(generates("explain")).toBe(false);
    expect(operationLabel("tests")).toBe("Test ideas");
    expect(usageLabel({ input_tokens: 1200, output_tokens: 340 })).toBe("1,200 tokens in · 340 out");
  });
});
