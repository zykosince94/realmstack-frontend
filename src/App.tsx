import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronDown,
  CircleHelp,
  Coins,
  Gamepad2,
  Gauge,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Trophy,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { api, idempotencyKey } from "./api";

type User = { id: string; email: string };
type Environment = { id: string; name: string; public_id?: string; public_identifier?: string };
type Project = {
  id: string;
  name: string;
  slug?: string;
  status?: string;
  environments?: Environment[];
};
type Player = { id: string; email?: string; display_name?: string; displayName?: string };
type Session = { access_token?: string; accessToken?: string; user?: User };
type Config = {
  items?: Array<Record<string, unknown>>;
  currencies?: Array<Record<string, unknown>>;
  progression?: number[];
  leaderboards?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};
type Notice = { kind: "success" | "error"; message: string };

const screens = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "players", label: "Players", icon: Users },
  { id: "economy", label: "Inventory & economy", icon: Wallet },
  { id: "progression", label: "Progression", icon: Activity },
  { id: "leaderboards", label: "Leaderboards", icon: Trophy },
  { id: "settings", label: "Project settings", icon: ShieldCheck },
] as const;
type Screen = (typeof screens)[number]["id"];

function readAccessToken(value: Session): string {
  const token = value.access_token ?? value.accessToken;
  if (!token) throw new Error("The API response did not include an access token.");
  return token;
}

function defaultConfig(): Config {
  return {
    items: [
      { key: "health_potion", name: "Health Potion", category: "consumable", stackable: true, max_stack: 99, metadata: { healing: 50 } },
      { key: "iron_sword", name: "Iron Sword", category: "weapon", stackable: false, max_stack: 1, metadata: { slot: "weapon", attack: 12 } },
    ],
    currencies: [{ key: "credits", name: "Credits" }, { key: "gems", name: "Gems" }],
    progression: [100, 300, 700, 1500],
    leaderboards: [{ key: "global", direction: "higher" }],
  };
}

function asArray<T>(value: T[] | { data?: T[]; items?: T[] } | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.data)) return value.data;
  if (value && Array.isArray(value.items)) return value.items;
  return [];
}

function App() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("admin@realmstack.local");
  const [password, setPassword] = useState("RealmStackLocal!2026");
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [screen, setScreen] = useState<Screen>("overview");
  const [demoPlayerId, setDemoPlayerId] = useState("");
  const [demoPlayerToken, setDemoPlayerToken] = useState("");
  const [serverCredential, setServerCredential] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectSlug, setNewProjectSlug] = useState("");

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await work();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }, []);

  const loadProjects = useCallback(async (authToken: string) => {
    const result = await api<Project[] | { projects?: Project[] }>("/v1/projects", "GET", { token: authToken });
    const rows = asArray<Project>(Array.isArray(result) ? result : result.projects);
    setProjects(rows);
    setProject((previous) => rows.find((row) => row.id === previous?.id) ?? rows[0] ?? null);
  }, []);

  const loadEnvironments = useCallback(async (authToken: string, selectedProject: Project) => {
    const result = await api<Environment[] | { environments?: Environment[] }>(
      `/v1/projects/${selectedProject.id}/environments`,
      "GET",
      { token: authToken },
    );
    const rows = asArray<Environment>(Array.isArray(result) ? result : result.environments);
    setEnvironments(rows);
    setEnvironment((previous) => rows.find((row) => row.id === previous?.id) ?? rows[0] ?? null);
  }, []);

  useEffect(() => {
    if (token) void run(async () => loadProjects(token));
  }, [token, loadProjects, run]);

  useEffect(() => {
    if (token && project) void run(async () => loadEnvironments(token, project));
  }, [token, project?.id, loadEnvironments, run]);

  useEffect(() => {
    setDemoPlayerId("");
    setDemoPlayerToken("");
    setServerCredential("");
  }, [project?.id, environment?.id]);

  async function authenticate() {
    await run(async () => {
      const result = await api<Session>(`/v1/auth/${authMode}`, "POST", {
        body: { email, password },
      });
      setToken(readAccessToken(result));
      setUser(result.user ?? { id: "", email });
      setNotice({ kind: "success", message: authMode === "login" ? "Welcome back." : "Account created." });
    });
  }

  function signOut() {
    setToken("");
    setUser(null);
    setProjects([]);
    setProject(null);
    setEnvironments([]);
    setEnvironment(null);
    setDemoPlayerId("");
    setDemoPlayerToken("");
    setServerCredential("");
    setScreen("overview");
  }

  if (!token) {
    return (
      <div className="login-shell">
        <div className="login-art">
          <div className="brand"><span className="brand-mark"><Gamepad2 size={19} /></span> REALMSTACK</div>
          <div className="login-message">
            <div className="eyebrow">GAME BACKEND, WITHOUT THE BOILERPLATE</div>
            <h1>Build the game.<br /><span>We’ll keep it running.</span></h1>
            <p>One workspace for player identity, inventory, economy, progression and competitive leaderboards.</p>
            <div className="feature-pills"><span><ShieldCheck size={15} /> Tenant-safe</span><span><Activity size={15} /> Transactional</span><span><Rocket size={15} /> API-first</span></div>
          </div>
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="login-footer">RealmStack Developer Console <span>•</span> Local MVP</div>
        </div>
        <div className="login-panel">
          <div className="mobile-brand"><span className="brand-mark"><Gamepad2 size={19} /></span> REALMSTACK</div>
          <div className="login-card">
            <div className="eyebrow">{authMode === "login" ? "WELCOME BACK" : "GET STARTED"}</div>
            <h2>{authMode === "login" ? "Sign in to your workspace" : "Create your workspace account"}</h2>
            <p className="subtle">Use your dashboard account to manage projects and game services.</p>
            <form onSubmit={(event) => { event.preventDefault(); void authenticate(); }}>
              <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
              <label>Password<input type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={authMode === "register" ? 10 : 1} /></label>
              <button className="button primary wide" disabled={busy}>{busy ? "Please wait…" : authMode === "login" ? "Sign in" : "Create account"} <ArrowUpRight size={16} /></button>
            </form>
            <div className="mode-toggle">{authMode === "login" ? "New to RealmStack?" : "Already have an account?"} <button onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>{authMode === "login" ? "Create account" : "Sign in"}</button></div>
            {authMode === "login" && <div className="demo-hint"><CircleHelp size={15} /><span>Demo login: <b>admin@realmstack.local</b><br />Password: <b>RealmStackLocal!2026</b> (local seed)</span></div>}
            {notice && <NoticeView notice={notice} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Gamepad2 size={19} /></span> REALMSTACK</div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav">
          {screens.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${screen === id ? "active" : ""}`} onClick={() => setScreen(id)}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{screen === id && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-card"><div className="avatar">{(user?.email ?? email).slice(0, 1).toUpperCase()}</div><div className="user-meta"><b>{user?.email ?? email}</b><small>Workspace owner</small></div><button className="icon-button" title="Sign out" onClick={signOut}><LogOut size={16} /></button></div>
          <div className="version">REALMSTACK <span>•</span> DEVELOPER CONSOLE</div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="crumb"><span>Projects</span><span className="slash">/</span><b>{project?.name ?? "Select a project"}</b></div>
          <div className="top-actions">
            {project && <button className="button secondary" onClick={() => setCreatingProject(true)}><Plus size={14} /> New project</button>}
            {projects.length > 0 && <select aria-label="Project" value={project?.id ?? ""} onChange={(event) => setProject(projects.find((row) => row.id === event.target.value) ?? null)}>{projects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>}
            {environments.length > 0 && <select aria-label="Environment" value={environment?.id ?? ""} onChange={(event) => setEnvironment(environments.find((row) => row.id === event.target.value) ?? null)}>{environments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>}
            <button className="icon-button top-avatar" title="Sign out" onClick={signOut}>{(user?.email ?? email).slice(0, 1).toUpperCase()}</button>
          </div>
        </header>
        {creatingProject && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreatingProject(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-project-title"><button className="icon-button modal-close" aria-label="Close dialog" onClick={() => setCreatingProject(false)}><X size={17} /></button><div className="eyebrow">NEW TENANT</div><h2 id="create-project-title">Create a game project</h2><p className="subtle">A development environment will be created for the project.</p><form className="stack-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { const created = await api<Project>("/v1/projects", "POST", { token, body: { name: newProjectName, slug: newProjectSlug } }); setProjects((rows) => [...rows, created]); setProject(created); setCreatingProject(false); setNewProjectName(""); setNewProjectSlug(""); }); }}><label>Project name<input value={newProjectName} onChange={(event) => { const next = event.target.value; setNewProjectName(next); setNewProjectSlug(next.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} required /></label><label>Project slug<input value={newProjectSlug} onChange={(event) => setNewProjectSlug(event.target.value)} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><div className="button-row"><button type="button" className="button secondary" onClick={() => setCreatingProject(false)}>Cancel</button><button className="button primary" disabled={busy}><Plus size={15} /> Create project</button></div></form></section></div>}
        <div className="content">
          {notice && <NoticeView notice={notice} />}
          {!project ? (
            <ProjectsEmpty token={token} busy={busy} run={run} onCreated={(created) => { setProjects((rows) => [...rows, created]); setProject(created); }} />
          ) : !environment ? (
            <div className="empty-card"><div className="empty-icon"><Boxes /></div><h2>Choose an environment</h2><p>This project does not have an environment yet.</p><button className="button primary" onClick={() => void run(async () => { const created = await api<Environment>(`/v1/projects/${project.id}/environments`, "POST", { token, body: { name: "development" } }); setEnvironments([created]); setEnvironment(created); })} disabled={busy}><Plus size={16} /> Create development environment</button></div>
          ) : (
            <ScreenContent
              screen={screen}
              token={token}
              project={project}
              onProject={setProject}
              environment={environment}
              environments={environments}
              onEnvironments={setEnvironments}
              run={run}
              busy={busy}
              onNotice={setNotice}
              demoPlayerId={demoPlayerId}
              onDemoPlayerId={setDemoPlayerId}
              demoPlayerToken={demoPlayerToken}
              onDemoPlayerToken={setDemoPlayerToken}
              serverCredential={serverCredential}
              onServerCredential={setServerCredential}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function NoticeView({ notice }: { notice: Notice }) {
  return <div className={`notice ${notice.kind}`}><span>{notice.kind === "success" ? <Check size={16} /> : <X size={16} />}</span>{notice.message}</div>;
}

function ProjectsEmpty({ token, busy, run, onCreated }: {
  token: string;
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = useState("My first game");
  const [slug, setSlug] = useState("my-first-game");
  return (
    <div className="empty-card">
      <div className="empty-icon"><Gamepad2 /></div>
      <div className="eyebrow">YOUR GAME BACKEND STARTS HERE</div>
      <h2>Create your first project</h2>
      <p>Projects isolate game data and credentials. Start with a development environment.</p>
      <form className="inline-create" onSubmit={(event) => { event.preventDefault(); void run(async () => { const created = await api<Project>("/v1/projects", "POST", { token, body: { name, slug } }); onCreated(created); }); }}>
        <label>Project name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label>Project slug<input value={slug} onChange={(event) => setSlug(event.target.value)} required /></label>
        <button className="button primary" disabled={busy}><Plus size={16} /> Create project</button>
      </form>
    </div>
  );
}

type ContentProps = {
  screen: Screen;
  token: string;
  project: Project;
  onProject: (project: Project) => void;
  environment: Environment;
  environments: Environment[];
  onEnvironments: (environments: Environment[]) => void;
  run: (work: () => Promise<void>) => Promise<void>;
  busy: boolean;
  onNotice: (notice: Notice | null) => void;
  demoPlayerId: string;
  onDemoPlayerId: (id: string) => void;
  demoPlayerToken: string;
  onDemoPlayerToken: (token: string) => void;
  serverCredential: string;
  onServerCredential: (credential: string) => void;
};

function ScreenContent(props: ContentProps) {
  const { screen } = props;
  const [reload, setReload] = useState(0);
  const bump = () => setReload((value) => value + 1);
  if (screen === "overview") return <Overview {...props} onNavigate={undefined} />;
  if (screen === "settings") return <Settings {...props} />;
  if (screen === "players") return <Players {...props} reload={reload} onRefresh={bump} />;
  if (screen === "economy") return <Economy {...props} reload={reload} onRefresh={bump} />;
  if (screen === "progression") return <Progression {...props} reload={reload} onRefresh={bump} />;
  if (screen === "leaderboards") return <Leaderboards {...props} reload={reload} onRefresh={bump} />;
  return <Overview {...props} onNavigate={undefined} />;
}

function PageTitle({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

function Overview(props: ContentProps & { onNavigate?: undefined }) {
  const { token, project, environment, onNotice } = props;
  const [config, setConfig] = useState<Config | null>(null);
  const [leaderboard, setLeaderboard] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Config>(`/v1/projects/${project.id}/environments/${environment.id}/configurations/draft`, "GET", { token }),
      api<Record<string, unknown>>(`/v1/leaderboards/global?environment_id=${encodeURIComponent(environment.public_id ?? environment.public_identifier ?? "")}`, "GET"),
    ]).then(([nextConfig, nextLeaderboard]) => {
      if (active) { setConfig(nextConfig); setLeaderboard(nextLeaderboard); setLoading(false); }
    }).catch((error: unknown) => {
      if (active) {
        setLoading(false);
        onNotice({ kind: "error", message: error instanceof Error ? error.message : "Could not load overview data." });
      }
    });
    return () => { active = false; };
  }, [token, project.id, environment.id, onNotice]);
  const items = asArray(config?.items);
  const currencies = asArray(config?.currencies);
  const thresholds = config?.progression ?? [];
  const stats = [
    { label: "Configured items", value: loading ? "—" : items.length, icon: Boxes, tone: "violet" },
    { label: "Currencies", value: loading ? "—" : currencies.length, icon: Coins, tone: "green" },
    { label: "Progression levels", value: loading ? "—" : thresholds.length, icon: Activity, tone: "blue" },
    { label: "Leaderboard", value: loading ? "—" : leaderboard ? "Live" : "Ready", icon: Trophy, tone: "orange" },
  ];
  return (
    <>
      <PageTitle eyebrow="REALMSTACK / OVERVIEW" title={`Good to see you, ${project.name}`} description="Your game services at a glance. Changes in this environment are isolated from production." actions={<span className={`environment-badge ${environment.name.toLowerCase()}`}>{environment.name}<span className="status-dot" /></span>} />
      <div className="stat-grid">{stats.map(({ label, value, icon: Icon, tone }) => <div className="stat-card" key={label}><div className={`stat-icon ${tone}`}><Icon size={18} /></div><span className="stat-label">{label}</span><b>{value}</b><small>{label === "Leaderboard" ? "PostgreSQL ranking" : "Current environment"}</small></div>)}</div>
      <div className="overview-grid">
        <div className="panel recent-panel"><div className="panel-heading"><div><h3>Quick start</h3><p>Follow the happy path to try your game backend.</p></div><Rocket size={18} /></div>
          <ol className="steps"><li className="done"><span>1</span><div><b>Project and environment ready</b><small>{project.name} · {environment.name}</small></div><Check size={15} /></li><li><span>2</span><div><b>Set up your game catalog</b><small>Define items and virtual currencies</small></div><ChevronDown size={15} /></li><li><span>3</span><div><b>Create a player</b><small>Register with the public environment ID</small></div><ChevronDown size={15} /></li><li><span>4</span><div><b>Run the service demo</b><small>Grant, spend, earn XP and submit a score</small></div><ChevronDown size={15} /></li></ol>
        </div>
        <div className="panel integration-panel"><div className="panel-heading"><div><h3>Client connection</h3><p>Safe to use in your game client.</p></div><KeyRound size={18} /></div><div className="connection-row"><span>Public environment identifier</span><code>{environment.public_id ?? environment.public_identifier ?? "Available in environment settings"}</code></div><div className="connection-row"><span>Environment</span><b>{environment.name}</b></div><div className="warning-note"><ShieldCheck size={16} /><span>Server credentials are never meant to ship with a client build.</span></div><div className="code-sample"><code>public_environment_id: {environment.public_id ?? environment.public_identifier ?? "your-public-environment-id"}</code></div></div>
      </div>
      <div className="demo-banner"><div className="demo-illustration"><Gamepad2 size={22} /></div><div><b>Want to see the full loop?</b><p>Open Players to create a demo player, then explore inventory, currency, XP and scores.</p></div><button className="button secondary" onClick={() => onNotice({ kind: "success", message: "Use the left navigation to explore the game services." })}>Explore features <ArrowUpRight size={15} /></button></div>
    </>
  );
}

function useConfig(token: string, project: Project, environment: Environment, reload: number, onNotice: (notice: Notice | null) => void) {
  const [config, setConfig] = useState<Config>(defaultConfig());
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    api<Config>(`/v1/projects/${project.id}/environments/${environment.id}/configurations/draft`, "GET", { token })
      .then((value) => { if (active) { setConfig(value); setLoaded(true); } })
      .catch((error: unknown) => {
        if (active) {
          setLoaded(true);
          onNotice({ kind: "error", message: error instanceof Error ? error.message : "Could not load configuration." });
        }
      });
    return () => { active = false; };
  }, [token, project.id, environment.id, reload, onNotice]);
  return { config, setConfig, loaded };
}

function Players(props: ContentProps & { reload: number; onRefresh: () => void }) {
  const { environment, run, onNotice } = props;
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerEmail, setPlayerEmail] = useState("player1@example.test");
  const [playerPassword, setPlayerPassword] = useState("PlayerDemo123!");
  const [displayName, setDisplayName] = useState("Rookie Pilot");
  const [profile, setProfile] = useState<Player | null>(null);
  const publicEnvironmentId = environment.public_id ?? environment.public_identifier ?? "";

  async function playerAuth(kind: "register" | "login") {
    await run(async () => {
      const result = await api<Session & { player?: Player }>(`/v1/players/${kind}`, "POST", {
        body: { public_environment_id: publicEnvironmentId, email: playerEmail, password: playerPassword, display_name: displayName },
      });
      const nextToken = readAccessToken(result);
      props.onDemoPlayerToken(nextToken);
      const nextPlayer: Player = result.player ?? (result.user
        ? { id: result.user.id, email: result.user.email }
        : { id: "", email: playerEmail, display_name: displayName });
      props.onDemoPlayerId(nextPlayer.id);
      setPlayer(nextPlayer);
      setProfile(nextPlayer);
      onNotice({ kind: "success", message: kind === "register" ? "Player registered and signed in." : "Player signed in." });
    });
  }

  async function loadProfile() {
    await run(async () => {
      const value = await api<Player>("/v1/players/me", "GET", { token: props.demoPlayerToken });
      setProfile(value);
    });
  }

  return (
    <>
      <PageTitle eyebrow="PLAYER IDENTITY" title="Players" description="Register and sign in players using the public project identifier. Player tokens can only access their own data." />
      <div className="two-column">
        <section className="panel"><div className="panel-heading"><div><h3>Player sign-in</h3><p>For the local sample client flow.</p></div><UserRound size={18} /></div>
          <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void playerAuth("register"); }}>
            <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
            <label>Email<input type="email" value={playerEmail} onChange={(event) => setPlayerEmail(event.target.value)} required /></label>
            <label>Password<input type="password" value={playerPassword} onChange={(event) => setPlayerPassword(event.target.value)} minLength={8} required /></label>
            <div className="button-row"><button className="button primary" disabled={props.busy}>Register player</button><button type="button" className="button secondary" disabled={props.busy} onClick={() => void playerAuth("login")}>Sign in existing</button></div>
          </form>
        </section>
        <section className="panel"><div className="panel-heading"><div><h3>Authenticated player</h3><p>Short-lived access token session.</p></div><ShieldCheck size={18} /></div>
          {props.demoPlayerToken ? <><div className="player-profile"><div className="avatar big">{(profile?.display_name ?? profile?.displayName ?? "P").slice(0, 1).toUpperCase()}</div><div><b>{profile?.display_name ?? profile?.displayName ?? player?.display_name ?? "Player"}</b><small>{profile?.email ?? player?.email ?? playerEmail}</small></div><span className="verified"><Check size={13} /> authenticated</span></div><div className="token-display"><span>PLAYER ID · ACCESS TOKEN</span><code>{props.demoPlayerId || "ID pending"}<br />{props.demoPlayerToken.slice(0, 20)}••••••••••••</code></div><div className="button-row"><button className="button secondary" onClick={() => void loadProfile()}>Refresh profile <RefreshCw size={14} /></button><button className="button ghost-danger" onClick={() => { props.onDemoPlayerToken(""); props.onDemoPlayerId(""); setPlayer(null); setProfile(null); }}>Sign out player</button></div></> : <div className="empty-inline"><UserRound size={21} /><p>Register a player to view their authenticated profile.</p></div>}
        </section>
      </div>
    </>
  );
}

function Economy(props: ContentProps & { reload: number; onRefresh: () => void }) {
  const { token, project, environment, run, busy } = props;
  const { config, loaded } = useConfig(token, project, environment, props.reload, props.onNotice);
  const [inventory, setInventory] = useState<Array<Record<string, unknown>>>([]);
  const [balances, setBalances] = useState<Array<Record<string, unknown>>>([]);
  const [transactions, setTransactions] = useState<Array<Record<string, unknown>>>([]);
  const [itemKey, setItemKey] = useState("health_potion");
  const [quantity, setQuantity] = useState(1);
  const [currencyKey, setCurrencyKey] = useState("credits");
  const [amount, setAmount] = useState(100);
  const [spendAmount, setSpendAmount] = useState(25);
  const [consumeKey, setConsumeKey] = useState("health_potion");
  const [consumeQuantity, setConsumeQuantity] = useState(1);
  const [equipKey, setEquipKey] = useState("plasma_rifle");
  const [equipSlot, setEquipSlot] = useState("weapon");
  const [actionResult, setActionResult] = useState("");
  const currencies = asArray(config.currencies);
  const items = asArray(config.items);
  async function fetchPlayerData() {
    if (!props.demoPlayerId) throw new Error("Register or sign in a player in the Players section first.");
    const [nextInventory, nextBalances, nextTransactions] = await Promise.all([
      api<Array<Record<string, unknown>>>("/v1/players/me/inventory", "GET", { token: props.demoPlayerToken }),
      api<Array<Record<string, unknown>>>("/v1/players/me/currency", "GET", { token: props.demoPlayerToken }),
      api<Array<Record<string, unknown>>>("/v1/players/me/transactions", "GET", { token: props.demoPlayerToken }),
    ]);
    setInventory(nextInventory);
    setBalances(nextBalances);
    setTransactions(nextTransactions);
  }

  async function refreshPlayerData() {
    await run(fetchPlayerData);
  }

  async function serverMutation(path: string, body: Record<string, unknown>) {
    await run(async () => {
      const result = await api<unknown>(path, "POST", {
        headers: { "X-Server-Credential": props.serverCredential, "Idempotency-Key": idempotencyKey() },
        body,
      });
      setActionResult(JSON.stringify(result, null, 2));
      if (props.demoPlayerId) await fetchPlayerData();
    });
  }

  async function playerMutation(path: string, body: Record<string, unknown>) {
    await run(async () => {
      if (!props.demoPlayerToken) throw new Error("Sign in as a player in the Players section first.");
      const result = await api<unknown>(path, "POST", {
        token: props.demoPlayerToken,
        headers: { "Idempotency-Key": idempotencyKey() },
        body,
      });
      setActionResult(JSON.stringify(result, null, 2));
      await fetchPlayerData();
    });
  }

  return (
    <>
      <PageTitle eyebrow="INVENTORY & ECONOMY" title="Inventory & economy" description="Define your catalog, grant or consume items, and move virtual currency with transactional idempotency." actions={<button className="button secondary" disabled={busy} onClick={() => void refreshPlayerData()}><RefreshCw size={15} /> Refresh player view</button>} />
      <div className="panel toolbar-panel"><div className="toolbar-field"><label>Player ID<input placeholder="Register a player first" value={props.demoPlayerId} onChange={(event) => props.onDemoPlayerId(event.target.value)} /></label></div><div className="toolbar-field"><label>Server credential<input type="password" placeholder="Create one in Project settings" value={props.serverCredential} onChange={(event) => props.onServerCredential(event.target.value)} /></label></div><p className="field-note"><ShieldCheck size={14} /> Keep server credentials on a trusted game server; never include them in a game build.</p></div>
      <div className="two-column">
        <section className="panel"><div className="panel-heading"><div><h3>Item catalog</h3><p>{loaded ? `${items.length} configured items` : "Loading draft…"}</p></div><Boxes size={18} /></div><DataTable columns={["Key", "Name", "Category", "Stack"]} rows={items.map((item) => [String(item.key ?? "—"), String(item.name ?? "—"), String(item.category ?? "—"), String(item.max_stack ?? 1)])} empty="No items in the current draft. Add items in the configuration editor." /></section>
        <section className="panel"><div className="panel-heading"><div><h3>Currency catalog</h3><p>{currencies.length} configured currency types</p></div><Coins size={18} /></div><DataTable columns={["Key", "Name", "Precision"]} rows={currencies.map((currency) => [String(currency.key ?? "—"), String(currency.name ?? "—"), String(currency.precision ?? 0)])} empty="No currencies configured yet." /></section>
      </div>
      <div className="two-column action-panels">
        <section className="panel"><div className="panel-heading"><div><h3>Grant an item</h3><p>Trusted server action · idempotent by request key</p></div><ArrowDownLeft size={18} /></div><form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void serverMutation(`/v1/server/players/${props.demoPlayerId}/items/grant`, { item_key: itemKey, quantity }); }}><label>Item<select value={itemKey} onChange={(event) => setItemKey(event.target.value)}>{items.map((item) => <option key={String(item.key)} value={String(item.key)}>{String(item.name ?? item.key)}</option>)}</select></label><label>Quantity<input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label><button className="button primary" disabled={busy || !props.serverCredential || !props.demoPlayerId}>Grant item</button></form></section>
        <section className="panel"><div className="panel-heading"><div><h3>Credit currency</h3><p>Trusted server action · integer minor units</p></div><ArrowUpRight size={18} /></div><form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void serverMutation(`/v1/server/players/${props.demoPlayerId}/currency/credit`, { currency_key: currencyKey, amount, reason: "demo_reward" }); }}><label>Currency<select value={currencyKey} onChange={(event) => setCurrencyKey(event.target.value)}>{currencies.map((currency) => <option key={String(currency.key)} value={String(currency.key)}>{String(currency.name ?? currency.key)}</option>)}</select></label><label>Amount<input type="number" min={1} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label><button className="button primary" disabled={busy || !props.serverCredential || !props.demoPlayerId}>Credit balance</button></form></section>
      </div>
      <div className="two-column action-panels">
        <section className="panel"><div className="panel-heading"><div><h3>Consume an item</h3><p>Player self-service · idempotent by request key</p></div><Boxes size={18} /></div><form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void playerMutation("/v1/players/me/inventory/consume", { item_key: consumeKey, quantity: consumeQuantity }); }}><label>Item<select value={consumeKey} onChange={(event) => setConsumeKey(event.target.value)}>{items.map((item) => <option key={String(item.key)} value={String(item.key)}>{String(item.name ?? item.key)}</option>)}</select></label><label>Quantity<input type="number" min={1} value={consumeQuantity} onChange={(event) => setConsumeQuantity(Number(event.target.value))} /></label><button className="button secondary" disabled={busy || !props.demoPlayerToken}>Consume item</button></form></section>
        <section className="panel"><div className="panel-heading"><div><h3>Spend currency</h3><p>Player self-service · balance cannot go below zero</p></div><Coins size={18} /></div><form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void playerMutation("/v1/players/me/currency/spend", { currency_key: currencyKey, amount: spendAmount, reason: "demo_purchase" }); }}><label>Currency<select value={currencyKey} onChange={(event) => setCurrencyKey(event.target.value)}>{currencies.map((currency) => <option key={String(currency.key)} value={String(currency.key)}>{String(currency.name ?? currency.key)}</option>)}</select></label><label>Amount<input type="number" min={1} value={spendAmount} onChange={(event) => setSpendAmount(Number(event.target.value))} /></label><button className="button secondary" disabled={busy || !props.demoPlayerToken}>Spend currency</button></form></section>
      </div>
      <section className="panel"><div className="panel-heading"><div><h3>Equip an owned item</h3><p>Player self-service · item must already be in inventory.</p></div><ShieldCheck size={18} /></div><form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void playerMutation("/v1/players/me/inventory/equip", { item_key: equipKey, slot: equipSlot }); }}><label>Owned item<select value={equipKey} onChange={(event) => setEquipKey(event.target.value)}>{items.map((item) => <option key={String(item.key)} value={String(item.key)}>{String(item.name ?? item.key)}</option>)}</select></label><label>Equipment slot<input value={equipSlot} onChange={(event) => setEquipSlot(event.target.value)} /></label><button className="button secondary" disabled={busy || !props.demoPlayerToken}>Equip item</button></form></section>
      {actionResult && <pre className="result-json">{actionResult}</pre>}
      <div className="two-column">
        <section className="panel"><div className="panel-heading"><div><h3>Player inventory</h3><p>Current stacks for this player</p></div><Boxes size={18} /></div><DataTable columns={["Item", "Quantity", "Updated"]} rows={inventory.map((row) => [String(row.item_key ?? row.key ?? "—"), String(row.quantity ?? 0), String(row.updated_at ?? "—")])} empty="Refresh player view to load inventory." /></section>
        <section className="panel"><div className="panel-heading"><div><h3>Balances & recent transactions</h3><p>Balances and immutable audit trail</p></div><Coins size={18} /></div><div className="balance-list">{balances.map((row, index) => <div className="balance-row" key={index}><span>{String(row.currency_key ?? row.key ?? "Currency")}</span><b>{String(row.balance ?? 0)}</b></div>)}</div><DataTable columns={["Operation", "Amount", "When"]} rows={transactions.slice(0, 5).map((row) => [String(row.operation ?? row.type ?? "—"), String(row.amount ?? row.quantity ?? "—"), String(row.created_at ?? "—")])} empty="No transactions loaded." /></section>
      </div>
    </>
  );
}

function Progression(props: ContentProps & { reload: number; onRefresh: () => void }) {
  const { token, project, environment, run, busy } = props;
  const { config, setConfig, loaded } = useConfig(token, project, environment, props.reload, props.onNotice);
  const [thresholdText, setThresholdText] = useState("");
  const [xp, setXp] = useState(120);
  const [playerProgress, setPlayerProgress] = useState<Record<string, unknown> | null>(null);
  const thresholds = config.progression ?? [];
  useEffect(() => setThresholdText(thresholds.join(", ")), [thresholds.join(",")]);
  async function saveProgression() {
    await run(async () => {
      const parsed = thresholdText.split(",").map((value) => Number(value.trim()));
      if (!parsed.length || parsed.some((value, index) => !Number.isInteger(value) || value <= 0 || (index > 0 && value <= parsed[index - 1]))) {
        throw new Error("Enter positive, strictly increasing XP thresholds for levels 2 and above.");
      }
      const next = { ...config, progression: parsed };
      await api(`/v1/projects/${project.id}/environments/${environment.id}/configurations/draft`, "PUT", { token, body: next });
      setConfig(next);
      props.onNotice({ kind: "success", message: "Progression thresholds saved to draft. Publish configuration to make them active for new players." });
    });
  }
  async function publish() {
    await run(async () => {
      await api(`/v1/projects/${project.id}/environments/${environment.id}/configurations/publish`, "POST", { token });
      props.onRefresh();
      props.onNotice({ kind: "success", message: "Configuration published as an immutable version." });
    });
  }
  async function award() {
    await run(async () => {
      await api(`/v1/server/players/${props.demoPlayerId}/xp/award`, "POST", { headers: { "X-Server-Credential": props.serverCredential, "Idempotency-Key": idempotencyKey() }, body: { amount: xp, reason: "demo_xp_award" } });
      const progress = await api<Record<string, unknown>>("/v1/players/me/progression", "GET", { token: props.demoPlayerToken });
      setPlayerProgress(progress);
      props.onNotice({ kind: "success", message: `Awarded ${xp} XP to player ${props.demoPlayerId}.` });
    });
  }
  return (
    <>
      <PageTitle eyebrow="PLAYER PROGRESSION" title="Progression" description="Publish a versioned cumulative XP curve. Existing player progression stays pinned to its original version." actions={<button className="button secondary" disabled={busy || !loaded} onClick={() => void publish()}><Rocket size={15} /> Publish configuration</button>} />
      <div className="two-column">
        <section className="panel"><div className="panel-heading"><div><h3>Level thresholds</h3><p>Thresholds are cumulative XP required to reach each level.</p></div><Activity size={18} /></div>
          <label>Level thresholds<input value={thresholdText} onChange={(event) => setThresholdText(event.target.value)} placeholder="100, 300, 700" /></label><div className="threshold-list">{thresholdText.split(",").map((value, index) => <div className="threshold-item" key={index}><span>LEVEL {index + 2}</span><b>{value.trim() || "—"} XP</b></div>)}</div><div className="button-row"><button className="button primary" disabled={busy} onClick={() => void saveProgression()}>Save draft</button><span className="small-note">Enter increasing cumulative XP thresholds for levels 2+.</span></div>
        </section>
        <section className="panel"><div className="panel-heading"><div><h3>Award XP</h3><p>Trusted server operation · idempotent</p></div><Rocket size={18} /></div><div className="stack-form"><label>Player ID<input value={props.demoPlayerId} onChange={(event) => props.onDemoPlayerId(event.target.value)} placeholder="Register a player in Players" /></label><label>Server credential<input type="password" value={props.serverCredential} onChange={(event) => props.onServerCredential(event.target.value)} placeholder="Create one in Project settings" /></label><label>XP amount<input type="number" min={1} value={xp} onChange={(event) => setXp(Number(event.target.value))} /></label><button className="button primary" disabled={busy || !props.serverCredential || !props.demoPlayerId} onClick={() => void award()}>Award XP</button>{playerProgress && <pre className="result-json">{JSON.stringify(playerProgress, null, 2)}</pre>}</div>
        </section>
      </div>
      <section className="panel"><div className="panel-heading"><div><h3>Versioning rules</h3><p>Progression policy for this environment</p></div><ShieldCheck size={18} /></div><div className="policy-grid"><div><b>New players</b><p>Use the latest published progression version on their first XP award.</p></div><div><b>Existing players</b><p>Remain pinned to the progression version assigned at their first award.</p></div><div><b>History</b><p>Published thresholds are immutable; updates create a new version.</p></div></div></section>
    </>
  );
}

function Leaderboards(props: ContentProps & { reload: number; onRefresh: () => void }) {
  const { token, project, environment, run, busy } = props;
  const { config, loaded } = useConfig(token, project, environment, props.reload, props.onNotice);
  const [key, setKey] = useState("global");
  const [score, setScore] = useState(18450);
  const [entries, setEntries] = useState<Array<Record<string, unknown>>>([]);
  const leaderboard = asArray(config.leaderboards).find((row) => row.key === key);
  useEffect(() => { if (config.leaderboards?.[0]?.key) setKey(String(config.leaderboards[0].key)); }, [config.leaderboards]);
  async function loadLeaderboard() {
    await run(async () => {
      const result = await api<Array<Record<string, unknown>> | { entries?: Array<Record<string, unknown>> }>(
        `/v1/leaderboards/${encodeURIComponent(key)}?environment_id=${encodeURIComponent(environment.public_id ?? environment.public_identifier ?? "")}&limit=10`,
      );
      setEntries(asArray(Array.isArray(result) ? result : result.entries));
    });
  }
  async function submitScore() {
    await run(async () => {
      await api(`/v1/leaderboards/${encodeURIComponent(key)}/scores`, "POST", {
        token: props.demoPlayerToken,
        headers: { "Idempotency-Key": idempotencyKey() },
        body: { score },
      });
      const result = await api<{ entries?: Array<Record<string, unknown>> }>(
        `/v1/leaderboards/${encodeURIComponent(key)}?environment_id=${encodeURIComponent(environment.public_id ?? environment.public_identifier ?? "")}&limit=10`,
      );
      setEntries(asArray(result.entries));
      props.onNotice({ kind: "success", message: "Score submitted. The leaderboard keeps the player's best score." });
    });
  }
  const boards = asArray(config.leaderboards);
  return (
    <>
      <PageTitle eyebrow="COMPETITIVE LEADERBOARDS" title="Leaderboards" description="PostgreSQL is the source of truth. Rankings are computed deterministically with each player's best score and earliest-best tie break." />
      <div className="two-column">
        <section className="panel"><div className="panel-heading"><div><h3>Submit a score</h3><p>Player access token required. Demo only; not anti-cheat.</p></div><Trophy size={18} /></div><div className="stack-form"><label>Leaderboard<select value={key} onChange={(event) => setKey(event.target.value)}>{boards.map((board) => <option key={String(board.key)} value={String(board.key)}>{String(board.key)}</option>)}</select></label><label>Player access token<input type="password" value={props.demoPlayerToken} readOnly placeholder="Sign in as a player in Players" /></label><label>Score<input type="number" value={score} onChange={(event) => setScore(Number(event.target.value))} /></label><button className="button primary" disabled={busy || !props.demoPlayerToken || !key} onClick={() => void submitScore()}>Submit score <ArrowUpRight size={15} /></button></div></section>
        <section className="panel"><div className="panel-heading"><div><h3>Leaderboard definition</h3><p>{loaded ? `${boards.length} published/draft definition(s)` : "Loading configuration…"}</p></div><Gauge size={18} /></div>{leaderboard ? <div className="definition-list"><div><span>Key</span><b>{String(leaderboard.key)}</b></div><div><span>Direction</span><b>{String(leaderboard.direction ?? "higher")}-is-better</b></div><div><span>Tie-break</span><b>Earliest best score</b></div><div><span>Season</span><b>{leaderboard.season_start ? "Seasonal" : "All time"}</b></div></div> : <p className="empty-text">No leaderboard configured in draft.</p>}<button className="button secondary" disabled={busy} onClick={() => void loadLeaderboard()}><RefreshCw size={15} /> Load top scores</button></section>
      </div>
      <section className="panel"><div className="panel-heading"><div><h3>Top players</h3><p>Current environment · {key || "no leaderboard selected"}</p></div><Trophy size={18} /></div><DataTable columns={["Rank", "Player", "Best score", "Achieved"]} rows={entries.map((row, index) => [String(row.rank ?? index + 1), String(row.display_name ?? row.player_name ?? row.player_id ?? "Player"), String(row.score ?? row.best_score ?? 0), String(row.achieved_at ?? row.submitted_at ?? "—")])} empty="Load the leaderboard to view top scores." /></section>
    </>
  );
}

function Settings(props: ContentProps) {
  const { token, project, environment, run, busy } = props;
  const [projectName, setProjectName] = useState(project.name);
  const [projectSlug, setProjectSlug] = useState(project.slug ?? "");
  const [raw, setRaw] = useState("");
  const [loaded, setLoaded] = useState(false);
  const publicId = environment.public_id ?? environment.public_identifier ?? "";
  const [createdCredential, setCreatedCredential] = useState("");
  const [credentials, setCredentials] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => {
    setProjectName(project.name);
    setProjectSlug(project.slug ?? "");
  }, [project.id, project.name, project.slug]);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Config>(`/v1/projects/${project.id}/environments/${environment.id}/configurations/draft`, "GET", { token }),
      api<Array<Record<string, unknown>>>(`/v1/projects/${project.id}/environments/${environment.id}/credentials`, "GET", { token }),
    ]).then(([nextDraft, nextCredentials]) => { if (active) { setRaw(JSON.stringify(nextDraft, null, 2)); setCredentials(asArray<Record<string, unknown>>(nextCredentials)); setLoaded(true); } }).catch((error: unknown) => {
      if (active) props.onNotice({ kind: "error", message: error instanceof Error ? error.message : "Could not load project settings." });
    });
    return () => { active = false; };
  }, [token, project.id, environment.id, props.onNotice]);

  async function saveDraft() {
    await run(async () => {
      let parsed: Config;
      try { parsed = JSON.parse(raw) as Config; } catch { throw new Error("Configuration is not valid JSON."); }
      if (!Array.isArray(parsed.items) || !Array.isArray(parsed.currencies) || !Array.isArray(parsed.leaderboards) || !Array.isArray(parsed.progression)) {
        throw new Error("Configuration must include items, currencies, progression, and leaderboards arrays.");
      }
      await api(`/v1/projects/${project.id}/environments/${environment.id}/configurations/draft`, "PUT", { token, body: parsed });
      props.onNotice({ kind: "success", message: "Configuration saved as a draft. Publish it to make it live." });
    });
  }
  async function publish() {
    await run(async () => {
      await api(`/v1/projects/${project.id}/environments/${environment.id}/configurations/publish`, "POST", { token });
      props.onNotice({ kind: "success", message: "Published immutable configuration version." });
    });
  }
  async function createCredential() {
    await run(async () => {
      const result = await api<{ id: string; credential: string }>(`/v1/projects/${project.id}/environments/${environment.id}/credentials`, "POST", { token });
      const secret = result.credential;
      if (!secret) throw new Error("Credential was created, but the API did not return its one-time secret.");
      setCreatedCredential(secret);
      props.onServerCredential(secret);
      const nextCredentials = await api<Array<Record<string, unknown>>>(`/v1/projects/${project.id}/environments/${environment.id}/credentials`, "GET", { token });
      setCredentials(asArray(nextCredentials));
    });
  }
  async function createProductionEnvironment() {
    await run(async () => {
      const created = await api<Environment>(`/v1/projects/${project.id}/environments`, "POST", { token, body: { name: "production" } });
      props.onEnvironments([...new Map([...props.environments, created].map((row) => [row.id, row])).values()]);
      props.onNotice({ kind: "success", message: "Production environment created with separate configuration and credentials." });
    });
  }
  async function saveProject() {
    await run(async () => {
      const updated = await api<Project>(`/v1/projects/${project.id}`, "PATCH", { token, body: { name: projectName, slug: projectSlug } });
      props.onProject(updated);
      props.onNotice({ kind: "success", message: "Project details updated." });
    });
  }
  return (
    <>
      <PageTitle eyebrow="PROJECT CONFIGURATION" title="Project settings" description="Manage environment credentials and versioned service configuration. Public identifiers select a project; server credentials stay private." actions={<><button className="button secondary" disabled={busy || !loaded} onClick={() => void saveDraft()}>Save draft</button><button className="button primary" disabled={busy || !loaded} onClick={() => void publish()}><Rocket size={15} /> Publish</button></>} />
      <section className="panel"><div className="panel-heading"><div><h3>Project details</h3><p>Update the dashboard name and stable project slug.</p></div><Boxes size={18} /></div><form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void saveProject(); }}><label>Project name<input value={projectName} onChange={(event) => setProjectName(event.target.value)} required /></label><label>Project slug<input value={projectSlug} onChange={(event) => setProjectSlug(event.target.value)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label><button className="button secondary" disabled={busy}>Save project</button></form></section>
      <section className="panel"><div className="panel-heading"><div><h3>Project environments</h3><p>Development and production have independent identifiers, credentials, and configuration.</p></div><ShieldCheck size={18} /></div><div className="environment-list">{props.environments.map((row) => <div className="environment-row" key={row.id}><span className={`status-dot ${row.name.toLowerCase()}`} /><b>{row.name}</b><code>{row.public_id ?? row.public_identifier ?? row.id}</code>{row.id === environment.id && <span className="current-label">CURRENT</span>}</div>)}</div>{!props.environments.some((row) => row.name.toLowerCase() === "production") && <button className="button secondary" disabled={busy} onClick={() => void createProductionEnvironment()}><Plus size={15} /> Add production environment</button>}</section>
      <section className="panel"><div className="panel-heading"><div><h3>{project.name} · {environment.name}</h3><p>Client-safe environment configuration</p></div><ShieldCheck size={18} /></div><div className="connection-row"><span>Public environment identifier</span><code>{publicId || "Not returned by API"}</code></div><div className="connection-row"><span>Environment ID</span><code>{environment.id}</code></div><label className="json-label">Configuration draft (JSON)<textarea className="json-editor" spellCheck={false} value={raw} onChange={(event) => setRaw(event.target.value)} /></label><div className="small-note">Edit catalog, progression and leaderboard definitions together. Saving does not affect live players until you publish.</div></section>
      <section className="panel"><div className="panel-heading"><div><h3>Server credentials</h3><p>Issue and revoke trusted-server access. Secrets are only shown once.</p></div><KeyRound size={18} /></div><button className="button secondary" disabled={busy} onClick={() => void createCredential()}><Plus size={15} /> Create server credential</button>{createdCredential && <div className="secret-alert"><b>Copy this secret now—it will not be shown again.</b><code>{createdCredential}</code><button className="button ghost-danger" onClick={() => setCreatedCredential("")}>Dismiss</button></div>}<div className="credential-list">{credentials.map((item, index) => <div className="credential-row" key={String(item.id ?? index)}><div className="credential-icon"><KeyRound size={16} /></div><div><b>{String(item.key_prefix ?? item.prefix ?? "Server credential")}</b><small>Created {String(item.created_at ?? "recently")} · {item.revoked_at ? "revoked" : "active"}</small></div>{!item.revoked_at && <button className="button ghost-danger" onClick={() => void run(async () => { await api(`/v1/credentials/${String(item.id)}/revoke`, "POST", { token }); setCredentials(credentials.map((row, i) => i === index ? { ...row, revoked_at: new Date().toISOString() } : row)); })}>Revoke</button>}</div>)}</div></section>
    </>
  );
}

function DataTable({ columns, rows, empty }: { columns: string[]; rows: string[][]; empty: string }) {
  return rows.length ? <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : <p className="empty-text">{empty}</p>;
}

export default App;
