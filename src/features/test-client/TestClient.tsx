import { useState } from "react";
import { Check, FlaskConical, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { authHeaders, client, unwrap } from "../../api/client";
import { useWorkspace } from "../../app/workspace";
import { PageTitle, Panel } from "../../components/ui";

type Profile = { id: string; email?: string; display_name?: string };

/**
 * The test client stands in for your game while you build. It signs in a test player
 * the way a game client does (public environment ID, email, password), which is how you
 * create a player to manage. Players never use the dashboard, so everything you do to a
 * player (grants, balances, XP, scores, stats, claims, quests) is in Players, which needs
 * no player password.
 */
export function TestClient() {
  const w = useWorkspace();
  const [playerEmail, setPlayerEmail] = useState("player1@example.test");
  const [playerPassword, setPlayerPassword] = useState("PlayerDemo123!");
  const [displayName, setDisplayName] = useState("Rookie Pilot");
  const [profile, setProfile] = useState<Profile | null>(null);
  const publicEnvironmentId = w.environment.public_id;

  async function playerAuth(kind: "register" | "login") {
    await w.run(async () => {
      const credentials = { public_environment_id: publicEnvironmentId, email: playerEmail, password: playerPassword };
      const session = await unwrap(kind === "register"
        ? client.POST("/v1/players/register", { body: { ...credentials, display_name: displayName } })
        : client.POST("/v1/players/login", { body: credentials }));
      w.setDemoPlayerToken(session.access_token);
      w.setDemoPlayerId(session.player.id);
      setProfile({ ...session.player, email: session.player.email ?? playerEmail });
      w.notify({ kind: "success", message: kind === "register" ? "Player registered and signed in." : "Player signed in." });
    });
  }

  async function loadProfile() {
    await w.run(async () => setProfile(await unwrap(client.GET("/v1/players/me", { headers: authHeaders({ token: w.demoPlayerToken }) }), w.demoPlayerToken)));
  }

  const name = profile?.display_name ?? "Player";
  return (
    <>
      <PageTitle eyebrow="DEVELOPMENT TOOL" title="Test client" description="Act as your game while you build: sign in a test player exactly as a game client would, with the public environment ID. Registering here creates a player you can then find and manage in Players, where every player-side action lives." />
      <div className="warning-note test-client-note"><FlaskConical size={15} /><span>This simulates a game client in the browser. A real game signs players in itself, and server credentials never reach a browser.</span></div>
      <div className="two-column">
        <Panel title="Test player sign-in" subtitle="Register or sign in a player with the public environment ID." icon={<UserRound size={18} />}>
          <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void playerAuth("register"); }}>
            <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
            <label>Email<input type="email" value={playerEmail} onChange={(event) => setPlayerEmail(event.target.value)} required /></label>
            <label>Password<input type="password" value={playerPassword} onChange={(event) => setPlayerPassword(event.target.value)} minLength={8} required /></label>
            <div className="button-row"><button className="button primary" disabled={w.busy}>Register player</button><button type="button" className="button secondary" disabled={w.busy} onClick={() => void playerAuth("login")}>Sign in existing</button></div>
          </form>
        </Panel>
        <Panel title="Signed-in test player" subtitle="Short-lived player access token, used by the other screens." icon={<ShieldCheck size={18} />}>
          {w.demoPlayerToken ? <>
            <div className="player-profile"><div className="avatar big">{name.slice(0, 1).toUpperCase()}</div><div><b>{name}</b><small>{profile?.email ?? playerEmail}</small></div><span className="verified"><Check size={13} /> authenticated</span></div>
            <div className="token-display"><span>PLAYER ID · ACCESS TOKEN</span><code>{w.demoPlayerId || "ID pending"}<br />{w.demoPlayerToken.slice(0, 20)}••••••••••••</code></div>
            <div className="button-row"><button className="button secondary" onClick={() => void loadProfile()}>Refresh profile <RefreshCw size={14} /></button><button className="button ghost-danger" onClick={() => { w.setDemoPlayerToken(""); w.setDemoPlayerId(""); setProfile(null); }}>Sign out player</button></div>
          </> : <div className="empty-inline"><UserRound size={21} /><p>Register or sign in a test player to try the player-facing APIs.</p></div>}
        </Panel>
      </div>
    </>
  );
}
