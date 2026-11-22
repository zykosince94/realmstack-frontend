import { useState } from "react";
import { Activity, ArrowUpRight, Award, BookOpen, Coins, Flag, HardDrive, Info, Layers, Package, ScrollText, ShieldBan, Sparkles, TrendingUp, Trophy, UserRound } from "lucide-react";
import type { Notice } from "../../app/workspace";
import { AppFooter, NoticeView } from "../../components/ui";
import { BrandGlyph, BrandLogo } from "../../components/Brand";

// Written inline (not via a helper) so production builds can drop the demo credentials entirely.
// Two seeded dashboard accounts: one with the demo project, one with a clean workspace.
const DEMO_LOGIN = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === "true"
  ? {
      password: "RealmStackLocal!2026",
      accounts: [
        { email: "admin@realmstack.local", note: "the demo project, with players, quests and activity" },
        { email: "admin", note: "a clean workspace with no projects" },
      ],
    }
  : null;

/** Every feature, one line each (shown beside the sign-in form). */
const features = [
  { icon: Layers, title: "Multi-tenant", text: "every game is a project, every environment isolated" },
  { icon: UserRound, title: "Player identity", text: "sign-in with rotating, reuse-detecting sessions" },
  { icon: Package, title: "Inventory", text: "stackable items and equipment slots" },
  { icon: Coins, title: "Virtual economy", text: "currencies that never overspend, with an append-only ledger" },
  { icon: TrendingUp, title: "Progression", text: "versioned XP curves, pinned per player" },
  { icon: Trophy, title: "Leaderboards", text: "seasonal boards ranked by best score" },
  { icon: Flag, title: "Stats & flags", text: "game-world counters and facts reported by your server" },
  { icon: Award, title: "Achievements", text: "passive goals whose rewards pay exactly once" },
  { icon: ScrollText, title: "Quests", text: "staged, chained and daily quests in a visual editor" },
  { icon: HardDrive, title: "Cloud saves", text: "versioned save slots that never overwrite silently" },
  { icon: ShieldBan, title: "Player management", text: "look players up, act for them, ban and unban" },
  { icon: Activity, title: "Live activity", text: "concurrent and daily active players at a glance" },
  { icon: Sparkles, title: "AI assistant", text: "bring your own key; it drafts, you publish" },
] as const;

export function LoginScreen({ busy, notice, onDismiss, onAuthenticate, onOpenDocs }: {
  busy: boolean;
  notice: Notice | null;
  onDismiss: () => void;
  onAuthenticate: (email: string, password: string) => Promise<void>;
  onOpenDocs: () => void;
}) {
  const [email, setEmail] = useState(DEMO_LOGIN?.accounts[0].email ?? "");
  const [password, setPassword] = useState(DEMO_LOGIN?.password ?? "");
  return (
    <div className="login-shell">
      <div className="login-art">
        <div className="brand"><BrandLogo size={36} /> REALMSTACK</div>
        {/* The mark as a large, faint background: the sign-in page's version of the corner watermark. */}
        <div className="login-art-mark" aria-hidden="true"><BrandGlyph size={460} /></div>
        <div className="login-message">
          <div className="eyebrow">GAME BACKEND FOR PLAYERS, ECONOMY AND PROGRESSION</div>
          <h1>Build the game.<br /><span>We’ll keep it running.</span></h1>
          <p className="login-lead">Everything a live game needs from its backend, behind one API. You configure the rules; RealmStack enforces them on every request.</p>
          <ul className="login-features" aria-label="Features">
            {features.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="login-feature-icon"><Icon size={16} /></span>
                <span><b>{title}</b> <span className="login-feature-text">— {text}</span></span>
              </li>
            ))}
          </ul>
          <button type="button" className="button primary login-docs-button" onClick={onOpenDocs}>
            <BookOpen size={18} aria-hidden="true" /> Read the documentation
          </button>
        </div>
      </div>
      <div className="login-panel">
        <div className="mobile-brand"><BrandLogo size={32} /> REALMSTACK</div>
        <div className="login-card">
          <div className="eyebrow">WELCOME BACK</div>
          <h2>Sign in</h2>
          <p className="subtle">Manage your games' players, economy and progression.</p>
          <form onSubmit={(event) => { event.preventDefault(); void onAuthenticate(email, password); }}>
            {/* Text, not type="email": the clean-workspace demo account is the username "admin". */}
            <label>Email or username<input type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="button primary wide" disabled={busy}>{busy ? "Please wait…" : "Sign in"} <ArrowUpRight size={18} /></button>
          </form>
          {/* The left feature panel is hidden on phones, so keep the docs entry point here. */}
          <button type="button" className="button secondary wide login-docs-mobile" onClick={onOpenDocs}>
            <BookOpen size={17} aria-hidden="true" /> Documentation
          </button>
          {DEMO_LOGIN && (
            <div className="demo-hint"><Info size={17} />
              <div>
                <span>Local demo accounts, both with the password <b>{DEMO_LOGIN.password}</b>:</span>
                <ul className="demo-accounts">
                  {DEMO_LOGIN.accounts.map((account) => (
                    <li key={account.email}>
                      <button type="button" className="demo-account" aria-label={`Use ${account.email}`} onClick={() => { setEmail(account.email); setPassword(DEMO_LOGIN.password); }}>
                        <b>{account.email}</b>
                      </button>
                      <span>{account.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {notice && <NoticeView notice={notice} onDismiss={onDismiss} />}
        </div>
      </div>
      {/* The credits line sits at the bottom-left of the art panel (below the form on phones). */}
      <AppFooter />
    </div>
  );
}
