import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Award, Boxes, Flag, Gamepad2, Gauge, LogOut, Plus, ScrollText, ShieldCheck, Trophy, Users, Wallet } from "lucide-react";
import { authHeaders, client, unwrap } from "../api/client";
import { describeError, isExpiredSession } from "../api/errors";
import type { Environment, Project } from "../api/types";
import { NoticeView } from "../components/ui";
import { keys } from "../hooks/queries";
import { WorkspaceContext, type Notice, type Workspace } from "./workspace";
import { LoginScreen } from "../features/auth/LoginScreen";
import { CreateProjectModal, ProjectsEmpty } from "../features/projects/Projects";
import { Overview } from "../features/overview/Overview";
import { Players } from "../features/players/Players";
import { Economy } from "../features/economy/Economy";
import { Progression } from "../features/progression/Progression";
import { Leaderboards } from "../features/leaderboards/Leaderboards";
import { StatsScreen } from "../features/stats/StatsScreen";
import { Achievements } from "../features/achievements/Achievements";
import { Settings } from "../features/settings/Settings";

// The quest editor pulls in React Flow, dagre and dnd-kit; load it only when opened.
const QuestsScreen = lazy(() => import("../features/quests/QuestsScreen"));

const screens = [
  { id: "overview", label: "Overview", icon: Gauge, view: Overview },
  { id: "players", label: "Players", icon: Users, view: Players },
  { id: "economy", label: "Inventory & economy", icon: Wallet, view: Economy },
  { id: "progression", label: "Progression", icon: Activity, view: Progression },
  { id: "leaderboards", label: "Leaderboards", icon: Trophy, view: Leaderboards },
  { id: "stats", label: "Stats & flags", icon: Flag, view: StatsScreen },
  { id: "achievements", label: "Achievements", icon: Award, view: Achievements },
  { id: "quests", label: "Quests", icon: ScrollText, view: QuestsScreen },
  { id: "settings", label: "Project settings", icon: ShieldCheck, view: Settings },
] as const;
type Screen = (typeof screens)[number]["id"];

type User = { id: string; email: string };

export function App() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [projectId, setProjectId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [screen, setScreen] = useState<Screen>("overview");
  const [demoPlayerId, setDemoPlayerId] = useState("");
  const [demoPlayerToken, setDemoPlayerToken] = useState("");
  const [serverCredential, setServerCredential] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

  const signOut = useCallback((message?: string) => {
    setToken("");
    setUser(null);
    setProjectId("");
    setEnvironmentId("");
    setDemoPlayerId("");
    setDemoPlayerToken("");
    setServerCredential("");
    setScreen("overview");
    queryClient.clear();
    setNotice(message ? { kind: "error", message } : null);
  }, [queryClient]);

  // A 401 for the dashboard token means the session expired: return to sign-in instead
  // of leaving the user on a page where every action fails. Player-token 401s are normal errors.
  const reportError = useCallback((error: unknown, fallback: string) => {
    if (isExpiredSession(error, token)) {
      signOut("Your session expired. Please sign in again.");
      return;
    }
    setNotice({ kind: "error", message: describeError(error, fallback) });
  }, [token, signOut]);

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await work();
    } catch (error) {
      reportError(error, "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [reportError]);

  const projectsQuery = useQuery({
    queryKey: keys.projects(token),
    enabled: token !== "",
    queryFn: () => unwrap(client.GET("/v1/projects", { headers: authHeaders({ token }) }), token),
  });
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const project = projects.find((row) => row.id === projectId) ?? projects[0] ?? null;

  const environmentsQuery = useQuery({
    queryKey: keys.environments(token, project?.id ?? ""),
    enabled: token !== "" && project !== null,
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments", { params: { path: { projectId: project!.id } }, headers: authHeaders({ token }) }), token),
  });
  const environments = useMemo(() => environmentsQuery.data ?? [], [environmentsQuery.data]);
  const environment = environments.find((row) => row.id === environmentId) ?? environments[0] ?? null;

  useEffect(() => {
    if (projectsQuery.error) reportError(projectsQuery.error, "Could not load projects.");
  }, [projectsQuery.error, reportError]);
  useEffect(() => {
    if (environmentsQuery.error) reportError(environmentsQuery.error, "Could not load environments.");
  }, [environmentsQuery.error, reportError]);

  // The demo player and server credential belong to one environment.
  useEffect(() => {
    setDemoPlayerId("");
    setDemoPlayerToken("");
    setServerCredential("");
  }, [project?.id, environment?.id]);

  const selectProject = useCallback((next: Project) => {
    queryClient.setQueryData(keys.projects(token), (rows: Project[] | undefined) => (rows ?? []).some((row) => row.id === next.id) ? (rows ?? []).map((row) => row.id === next.id ? { ...row, ...next } : row) : [...(rows ?? []), next]);
    setProjectId(next.id);
  }, [queryClient, token]);

  const setEnvironments = useCallback((rows: Environment[]) => {
    if (project) queryClient.setQueryData(keys.environments(token, project.id), rows);
  }, [queryClient, token, project]);

  const workspace = useMemo<Workspace | null>(() => project && environment ? {
    token, project, environment, environments, setProject: selectProject, setEnvironments,
    onProjectArchived: () => void run(async () => {
      setProjectId("");
      await queryClient.invalidateQueries({ queryKey: keys.projects(token) });
      setNotice({ kind: "success", message: "Project archived. Its data is kept and its runtime APIs are stopped." });
    }),
    demoPlayerId, setDemoPlayerId, demoPlayerToken, setDemoPlayerToken, serverCredential, setServerCredential,
    busy, run, notify: setNotice, reportError,
  } : null, [token, project, environment, environments, selectProject, setEnvironments, run, queryClient, demoPlayerId, demoPlayerToken, serverCredential, busy, reportError]);

  async function authenticate(mode: "login" | "register", email: string, password: string) {
    await run(async () => {
      const session = await unwrap(mode === "login"
        ? client.POST("/v1/auth/login", { body: { email, password } })
        : client.POST("/v1/auth/register", { body: { email, password } }));
      setToken(session.access_token);
      setUser(session.user);
      setNotice({ kind: "success", message: mode === "login" ? "Welcome back." : "Account created." });
    });
  }

  if (!token) return <LoginScreen busy={busy} notice={notice} onAuthenticate={authenticate} />;

  const email = user?.email ?? "";
  const Active = screens.find((row) => row.id === screen)!.view;
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
          <div className="user-card"><div className="avatar">{email.slice(0, 1).toUpperCase()}</div><div className="user-meta"><b>{email}</b><small>Workspace owner</small></div><button className="icon-button" title="Sign out" onClick={() => signOut()}><LogOut size={16} /></button></div>
          <div className="version">REALMSTACK <span>•</span> DEVELOPER CONSOLE</div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="crumb"><span>Projects</span><span className="slash">/</span><b>{project?.name ?? "Select a project"}</b></div>
          <div className="top-actions">
            {project && <button className="button secondary" onClick={() => setCreatingProject(true)}><Plus size={14} /> New project</button>}
            {projects.length > 0 && <select aria-label="Project" value={project?.id ?? ""} onChange={(event) => setProjectId(event.target.value)}>{projects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>}
            {environments.length > 0 && <select aria-label="Environment" value={environment?.id ?? ""} onChange={(event) => setEnvironmentId(event.target.value)}>{environments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>}
            <button className="icon-button top-avatar" title="Sign out" onClick={() => signOut()}>{email.slice(0, 1).toUpperCase()}</button>
          </div>
        </header>
        {creatingProject && <CreateProjectModal token={token} busy={busy} run={run} onClose={() => setCreatingProject(false)} onCreated={(created) => { selectProject(created); setCreatingProject(false); }} />}
        <div className="content">
          {notice && <NoticeView notice={notice} />}
          {projectsQuery.isPending ? <p className="empty-text">Loading projects…</p>
            : !project ? <ProjectsEmpty token={token} busy={busy} run={run} onCreated={selectProject} />
            : !environment ? (environmentsQuery.isPending ? <p className="empty-text">Loading environments…</p>
              : <div className="empty-card"><div className="empty-icon"><Boxes /></div><h2>Choose an environment</h2><p>This project does not have an environment yet.</p><button className="button primary" disabled={busy} onClick={() => void run(async () => { const created = await unwrap(client.POST("/v1/projects/{projectId}/environments", { params: { path: { projectId: project.id } }, body: { name: "development" }, headers: authHeaders({ token }) }), token); setEnvironments([created]); setEnvironmentId(created.id); })}><Plus size={16} /> Create development environment</button></div>)
            : <WorkspaceContext.Provider value={workspace}><Suspense fallback={<p className="empty-text">Loading…</p>}><Active /></Suspense></WorkspaceContext.Provider>}
        </div>
      </main>
    </div>
  );
}

export default App;
