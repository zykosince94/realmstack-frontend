import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { History, PowerOff, Sparkles } from "lucide-react";
import { authHeaders, client, unwrap } from "../../api/client";
import { ApiError } from "../../api/errors";
import type { AIOperation, AIParams, AIProposal } from "../../api/types";
import { useWorkspace } from "../../app/workspace";
import { PageTitle, Panel } from "../../components/ui";
import { keys, useAIGeneration, useAIGenerations, useAISettings, useDraft, useInvalidate, useReportError } from "../../hooks/queries";
import { generates, operationLabel, operations, paramsFor } from "../../lib/ai";
import { AISettingsCard } from "./AISettingsCard";
import { GenerationView } from "./GenerationView";

/**
 * The AI configuration assistant (spec 2.8, 8). It proposes; people decide. A proposal
 * is validated by the server like hand-written configuration, is applied to the draft
 * only when someone clicks Apply, and goes live only through Publish.
 */
export default function AIAssistant() {
  const settings = useAISettings();
  const disabled = settings.error instanceof ApiError && settings.error.code === "AI_UNAVAILABLE";
  useReportError(disabled ? null : settings.error, "Could not load AI settings.");
  const intro = "Generate catalog, economy, progression, achievement and quest drafts with your own OpenAI key. Every proposal is validated like hand-written configuration, and nothing changes until you apply it and publish.";

  if (disabled) {
    return (
      <>
        <PageTitle eyebrow="ASSISTANT" title="AI assistant" description={intro} />
        <div className="empty-card"><div className="empty-icon"><PowerOff /></div><h2>AI is turned off on this deployment</h2>
          <p>The server has no <code>AI_ENCRYPTION_KEY</code>, so provider keys cannot be stored safely. Every other feature works without AI.</p></div>
      </>
    );
  }
  return (
    <>
      <PageTitle eyebrow="ASSISTANT" title="AI assistant" description={intro} />
      {settings.isPending ? <p className="empty-text">Loading AI settings…</p> : settings.data ? <Workspace configured={settings.data.configured} settingsCard={<AISettingsCard key={settings.data.updated_at ?? "new"} settings={settings.data} />} /> : null}
    </>
  );
}

function Workspace({ configured, settingsCard }: { configured: boolean; settingsCard: ReactNode }) {
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

  return (
    <div className="ai-layout">
      <div className="ai-side">
        {settingsCard}
        <Panel title="Generate" subtitle={operation.description} icon={<Sparkles size={18} />}>
          <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
            <label>What to generate
              <select value={op} onChange={(event) => setOp(event.target.value as AIOperation)}>
                {operations.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            {operation.fields.includes("brief") && <label>Brief<textarea rows={3} maxLength={2000} value={params.brief ?? ""} onChange={(event) => set({ brief: event.target.value })} placeholder="Genre, theme, tone, constraints…" /></label>}
            {operation.fields.includes("question") && <label>Question<textarea rows={3} maxLength={2000} required value={params.question ?? ""} onChange={(event) => set({ question: event.target.value })} placeholder="Which quests unlock after the tutorial?" /></label>}
            {operation.fields.includes("count") && <label>How many<input type="number" min={1} max={50} value={params.count ?? ""} onChange={(event) => set({ count: num(event.target.value) })} placeholder="default" /></label>}
            {operation.fields.includes("levels") && <label>Levels<input type="number" min={2} max={200} value={params.levels ?? ""} onChange={(event) => set({ levels: num(event.target.value) })} placeholder="20" /></label>}
            {operation.fields.includes("pacing") && <label>Pacing<select value={params.pacing ?? "steady"} onChange={(event) => set({ pacing: event.target.value as AIParams["pacing"] })}><option value="gentle">Gentle</option><option value="steady">Steady</option><option value="steep">Steep</option></select></label>}
            {operation.fields.includes("quest_type") && <label>Quest type<select value={params.quest_type ?? "story"} onChange={(event) => set({ quest_type: event.target.value as AIParams["quest_type"] })}>{["story", "side", "daily", "weekly", "event"].map((t) => <option key={t} value={t}>{t}</option>)}</select></label>}
            {operation.fields.includes("stage_count") && <label>Stages per quest<input type="number" min={1} max={20} value={params.stage_count ?? ""} onChange={(event) => set({ stage_count: num(event.target.value) })} placeholder="3" /></label>}
            {generates(op) && op !== "progression" && (
              <label>If a key already exists
                <select value={policy} onChange={(event) => setPolicy(event.target.value as "add" | "replace")}>
                  <option value="add">Reject the proposal (safe)</option>
                  <option value="replace">Replace the existing definition</option>
                </select>
              </label>
            )}
            <button className="button primary" disabled={w.busy || !configured || !draft.data} title={configured ? "" : "Add an API key first"}><Sparkles size={15} /> Generate</button>
          </form>
        </Panel>
      </div>
      <div className="ai-main">
        {generation.data
          ? <GenerationView generation={generation.data} draft={draft.data} busy={w.busy} published={publishedIds.includes(generation.data.id)}
              onApply={() => void apply(generation.data!.id, countOf(generation.data!.proposal))} onDiscard={() => void discard(generation.data!.id)} onPublish={() => void publish(generation.data!.id)} />
          : <div className="empty-inline"><Sparkles size={21} /><p>{configured ? "Describe what you need and generate a proposal. You review it before anything changes." : "Add your OpenAI API key to start."}</p></div>}
        <Panel title="History" subtitle="Recent generations in this environment." icon={<History size={18} />}>
          {history.isPending ? <p className="empty-text">Loading…</p>
            : (history.data ?? []).length === 0 ? <p className="empty-text">Nothing generated yet.</p>
            : <ul className="generation-history">{(history.data ?? []).map((g) => (
              <li key={g.id}><button className={`link-row ${g.id === selected ? "selected" : ""}`} onClick={() => setSelected(g.id)}>
                <span>{operationLabel(g.operation)}</span><span className={`status-pill ${g.status}`}>{g.status}</span><small>{new Date(g.created_at).toLocaleString()}</small>
              </button></li>
            ))}</ul>}
        </Panel>
      </div>
    </div>
  );
}

/** How many definitions a proposal adds or replaces (a new XP curve counts as one). */
function countOf(p: AIProposal | null | undefined): number {
  if (!p) return 0;
  return (p.items?.length ?? 0) + (p.currencies?.length ?? 0) + (p.stats?.length ?? 0) + (p.achievements?.length ?? 0) + (p.quests?.length ?? 0) + (p.progression?.length ? 1 : 0);
}
