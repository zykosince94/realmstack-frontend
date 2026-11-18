import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { PlayerQuest } from "../../api/types";
import { useWorkspace } from "../../app/workspace";
import {
  useAdminPlayerAchievements, useAdminPlayerCurrency, useAdminPlayerInventory, useAdminPlayerLedger, useAdminPlayerProgression,
  useAdminPlayerQuests, useAdminPlayerStats, usePublished,
} from "../../hooks/queries";
import { usePlayerActions } from "../../hooks/playerActions";
import { itemSlot, keysOf, pickKey } from "../../lib/config";

const dateTime = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : "Never");

/** A form row for one admin action: a title, its fields, then the submit button(s). */
function ActionForm({ label, children, onSubmit }: { label: string; children: ReactNode; onSubmit: () => void }) {
  return (
    <form className="action-row" aria-label={label} onSubmit={(event: FormEvent) => { event.preventDefault(); onSubmit(); }}>
      <h4>{label}</h4>
      <div className="action-fields">{children}</div>
    </form>
  );
}

const NotPublishedNote = () => <p className="empty-text">Nothing is published in this environment yet, so there is nothing to act on. Publish a configuration first.</p>;

export function InventoryTab({ playerId }: { playerId: string }) {
  const w = useWorkspace();
  const q = useAdminPlayerInventory(playerId, true);
  const items = usePublished().data?.config?.items ?? [];
  const act = usePlayerActions(playerId);
  const [choice, setChoice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [why, setWhy] = useState("");
  const itemKey = pickKey(choice, keysOf(items));
  const slots = new Map(items.map((i) => [i.key, itemSlot(i)]));
  const owned = q.data ?? [];

  function consume(key: string) {
    if (!window.confirm(`Consume 1 × ${key} from this player's inventory?`)) return;
    void act.consumeItem(key, 1);
  }
  return (
    <>
      {items.length === 0 ? <NotPublishedNote /> : (
        <ActionForm label="Grant an item" onSubmit={() => void act.grantItem(itemKey, quantity, why)}>
          <label>Item<select value={itemKey} onChange={(event) => setChoice(event.target.value)}>{items.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}</select></label>
          <label>Quantity<input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
          <label>Reason<input value={why} onChange={(event) => setWhy(event.target.value)} placeholder="Optional, kept in the ledger" /></label>
          <button className="button primary" disabled={w.busy || !itemKey || quantity < 1}>Grant</button>
        </ActionForm>
      )}
      {q.isPending ? <p className="empty-text">Loading…</p> : owned.length === 0 ? <p className="empty-text">The inventory is empty.</p> : (
        <div className="table-wrap"><table aria-label="Inventory">
          <thead><tr><th>Item</th><th>Category</th><th>Quantity</th><th>Equipped</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{owned.map((i) => {
            const slot = slots.get(i.item_key);
            return (
              <tr key={i.item_key}>
                <td><b>{i.name}</b> <code>{i.item_key}</code></td><td>{i.category || "–"}</td><td>{i.quantity}</td><td>{i.equipped_slot || "–"}</td>
                <td className="row-actions">
                  <button className="button secondary small" disabled={w.busy} aria-label={`Consume ${i.item_key}`} onClick={() => consume(i.item_key)}>Consume</button>
                  {i.equipped_slot
                    ? <button className="button secondary small" disabled={w.busy} aria-label={`Unequip ${i.item_key}`} onClick={() => void act.unequipSlot(i.equipped_slot!)}>Unequip</button>
                    : slot && <button className="button secondary small" disabled={w.busy} aria-label={`Equip ${i.item_key}`} onClick={() => void act.equipItem(i.item_key, slot)}>Equip</button>}
                </td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
    </>
  );
}

export function EconomyTab({ playerId }: { playerId: string }) {
  const w = useWorkspace();
  const ledger = useAdminPlayerLedger(playerId, true);
  const balances = useAdminPlayerCurrency(playerId).data ?? [];
  const currencies = usePublished().data?.config?.currencies ?? [];
  const act = usePlayerActions(playerId);
  const [choice, setChoice] = useState("");
  const [amount, setAmount] = useState(100);
  const [why, setWhy] = useState("");
  const currencyKey = pickKey(choice, keysOf(currencies));
  const rows = ledger.data?.pages.flatMap((page) => page.rows) ?? [];

  function deduct() {
    if (!window.confirm(`Deduct ${amount} ${currencyKey} from this player? The ledger keeps a record, and a balance cannot go below zero.`)) return;
    void act.spend(currencyKey, amount, why);
  }
  return (
    <>
      {currencies.length === 0 ? <NotPublishedNote /> : (
        <ActionForm label="Adjust a balance" onSubmit={() => void act.credit(currencyKey, amount, why)}>
          <label>Currency<select value={currencyKey} onChange={(event) => setChoice(event.target.value)}>{currencies.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select></label>
          <label>Amount<input type="number" min={1} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label>
          <label>Reason<input value={why} onChange={(event) => setWhy(event.target.value)} placeholder="Optional, kept in the ledger" /></label>
          <button className="button primary" disabled={w.busy || !currencyKey || amount < 1}>Credit</button>
          <button type="button" className="button secondary" disabled={w.busy || !currencyKey || amount < 1} onClick={deduct}>Deduct</button>
        </ActionForm>
      )}
      {balances.length > 0 && <div className="balance-list">{balances.map((b) => <div className="balance-row" key={b.currency_key}><span>{b.currency_key}</span><b>{b.balance.toLocaleString()}</b></div>)}</div>}
      {ledger.isPending ? <p className="empty-text">Loading…</p> : rows.length === 0 ? <p className="empty-text">No economy activity yet.</p> : (
        <>
          <div className="table-wrap"><table aria-label="Economy history">
            <thead><tr><th>When</th><th>Change</th><th>Amount</th><th>Balance after</th><th>Reason</th></tr></thead>
            <tbody>{rows.map((t) => (
              <tr key={t.id}>
                <td>{dateTime(t.created_at)}</td>
                <td>{t.operation} <code>{t.currency_key ?? t.item_key}</code>{t.source !== "api" && <span className="badge">{t.source}</span>}</td>
                <td>{t.amount.toLocaleString()}</td>
                <td>{t.balance ?? "–"}</td>
                <td>{t.reason || "–"}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {ledger.hasNextPage && <button className="button secondary" disabled={ledger.isFetchingNextPage} onClick={() => void ledger.fetchNextPage()}>{ledger.isFetchingNextPage ? "Loading…" : "Load older"}</button>}
        </>
      )}
    </>
  );
}

export function ProgressTab({ playerId }: { playerId: string }) {
  const w = useWorkspace();
  const progression = useAdminPlayerProgression(playerId).data;
  const boards = usePublished().data?.config?.leaderboards ?? [];
  const act = usePlayerActions(playerId);
  const [xp, setXp] = useState(100);
  const [why, setWhy] = useState("");
  const [choice, setChoice] = useState("");
  const [score, setScore] = useState(1000);
  const board = pickKey(choice, keysOf(boards));
  const next = progression?.thresholds?.find((t) => t > progression.total_xp);
  return (
    <>
      <p className="tab-summary">{progression
        ? <>Level <b>{progression.level}</b> · {progression.total_xp.toLocaleString()} XP{next ? ` · ${(next - progression.total_xp).toLocaleString()} to the next level` : " · top level"}</>
        : "Loading progression…"}</p>
      <ActionForm label="Award XP" onSubmit={() => void act.awardXP(xp, why)}>
        <label>XP<input type="number" min={1} value={xp} onChange={(event) => setXp(Number(event.target.value))} /></label>
        <label>Reason<input value={why} onChange={(event) => setWhy(event.target.value)} placeholder="Optional, kept in the ledger" /></label>
        <button className="button primary" disabled={w.busy || xp < 1}>Award</button>
      </ActionForm>
      {boards.length === 0 ? <p className="empty-text">No leaderboards are published in this environment.</p> : (
        <ActionForm label="Submit a score" onSubmit={() => void act.submitScore(board, score)}>
          <label>Leaderboard<select value={board} onChange={(event) => setChoice(event.target.value)}>{boards.map((b) => <option key={b.key} value={b.key}>{b.key}</option>)}</select></label>
          <label>Score<input type="number" value={score} onChange={(event) => setScore(Number(event.target.value))} /></label>
          <button className="button primary" disabled={w.busy || !board}>Submit</button>
        </ActionForm>
      )}
    </>
  );
}

export function StatsTab({ playerId }: { playerId: string }) {
  const w = useWorkspace();
  const q = useAdminPlayerStats(playerId, true);
  const stats = usePublished().data?.config?.stats ?? [];
  const act = usePlayerActions(playerId);
  const [counterChoice, setCounterChoice] = useState("");
  const [flagChoice, setFlagChoice] = useState("");
  const [amount, setAmount] = useState(1);
  const [why, setWhy] = useState("");
  const counters = stats.filter((s) => s.kind === "counter").map((s) => s.key);
  const flags = stats.filter((s) => s.kind === "flag").map((s) => s.key);
  const counter = pickKey(counterChoice, counters);
  const flag = pickKey(flagChoice, flags);
  const shown = { counters: q.data?.counters ?? [], flags: q.data?.flags ?? [] };
  return (
    <>
      {stats.length === 0 ? <NotPublishedNote /> : <>
        {counters.length > 0 && (
          <ActionForm label="Increment a counter" onSubmit={() => void act.incrementStat(counter, amount, why)}>
            <label>Counter<select value={counter} onChange={(event) => setCounterChoice(event.target.value)}>{counters.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
            <label>Amount<input type="number" min={1} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label>
            <label>Reason<input value={why} onChange={(event) => setWhy(event.target.value)} placeholder="Optional" /></label>
            <button className="button primary" disabled={w.busy || amount < 1}>Increment</button>
          </ActionForm>
        )}
        {flags.length > 0 && (
          <ActionForm label="Set a flag" onSubmit={() => void act.setFlag(flag, why)}>
            <label>Flag<select value={flag} onChange={(event) => setFlagChoice(event.target.value)}>{flags.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
            <button className="button primary" disabled={w.busy}>Set flag</button>
            <small>Flags are set-only; counters only go up.</small>
          </ActionForm>
        )}
      </>}
      {q.isPending ? <p className="empty-text">Loading…</p> : shown.counters.length + shown.flags.length === 0 ? <p className="empty-text">No stats or flags are published in this environment.</p> : (
        <div className="table-wrap"><table aria-label="Stats and flags">
          <thead><tr><th>Stat</th><th>Kind</th><th>Value</th></tr></thead>
          <tbody>
            {shown.counters.map((c) => <tr key={c.key}><td><b>{c.name}</b> <code>{c.key}</code></td><td>counter</td><td>{c.value.toLocaleString()}</td></tr>)}
            {shown.flags.map((f) => <tr key={f.key}><td><b>{f.name}</b> <code>{f.key}</code></td><td>flag</td><td>{f.set ? "set" : "not set"}</td></tr>)}
          </tbody>
        </table></div>
      )}
    </>
  );
}

export function AchievementsTab({ playerId }: { playerId: string }) {
  const w = useWorkspace();
  const q = useAdminPlayerAchievements(playerId, true);
  const act = usePlayerActions(playerId);
  if (q.isPending) return <p className="empty-text">Loading…</p>;
  const list = q.data ?? [];
  if (list.length === 0) return <p className="empty-text">No achievements are published in this environment.</p>;
  return (
    <div className="table-wrap"><table aria-label="Achievements">
      <thead><tr><th>Achievement</th><th>Progress</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{list.map((a) => (
        <tr key={a.key}>
          <td><b>{a.name ?? a.key}</b> {a.hidden && <span className="badge">hidden</span>}</td>
          <td>{(a.progress ?? []).map((c, i) => <span key={i} className="progress-chip">{c.current}/{c.target}</span>)}</td>
          <td><span className={`status-pill ${a.status}`}>{a.status.replace("_", " ")}</span></td>
          <td className="row-actions">{a.status === "completed" && <button className="button primary small" disabled={w.busy} aria-label={`Claim ${a.key}`} onClick={() => void act.claimAchievement(a.key)}>Claim</button>}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function questStage(q: PlayerQuest): string {
  if (q.status === "claimed" || q.completion_claimed) return "Done";
  const stage = q.stages[q.current_stage ?? 0];
  return stage ? `${(q.current_stage ?? 0) + 1}/${q.stages.length} · ${stage.name}` : "–";
}

export function QuestsTab({ playerId }: { playerId: string }) {
  const w = useWorkspace();
  const q = useAdminPlayerQuests(playerId, true);
  const act = usePlayerActions(playerId);
  if (q.isPending) return <p className="empty-text">Loading…</p>;
  const list = q.data ?? [];
  if (list.length === 0) return <p className="empty-text">No quests are published in this environment.</p>;
  function abandon(quest: PlayerQuest) {
    if (!window.confirm(`Abandon ${quest.name} for this player? Progress restarts if they accept it again; rewards already claimed are kept.`)) return;
    void act.abandonQuest(quest.key);
  }
  return (
    <div className="table-wrap"><table aria-label="Quests">
      <thead><tr><th>Quest</th><th>Stage</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{list.map((x) => {
        const claimable = x.claimable.stages.length > 0 || x.claimable.completion;
        return (
          <tr key={x.key}>
            <td><b>{x.name}</b>{x.chain && <small className="cell-note">{x.chain}</small>}</td><td>{questStage(x)}</td><td><span className={`status-pill ${x.status}`}>{x.status}</span></td>
            <td className="row-actions">
              {x.status === "available" && <button className="button secondary small" disabled={w.busy} aria-label={`Accept ${x.key}`} onClick={() => void act.acceptQuest(x.key)}>Accept</button>}
              {x.status === "active" && <button className="button secondary small" disabled={w.busy} aria-label={`Abandon ${x.key}`} onClick={() => abandon(x)}>Abandon</button>}
              {claimable && <button className="button primary small" disabled={w.busy} aria-label={`Claim ${x.key}`} onClick={() => void act.claimQuest(x.key)}>Claim</button>}
            </td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}
