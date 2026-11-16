import { useEffect, useState } from "react";
import { Activity, Rocket, ShieldCheck } from "lucide-react";
import { authHeaders, client, idempotencyKey, unwrap } from "../../api/client";
import { useWorkspace } from "../../app/workspace";
import { PageTitle, Panel } from "../../components/ui";
import { useDraft, useInvalidate } from "../../hooks/queries";
import { parseThresholds } from "../../lib/config";

export function Progression() {
  const w = useWorkspace();
  const invalidate = useInvalidate();
  const config = useDraft().data;
  const [thresholdText, setThresholdText] = useState("");
  const [xp, setXp] = useState(120);
  const [result, setResult] = useState<unknown>(null);
  const loadedThresholds = config?.progression.join(", ") ?? "";
  useEffect(() => setThresholdText(loadedThresholds), [loadedThresholds]);
  const path = { projectId: w.project.id, envId: w.environment.id };
  const dashboard = { headers: authHeaders({ token: w.token }) };

  /** Saves only the thresholds, so other draft edits made elsewhere are not overwritten. */
  async function storeThresholds() {
    if (!config) throw new Error("The draft has not loaded yet.");
    const parsed = parseThresholds(thresholdText);
    if (!parsed) throw new Error("Enter positive, strictly increasing XP thresholds for levels 2 and above.");
    await unwrap(client.PUT("/v1/projects/{projectId}/environments/{envId}/progression", { ...dashboard, params: { path }, body: { thresholds: parsed } }), w.token);
    await invalidate.draft();
  }
  async function saveProgression() {
    await w.run(async () => {
      await storeThresholds();
      w.notify({ kind: "success", message: "Progression thresholds saved to draft. Publish configuration to make them active for new players." });
    });
  }
  async function publish() {
    await w.run(async () => {
      // Publish what is on screen: unsaved threshold edits are saved first.
      if (thresholdText !== loadedThresholds) await storeThresholds();
      const published = await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/configurations/publish", { ...dashboard, params: { path } }), w.token);
      await invalidate.scope();
      w.notify({ kind: "success", message: published.progression_version_created === false
        ? `Published configuration version ${published.version}. Thresholds were unchanged, so no new progression version was created.`
        : `Published configuration version ${published.version} as an immutable version.` });
    });
  }
  async function award() {
    await w.run(async () => {
      setResult(await unwrap(client.POST("/v1/server/players/{playerId}/xp/award", { headers: authHeaders({ serverCredential: w.serverCredential }), params: { path: { playerId: w.demoPlayerId }, header: { "Idempotency-Key": idempotencyKey() } }, body: { amount: xp, reason: "demo_xp_award" } })));
      await invalidate.player();
      w.notify({ kind: "success", message: `Awarded ${xp} XP to player ${w.demoPlayerId}.` });
    });
  }
  async function loadSignedInProgress() {
    await w.run(async () => setResult(await unwrap(client.GET("/v1/players/me/progression", { headers: authHeaders({ token: w.demoPlayerToken }) }), w.demoPlayerToken)));
  }
  return (
    <>
      <PageTitle eyebrow="PLAYER PROGRESSION" title="Progression" description="Publish a versioned cumulative XP curve. Existing player progression stays pinned to its original version." actions={<button className="button secondary" disabled={w.busy || !config} onClick={() => void publish()}><Rocket size={15} /> Publish configuration</button>} />
      <div className="two-column">
        <Panel title="Level thresholds" subtitle="Thresholds are cumulative XP required to reach each level." icon={<Activity size={18} />}>
          {!config ? <p className="empty-text">Loading draft…</p> : <>
            <label>Level thresholds<input value={thresholdText} onChange={(event) => setThresholdText(event.target.value)} placeholder="100, 300, 700" /></label>
            <div className="threshold-list">{thresholdText.split(",").map((value, index) => <div className="threshold-item" key={index}><span>LEVEL {index + 2}</span><b>{value.trim() || "—"} XP</b></div>)}</div>
            <div className="button-row"><button className="button primary" disabled={w.busy} onClick={() => void saveProgression()}>Save draft</button><span className="small-note">Enter increasing cumulative XP thresholds for levels 2+.</span></div>
          </>}
        </Panel>
        <Panel title="Award XP" subtitle="Trusted server operation · idempotent" icon={<Rocket size={18} />}>
          <div className="stack-form">
            <label>Player ID<input value={w.demoPlayerId} onChange={(event) => w.setDemoPlayerId(event.target.value)} placeholder="Register a player in Players" /></label>
            <label>Server credential<input type="password" value={w.serverCredential} onChange={(event) => w.setServerCredential(event.target.value)} placeholder="Create one in Project settings" /></label>
            <label>XP amount<input type="number" min={1} value={xp} onChange={(event) => setXp(Number(event.target.value))} /></label>
            <div className="button-row"><button className="button primary" disabled={w.busy || !w.serverCredential || !w.demoPlayerId} onClick={() => void award()}>Award XP</button><button className="button secondary" disabled={w.busy || !w.demoPlayerToken} onClick={() => void loadSignedInProgress()}>Signed-in player's level</button></div>
            {result !== null && <pre className="result-json">{JSON.stringify(result, null, 2)}</pre>}
          </div>
        </Panel>
      </div>
      <Panel title="Versioning rules" subtitle="Progression policy for this environment" icon={<ShieldCheck size={18} />}><div className="policy-grid"><div><b>New players</b><p>Use the latest published progression version on their first XP award.</p></div><div><b>Existing players</b><p>Remain pinned to the progression version assigned at their first award.</p></div><div><b>History</b><p>Published thresholds are immutable; changed thresholds create a new version.</p></div></div></Panel>
    </>
  );
}
