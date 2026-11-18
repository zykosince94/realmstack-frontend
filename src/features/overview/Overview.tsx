import { Activity, Award, Boxes, Check, ChevronDown, Coins, Gamepad2, KeyRound, Rocket, ShieldCheck, Trophy } from "lucide-react";
import { useWorkspace } from "../../app/workspace";
import { PageTitle } from "../../components/ui";
import { useDraft, usePublished } from "../../hooks/queries";

export function Overview() {
  const { project, environment } = useWorkspace();
  const draft = useDraft().data;
  const published = usePublished().data;
  const loading = !draft || !published;
  const live = published?.config;
  const stats = [
    { label: "Configured items", value: loading ? "—" : draft.items.length, icon: Boxes, tone: "violet", note: "Current draft" },
    { label: "Currencies", value: loading ? "—" : draft.currencies.length, icon: Coins, tone: "green", note: "Current draft" },
    { label: "Progression levels", value: loading ? "—" : draft.progression.length + 1, icon: Activity, tone: "blue", note: "Current draft" },
    { label: "Live leaderboards", value: loading ? "—" : live?.leaderboards.length ?? 0, icon: Trophy, tone: "orange", note: published?.version ? `Published v${published.version}` : "Not published yet" },
    { label: "Live achievements", value: loading ? "—" : live?.achievements?.length ?? 0, icon: Award, tone: "violet", note: `${live?.stats?.length ?? 0} stats & flags` },
  ];
  const isPublished = Boolean(published?.version);
  const pid = environment.public_id;
  return (
    <>
      <PageTitle eyebrow="REALMSTACK / OVERVIEW" title={project.name} description="Your game services at a glance. Changes in this environment are isolated from other environments." actions={<span className={`environment-badge ${environment.name}`}>{environment.name}<span className="status-dot" /></span>} />
      <div className="stat-grid">{stats.map(({ label, value, icon: Icon, tone, note }) => <div className="stat-card" key={label}><div className={`stat-icon ${tone}`}><Icon size={18} /></div><span className="stat-label">{label}</span><b>{value}</b><small>{note}</small></div>)}</div>
      <div className="overview-grid">
        <div className="panel recent-panel"><div className="panel-heading"><div><h3>Quick start</h3><p>Follow the happy path to try your game backend.</p></div><Rocket size={18} /></div>
          <ol className="steps">
            <li className="done"><span>1</span><div><b>Project and environment ready</b><small>{project.name} · {environment.name}</small></div><Check size={15} /></li>
            <li className={isPublished ? "done" : ""}><span>2</span><div><b>Publish your game catalog</b><small>{isPublished ? `Version ${published?.version} is live` : "Define items and currencies, then publish"}</small></div>{isPublished ? <Check size={15} /> : <ChevronDown size={15} />}</li>
            <li><span>3</span><div><b>Create a player</b><small>Register one in Test client with the public environment ID</small></div><ChevronDown size={15} /></li>
            <li><span>4</span><div><b>Manage the player</b><small>In Players: grant, spend, award XP, set stats and claim achievements</small></div><ChevronDown size={15} /></li>
          </ol>
        </div>
        <div className="panel integration-panel"><div className="panel-heading"><div><h3>Client connection</h3><p>Safe to use in your game client.</p></div><KeyRound size={18} /></div>
          <div className="connection-row"><span>Public environment identifier</span><code>{pid || "Available in environment settings"}</code></div>
          <div className="connection-row"><span>Environment</span><b>{environment.name}</b></div>
          <div className="warning-note"><ShieldCheck size={16} /><span>Server credentials are never meant to ship with a client build.</span></div>
          <div className="code-sample"><code>public_environment_id: {pid || "your-public-environment-id"}</code></div>
        </div>
      </div>
      <div className="demo-banner"><div className="demo-illustration"><Gamepad2 size={22} /></div><div><b>Want to see the full loop?</b><p>Create a demo player in Test client, then open it in Players to grant items and currency, award XP, submit scores, adjust stats and run achievements and quests.</p></div></div>
    </>
  );
}
