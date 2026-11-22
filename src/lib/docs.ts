/**
 * Pure helpers for the documentation screen. Kept outside the React tree so the
 * table-of-contents extraction and search can be unit-tested without a DOM.
 */
export type DocHeading = { id: string; text: string; level: 2 | 3 };

export type DocPage = {
  id: string;
  title: string;
  summary: string;
  /** Raw Markdown, imported with Vite's `?raw` suffix. */
  body: string;
};

export type DocTab = {
  id: string;
  label: string;
  description: string;
  pages: DocPage[];
};

/** A heading slug that is stable between the Markdown renderer and the TOC. */
export function slugify(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Extracts the h2/h3 headings of a Markdown page for the sticky TOC. Fenced code
 * blocks are skipped so a `# comment` inside a shell sample never becomes a heading.
 */
export function extractHeadings(markdown: string): DocHeading[] {
  const headings: DocHeading[] = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = match[2].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_~]/g, "").trim();
    if (!text) continue;
    headings.push({ id: slugify(text), text, level: match[1].length as 2 | 3 });
  }
  return headings;
}

/** Strips the Markdown that makes search snippets noisy while keeping the words. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*/g, " "))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]*>\s?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[`*_~|]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, " ")
    .trim();
}

export type DocSearchHit = {
  tabId: string;
  tabLabel: string;
  pageId: string;
  title: string;
  summary: string;
  snippet: string;
};

/**
 * Case-insensitive search over every page. Every word in the query must appear, so
 * "quest claim" finds the quest claim section but not a page that only says "quest".
 */
export function searchDocs(tabs: DocTab[], query: string, limit = 24): DocSearchHit[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: DocSearchHit[] = [];
  for (const tab of tabs) {
    for (const page of tab.pages) {
      const haystack = `${page.title}\n${page.summary}\n${plainText(page.body)}`.toLowerCase();
      if (!words.every((word) => haystack.includes(word))) continue;
      const text = plainText(page.body);
      const at = Math.max(0, text.toLowerCase().indexOf(words[0]) - 60);
      const snippet = text.slice(at, at + 180).trim();
      hits.push({ tabId: tab.id, tabLabel: tab.label, pageId: page.id, title: page.title, summary: page.summary, snippet });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}
