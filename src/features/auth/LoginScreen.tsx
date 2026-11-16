import { useState } from "react";
import { Activity, ArrowUpRight, CircleHelp, Gamepad2, Rocket, ShieldCheck } from "lucide-react";
import type { Notice } from "../../app/workspace";
import { NoticeView } from "../../components/ui";

// Written inline (not via a helper) so production builds can drop the demo credentials entirely.
const DEMO_LOGIN = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === "true"
  ? { email: "admin@realmstack.local", password: "RealmStackLocal!2026" }
  : null;

export function LoginScreen({ busy, notice, onAuthenticate }: {
  busy: boolean;
  notice: Notice | null;
  onAuthenticate: (mode: "login" | "register", email: string, password: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState(DEMO_LOGIN?.email ?? "");
  const [password, setPassword] = useState(DEMO_LOGIN?.password ?? "");
  return (
    <div className="login-shell">
      <div className="login-art">
        <div className="brand"><span className="brand-mark"><Gamepad2 size={19} /></span> REALMSTACK</div>
        <div className="login-message">
          <div className="eyebrow">GAME BACKEND, WITHOUT THE BOILERPLATE</div>
          <h1>Build the game.<br /><span>We’ll keep it running.</span></h1>
          <p>One workspace for player identity, inventory, economy, progression, leaderboards and achievements.</p>
          <div className="feature-pills"><span><ShieldCheck size={15} /> Tenant-safe</span><span><Activity size={15} /> Transactional</span><span><Rocket size={15} /> API-first</span></div>
        </div>
        <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
        <div className="login-footer">RealmStack Developer Console <span>•</span> Local MVP</div>
      </div>
      <div className="login-panel">
        <div className="mobile-brand"><span className="brand-mark"><Gamepad2 size={19} /></span> REALMSTACK</div>
        <div className="login-card">
          <div className="eyebrow">{mode === "login" ? "WELCOME BACK" : "GET STARTED"}</div>
          <h2>{mode === "login" ? "Sign in to your workspace" : "Create your workspace account"}</h2>
          <p className="subtle">Use your dashboard account to manage projects and game services.</p>
          <form onSubmit={(event) => { event.preventDefault(); void onAuthenticate(mode, email, password); }}>
            <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === "register" ? 10 : 1} /></label>
            <button className="button primary wide" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"} <ArrowUpRight size={16} /></button>
          </form>
          <div className="mode-toggle">{mode === "login" ? "New to RealmStack?" : "Already have an account?"} <button onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Create account" : "Sign in"}</button></div>
          {mode === "login" && DEMO_LOGIN && <div className="demo-hint"><CircleHelp size={15} /><span>Demo login: <b>{DEMO_LOGIN.email}</b><br />Password: <b>{DEMO_LOGIN.password}</b> (local seed)</span></div>}
          {notice && <NoticeView notice={notice} />}
        </div>
      </div>
    </div>
  );
}
