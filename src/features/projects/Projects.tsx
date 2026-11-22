import { useState } from "react";
import { Gamepad2, Plus, X } from "lucide-react";
import { authHeaders, client, unwrap } from "../../api/client";
import type { Project } from "../../api/types";

type Props = {
  token: string;
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  onCreated: (project: Project) => void;
};

function createProject(token: string, name: string, slug: string) {
  return unwrap(client.POST("/v1/projects", { body: { name, slug }, headers: authHeaders({ token }) }), token);
}

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function ProjectsEmpty({ token, busy, run, onCreated }: Props) {
  const [name, setName] = useState("My first game");
  const [slug, setSlug] = useState("my-first-game");
  return (
    <div className="empty-card">
      <div className="empty-icon"><Gamepad2 /></div>
      <div className="eyebrow">YOUR GAME BACKEND STARTS HERE</div>
      <h2>Create your first project</h2>
      <p>Projects isolate game data and credentials. Start with a development environment.</p>
      <form className="inline-create" onSubmit={(event) => { event.preventDefault(); void run(async () => onCreated(await createProject(token, name, slug))); }}>
        <label>Project name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label>Project slug<input value={slug} onChange={(event) => setSlug(event.target.value)} required /></label>
        <button className="button primary" disabled={busy}><Plus size={18} /> Create project</button>
      </form>
    </div>
  );
}

export function CreateProjectModal({ token, busy, run, onCreated, onClose }: Props & { onClose: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
        <button className="icon-button modal-close" aria-label="Close dialog" onClick={onClose}><X size={19} /></button>
        <div className="eyebrow">NEW TENANT</div>
        <h2 id="create-project-title">Create a game project</h2>
        <p className="subtle">A development environment will be created for the project.</p>
        <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void run(async () => onCreated(await createProject(token, name, slug))); }}>
          <label>Project name<input value={name} onChange={(event) => { setName(event.target.value); setSlug(slugify(event.target.value)); }} required /></label>
          <label>Project slug<input value={slug} onChange={(event) => setSlug(event.target.value)} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label>
          <div className="button-row"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}><Plus size={17} /> Create project</button></div>
        </form>
      </section>
    </div>
  );
}
