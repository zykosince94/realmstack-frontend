import { isValidElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Search } from "lucide-react";
import { extractHeadings, searchDocs, slugify, type DocTab } from "../../lib/docs";
import { docTabs, findPage, findTab } from "./content";

/** Plain text of a rendered Markdown node, used to derive stable heading ids. */
function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return "";
}

/** A fenced code block with a copy button; plain `pre` nodes from Markdown use it. */
function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLPreElement>(null);

  async function copy() {
    const text = ref.current?.innerText ?? "";
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // A browser may refuse clipboard access; the text is still selectable.
    }
  }

  return (
    <div className="docs-code">
      <button type="button" className="docs-copy" onClick={() => void copy()}>
        {copied ? "Copied" : "Copy"}
      </button>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

const markdownComponents: Components = {
  h2: ({ children }) => <h2 id={slugify(nodeText(children))}>{children}</h2>,
  h3: ({ children }) => <h3 id={slugify(nodeText(children))}>{children}</h3>,
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  table: ({ children }) => (
    <div className="docs-table-wrap">
      <table>{children}</table>
    </div>
  ),
  img: ({ src, alt }) => <img src={src} alt={alt ?? ""} decoding="async" />,
  a: ({ href, children }) => {
    const external = Boolean(href?.startsWith("http"));
    return (
      <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
        {children}
        {external && <ExternalLink size={12} aria-hidden="true" />}
      </a>
    );
  },
};

/**
 * The documentation experience. It is rendered both as a public page (`#/docs`) and as a
 * dashboard screen; `embedded` only changes the surrounding chrome. Content is static, so
 * there is no loading or request state.
 */
export function DocsPage({ embedded = false, onExit }: {
  embedded?: boolean;
  onExit?: () => void;
}) {
  const [tabId, setTabId] = useState(docTabs[0].id);
  const [pageId, setPageId] = useState(() => findTab(docTabs[0].id).pages[0].id);
  const [query, setQuery] = useState("");
  const articleRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  const tab = findTab(tabId);
  const page = findPage(tab, pageId);
  const headings = useMemo(() => extractHeadings(page.body), [page.body]);
  const hits = useMemo(() => searchDocs(docTabs, query), [query]);

  const index = tab.pages.findIndex((item) => item.id === page.id);
  const previous = index > 0 ? tab.pages[index - 1] : undefined;
  const next = index >= 0 && index < tab.pages.length - 1 ? tab.pages[index + 1] : undefined;

  useEffect(() => {
    // Do not jump past the hero on first load; only a page change should reposition.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // jsdom does not implement scrollIntoView; the optional call keeps tests honest.
    articleRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [page.id]);

  function selectTab(id: string) {
    const nextTab = findTab(id);
    setTabId(nextTab.id);
    setPageId(nextTab.pages[0].id);
    setQuery("");
  }

  function selectPage(nextTab: DocTab, id: string) {
    setTabId(nextTab.id);
    setPageId(id);
    setQuery("");
  }

  return (
    <div className={`docs ${embedded ? "embedded" : "standalone"}`}>
      <header className="docs-hero">
        <div>
          <div className="eyebrow">DOCUMENTATION</div>
          <h1>{embedded ? "Documentation" : "Build on RealmStack"}</h1>
          <p>
            Feature guides, the complete HTTP reference, deployment instructions and the
            operational rules behind the platform.
          </p>
        </div>
        <div className="docs-hero-actions">
          <a className="button secondary" href="/openapi.yaml" download="realmstack-openapi.yaml">
            <Download size={15} aria-hidden="true" /> OpenAPI contract
          </a>
          {!embedded && onExit && (
            <button type="button" className="button secondary" onClick={onExit}>Sign in</button>
          )}
        </div>
      </header>

      <div className="docs-tabs" role="tablist" aria-label="Documentation categories">
        {docTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === tab.id}
            className={`docs-tab ${item.id === tab.id ? "selected" : ""}`}
            onClick={() => selectTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="docs-layout">
        <nav className="docs-nav" aria-label={`${tab.label} pages`}>
          <label className="docs-search">
            <span className="sr-only">Search documentation</span>
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder="Search docs…"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          {query.trim() ? (
            <div className="docs-search-results" aria-live="polite">
              <p className="docs-nav-label">{hits.length} result{hits.length === 1 ? "" : "s"}</p>
              {hits.map((hit) => (
                <button
                  key={`${hit.tabId}/${hit.pageId}`}
                  type="button"
                  className="docs-result"
                  onClick={() => selectPage(findTab(hit.tabId), hit.pageId)}
                >
                  <small>{hit.tabLabel}</small>
                  <b>{hit.title}</b>
                  <span>{hit.snippet}…</span>
                </button>
              ))}
              {!hits.length && <p className="docs-empty">No page matches “{query}”.</p>}
            </div>
          ) : (
            <>
              <p className="docs-nav-label">{tab.label}</p>
              {tab.pages.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`docs-page-link ${item.id === page.id ? "selected" : ""}`}
                  aria-current={item.id === page.id ? "page" : undefined}
                  onClick={() => selectPage(tab, item.id)}
                >
                  {item.title}
                </button>
              ))}
              <p className="docs-nav-note">{tab.description}</p>
            </>
          )}
        </nav>

        <article className="docs-article" ref={articleRef}>
          <div className="eyebrow">{tab.label}</div>
          <h1 className="docs-page-title">{page.title}</h1>
          <p className="docs-page-summary">{page.summary}</p>
          <div className="docs-prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {page.body}
            </ReactMarkdown>
          </div>

          <nav className="docs-pager" aria-label="Previous and next page">
            {previous ? (
              <button type="button" className="docs-pager-button" onClick={() => selectPage(tab, previous.id)}>
                <ChevronLeft size={15} aria-hidden="true" />
                <span><small>Previous</small><b>{previous.title}</b></span>
              </button>
            ) : <span />}
            {next && (
              <button type="button" className="docs-pager-button next" onClick={() => selectPage(tab, next.id)}>
                <span><small>Next</small><b>{next.title}</b></span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            )}
          </nav>
        </article>

        <aside className="docs-toc" aria-label="On this page">
          <p className="docs-nav-label">On this page</p>
          {headings.map((heading) => (
            <button
              key={`${heading.id}-${heading.text}`}
              type="button"
              className={`docs-toc-link level-${heading.level}`}
              onClick={() => document.getElementById(heading.id)?.scrollIntoView?.({ block: "start", behavior: "smooth" })}
            >
              {heading.text}
            </button>
          ))}
          {!headings.length && <p className="docs-empty">This page has no sections.</p>}
        </aside>
      </div>
    </div>
  );
}
