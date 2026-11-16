import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Boxes, Coins, RefreshCw, ShieldCheck } from "lucide-react";
import { authHeaders, client, idempotencyKey, unwrap } from "../../api/client";
import { useWorkspace } from "../../app/workspace";
import { DataTable, NotPublished, PageTitle, Panel } from "../../components/ui";
import { keys, useInvalidate, usePublished } from "../../hooks/queries";
import { equippableItems, itemSlot, keysOf, pickKey } from "../../lib/config";

/** The demo player's inventory, balances and history; disabled until a player signs in. */
function usePlayerEconomy(playerToken: string) {
  const headers = authHeaders({ token: playerToken });
  const enabled = playerToken !== "";
  const inventory = useQuery({ queryKey: [...keys.player(playerToken), "inventory"], enabled, queryFn: () => unwrap(client.GET("/v1/players/me/inventory", { headers }), playerToken) });
  const balances = useQuery({ queryKey: [...keys.player(playerToken), "balances"], enabled, queryFn: () => unwrap(client.GET("/v1/players/me/currency", { headers }), playerToken) });
  const transactions = useQuery({ queryKey: [...keys.player(playerToken), "transactions"], enabled, queryFn: () => unwrap(client.GET("/v1/players/me/transactions", { headers }), playerToken) });
  return { inventory: inventory.data ?? [], balances: balances.data ?? [], transactions: transactions.data ?? [] };
}

export function Economy() {
  const w = useWorkspace();
  const invalidate = useInvalidate();
  const published = usePublished().data;
  const live = published?.config;
  const items = live?.items ?? [];
  const currencies = live?.currencies ?? [];
  const equippable = equippableItems(items);
  const itemKeys = keysOf(items);
  const currencyKeys = keysOf(currencies);
  const equipKeys = keysOf(equippable);
  // Selections are resolved against the live options so the request always matches the visible choice.
  const [grantChoice, setGrantChoice] = useState("");
  const [consumeChoice, setConsumeChoice] = useState("");
  const [equipChoice, setEquipChoice] = useState("");
  const [currencyChoice, setCurrencyChoice] = useState("");
  const grantKey = pickKey(grantChoice, itemKeys);
  const consumeKey = pickKey(consumeChoice, itemKeys);
  const equipKey = pickKey(equipChoice, equipKeys);
  const currencyKey = pickKey(currencyChoice, currencyKeys);
  const equipSlot = itemSlot(equippable.find((item) => item.key === equipKey) ?? {}) ?? "";
  const [quantity, setQuantity] = useState(1);
  const [amount, setAmount] = useState(100);
  const [spendAmount, setSpendAmount] = useState(25);
  const [consumeQuantity, setConsumeQuantity] = useState(1);
  const [actionResult, setActionResult] = useState("");
  const { inventory, balances, transactions } = usePlayerEconomy(w.demoPlayerToken);

  const server = { headers: authHeaders({ serverCredential: w.serverCredential }) };
  const player = { headers: authHeaders({ token: w.demoPlayerToken }) };
  const key = () => ({ "Idempotency-Key": idempotencyKey() });
  const playerPath = { playerId: w.demoPlayerId };

  async function mutate(work: () => Promise<unknown>, needsPlayer: boolean) {
    await w.run(async () => {
      if (needsPlayer && !w.demoPlayerToken) throw new Error("Sign in as a player in the Players section first.");
      setActionResult(JSON.stringify(await work(), null, 2));
      await invalidate.player();
    });
  }

  const itemOptions = items.map((item) => <option key={item.key} value={item.key}>{item.name}</option>);
  const currencyOptions = currencies.map((currency) => <option key={currency.key} value={currency.key}>{currency.name}</option>);
  const noItems = itemKeys.length === 0;
  const noCurrencies = currencyKeys.length === 0;

  return (
    <>
      <PageTitle eyebrow="INVENTORY & ECONOMY" title="Inventory & economy" description="Grant or consume items and move virtual currency with transactional idempotency. Lists show the published (live) catalog." actions={<button className="button secondary" disabled={w.busy || !w.demoPlayerToken} onClick={() => void w.run(() => invalidate.player())}><RefreshCw size={15} /> Refresh player view</button>} />
      <div className="panel toolbar-panel"><div className="toolbar-field"><label>Player ID<input placeholder="Register a player first" value={w.demoPlayerId} onChange={(event) => w.setDemoPlayerId(event.target.value)} /></label></div><div className="toolbar-field"><label>Server credential<input type="password" placeholder="Create one in Project settings" value={w.serverCredential} onChange={(event) => w.setServerCredential(event.target.value)} /></label></div><p className="field-note"><ShieldCheck size={14} /> Keep server credentials on a trusted game server; never include them in a game build.</p></div>
      {published && !published.version ? <section className="panel"><NotPublished /></section> : <>
        <div className="two-column">
          <Panel title="Item catalog" subtitle={published ? `${items.length} live items · version ${published.version}` : "Loading…"} icon={<Boxes size={18} />}><DataTable columns={["Key", "Name", "Category", "Stack", "Slot"]} rows={items.map((item) => [item.key, item.name, item.category ?? "—", String(item.max_stack), itemSlot(item) ?? "—"])} empty="No items are published." /></Panel>
          <Panel title="Currency catalog" subtitle={`${currencies.length} live currency types`} icon={<Coins size={18} />}><DataTable columns={["Key", "Name"]} rows={currencies.map((currency) => [currency.key, currency.name])} empty="No currencies are published." /></Panel>
        </div>
        <div className="two-column action-panels">
          <Panel title="Grant an item" subtitle="Trusted server action · idempotent by request key" icon={<ArrowDownLeft size={18} />}><form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void mutate(() => unwrap(client.POST("/v1/server/players/{playerId}/items/grant", { ...server, params: { path: playerPath, header: key() }, body: { item_key: grantKey, quantity } })), false); }}><label>Item<select aria-label="Item to grant" value={grantKey} onChange={(event) => setGrantChoice(event.target.value)}>{itemOptions}</select></label><label>Quantity<input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label><button className="button primary" disabled={w.busy || noItems || !w.serverCredential || !w.demoPlayerId}>Grant item</button></form></Panel>
          <Panel title="Credit currency" subtitle="Trusted server action · integer minor units" icon={<ArrowUpRight size={18} />}><form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void mutate(() => unwrap(client.POST("/v1/server/players/{playerId}/currency/credit", { ...server, params: { path: playerPath, header: key() }, body: { currency_key: currencyKey, amount, reason: "demo_reward" } })), false); }}><label>Currency<select aria-label="Currency to credit" value={currencyKey} onChange={(event) => setCurrencyChoice(event.target.value)}>{currencyOptions}</select></label><label>Amount<input type="number" min={1} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label><button className="button primary" disabled={w.busy || noCurrencies || !w.serverCredential || !w.demoPlayerId}>Credit balance</button></form></Panel>
        </div>
        <div className="two-column action-panels">
          <Panel title="Consume an item" subtitle="Player self-service · idempotent by request key" icon={<Boxes size={18} />}><form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void mutate(() => unwrap(client.POST("/v1/players/me/inventory/consume", { ...player, params: { header: key() }, body: { item_key: consumeKey, quantity: consumeQuantity } }), w.demoPlayerToken), true); }}><label>Item<select aria-label="Item to consume" value={consumeKey} onChange={(event) => setConsumeChoice(event.target.value)}>{itemOptions}</select></label><label>Quantity<input type="number" min={1} value={consumeQuantity} onChange={(event) => setConsumeQuantity(Number(event.target.value))} /></label><button className="button secondary" disabled={w.busy || noItems || !w.demoPlayerToken}>Consume item</button></form></Panel>
          <Panel title="Spend currency" subtitle="Player self-service · balance cannot go below zero" icon={<Coins size={18} />}><form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void mutate(() => unwrap(client.POST("/v1/players/me/currency/spend", { ...player, params: { header: key() }, body: { currency_key: currencyKey, amount: spendAmount, reason: "demo_purchase" } }), w.demoPlayerToken), true); }}><label>Currency<select aria-label="Currency to spend" value={currencyKey} onChange={(event) => setCurrencyChoice(event.target.value)}>{currencyOptions}</select></label><label>Amount<input type="number" min={1} value={spendAmount} onChange={(event) => setSpendAmount(Number(event.target.value))} /></label><button className="button secondary" disabled={w.busy || noCurrencies || !w.demoPlayerToken}>Spend currency</button></form></Panel>
        </div>
        <Panel title="Equip an owned item" subtitle="Player self-service · each item has one slot, set by its metadata.slot." icon={<ShieldCheck size={18} />}>{equipKeys.length === 0 ? <p className="empty-text">No published item declares a metadata.slot, so nothing can be equipped.</p> : <form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void mutate(() => unwrap(client.POST("/v1/players/me/inventory/equip", { ...player, params: { header: key() }, body: { item_key: equipKey, slot: equipSlot } }), w.demoPlayerToken), true); }}><label>Owned item<select aria-label="Item to equip" value={equipKey} onChange={(event) => setEquipChoice(event.target.value)}>{equippable.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label><label>Equipment slot<input value={equipSlot} readOnly /></label><button className="button secondary" disabled={w.busy || !w.demoPlayerToken}>Equip item</button></form>}</Panel>
      </>}
      {actionResult && <pre className="result-json">{actionResult}</pre>}
      <div className="two-column">
        <Panel title="Player inventory" subtitle="Current stacks for this player" icon={<Boxes size={18} />}><DataTable columns={["Item", "Quantity", "Equipped"]} rows={inventory.map((row) => [row.item_key, String(row.quantity), row.equipped_slot || "—"])} empty={w.demoPlayerToken ? "This player owns no items." : "Sign in a player to load inventory."} /></Panel>
        <Panel title="Balances & recent transactions" subtitle="Balances and immutable audit trail" icon={<Coins size={18} />}><div className="balance-list">{balances.map((row) => <div className="balance-row" key={row.currency_key}><span>{row.currency_key}</span><b>{row.balance}</b></div>)}</div><DataTable columns={["Operation", "Amount", "Source", "When"]} rows={transactions.slice(0, 5).map((row) => [row.operation, String(row.amount), row.source, row.created_at])} empty="No transactions loaded." /></Panel>
      </div>
    </>
  );
}
