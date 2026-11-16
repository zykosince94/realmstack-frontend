import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, LayoutGrid, List, Network, Plus, Rocket, ScrollText, UserRound } from "lucide-react";
import { authHeaders, client, idempotencyKey, unwrap } from "../../api/client";
import { ApiError } from "../../api/errors";
import type { Config, PlayerQuest, QuestDefinition } from "../../api/types";
import { useWorkspace } from "../../app/workspace";
import { NotPublished, PageTitle } from "../../components/ui";
import { useDraft, useDraftValidation, useInvalidate, usePlayerQuests, usePublished, useQuestStats } from "../../hooks/queries";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { defaultCondition, errorsFor, indexesWithErrors } from "../../lib/config";
import { autoLayout, chainsOf, connect, disconnect, layoutOf, placeNodes, withQuests, type Position, type QuestLayout } from "../../lib/quests";
import { catalogFrom } from "../goals/GoalFields";
import { QuestCanvas } from "./QuestCanvas";
import { QuestEditor } from "./QuestEditor";
import { QuestList } from "./QuestList";
import type { QuestAction } from "./QuestPreview";

/** Below this width the canvas falls back to a list plus the side panel (spec 8). */
export const NARROW_QUERY = "(max-width: 900px)";

function blankQuest(firstFlag: string | undefined): QuestDefinition {
  return {
    key: "", name: "", description: "", claimable_by: "player", repeat: "none", auto_accept: false, requires_quests: [], requires_achievements: [],
    stages: [{ key: "stage_1", name: "Stage 1", conditions: [defaultCondition("flag", { flag: firstFlag })] }], rewards: {},
  };
}

/**
 * The Quests screen: a graph of the draft's quests (or a list on narrow screens), a
 * side-panel editor, the draft's validation issues, quest statistics and a player
 * preview. Loaded lazily, so React Flow, dagre and dnd-kit download only here.
 */
export default function QuestsScreen() {
  const w = useWorkspace();
  const invalidate = useInvalidate();
  const draft = useDraft();
  const published = usePublished().data;
  const validation = useDraftValidation().data;
  const statsRows = useQuestStats().data;
  const playerQuests = usePlayerQuests();
  const narrow = useMediaQuery(NARROW_QUERY);
  const [listView, setListView] = useState(false);
  const [selected, setSelected] = useState<string | "new" | null>(null);
  // Errors from the last rejected save, keyed inside the quest ("stages[0].name").
  const [saveIssues, setSaveIssues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);

  const config = draft.data;
  const quests = useMemo(() => config?.quests ?? [], [config]);
  const layout = useMemo(() => layoutOf(config), [config]);
  const catalog = catalogFrom(config);
  const errors = useMemo(() => validation?.errors ?? [], [validation]);
  const issueIndexes = useMemo(() => indexesWithErrors(errors, "quests"), [errors]);
  const stats = useMemo(() => new Map((statsRows ?? []).map((s) => [s.key, s])), [statsRows]);
  const live = useMemo(() => new Map((playerQuests.data ?? []).map((q) => [q.key, q])), [playerQuests.data]);
  const canActAsServer = Boolean(w.serverCredential && w.demoPlayerId);
  const showList = narrow || listView;

  const base = `/v1/projects/{projectId}/environments/{envId}/quests` as const;
  const path = useMemo(() => ({ projectId: w.project.id, envId: w.environment.id }), [w.project.id, w.environment.id]);
  const dashboard = useMemo(() => ({ headers: authHeaders({ token: w.token }) }), [w.token]);

  const selectedIndex = selected === null || selected === "new" ? -1 : quests.findIndex((q) => q.key === selected);
  const editing = selected === "new" ? blankQuest(catalog.flags[0]?.key) : selectedIndex >= 0 ? quests[selectedIndex] : null;
  const issues = selected === null ? {} : { ...(selectedIndex >= 0 ? errorsFor(errors, "quests", selectedIndex) : {}), ...saveIssues };

  const select = useCallback((next: string | "new" | null) => {
    setSelected(next);
    setSaveIssues({});
  }, []);

  /** Saves graph edits (positions, chains, prerequisites) as one whole-draft write. */
  const saveGraph = useCallback(async (current: Config, nextQuests: QuestDefinition[], nextLayout: QuestLayout) => {
    await unwrap(client.PUT("/v1/projects/{projectId}/environments/{envId}/configurations/draft", { ...dashboard, params: { path }, body: withQuests(current, nextQuests, nextLayout) }), w.token);
    await invalidate.draft();
  }, [dashboard, path, w.token, invalidate]);

  const onMove = useCallback((key: string, position: Position, chain: string) => {
    if (!config) return;
    const moved = { ...placeNodes(quests, layout), [key]: position };
    const nextQuests = quests.map((q) => q.key === key && (q.chain ?? "") !== chain ? { ...q, chain: chain || undefined } : q);
    const chainChanged = nextQuests.some((q, i) => q !== quests[i]);
    void w.run(async () => {
      await saveGraph(config, nextQuests, moved);
      if (chainChanged) w.notify({ kind: "success", message: chain ? `Moved ${key} into the ${chain} chain.` : `Removed ${key} from its chain.` });
    });
  }, [config, quests, layout, w, saveGraph]);

  const onConnect = useCallback((prerequisite: string, dependent: string) => {
    if (!config) return;
    const result = connect(quests, prerequisite, dependent);
    if ("error" in result) {
      w.notify({ kind: "error", message: result.error });
      return;
    }
    void w.run(async () => {
      await saveGraph(config, result.quests, placeNodes(quests, layout));
      w.notify({ kind: "success", message: `${dependent} now requires ${prerequisite}.` });
    });
  }, [config, quests, layout, w, saveGraph]);

  const onDisconnect = useCallback((prerequisite: string, dependent: string) => {
    if (!config) return;
    void w.run(async () => {
      await saveGraph(config, disconnect(quests, prerequisite, dependent), placeNodes(quests, layout));
      w.notify({ kind: "success", message: `${dependent} no longer requires ${prerequisite}.` });
    });
  }, [config, quests, layout, w, saveGraph]);

  async function arrange() {
    if (!config) return;
    await w.run(async () => {
      await saveGraph(config, quests, autoLayout(quests));
      w.notify({ kind: "success", message: "Arranged quests by prerequisites, one lane per chain." });
    });
  }

  async function save(quest: QuestDefinition) {
    await w.run(async () => {
      try {
        if (selected === "new") await unwrap(client.POST(base, { ...dashboard, params: { path }, body: quest }), w.token);
        else await unwrap(client.PUT(`${base}/{key}`, { ...dashboard, params: { path: { ...path, key: quest.key } }, body: quest }), w.token);
      } catch (error) {
        // Single-definition errors use paths like "quest.stages[0].name"; strip the prefix.
        if (error instanceof ApiError && error.fieldErrors.length) {
          setSaveIssues(Object.fromEntries(error.fieldErrors.map((e) => [e.field.replace(/^quest\.?/, ""), e.message])));
        }
        throw error;
      }
      await invalidate.draft();
      w.notify({ kind: "success", message: `Saved ${quest.name} to the draft. Publish to make it live.` });
      select(null);
    });
  }

  async function remove(key: string) {
    if (!config) return;
    const dependents = quests.filter((q) => (q.requires_quests ?? []).includes(key)).map((q) => q.key);
    const also = dependents.length ? ` ${dependents.join(", ")} will no longer require it.` : "";
    if (!window.confirm(`Delete the quest ${key} from the draft?${also} Players keep rewards they already claimed.`)) return;
    await w.run(async () => {
      // One whole-draft write removes the quest and every edge to it, so the graph never
      // points at a quest that is gone.
      const remaining = dependents.reduce((list, d) => disconnect(list, key, d), quests.filter((q) => q.key !== key));
      await saveGraph(config, remaining, placeNodes(quests, layout));
      select(null);
      w.notify({ kind: "success", message: `Removed ${key} from the draft.` });
    });
  }

  async function publish() {
    await w.run(async () => {
      try {
        const result = await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/configurations/publish", { ...dashboard, params: { path } }), w.token);
        w.notify({ kind: "success", message: `Published configuration version ${result.version}.` });
      } finally {
        await invalidate.scope();
      }
    });
  }

  const act = useCallback((quest: PlayerQuest, action: QuestAction) => {
    void w.run(async () => {
      const params = { path: { key: quest.key }, header: { "Idempotency-Key": idempotencyKey() } };
      const player = { headers: authHeaders({ token: w.demoPlayerToken }), params };
      if (action === "accept") await unwrap(client.POST("/v1/players/me/quests/{key}/accept", player), w.demoPlayerToken);
      else if (action === "abandon") await unwrap(client.POST("/v1/players/me/quests/{key}/abandon", player), w.demoPlayerToken);
      else if (quest.claimable_by === "player") await unwrap(client.POST("/v1/players/me/quests/{key}/claim", player), w.demoPlayerToken);
      else await unwrap(client.POST("/v1/server/players/{playerId}/quests/{key}/claim", { headers: authHeaders({ serverCredential: w.serverCredential }), params: { ...params, path: { playerId: w.demoPlayerId, key: quest.key } } }));
      await Promise.all([invalidate.player(), invalidate.scope()]);
      const done = { accept: "Accepted", abandon: "Abandoned", claim: "Claimed the earned rewards of" }[action];
      w.notify({ kind: "success", message: `${done} ${quest.name}.` });
    });
  }, [w, invalidate]);

  const onEdit = useCallback((index: number) => select(quests[index]?.key ?? null), [quests, select]);
  const onReject = useCallback((message: string) => w.notify({ kind: "error", message }), [w]);

  const shared = { quests, issueIndexes, selectedKey: selectedIndex >= 0 ? quests[selectedIndex].key : null, stats, live, preview, canActAsServer, busy: w.busy, onEdit, onAction: act };

  return (
    <>
      <PageTitle eyebrow="GOALS" title="Quests" description="Active, staged goals. Players accept a quest, complete its stages in order and claim stage and completion rewards. Drag between nodes to add a prerequisite; drop a node in a lane to set its chain."
        actions={<>
          <button className={`button ${preview ? "primary" : "secondary"}`} aria-pressed={preview} disabled={!w.demoPlayerToken} title={w.demoPlayerToken ? "" : "Sign in a player in Players first"} onClick={() => setPreview(!preview)}><UserRound size={15} /> Player preview</button>
          {!narrow && <button className="button secondary" aria-pressed={listView} onClick={() => setListView(!listView)}>{listView ? <><Network size={15} /> Canvas</> : <><List size={15} /> List</>}</button>}
          {!showList && <button className="button secondary" disabled={w.busy || !config || quests.length === 0} onClick={() => void arrange()}><LayoutGrid size={15} /> Auto-arrange</button>}
          <button className="button secondary" disabled={w.busy || !config} onClick={() => select("new")}><Plus size={15} /> New quest</button>
          <button className="button primary" disabled={w.busy || !config} onClick={() => void publish()}><Rocket size={15} /> Publish</button>
        </>} />
      {errors.length > 0 && (
        <div className="issue-bar" role="status">
          <AlertTriangle size={16} /><b>{errors.length} validation issue{errors.length === 1 ? "" : "s"} in the draft</b>
          <ul>{errors.slice(0, 8).map((e) => {
            const match = /^quests\[(\d+)\]/.exec(e.field);
            const key = match ? quests[Number(match[1])]?.key : undefined;
            return <li key={e.field}>{key ? <button className="link-button" onClick={() => select(key)}>{e.field}</button> : <code>{e.field}</code>} {e.message}</li>;
          })}</ul>
        </div>
      )}
      {published && !published.version && <section className="panel"><NotPublished /></section>}
      <div className={`editor-layout ${editing ? "with-panel" : ""}`}>
        <div>
          {draft.isPending ? <p className="empty-text">Loading quests…</p>
            : quests.length === 0 ? <div className="empty-inline"><ScrollText size={21} /><p>No quests yet. Add one; define stats and flags first so stages can track what happens in the game.</p></div>
            : showList ? <QuestList {...shared} />
            : <QuestCanvas {...shared} layout={layout} onMove={onMove} onConnect={onConnect} onDisconnect={onDisconnect} onRejectConnection={onReject} />}
        </div>
        {editing && <QuestEditor key={selected === "new" ? "new" : editing.key} initial={editing} isNew={selected === "new"} quests={quests}
          achievements={(config?.achievements ?? []).map((a) => ({ key: a.key, name: a.name }))} chains={chainsOf(quests)} catalog={catalog} issues={issues} busy={w.busy}
          onSave={(q) => void save(q)} onDelete={() => void remove(editing.key)} onClose={() => select(null)} />}
      </div>
    </>
  );
}
