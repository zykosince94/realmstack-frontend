import { useState } from "react";
import { AlertTriangle, Award, EyeOff, Plus, Rocket, Server } from "lucide-react";
import { authHeaders, client, unwrap } from "../../api/client";
import { ApiError } from "../../api/errors";
import type { AchievementDefinition } from "../../api/types";
import { useWorkspace } from "../../app/workspace";
import { NotPublished, PageTitle } from "../../components/ui";
import { useAchievementStats, useDraft, useDraftValidation, useInvalidate, usePublished } from "../../hooks/queries";
import { describeCondition, errorsFor, indexesWithErrors } from "../../lib/config";
import { rewardSummary } from "../goals/GoalFields";
import { AchievementEditor, catalogFrom } from "./AchievementEditor";

const blank: AchievementDefinition = { key: "", name: "", description: "", hidden: false, claimable_by: "player", conditions: [{ type: "xp_total", target: 100 }], rewards: {} };

export function Achievements() {
  const w = useWorkspace();
  const invalidate = useInvalidate();
  const draft = useDraft();
  const published = usePublished().data;
  const validation = useDraftValidation().data;
  const stats = useAchievementStats().data ?? [];
  const [selected, setSelected] = useState<number | "new" | null>(null);
  // Errors from the last rejected save, keyed inside the achievement ("name", "conditions[0].target").
  const [saveIssues, setSaveIssues] = useState<Record<string, string>>({});

  const definitions = draft.data?.achievements ?? [];
  const catalog = catalogFrom(draft.data);
  const errors = validation?.errors ?? [];
  const withErrors = indexesWithErrors(errors, "achievements");
  const claims = new Map(stats.map((s) => [s.key, s.claims]));
  const base = `/v1/projects/{projectId}/environments/{envId}/achievements` as const;
  const path = { projectId: w.project.id, envId: w.environment.id };
  const dashboard = { headers: authHeaders({ token: w.token }) };

  function select(next: number | "new" | null) {
    setSelected(next);
    setSaveIssues({});
  }

  async function save(achievement: AchievementDefinition) {
    await w.run(async () => {
      try {
        if (selected === "new") await unwrap(client.POST(base, { ...dashboard, params: { path }, body: achievement }), w.token);
        else await unwrap(client.PUT(`${base}/{key}`, { ...dashboard, params: { path: { ...path, key: achievement.key } }, body: achievement }), w.token);
      } catch (error) {
        // Single-definition errors use paths like "achievement.name"; strip the prefix for the form.
        if (error instanceof ApiError && error.fieldErrors.length) {
          setSaveIssues(Object.fromEntries(error.fieldErrors.map((e) => [e.field.replace(/^achievement\.?/, ""), e.message])));
        }
        throw error;
      }
      await invalidate.draft();
      w.notify({ kind: "success", message: `Saved ${achievement.name} to the draft. Publish to make it live.` });
      select(null);
    });
  }

  async function remove(key: string) {
    if (!window.confirm(`Delete the achievement ${key} from the draft? Players keep any rewards they already claimed.`)) return;
    await w.run(async () => {
      await unwrap(client.DELETE(`${base}/{key}`, { ...dashboard, params: { path: { ...path, key } } }), w.token);
      await invalidate.draft();
      select(null);
      w.notify({ kind: "success", message: `Removed ${key} from the draft.` });
    });
  }

  async function publish() {
    await w.run(async () => {
      try {
        const result = await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/configurations/publish", { ...dashboard, params: { path } }), w.token);
        w.notify({ kind: "success", message: `Published configuration version ${result.version}. Progress is re-evaluated against the new definitions.` });
      } finally {
        await invalidate.scope();
      }
    });
  }

  const editing = selected === "new" ? blank : selected !== null ? definitions[selected] : null;
  const issues = selected === null ? {} : { ...(selected === "new" ? {} : errorsFor(errors, "achievements", selected)), ...saveIssues };

  return (
    <>
      <PageTitle eyebrow="GOALS" title="Achievements" description="Permanent, passive goals. They complete when their conditions are met and can be claimed once per player. Progress is computed from the ledgers; rewards paid by claims never count toward other goals. A player's progress and claims are in Players."
        actions={<>
          <button className="button secondary" disabled={w.busy || !draft.data} onClick={() => select("new")}><Plus size={15} /> New achievement</button>
          <button className="button primary" disabled={w.busy || !draft.data} onClick={() => void publish()}><Rocket size={15} /> Publish</button>
        </>} />
      {errors.length > 0 && (
        <div className="issue-bar" role="status">
          <AlertTriangle size={16} /><b>{errors.length} validation issue{errors.length === 1 ? "" : "s"} in the draft</b>
          <ul>{errors.slice(0, 6).map((e) => {
            const match = /^achievements\[(\d+)\]/.exec(e.field);
            return <li key={e.field}>{match ? <button className="link-button" onClick={() => select(Number(match[1]))}>{e.field}</button> : <code>{e.field}</code>} {e.message}</li>;
          })}</ul>
        </div>
      )}
      {published && !published.version && <section className="panel"><NotPublished /></section>}
      <div className={`editor-layout ${editing ? "with-panel" : ""}`}>
        <div>
          {draft.isPending ? <p className="empty-text">Loading achievements…</p>
            : definitions.length === 0 ? <div className="empty-inline"><Award size={21} /><p>No achievements yet. Add one, or define stats and flags first so conditions can track game-world events.</p></div>
            : <div className="card-grid">{definitions.map((a, index) => {
              return (
                <article key={a.key} className={`achievement-card ${selected === index ? "selected" : ""} ${withErrors.has(index) ? "has-issues" : ""}`}>
                  <button className="card-select" onClick={() => select(index)} aria-label={`Edit ${a.name}`}>
                    <div className="card-top"><Award size={18} /><b>{a.name}</b>{a.hidden && <span className="badge" title="Hidden until completed"><EyeOff size={12} /> hidden</span>}{a.claimable_by === "server" && <span className="badge" title="Only the game server can claim"><Server size={12} /> server</span>}</div>
                    <small className="card-key">{a.key}{withErrors.has(index) && <span className="issue-dot"> · has issues</span>}</small>
                    {a.description && <p>{a.description}</p>}
                    <ul className="condition-list">{a.conditions.map((c, i) => <li key={i}>{describeCondition(c)}</li>)}</ul>
                    <small>{rewardSummary(a.rewards)} · {claims.get(a.key) ?? 0} claim{claims.get(a.key) === 1 ? "" : "s"}</small>
                  </button>
                </article>
              );
            })}</div>}
        </div>
        {editing && <AchievementEditor key={selected === "new" ? "new" : editing.key} initial={editing} isNew={selected === "new"} catalog={catalog} issues={issues} busy={w.busy}
          onSave={(a) => void save(a)} onDelete={() => void remove(editing.key)} onClose={() => select(null)} />}
      </div>
    </>
  );
}
