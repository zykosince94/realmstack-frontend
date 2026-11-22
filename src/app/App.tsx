import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Award, Boxes, Flag, FlaskConical, Gamepad2, LayoutDashboard, LogOut, Plus, ScrollText, ShieldCheck, Sparkles, Trophy, Users, Wallet } from "lucide-react";
import { authHeaders, client, unwrap } from "../api/client";
import { describeError, isExpiredSession } from "../api/errors";
import type { Environment, Project } from "../api/types";
import { AppFooter, NoticeView } from "../components/ui";
import { keys } from "../hooks/queries";
import { WorkspaceContext, type Notice, type ScreenId, type Workspace } from "./workspace";
import { LoginScreen } from "../features/auth/LoginScreen";
import { CreateProjectModal, ProjectsEmpty } from "../features/projects/Projects";
import { Dashboard } from "../features/dashboard/Dashboard";
import { PlayersScreen } from "../features/players/PlayersScreen";
import { TestClient } from "../features/test-client/TestClient";
import { Economy } from "../features/economy/Economy";
import { Progression } from "../features/progression/Progression";
import { Leaderboards } from "../features/leaderboards/Leaderboards";
import { StatsScreen } from "../features/stats/StatsScreen";
import { Achievements } from "../features/achievements/Achievements";
import { Settings } from "../features/settings/Settings";

// The quest editor pulls in React Flow, dagre and dnd-kit; load it only when opened.
const QuestsScreen = lazy(() => import("../features/quests/QuestsScreen"));
// AI is optional; its screen is loaded only when opened.
const AIAssistant = lazy(() => import("../features/ai-config/AIAssistant"));

const screens = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, view: Dashboard },
  { id: "players", label: "Players", icon: Users, view: PlayersScreen },
  { id: "economy", label: "Inventory & economy", icon: Wallet, view: Economy },
  { id: "progression", label: "Progression", icon: Activity, view: Progression },
  { id: "leaderboards", label: "Leaderboards", icon: Trophy, view: Leaderboards },
  { id: "stats", label: "Stats & flags", icon: Flag, view: StatsScreen },
  { id: "achievements", label: "Achievements", icon: Award, view: Achievements },
  { id: "quests", label: "Quests", icon: ScrollText, view: QuestsScreen },
  { id: "ai", label: "AI assistant", icon: Sparkles, view: AIAssistant },
  // Simulates a game client and game server while you build; real players are under Players.
  { id: "client", label: "Test client", icon: FlaskConical, view: TestClient },
  { id: "settings", label: "Project settings", icon: ShieldCheck, view: Settings },
] as const;
type Screen = ScreenId;
// Every screen in the list must be a ScreenId, and every ScreenId must be listed.
const screensMatch: (typeof screens)[number]["id"] extends ScreenId ? (ScreenId extends (typeof screens)[number]["id"] ? true : never) : never = true;
void screensMatch;

type User = { id: string; email: string };
type Session = { access_token: string; user: User; expires_in?: number };

// Which screen, project and environment were open, so a reload returns to them. Tab-scoped
// (sessionStorage) and best-effort: storage can be unavailable, and then the defaults apply.
const uiStateKey = "realmstack.ui";
type UIState = { screen?: string; projectId?: string; environmentId?: string };
function readUIState(): UIState {
  try { return JSON.parse(sessionStorage.getItem(uiStateKey) ?? "{}") as UIState; } catch { return {}; }
}
function writeUIState(state: UIState) {
  try { sessionStorage.setItem(uiStateKey, JSON.stringify(state)); } catch { /* storage unavailable */ }
}
const isScreen = (id: unknown): id is Screen => screens.some((row) => row.id === id);

export function App() {
  const queryClient = useQueryClient();
  const [saved] = useState(readUIState);
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  // True until the first session check finishes, so a reload does not flash the sign-in form.
  const [restoring, setRestoring] = useState(true);
  const [projectId, setProjectId] = useState(saved.projectId ?? "");
  const [environmentId, setEnvironmentId] = useState(saved.environmentId ?? "");
  const [screen, setScreenState] = useState<Screen>(isScreen(saved.screen) ? saved.screen : "dashboard");
  const [demoPlayerId, setDemoPlayerId] = useState("");
  const [demoPlayerToken, setDemoPlayerToken] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

  // Switching screens clears the previous screen's notice: it described that screen.
  const setScreen = useCallback((next: Screen) => {
    setScreenState(next);
    setNotice(null);
  }, []);

  // Dashboard sessions: the access token lives in memory and expires quickly; an httpOnly
  // cookie (unreadable from here) holds a refresh token. resume() trades the cookie for a
  // new access token; it runs on load, shortly before each expiry, and once when a request
  // says the token expired.
  const refreshTimer = useRef<number | undefined>(undefined);
  const expire = useRef<(message: string) => void>(() => {});
  const startSession = useCallback((session: Session) => {
    setToken(session.access_token);
    setUser(session.user);
    window.clearTimeout(refreshTimer.current);
    const seconds = Math.max(30, (session.expires_in ?? 900) - 60);
    refreshTimer.current = window.setTimeout(() => {
      void resumeRef.current().then((ok) => { if (!ok) expire.current("Your session expired. Please sign in again."); });
    }, seconds * 1000);
  }, []);
  const resume = useCallback(async (): Promise<boolean> => {
    try {
      startSession(await unwrap(client.POST("/v1/auth/refresh", {})));
      return true;
    } catch {
      return false;
    }
  }, [startSession]);
  const resumeRef = useRef(resume);
  resumeRef.current = resume;
  useEffect(() => {
    void resume().finally(() => setRestoring(false));
    return () => window.clearTimeout(refreshTimer.current);
  }, [resume]);

  const signOut = useCallback((message?: string) => {
    window.clearTimeout(refreshTimer.current);
    // End the server-side session too; signing out locally must not depend on it.
    void client.POST("/v1/auth/logout", {}).catch(() => undefined);
    setToken("");
    setUser(null);
    setProjectId("");
    setEnvironmentId("");
    setDemoPlayerId("");
    setDemoPlayerToken("");
    setScreen("dashboard");
    queryClient.clear();
    setNotice(message ? { kind: "error", message } : null);
  }, [queryClient, setScreen]);
  expire.current = signOut;

  useEffect(() => { writeUIState({ screen, projectId, environmentId }); }, [screen, projectId, environmentId]);

  // Success notices fade after a few seconds; errors stay until dismissed or replaced.
  useEffect(() => {
    if (notice?.kind !== "success") return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // A 401 for the dashboard token means the session expired: return to sign-in instead
  // of leaving the user on a page where every action fails. Player-token 401s are normal errors.
  const reportError = useCallback((error: unknown, fallback: string) => {
    if (isExpiredSession(error, token)) {
      // Try the refresh cookie once before giving up on the session.
      void resume().then((ok) => { if (!ok) signOut("Your session expired. Please sign in again."); });
      return;
    }
    setNotice({ kind: "error", message: describeError(error, fallback) });
  }, [token, signOut, resume]);

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

  // The demo player belongs to one environment.
  useEffect(() => {
    setDemoPlayerId("");
    setDemoPlayerToken("");
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
    openScreen: setScreen,
    demoPlayerId, setDemoPlayerId, demoPlayerToken, setDemoPlayerToken,
    busy, run, notify: setNotice, reportError,
  } : null, [token, project, environment, environments, selectProject, setEnvironments, run, queryClient, demoPlayerId, demoPlayerToken, busy, reportError, setScreen]);

  async function authenticate(mode: "login" | "register", email: string, password: string) {
    await run(async () => {
      const session = await unwrap(mode === "login"
        ? client.POST("/v1/auth/login", { body: { email, password } })
        : client.POST("/v1/auth/register", { body: { email, password } }));
      startSession(session);
      setNotice({ kind: "success", message: mode === "login" ? "Welcome back." : "Account created." });
    });
  }

  if (restoring) return <div className="boot-screen" role="status"><Gamepad2 size={22} /> Restoring your session…</div>;
  if (!token) return <LoginScreen busy={busy} notice={notice} onDismiss={() => setNotice(null)} onAuthenticate={authenticate} />;

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
          {notice && <NoticeView notice={notice} onDismiss={() => setNotice(null)} />}
          {projectsQuery.isPending ? <p className="empty-text">Loading projects…</p>
            : !project ? <ProjectsEmpty token={token} busy={busy} run={run} onCreated={selectProject} />
            : !environment ? (environmentsQuery.isPending ? <p className="empty-text">Loading environments…</p>
              : <div className="empty-card"><div className="empty-icon"><Boxes /></div><h2>Choose an environment</h2><p>This project does not have an environment yet.</p><button className="button primary" disabled={busy} onClick={() => void run(async () => { const created = await unwrap(client.POST("/v1/projects/{projectId}/environments", { params: { path: { projectId: project.id } }, body: { name: "development" }, headers: authHeaders({ token }) }), token); setEnvironments([created]); setEnvironmentId(created.id); })}><Plus size={16} /> Create development environment</button></div>)
            : <WorkspaceContext.Provider value={workspace}><Suspense fallback={<p className="empty-text">Loading…</p>}><Active /></Suspense></WorkspaceContext.Provider>}
        </div>
        <AppFooter />
      </main>
    </div>
  );
}

export default App;
