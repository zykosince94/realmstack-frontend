import { describe, expect, it } from "vitest";
import { extractHeadings } from "../../lib/docs";
import { docTabs } from "./content";

describe("documentation content", () => {
  it("has unique tabs and page ids", () => {
    expect(docTabs).toHaveLength(5);
    expect(new Set(docTabs.map((tab) => tab.id)).size).toBe(docTabs.length);
    const pageIds = docTabs.flatMap((tab) => tab.pages.map((page) => page.id));
    expect(new Set(pageIds).size).toBe(pageIds.length);
  });

  it("every page has a title, summary, body and sections", () => {
    for (const tab of docTabs) {
      expect(tab.pages.length).toBeGreaterThan(0);
      for (const page of tab.pages) {
        expect(page.title.trim()).not.toBe("");
        expect(page.summary.trim()).not.toBe("");
        expect(page.body.length).toBeGreaterThan(200);
        // The React component renders the page title as h1; content starts at h2. Shell
        // comments inside fenced code are not headings, so ignore fenced blocks.
        expect(page.body.replace(/```[\s\S]*?```/g, "")).not.toMatch(/^# /m);
        expect(extractHeadings(page.body).length).toBeGreaterThan(0);
      }
    }
  });

  it("covers the documented feature areas", () => {
    const ids = new Set(docTabs.flatMap((tab) => tab.pages.map((page) => page.id)));
    for (const id of ["getting-started", "players", "quests", "api-conventions", "deployment-production", "security"]) {
      expect(ids.has(id)).toBe(true);
    }
  });
});
