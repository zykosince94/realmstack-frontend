import { describe, expect, it } from "vitest";
import { extractHeadings, plainText, searchDocs, slugify, type DocTab } from "./docs";

describe("documentation helpers", () => {
  it("builds stable heading slugs", () => {
    expect(slugify("Auth and conventions")).toBe("auth-and-conventions");
    expect(slugify("API: errors & codes")).toBe("api-errors-codes");
    expect(slugify("`Idempotency-Key`")).toBe("idempotency-key");
    expect(slugify("[Linked heading](https://example.com)")).toBe("linked-heading");
  });

  it("extracts h2/h3 headings and ignores fenced code", () => {
    const headings = extractHeadings([
      "# Page title is not a section",
      "## Claim rewards",
      "```bash",
      "# this is a shell comment, not a heading",
      "## not a heading either",
      "```",
      "### Per period",
      "## Claim rewards",
    ].join("\n"));
    expect(headings.map((heading) => heading.text)).toEqual(["Claim rewards", "Per period", "Claim rewards"]);
    expect(headings[0]).toMatchObject({ id: "claim-rewards", level: 2 });
    expect(headings[1]).toMatchObject({ id: "per-period", level: 3 });
  });

  it("strips Markdown for snippets", () => {
    expect(plainText("## Title\n\nA **bold** [link](https://example.com) and `code`.\n\n```js\nconst x = 1;\n```"))
      .toContain("A bold link and code");
  });

  it("searches every word across pages", () => {
    const tabs: DocTab[] = [{
      id: "guides",
      label: "Guides",
      description: "",
      pages: [
        { id: "quests", title: "Quest claims", summary: "How claims work", body: "A claim pays every earned reward." },
        { id: "saves", title: "Cloud saves", summary: "Versioned slots", body: "Write with expected_version." },
      ],
    }];
    expect(searchDocs(tabs, "claim earned")).toHaveLength(1);
    expect(searchDocs(tabs, "quest reward")[0].pageId).toBe("quests");
    expect(searchDocs(tabs, "claim earned")[0].snippet).toContain("claim");
    expect(searchDocs(tabs, "missing")).toHaveLength(0);
    expect(searchDocs(tabs, "   ")).toHaveLength(0);
  });
});
