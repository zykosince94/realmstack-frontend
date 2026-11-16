import { useState } from "react";
import { Check, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { authHeaders, client, unwrap } from "../../api/client";
import { useWorkspace } from "../../app/workspace";
import { PageTitle, Panel } from "../../components/ui";

type Profile = { id: string; email?: string; display_name?: string };

export function Players() {
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
      <PageTitle eyebrow="PLAYER IDENTITY" title="Players" description="Register and sign in players using the public project identifier. Player tokens can only access their own data." />
      <div className="two-column">
        <Panel title="Player sign-in" subtitle="For the local sample client flow." icon={<UserRound size={18} />}>
          <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void playerAuth("register"); }}>
            <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
            <label>Email<input type="email" value={playerEmail} onChange={(event) => setPlayerEmail(event.target.value)} required /></label>
            <label>Password<input type="password" value={playerPassword} onChange={(event) => setPlayerPassword(event.target.value)} minLength={8} required /></label>
            <div className="button-row"><button className="button primary" disabled={w.busy}>Register player</button><button type="button" className="button secondary" disabled={w.busy} onClick={() => void playerAuth("login")}>Sign in existing</button></div>
          </form>
        </Panel>
        <Panel title="Authenticated player" subtitle="Short-lived access token session." icon={<ShieldCheck size={18} />}>
          {w.demoPlayerToken ? <>
            <div className="player-profile"><div className="avatar big">{name.slice(0, 1).toUpperCase()}</div><div><b>{name}</b><small>{profile?.email ?? playerEmail}</small></div><span className="verified"><Check size={13} /> authenticated</span></div>
            <div className="token-display"><span>PLAYER ID · ACCESS TOKEN</span><code>{w.demoPlayerId || "ID pending"}<br />{w.demoPlayerToken.slice(0, 20)}••••••••••••</code></div>
            <div className="button-row"><button className="button secondary" onClick={() => void loadProfile()}>Refresh profile <RefreshCw size={14} /></button><button className="button ghost-danger" onClick={() => { w.setDemoPlayerToken(""); w.setDemoPlayerId(""); setProfile(null); }}>Sign out player</button></div>
          </> : <div className="empty-inline"><UserRound size={21} /><p>Register a player to view their authenticated profile.</p></div>}
        </Panel>
      </div>
    </>
  );
}
