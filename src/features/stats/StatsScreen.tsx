import { useState } from "react";
import { Flag, Hash, Plus, Rocket, Server, Trash2 } from "lucide-react";
import { authHeaders, client, idempotencyKey, unwrap } from "../../api/client";
import { useWorkspace } from "../../app/workspace";
import { DataTable, PageTitle, Panel } from "../../components/ui";
import { useDraft, useInvalidate, usePlayerStats, usePublished } from "../../hooks/queries";
import { pickKey } from "../../lib/config";

export function StatsScreen() {
  const w = useWorkspace();
  const invalidate = useInvalidate();
  const draft = useDraft();
  const published = usePublished().data;
  const playerStats = usePlayerStats().data;
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"counter" | "flag">("counter");
  const [counterChoice, setCounterChoice] = useState("");
  const [flagChoice, setFlagChoice] = useState("");
  const [amount, setAmount] = useState(1);

  const definitions = draft.data?.stats ?? [];
  const live = published?.config?.stats ?? [];
  const liveKeys = new Set(live.map((s) => s.key));
  const counters = live.filter((s) => s.kind === "counter").map((s) => s.key);
  const flags = live.filter((s) => s.kind === "flag").map((s) => s.key);
  const counter = pickKey(counterChoice, counters);
  const flag = pickKey(flagChoice, flags);
  const path = { projectId: w.project.id, envId: w.environment.id };
  const dashboard = { headers: authHeaders({ token: w.token }) };
  const server = { headers: authHeaders({ serverCredential: w.serverCredential }) };
  const canWrite = Boolean(w.serverCredential && w.demoPlayerId);

  async function add() {
    await w.run(async () => {
      await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/stats", { ...dashboard, params: { path }, body: { key, name, kind } }), w.token);
      await invalidate.draft();
      setKey("");
      setName("");
      w.notify({ kind: "success", message: `Added ${kind} ${key} to the draft. Publish to make it live.` });
    });
  }
  async function remove(statKey: string) {
    if (!window.confirm(`Remove ${statKey} from the draft? Recorded values are kept; achievements that use it will fail validation.`)) return;
    await w.run(async () => {
      await unwrap(client.DELETE("/v1/projects/{projectId}/environments/{envId}/stats/{key}", { ...dashboard, params: { path: { ...path, key: statKey } } }), w.token);
      await invalidate.draft();
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
  async function increment() {
    await w.run(async () => {
      const result = await unwrap(client.POST("/v1/server/players/{playerId}/stats/{statKey}/increment", { ...server, params: { path: { playerId: w.demoPlayerId, statKey: counter }, header: { "Idempotency-Key": idempotencyKey() } }, body: { amount, reason: "dashboard_test" } }));
      await invalidate.player();
      w.notify({ kind: "success", message: `${counter} is now ${result.value}.` });
    });
  }
  async function setFlag() {
    await w.run(async () => {
      const result = await unwrap(client.POST("/v1/server/players/{playerId}/flags/{flagKey}/set", { ...server, params: { path: { playerId: w.demoPlayerId, flagKey: flag }, header: { "Idempotency-Key": idempotencyKey() } }, body: { reason: "dashboard_test" } }));
      await invalidate.player();
      w.notify({ kind: "success", message: result.newly_set ? `Set ${flag}.` : `${flag} was already set; flags are set-only.` });
    });
  }

  return (
    <>
      <PageTitle eyebrow="GAME-WORLD EVENTS" title="Stats & flags" description="RealmStack cannot see enemies defeated or NPCs met, so your game server reports them: counters only go up and flags are set-only. Only a trusted server credential can write them."
        actions={<button className="button primary" disabled={w.busy || !draft.data} onClick={() => void publish()}><Rocket size={15} /> Publish</button>} />
      <div className="two-column">
        <Panel title="Definitions" subtitle="The draft's stats array. Live means published." icon={<Hash size={18} />}>
          {draft.isPending ? <p className="empty-text">Loading draft…</p> : definitions.length === 0 ? <p className="empty-text">No stats or flags yet.</p> : (
            <div className="table-wrap"><table><thead><tr><th>Key</th><th>Name</th><th>Kind</th><th>Status</th><th /></tr></thead><tbody>
              {definitions.map((s) => <tr key={s.key}><td><code>{s.key}</code></td><td>{s.name}</td><td>{s.kind === "flag" ? <><Flag size={12} /> flag</> : <><Hash size={12} /> counter</>}</td><td>{liveKeys.has(s.key) ? "live" : "draft only"}</td><td><button className="icon-button" aria-label={`Remove ${s.key}`} disabled={w.busy} onClick={() => void remove(s.key)}><Trash2 size={14} /></button></td></tr>)}
            </tbody></table></div>
          )}
          <form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void add(); }}>
            <label>Key<input value={key} onChange={(event) => setKey(event.target.value)} placeholder="trolls_defeated" required /></label>
            <label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Trolls defeated" required /></label>
            <label>Kind<select value={kind} onChange={(event) => setKind(event.target.value as "counter" | "flag")}><option value="counter">Counter (goes up)</option><option value="flag">Flag (set once)</option></select></label>
            <button className="button secondary" disabled={w.busy || !draft.data}><Plus size={15} /> Add to draft</button>
          </form>
        </Panel>
        <Panel title="Server test actions" subtitle="Write as the trusted game server for the demo player." icon={<Server size={18} />}>
          {!canWrite ? <p className="empty-text">Sign in a player in Players and add a server credential in Inventory &amp; economy (or create one in Project settings).</p> : <>
            <form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void increment(); }}>
              <label>Counter<select aria-label="Counter to increment" value={counter} onChange={(event) => setCounterChoice(event.target.value)}>{counters.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
              <label>Amount<input type="number" min={1} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label>
              <button className="button secondary" disabled={w.busy || !counter}>Increment counter</button>
            </form>
            <form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void setFlag(); }}>
              <label>Flag<select aria-label="Flag to set" value={flag} onChange={(event) => setFlagChoice(event.target.value)}>{flags.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
              <button className="button secondary" disabled={w.busy || !flag}>Set flag</button>
            </form>
          </>}
          <h4>Demo player's values</h4>
          {!w.demoPlayerToken ? <p className="empty-text">Sign in a player to see their values.</p> : (
            <DataTable columns={["Key", "Value"]} rows={[...(playerStats?.counters ?? []).map((c) => [c.key, String(c.value)]), ...(playerStats?.flags ?? []).map((f) => [f.key, f.set ? "set" : "not set"])]} empty="No live stats or flags." />
          )}
        </Panel>
      </div>
    </>
  );
}
