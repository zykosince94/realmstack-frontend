import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Award, CircleHelp, Coins, History, ListChecks, Package, PowerOff, ScrollText, Settings2, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";
import { authHeaders, client, unwrap } from "../../api/client";
import { ApiError } from "../../api/errors";
import type { AIOperation, AIParams, AIProposal, AISettings } from "../../api/types";
import { useWorkspace } from "../../app/workspace";
import { PageTitle, Panel } from "../../components/ui";
import { keys, useAIGeneration, useAIGenerations, useAISettings, useDraft, useInvalidate, useReportError } from "../../hooks/queries";
import { asProvider, generates, hostOf, operationLabel, operations, paramsFor, providerLabels } from "../../lib/ai";
import { GenerationView } from "./GenerationView";

const operationIcons: Record<AIOperation, LucideIcon> = {
  items: Package, economy: Coins, progression: TrendingUp, achievements: Award, quests: ScrollText, explain: CircleHelp, tests: ListChecks,
};

const intro = "Describe what you need; the assistant proposes definitions, the server validates them like hand-written configuration, and nothing changes until you apply and publish.";

/**
 * The AI configuration assistant (spec 2.8, 8). It proposes; people decide. A proposal
 * is validated by the server like hand-written configuration, is applied to the draft
 * only when someone clicks Apply, and goes live only through Publish. The provider and
 * key live in Project settings (they belong to the user, not the project).
 */
export default function AIAssistant() {
  const w = useWorkspace();
  const settings = useAISettings();
  const disabled = settings.error instanceof ApiError && settings.error.code === "AI_UNAVAILABLE";
  useReportError(disabled ? null : settings.error, "Could not load AI settings.");

  if (disabled) {
    return (
      <>
        <PageTitle eyebrow="ASSISTANT" title="AI assistant" description={intro} />
        <div className="empty-card"><div className="empty-icon"><PowerOff /></div><h2>AI is turned off on this deployment</h2>
          <p>The server has no <code>AI_ENCRYPTION_KEY</code>, so provider keys cannot be stored safely. Every other feature works without AI.</p></div>
      </>
    );
  }
  const data = settings.data;
  return (
    <>
      <PageTitle eyebrow="ASSISTANT" title="AI assistant" description={intro}
        actions={<>
          {data?.configured && <ProviderChip settings={data} />}
          <button className="button secondary" onClick={() => w.openScreen("settings")}><Settings2 size={16} /> Provider settings</button>
        </>} />
      {settings.isPending ? <p className="empty-text">Loading AI settings…</p> : data ? (
        <>
          {!data.configured && (
            <div className="ai-connect" role="status">
              <div className="demo-illustration"><Sparkles size={20} /></div>
              <div><b>Connect an AI provider to start</b><p>Add an OpenAI key, or any OpenAI-compatible service such as OpenRouter, in Project settings. The key is encrypted and only your configuration draft is ever sent.</p></div>
              <button className="button primary" onClick={() => w.openScreen("settings")}>Open settings <ArrowRight size={16} /></button>
            </div>
          )}
          <Workspace configured={data.configured} />
        </>
      ) : null}
    </>
  );
}

function ProviderChip({ settings }: { settings: AISettings }) {
  const provider = providerLabels[asProvider(settings.provider)];
  const where = settings.base_url ? hostOf(settings.base_url) : provider;
  return <span className="provider-chip" title={`${provider} · ${settings.model}`}><span className="status-dot" />{where} · <code>{settings.model}</code></span>;
}

function Workspace({ configured }: { configured: boolean }) {
  const w = useWorkspace();
  const queryClient = useQueryClient();
  const invalidate = useInvalidate();
  const draft = useDraft();
  const history = useAIGenerations(true);
  useReportError(history.error, "Could not load AI generations.");
  const [selected, setSelected] = useState<string | null>(null);
  const generation = useAIGeneration(selected);
  useReportError(generation.error, "Could not load the generation.");
  const [op, setOp] = useState<AIOperation>("items");
  const [params, setParams] = useState<AIParams>({});
  const [policy, setPolicy] = useState<"add" | "replace">("add");
  const [publishedIds, setPublishedIds] = useState<string[]>([]);
  const path = { projectId: w.project.id, envId: w.environment.id };
  const headers = authHeaders({ token: w.token });
  const operation = operations.find((o) => o.id === op)!;

  // When a polled generation finishes, refresh the history list's status.
  const status = generation.data?.status;
  useEffect(() => {
    if (status && status !== "pending" && status !== "running") void queryClient.invalidateQueries({ queryKey: keys.aiGenerations(w.project.id, w.environment.id), exact: true });
  }, [status, queryClient, w.project.id, w.environment.id]);

  async function generate() {
    await w.run(async () => {
      const created = await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/ai/generations", { headers, params: { path }, body: { operation: op, params: paramsFor(op, params), merge_policy: policy } }), w.token);
      queryClient.setQueryData(keys.aiGeneration(w.project.id, w.environment.id, created.id), created);
      setSelected(created.id);
      await queryClient.invalidateQueries({ queryKey: keys.aiGenerations(w.project.id, w.environment.id), exact: true });
    });
  }

  async function apply(id: string, count: number) {
    if (!window.confirm(`Apply ${count} proposed definition${count === 1 ? "" : "s"} to the draft? Nothing goes live until you publish.`)) return;
    await w.run(async () => {
      await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/ai/generations/{id}/apply", { headers, params: { path: { ...path, id } } }), w.token);
      await Promise.all([invalidate.draft(), queryClient.invalidateQueries({ queryKey: keys.aiGenerations(w.project.id, w.environment.id) })]);
      w.notify({ kind: "success", message: "Applied to the draft. Publish when you are ready to make it live." });
    });
  }

  async function discard(id: string) {
    await w.run(async () => {
      await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/ai/generations/{id}/discard", { headers, params: { path: { ...path, id } } }), w.token);
      await queryClient.invalidateQueries({ queryKey: keys.aiGenerations(w.project.id, w.environment.id) });
      setSelected(null);
    });
  }

  async function publish(id: string) {
    if (!window.confirm("Publish the draft? It becomes the live configuration for this environment.")) return;
    await w.run(async () => {
      try {
        const result = await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/configurations/publish", { headers, params: { path } }), w.token);
        setPublishedIds((ids) => [...ids, id]);
        w.notify({ kind: "success", message: `Published configuration version ${result.version}.` });
      } finally {
        await invalidate.scope();
      }
    });
  }

  const set = (patch: AIParams) => setParams((p) => ({ ...p, ...patch }));
  const num = (value: string) => (value === "" ? undefined : Number(value));
  const items = history.data ?? [];

  return (
    <div className="ai-layout">
      <div className="ai-side">
        <Panel title="New proposal" subtitle={operation.description} icon={<Sparkles size={20} />} className="ai-composer">
          <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
            <div className="op-grid" role="radiogroup" aria-label="What to generate">
              {operations.map((o) => {
                const Icon = operationIcons[o.id];
                return (
                  <button key={o.id} type="button" role="radio" aria-checked={o.id === op} className={`op-tile ${o.id === op ? "selected" : ""}`} onClick={() => setOp(o.id)}>
                    <Icon size={16} /><span>{o.label}</span>
                  </button>
                );
              })}
            </div>
            {operation.fields.includes("brief") && <label>Brief<textarea rows={4} maxLength={2000} value={params.brief ?? ""} onChange={(event) => set({ brief: event.target.value })} placeholder="Genre, theme, tone, constraints…" /></label>}
            {operation.fields.includes("question") && <label>Question<textarea rows={4} maxLength={2000} required value={params.question ?? ""} onChange={(event) => set({ question: event.target.value })} placeholder="Which quests unlock after the tutorial?" /></label>}
            <div className="ai-fields">
              {operation.fields.includes("count") && <label>How many<input type="number" min={1} max={50} value={params.count ?? ""} onChange={(event) => set({ count: num(event.target.value) })} placeholder="default" /></label>}
              {operation.fields.includes("levels") && <label>Levels<input type="number" min={2} max={200} value={params.levels ?? ""} onChange={(event) => set({ levels: num(event.target.value) })} placeholder="20" /></label>}
              {operation.fields.includes("pacing") && <label>Pacing<select value={params.pacing ?? "steady"} onChange={(event) => set({ pacing: event.target.value as AIParams["pacing"] })}><option value="gentle">Gentle</option><option value="steady">Steady</option><option value="steep">Steep</option></select></label>}
              {operation.fields.includes("quest_type") && <label>Quest type<select value={params.quest_type ?? "story"} onChange={(event) => set({ quest_type: event.target.value as AIParams["quest_type"] })}>{["story", "side", "daily", "weekly", "event"].map((t) => <option key={t} value={t}>{t}</option>)}</select></label>}
              {operation.fields.includes("stage_count") && <label>Stages per quest<input type="number" min={1} max={20} value={params.stage_count ?? ""} onChange={(event) => set({ stage_count: num(event.target.value) })} placeholder="3" /></label>}
            </div>
            {generates(op) && op !== "progression" && (
              <label>If a key already exists
                <select value={policy} onChange={(event) => setPolicy(event.target.value as "add" | "replace")}>
                  <option value="add">Reject the proposal (safe)</option>
                  <option value="replace">Replace the existing definition</option>
                </select>
              </label>
            )}
            <button className="button primary wide" disabled={w.busy || !configured || !draft.data} title={configured ? "" : "Connect a provider in Project settings first"}><Sparkles size={17} /> Generate</button>
          </form>
        </Panel>
        <Panel title="History" subtitle="Recent generations in this environment." icon={<History size={20} />} className="ai-history">
          {history.isPending ? <p className="empty-text">Loading…</p>
            : items.length === 0 ? <p className="empty-text">Nothing generated yet.</p>
            : <ul className="generation-history">{items.map((g) => (
              <li key={g.id}><button className={`link-row ${g.id === selected ? "selected" : ""}`} onClick={() => setSelected(g.id)}>
                <span>{operationLabel(g.operation)}</span><span className={`status-pill ${g.status}`}>{g.status}</span><small>{new Date(g.created_at).toLocaleString()}</small>
              </button></li>
            ))}</ul>}
        </Panel>
      </div>
      <div className="ai-main">
        {generation.data
          ? <GenerationView generation={generation.data} draft={draft.data} busy={w.busy} published={publishedIds.includes(generation.data.id)}
              onApply={() => void apply(generation.data!.id, countOf(generation.data!.proposal))} onDiscard={() => void discard(generation.data!.id)} onPublish={() => void publish(generation.data!.id)} />
          : <ReviewPlaceholder configured={configured} />}
      </div>
    </div>
  );
}

/** The review area before a generation is selected: how the human-in-the-loop flow works. */
function ReviewPlaceholder({ configured }: { configured: boolean }) {
  const steps = [
    ["Describe", "Pick what to generate and write a short brief."],
    ["Review", "The server validates the proposal like hand-written configuration."],
    ["Apply", "A valid proposal is merged into the draft only when you click Apply."],
    ["Publish", "Nothing reaches players until you publish the draft."],
  ];
  return (
    <section className="panel ai-placeholder" aria-label="Review">
      <div className="ai-placeholder-head"><Sparkles size={22} /><div><h3>Proposals appear here for review</h3>
        <p>{configured ? "Generate one on the left, or pick a past generation from History." : "Connect a provider in Project settings, then generate your first proposal."}</p></div></div>
      <ol className="ai-steps">{steps.map(([title, text], i) => <li key={title}><span>{i + 1}</span><div><b>{title}</b><small>{text}</small></div></li>)}</ol>
    </section>
  );
}

/** How many definitions a proposal adds or replaces (a new XP curve counts as one). */
function countOf(p: AIProposal | null | undefined): number {
  if (!p) return 0;
  return (p.items?.length ?? 0) + (p.currencies?.length ?? 0) + (p.stats?.length ?? 0) + (p.achievements?.length ?? 0) + (p.quests?.length ?? 0) + (p.progression?.length ? 1 : 0);
}
