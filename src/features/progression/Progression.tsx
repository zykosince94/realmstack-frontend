import { useEffect, useState } from "react";
import { Activity, Rocket, ShieldCheck } from "lucide-react";
import { authHeaders, client, unwrap } from "../../api/client";
import { useWorkspace } from "../../app/workspace";
import { PageTitle, Panel } from "../../components/ui";
import { useDraft, useInvalidate } from "../../hooks/queries";
import { parseThresholds } from "../../lib/config";

export function Progression() {
  const w = useWorkspace();
  const invalidate = useInvalidate();
  const config = useDraft().data;
  const [thresholdText, setThresholdText] = useState("");
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
  return (
    <>
      <PageTitle eyebrow="PLAYER PROGRESSION" title="Progression" description="Publish a versioned cumulative XP curve. Existing player progression stays pinned to its original version. To award a player XP, open the player in Players." actions={<button className="button secondary" disabled={w.busy || !config} onClick={() => void publish()}><Rocket size={15} /> Publish configuration</button>} />
      <Panel title="Level thresholds" subtitle="Thresholds are cumulative XP required to reach each level." icon={<Activity size={18} />}>
          {!config ? <p className="empty-text">Loading draft…</p> : <>
            <label>Level thresholds<input value={thresholdText} onChange={(event) => setThresholdText(event.target.value)} placeholder="100, 300, 700" /></label>
            <div className="threshold-list">{thresholdText.split(",").map((value, index) => <div className="threshold-item" key={index}><span>LEVEL {index + 2}</span><b>{value.trim() || "—"} XP</b></div>)}</div>
            <div className="button-row"><button className="button primary" disabled={w.busy} onClick={() => void saveProgression()}>Save draft</button><span className="small-note">Enter increasing cumulative XP thresholds for levels 2+.</span></div>
          </>}
      </Panel>
      <Panel title="Versioning rules" subtitle="Progression policy for this environment" icon={<ShieldCheck size={18} />}><div className="policy-grid"><div><b>New players</b><p>Use the latest published progression version on their first XP award.</p></div><div><b>Existing players</b><p>Remain pinned to the progression version assigned at their first award.</p></div><div><b>History</b><p>Published thresholds are immutable; changed thresholds create a new version.</p></div></div></Panel>
    </>
  );
}
