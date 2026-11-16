import { useState } from "react";
import { ArrowUpRight, Gauge, RefreshCw, Trophy } from "lucide-react";
import { authHeaders, client, idempotencyKey, unwrap } from "../../api/client";
import type { LeaderboardEntry } from "../../api/types";
import { useWorkspace } from "../../app/workspace";
import { DataTable, NotPublished, PageTitle, Panel } from "../../components/ui";
import { useInvalidate, usePublished } from "../../hooks/queries";
import { keysOf, pickKey } from "../../lib/config";

export function Leaderboards() {
  const w = useWorkspace();
  const invalidate = useInvalidate();
  const published = usePublished().data;
  const boards = published?.config?.leaderboards ?? [];
  const [choice, setChoice] = useState("");
  const key = pickKey(choice, keysOf(boards));
  const [score, setScore] = useState(18450);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const leaderboard = boards.find((row) => row.key === key);

  const loadBoard = async () => {
    const view = await unwrap(client.GET("/v1/leaderboards/{key}", { params: { path: { key }, query: { environment_id: w.environment.public_id, limit: 10 } } }));
    setEntries(view.entries);
  };
  async function submitScore() {
    await w.run(async () => {
      await unwrap(client.POST("/v1/leaderboards/{key}/scores", { headers: authHeaders({ token: w.demoPlayerToken }), params: { path: { key }, header: { "Idempotency-Key": idempotencyKey() } }, body: { score } }), w.demoPlayerToken);
      await loadBoard();
      await invalidate.player();
      w.notify({ kind: "success", message: "Score submitted. The leaderboard keeps the player's best score." });
    });
  }
  return (
    <>
      <PageTitle eyebrow="COMPETITIVE LEADERBOARDS" title="Leaderboards" description="PostgreSQL is the source of truth. Rankings are computed deterministically with each player's best score and earliest-best tie break." />
      {published && !published.version ? <section className="panel"><NotPublished /></section> : <>
        <div className="two-column">
          <Panel title="Submit a score" subtitle="Player access token required. Demo only; not anti-cheat." icon={<Trophy size={18} />}>
            <div className="stack-form">
              <label>Leaderboard<select aria-label="Leaderboard" value={key} onChange={(event) => setChoice(event.target.value)}>{boards.map((board) => <option key={board.key} value={board.key}>{board.key}</option>)}</select></label>
              <label>Player access token<input type="password" value={w.demoPlayerToken} readOnly placeholder="Sign in as a player in Players" /></label>
              <label>Score<input type="number" value={score} onChange={(event) => setScore(Number(event.target.value))} /></label>
              <button className="button primary" disabled={w.busy || !w.demoPlayerToken || !key} onClick={() => void submitScore()}>Submit score <ArrowUpRight size={15} /></button>
            </div>
          </Panel>
          <Panel title="Leaderboard definition" subtitle={published ? `${boards.length} live leaderboard(s)` : "Loading…"} icon={<Gauge size={18} />}>
            {leaderboard ? <div className="definition-list"><div><span>Key</span><b>{leaderboard.key}</b></div><div><span>Direction</span><b>{leaderboard.direction}-is-better</b></div><div><span>Tie-break</span><b>Earliest best score</b></div><div><span>Season</span><b>{leaderboard.season_start || leaderboard.season_end ? "Seasonal" : "All time"}</b></div></div> : <p className="empty-text">No leaderboard is published.</p>}
            <button className="button secondary" disabled={w.busy || !key} onClick={() => void w.run(loadBoard)}><RefreshCw size={15} /> Load top scores</button>
          </Panel>
        </div>
        <Panel title="Top players" subtitle={`Current environment · ${key || "no leaderboard selected"}`} icon={<Trophy size={18} />}><DataTable columns={["Rank", "Player", "Best score", "Achieved"]} rows={entries.map((row) => [String(row.rank), row.display_name, String(row.score), row.submitted_at])} empty="Load the leaderboard to view top scores." /></Panel>
      </>}
    </>
  );
}
