import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Boxes, History, KeyRound, Plus, Rocket, RotateCcw, ShieldCheck } from "lucide-react";
import { authHeaders, client, unwrap } from "../../api/client";
import type { Config } from "../../api/types";
import { useWorkspace } from "../../app/workspace";
import { PageTitle, Panel } from "../../components/ui";
import { keys, useCredentials, useDraft, useInvalidate, useVersions } from "../../hooks/queries";

export function Settings() {
  const w = useWorkspace();
  const queryClient = useQueryClient();
  const invalidate = useInvalidate();
  const draft = useDraft();
  const credentials = useCredentials();
  const versions = useVersions();
  const [projectName, setProjectName] = useState(w.project.name);
  const [projectSlug, setProjectSlug] = useState(w.project.slug);
  const [raw, setRaw] = useState("");
  const [createdCredential, setCreatedCredential] = useState("");
  const path = { projectId: w.project.id, envId: w.environment.id };
  const dashboard = { headers: authHeaders({ token: w.token }) };
  const loaded = draft.data !== undefined && credentials.data !== undefined;

  useEffect(() => {
    setProjectName(w.project.name);
    setProjectSlug(w.project.slug);
  }, [w.project.id, w.project.name, w.project.slug]);
  // Load the editor text once per draft fetch; later edits stay local until saved.
  useEffect(() => {
    if (draft.data) setRaw(JSON.stringify(draft.data, null, 2));
  }, [draft.data]);

  /** Parses the editor text and stores it as the draft. */
  async function storeDraft() {
    let parsed: Config;
    try { parsed = JSON.parse(raw) as Config; } catch { throw new Error("Configuration is not valid JSON."); }
    if (!Array.isArray(parsed.items) || !Array.isArray(parsed.currencies) || !Array.isArray(parsed.leaderboards) || !Array.isArray(parsed.progression)) {
      throw new Error("Configuration must include items, currencies, progression, and leaderboards arrays.");
    }
    await unwrap(client.PUT("/v1/projects/{projectId}/environments/{envId}/configurations/draft", { ...dashboard, params: { path }, body: parsed }), w.token);
  }
  async function saveDraft() {
    await w.run(async () => {
      await storeDraft();
      w.notify({ kind: "success", message: "Configuration saved as a draft. Publish it to make it live." });
    });
  }
  async function publish() {
    await w.run(async () => {
      // Publish exactly what is in the editor: save it first so unsaved edits are not skipped.
      await storeDraft();
      const result = await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/configurations/publish", { ...dashboard, params: { path } }), w.token);
      await invalidate.scope();
      w.notify({ kind: "success", message: `Saved and published configuration version ${result.version}.` });
    });
  }
  async function rollback(version: number) {
    if (!window.confirm(`Restore version ${version}? It is published again as a new version and replaces the current draft. History is kept.`)) return;
    await w.run(async () => {
      const result = await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/configurations/versions/{version}/rollback", { ...dashboard, params: { path: { ...path, version } } }), w.token);
      await invalidate.scope();
      w.notify({ kind: "success", message: `Restored version ${version} as version ${result.version}.` });
    });
  }
  async function createCredential() {
    await w.run(async () => {
      const result = await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/credentials", { ...dashboard, params: { path } }), w.token);
      setCreatedCredential(result.credential);
      w.setServerCredential(result.credential);
      await queryClient.invalidateQueries({ queryKey: keys.credentials(w.project.id, w.environment.id) });
    });
  }
  async function revokeCredential(id: string, prefix: string) {
    if (!window.confirm(`Revoke ${prefix}? Game servers using it will stop working immediately. This cannot be undone.`)) return;
    await w.run(async () => {
      await unwrap(client.POST("/v1/credentials/{id}/revoke", { ...dashboard, params: { path: { id } } }), w.token);
      queryClient.setQueryData(keys.credentials(w.project.id, w.environment.id), (rows: typeof credentials.data) => rows?.map((row) => row.id === id ? { ...row, revoked_at: new Date().toISOString() } : row));
      w.notify({ kind: "success", message: `Revoked ${prefix}.` });
    });
  }
  async function archiveProject() {
    if (!window.confirm(`Archive ${w.project.name}? Its server credentials, player sign-in and leaderboards stop working. All data is kept and the project can be restored through the API.`)) return;
    await w.run(async () => {
      await unwrap(client.PATCH("/v1/projects/{projectId}", { ...dashboard, params: { path: { projectId: w.project.id } }, body: { status: "archived" } }), w.token);
      w.onProjectArchived();
    });
  }
  async function createProductionEnvironment() {
    await w.run(async () => {
      const created = await unwrap(client.POST("/v1/projects/{projectId}/environments", { ...dashboard, params: { path: { projectId: w.project.id } }, body: { name: "production" } }), w.token);
      w.setEnvironments([...w.environments.filter((row) => row.id !== created.id), created]);
      w.notify({ kind: "success", message: "Production environment created with separate configuration and credentials." });
    });
  }
  async function saveProject() {
    await w.run(async () => {
      w.setProject(await unwrap(client.PATCH("/v1/projects/{projectId}", { ...dashboard, params: { path: { projectId: w.project.id } }, body: { name: projectName, slug: projectSlug } }), w.token));
      w.notify({ kind: "success", message: "Project details updated." });
    });
  }
  return (
    <>
      <PageTitle eyebrow="PROJECT CONFIGURATION" title="Project settings" description="Manage environment credentials and versioned service configuration. Public identifiers select a project; server credentials stay private." actions={<><button className="button secondary" disabled={w.busy || !loaded} onClick={() => void saveDraft()}>Save draft</button><button className="button primary" disabled={w.busy || !loaded} onClick={() => void publish()}><Rocket size={15} /> Save &amp; publish</button></>} />
      <Panel title="Project details" subtitle="Update the dashboard name and stable project slug." icon={<Boxes size={18} />}>
        <form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void saveProject(); }}>
          <label>Project name<input value={projectName} onChange={(event) => setProjectName(event.target.value)} required /></label>
          <label>Project slug<input value={projectSlug} onChange={(event) => setProjectSlug(event.target.value)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label>
          <div className="button-row"><button className="button secondary" disabled={w.busy}>Save project</button><button type="button" className="button ghost-danger" disabled={w.busy} onClick={() => void archiveProject()}>Archive project</button></div>
        </form>
      </Panel>
      <Panel title="Project environments" subtitle="Development and production have independent identifiers, credentials, and configuration." icon={<ShieldCheck size={18} />}>
        <div className="environment-list">{w.environments.map((row) => <div className="environment-row" key={row.id}><span className={`status-dot ${row.name}`} /><b>{row.name}</b><code>{row.public_id}</code>{row.id === w.environment.id && <span className="current-label">CURRENT</span>}</div>)}</div>
        {!w.environments.some((row) => row.name === "production") && <button className="button secondary" disabled={w.busy} onClick={() => void createProductionEnvironment()}><Plus size={15} /> Add production environment</button>}
      </Panel>
      <Panel title={`${w.project.name} · ${w.environment.name}`} subtitle="Client-safe environment configuration" icon={<ShieldCheck size={18} />}>
        <div className="connection-row"><span>Public environment identifier</span><code>{w.environment.public_id}</code></div>
        <div className="connection-row"><span>Environment ID</span><code>{w.environment.id}</code></div>
        <label className="json-label">Configuration draft (JSON)<textarea className="json-editor" spellCheck={false} value={raw} onChange={(event) => setRaw(event.target.value)} /></label>
        <div className="small-note">Edit catalog, progression, leaderboard, stat and achievement definitions together. Give an item a metadata.slot to make it equippable. Saving does not affect live players until you publish.</div>
      </Panel>
      <Panel title="Version history" subtitle="Every publish is an immutable version. Restoring one publishes it again as a new version." icon={<History size={18} />}>
        {versions.isPending ? <p className="empty-text">Loading versions…</p>
          : (versions.data ?? []).length === 0 ? <p className="empty-text">Nothing published yet.</p>
          : <div className="credential-list">{(versions.data ?? []).map((v, i) => (
            <div className="credential-row" key={v.id}><div className="credential-icon"><History size={16} /></div>
              <div><b>Version {v.version}{i === 0 && <span className="current-label"> LIVE</span>}</b><small>Published {v.published_at}</small></div>
              {i > 0 && <button className="button secondary" disabled={w.busy} onClick={() => void rollback(v.version)}><RotateCcw size={14} /> Restore</button>}
            </div>
          ))}</div>}
      </Panel>
      <Panel title="Server credentials" subtitle="Issue and revoke trusted-server access. Secrets are only shown once." icon={<KeyRound size={18} />}>
        <button className="button secondary" disabled={w.busy} onClick={() => void createCredential()}><Plus size={15} /> Create server credential</button>
        {createdCredential && <div className="secret-alert"><b>Copy this secret now—it will not be shown again.</b><code>{createdCredential}</code><button className="button ghost-danger" onClick={() => setCreatedCredential("")}>Dismiss</button></div>}
        <div className="credential-list">{(credentials.data ?? []).map((item) => <div className="credential-row" key={item.id}><div className="credential-icon"><KeyRound size={16} /></div><div><b>{item.key_prefix}</b><small>Created {item.created_at} · {item.revoked_at ? "revoked" : "active"}</small></div>{!item.revoked_at && <button className="button ghost-danger" disabled={w.busy} onClick={() => void revokeCredential(item.id, item.key_prefix)}>Revoke</button>}</div>)}</div>
      </Panel>
    </>
  );
}
