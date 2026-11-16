import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Award, EyeOff, Plus, Rocket, Server, UserRound } from "lucide-react";
import { authHeaders, client, idempotencyKey, unwrap } from "../../api/client";
import { ApiError } from "../../api/errors";
import type { AchievementDefinition, PlayerAchievement } from "../../api/types";
import { useWorkspace } from "../../app/workspace";
import { NotPublished, PageTitle } from "../../components/ui";
import { keys, useAchievementStats, useDraft, useInvalidate, usePlayerAchievements, usePublished } from "../../hooks/queries";
import { describeCondition, errorsFor, indexesWithErrors, progressPercent } from "../../lib/config";
import { AchievementEditor, catalogFrom } from "./AchievementEditor";

const blank: AchievementDefinition = { key: "", name: "", description: "", hidden: false, claimable_by: "player", conditions: [{ type: "xp_total", target: 100 }], rewards: {} };

function rewardSummary(a: AchievementDefinition): string {
  const parts = [
    ...(a.rewards?.items ?? []).map((r) => `${r.quantity} × ${r.item_key}`),
    ...(a.rewards?.currencies ?? []).map((r) => `${r.amount} ${r.currency_key}`),
    ...(a.rewards?.xp ? [`${a.rewards.xp} XP`] : []),
  ];
  return parts.length ? parts.join(" · ") : "No rewards";
}

/** Validates the stored draft. Its key sits under the draft key, so invalidating the draft re-validates. */
function useDraftValidation() {
  const { token, project, environment } = useWorkspace();
  return useQuery({
    queryKey: [...keys.draft(project.id, environment.id), "validation"],
    queryFn: () => unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/configurations/validate", { params: { path: { projectId: project.id, envId: environment.id } }, headers: authHeaders({ token }) }), token),
  });
}

export function Achievements() {
  const w = useWorkspace();
  const invalidate = useInvalidate();
  const draft = useDraft();
  const published = usePublished().data;
  const validation = useDraftValidation().data;
  const stats = useAchievementStats().data ?? [];
  const playerAchievements = usePlayerAchievements();
  const [selected, setSelected] = useState<number | "new" | null>(null);
  // Errors from the last rejected save, keyed inside the achievement ("name", "conditions[0].target").
  const [saveIssues, setSaveIssues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);

  const definitions = draft.data?.achievements ?? [];
  const catalog = catalogFrom(draft.data);
  const errors = validation?.errors ?? [];
  const withErrors = indexesWithErrors(errors, "achievements");
  const claims = new Map(stats.map((s) => [s.key, s.claims]));
  const progressByKey = new Map((playerAchievements.data ?? []).map((a) => [a.key, a]));
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

  async function claim(a: PlayerAchievement) {
    await w.run(async () => {
      const header = { "Idempotency-Key": idempotencyKey() };
      if (a.claimable_by === "player") {
        await unwrap(client.POST("/v1/players/me/achievements/{key}/claim", { headers: authHeaders({ token: w.demoPlayerToken }), params: { path: { key: a.key }, header } }), w.demoPlayerToken);
      } else {
        await unwrap(client.POST("/v1/server/players/{playerId}/achievements/{key}/claim", { headers: authHeaders({ serverCredential: w.serverCredential }), params: { path: { playerId: w.demoPlayerId, key: a.key }, header } }));
      }
      await Promise.all([invalidate.player(), invalidate.scope()]);
      w.notify({ kind: "success", message: `Claimed ${a.name ?? a.key}. Its rewards are tagged so they never count toward other goals.` });
    });
  }

  const editing = selected === "new" ? blank : selected !== null ? definitions[selected] : null;
  const issues = selected === null ? {} : { ...(selected === "new" ? {} : errorsFor(errors, "achievements", selected)), ...saveIssues };

  return (
    <>
      <PageTitle eyebrow="GOALS" title="Achievements" description="Permanent, passive goals. They complete when their conditions are met and can be claimed once per player. Progress is computed from the ledgers; rewards paid by claims never count toward other goals."
        actions={<>
          <button className={`button ${preview ? "primary" : "secondary"}`} aria-pressed={preview} disabled={!w.demoPlayerToken} title={w.demoPlayerToken ? "" : "Sign in a player in Players first"} onClick={() => setPreview(!preview)}><UserRound size={15} /> Player preview</button>
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
              const live = progressByKey.get(a.key);
              return (
                <article key={a.key} className={`achievement-card ${selected === index ? "selected" : ""} ${withErrors.has(index) ? "has-issues" : ""}`}>
                  <button className="card-select" onClick={() => select(index)} aria-label={`Edit ${a.name}`}>
                    <div className="card-top"><Award size={18} /><b>{a.name}</b>{a.hidden && <span className="badge" title="Hidden until completed"><EyeOff size={12} /> hidden</span>}{a.claimable_by === "server" && <span className="badge" title="Only the game server can claim"><Server size={12} /> server</span>}</div>
                    <small className="card-key">{a.key}{withErrors.has(index) && <span className="issue-dot"> · has issues</span>}</small>
                    {a.description && <p>{a.description}</p>}
                    <ul className="condition-list">{a.conditions.map((c, i) => <li key={i}>{describeCondition(c)}</li>)}</ul>
                    <small>{rewardSummary(a)} · {claims.get(a.key) ?? 0} claim{claims.get(a.key) === 1 ? "" : "s"}</small>
                  </button>
                  {preview && <PlayerProgress achievement={live} canClaimAsServer={Boolean(w.serverCredential && w.demoPlayerId)} busy={w.busy} onClaim={claim} />}
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

/** How the demo player sees one achievement: status, per-condition progress bars and a Claim action. */
function PlayerProgress({ achievement, canClaimAsServer, busy, onClaim }: { achievement?: PlayerAchievement; canClaimAsServer: boolean; busy: boolean; onClaim: (a: PlayerAchievement) => void }) {
  if (!achievement) return <div className="player-progress"><small>Not published yet, so the player cannot see it.</small></div>;
  const masked = achievement.name === null;
  return (
    <div className="player-progress" aria-label={`Player progress for ${achievement.key}`}>
      <span className={`status-pill ${achievement.status}`}>{achievement.status.replace("_", " ")}</span>
      {masked ? <small>Hidden from the player until completed.</small> : (achievement.progress ?? []).map((p, i) => (
        <div key={i} className="progress-line">
          <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent(p)} aria-label={`${p.type} progress`}><span style={{ width: `${progressPercent(p)}%` }} /></div>
          <small>{p.type === "flag" ? (p.met ? "set" : "not set") : p.has_value ? `${p.current} / ${p.target}` : `no score / ${p.target}`}</small>
        </div>
      ))}
      {achievement.status === "completed" && (achievement.claimable_by === "player" || canClaimAsServer) && (
        <button className="button primary small" disabled={busy} onClick={() => onClaim(achievement)}>{achievement.claimable_by === "player" ? "Claim" : "Claim as server"}</button>
      )}
      {achievement.status === "completed" && achievement.claimable_by === "server" && !canClaimAsServer && <small>Only the game server can claim this. Add a server credential in Inventory &amp; economy.</small>}
    </div>
  );
}
