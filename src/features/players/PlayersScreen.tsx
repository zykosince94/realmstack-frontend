import { useEffect, useState } from "react";
import { Award, Coins, HardDrive, Package, ScrollText, Search, ShieldBan, Sparkles, TrendingUp, UserRound, Users, Wallet } from "lucide-react";
import type { PlayerSummary } from "../../api/types";
import { useWorkspace } from "../../app/workspace";
import { PageTitle, Panel } from "../../components/ui";
import { useAdminPlayerCurrency, useAdminPlayerProfile, useAdminPlayerProgression, usePlayerDirectory } from "../../hooks/queries";
import { AchievementsTab, EconomyTab, InventoryTab, ModerationTab, ProgressTab, QuestsTab, SavesTab, StatsTab } from "./PlayerTabs";

const dateTime = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : "Never");
const date = (value: string) => new Date(value).toLocaleDateString();

/**
 * Players: the environment's players and everything you can do for one of them. Players
 * never use the dashboard, so this is where the player side of every feature lives: you
 * read the same data the game does and perform the same actions (grants, balances, XP,
 * scores, stats, claims, quests) through admin routes scoped to the environment you own.
 * Nothing needs a player's password or token; the Test client is only for simulating a
 * game.
 */
export function PlayersScreen() {
  const w = useWorkspace();
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [bannedOnly, setBannedOnly] = useState(false);
  // Search after a short pause, not on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(typed.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [typed]);
  // A different environment has different players.
  useEffect(() => setSelected(null), [w.environment.id]);

  const directory = usePlayerDirectory(search, bannedOnly);
  const players = directory.data?.pages.flatMap((page) => page.rows) ?? [];

  return (
    <>
      <PageTitle eyebrow="PLAYER SUPPORT" title="Players" description="Look up the players of this environment, see what the game knows about them and manage them: grant items and currency, award XP, submit scores, adjust stats and flags, claim achievements, run quests, repair cloud saves and ban or unban them." />
      <div className="players-layout">
        <Panel title="Directory" subtitle={`Players in ${w.environment.name}, newest first.`} icon={<Users size={18} />} className="players-directory">
          <label className="search-field"><span className="sr-only">Search players</span>
            <Search size={15} aria-hidden="true" />
            <input type="search" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="Name, email, external key or player ID" aria-label="Search players" />
          </label>
          <label className="checkbox"><input type="checkbox" checked={bannedOnly} onChange={(event) => setBannedOnly(event.target.checked)} /> Banned players only</label>
          {directory.isPending ? <p className="empty-text">Loading players…</p>
            : directory.isError ? <p className="empty-text">Players could not be loaded.</p>
            : players.length === 0 ? <p className="empty-text">{search ? `No players match “${search}”.` : bannedOnly ? "No player is banned." : "No players have signed up in this environment yet."}</p>
            : (
              <ul className="player-list" aria-label="Players">
                {players.map((p) => <PlayerRow key={p.id} player={p} selected={p.id === selected} onSelect={() => setSelected(p.id)} />)}
              </ul>
            )}
          {directory.hasNextPage && (
            <button className="button secondary wide" disabled={directory.isFetchingNextPage} onClick={() => void directory.fetchNextPage()}>
              {directory.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          )}
        </Panel>
        <div className="players-detail">
          {selected ? <PlayerDetail key={selected} playerId={selected} /> : (
            <section className="panel player-placeholder" aria-label="Player details">
              <UserRound size={22} />
              <h3>Select a player</h3>
              <p>Pick someone from the directory to see their profile and manage their inventory, balances, progress, stats, achievements and quests.</p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function PlayerRow({ player: p, selected, onSelect }: { player: PlayerSummary; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button className={`player-row ${selected ? "selected" : ""}`} onClick={onSelect} aria-current={selected || undefined}>
        <span className="avatar">{p.display_name.slice(0, 1).toUpperCase()}</span>
        <span className="player-row-main"><b>{p.display_name}</b><small>{p.email ?? p.external_player_key ?? p.id}</small></span>
        <span className="player-row-meta"><span>{p.banned && <span className="badge negative">Banned</span>} <span className="badge">Lv {p.level}</span></span><small>{date(p.created_at)}</small></span>
      </button>
    </li>
  );
}

const tabs = [
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "economy", label: "Economy", icon: Wallet },
  { id: "progress", label: "Progress", icon: TrendingUp },
  { id: "stats", label: "Stats & flags", icon: Sparkles },
  { id: "achievements", label: "Achievements", icon: Award },
  { id: "quests", label: "Quests", icon: ScrollText },
  { id: "saves", label: "Saves", icon: HardDrive },
  { id: "moderation", label: "Moderation", icon: ShieldBan },
] as const;
type Tab = (typeof tabs)[number]["id"];

function PlayerDetail({ playerId }: { playerId: string }) {
  const profile = useAdminPlayerProfile(playerId);
  const progression = useAdminPlayerProgression(playerId);
  const currency = useAdminPlayerCurrency(playerId);
  const [tab, setTab] = useState<Tab>("inventory");
  const p = profile.data;
  if (profile.isPending) return <section className="panel"><p className="empty-text">Loading player…</p></section>;
  if (!p) return <section className="panel"><p className="empty-text">This player could not be loaded.</p></section>;
  const prog = progression.data;
  const next = prog?.thresholds?.find((t) => t > prog.total_xp);
  return (
    <section className="panel player-detail" aria-label={`Player ${p.display_name}`}>
      <div className="player-head">
        <span className="avatar big">{p.display_name.slice(0, 1).toUpperCase()}</span>
        <div className="player-head-main">
          <h3>{p.display_name}</h3>
          <p>{p.email ?? "No email"}{p.external_player_key && <> · external key <code>{p.external_player_key}</code></>}</p>
          <code className="player-id">{p.id}</code>
        </div>
      </div>
      {p.ban && (
        <p className="ban-banner" role="status">
          <ShieldBan size={15} aria-hidden="true" />
          <span><b>Banned {p.ban.expires_at ? `until ${dateTime(p.ban.expires_at)}` : "permanently"}.</b> {p.ban.reason}</span>
        </p>
      )}
      <dl className="player-facts">
        <div><dt>Joined</dt><dd>{dateTime(p.created_at)}</dd></div>
        <div><dt>Last session</dt><dd>{dateTime(p.last_session_at)}</dd></div>
        <div><dt>Active sessions</dt><dd>{p.active_sessions}</dd></div>
      </dl>
      <div className="player-tiles">
        <div className="player-tile"><small>Level</small><b>{prog?.level ?? "–"}</b><span>{prog ? `${prog.total_xp.toLocaleString()} XP${next ? ` · ${(next - prog.total_xp).toLocaleString()} to next` : ""}` : "…"}</span></div>
        {(currency.data ?? []).map((c) => <div className="player-tile" key={c.currency_key}><small><Coins size={12} /> {c.name}</small><b>{c.balance.toLocaleString()}</b><span><code>{c.currency_key}</code></span></div>)}
      </div>
      {Object.keys(p.metadata ?? {}).length > 0 && <details className="generation-json"><summary>Profile metadata</summary><pre>{JSON.stringify(p.metadata, null, 2)}</pre></details>}
      <div className="player-tabs" role="tablist" aria-label="Player data">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`player-tab ${tab === id ? "selected" : ""}`} onClick={() => setTab(id)}><Icon size={14} /> {label}</button>
        ))}
      </div>
      <div role="tabpanel" className="player-tabpanel">
        {tab === "inventory" && <InventoryTab playerId={playerId} />}
        {tab === "economy" && <EconomyTab playerId={playerId} />}
        {tab === "progress" && <ProgressTab playerId={playerId} />}
        {tab === "stats" && <StatsTab playerId={playerId} />}
        {tab === "achievements" && <AchievementsTab playerId={playerId} />}
        {tab === "quests" && <QuestsTab playerId={playerId} />}
        {tab === "saves" && <SavesTab playerId={playerId} />}
        {tab === "moderation" && <ModerationTab playerId={playerId} ban={p.ban} />}
      </div>
    </section>
  );
}
