import { useState } from "react";
import { Boxes, Coins, Plus, Rocket, Trash2, X } from "lucide-react";
import { authHeaders, client, unwrap } from "../../api/client";
import { useWorkspace } from "../../app/workspace";
import { PageTitle, Panel } from "../../components/ui";
import { useDraft, useInvalidate, usePublished } from "../../hooks/queries";
import { itemSlot } from "../../lib/config";

/**
 * The environment's item and currency catalog. Definitions are edited in the draft here;
 * a player's own inventory and balances, and the actions on them, stay in Players.
 * Publishing is explicit, so a new definition is not live until the draft is published.
 */
export function Economy() {
  const w = useWorkspace();
  const invalidate = useInvalidate();
  const draft = useDraft();
  const published = usePublished().data;
  const items = draft.data?.items ?? [];
  const currencies = draft.data?.currencies ?? [];
  const liveItems = new Set((published?.config?.items ?? []).map((item) => item.key));
  const liveCurrencies = new Set((published?.config?.currencies ?? []).map((currency) => currency.key));

  const [itemKey, setItemKey] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemCategory, setItemCategory] = useState("");
  const [itemStackable, setItemStackable] = useState(true);
  const [itemMaxStack, setItemMaxStack] = useState(99);
  const [itemMetadata, setItemMetadata] = useState<{ key: string; value: string }[]>([]);
  const [currencyKey, setCurrencyKey] = useState("");
  const [currencyName, setCurrencyName] = useState("");

  const path = { projectId: w.project.id, envId: w.environment.id };
  const dashboard = { headers: authHeaders({ token: w.token }) };

  async function addItem() {
    const maxStack = itemStackable ? Math.max(1, itemMaxStack) : 1;
    const metadata: Record<string, unknown> = {};
    for (const row of itemMetadata) {
      const key = row.key.trim();
      if (!key) continue;
      // Metadata values are free-form JSON: numbers, booleans, arrays and objects keep
      // their type; anything that is not valid JSON is stored as a string.
      const text = row.value.trim();
      if (!text) {
        metadata[key] = "";
        continue;
      }
      try {
        metadata[key] = JSON.parse(text);
      } catch {
        metadata[key] = row.value;
      }
    }
    await w.run(async () => {
      await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/items", {
        ...dashboard,
        params: { path },
        body: {
          key: itemKey,
          name: itemName,
          category: itemCategory.trim(),
          stackable: itemStackable,
          max_stack: maxStack,
          metadata,
        },
      }), w.token);
      await invalidate.draft();
      w.notify({ kind: "success", message: `Added ${itemKey} to the draft. Publish to make it live.` });
      setItemKey("");
      setItemName("");
      setItemCategory("");
      setItemStackable(true);
      setItemMaxStack(99);
      setItemMetadata([]);
    });
  }

  async function addCurrency() {
    await w.run(async () => {
      await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/currencies", {
        ...dashboard,
        params: { path },
        body: { key: currencyKey, name: currencyName },
      }), w.token);
      await invalidate.draft();
      w.notify({ kind: "success", message: `Added ${currencyKey} to the draft. Publish to make it live.` });
      setCurrencyKey("");
      setCurrencyName("");
    });
  }

  async function removeItem(key: string) {
    if (!window.confirm(`Remove ${key} from the draft? Existing player stacks and ledger rows are kept.`)) return;
    await w.run(async () => {
      await unwrap(client.DELETE("/v1/projects/{projectId}/environments/{envId}/items/{key}", { ...dashboard, params: { path: { ...path, key } } }), w.token);
      await invalidate.draft();
    });
  }

  async function removeCurrency(key: string) {
    if (!window.confirm(`Remove ${key} from the draft? Existing balances and ledger rows are kept.`)) return;
    await w.run(async () => {
      await unwrap(client.DELETE("/v1/projects/{projectId}/environments/{envId}/currencies/{key}", { ...dashboard, params: { path: { ...path, key } } }), w.token);
      await invalidate.draft();
    });
  }

  async function publish() {
    await w.run(async () => {
      try {
        const result = await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/configurations/publish", { ...dashboard, params: { path } }), w.token);
        w.notify({ kind: "success", message: `Published configuration version ${result.version}.` });
      } finally {
        await invalidate.scope();
      }
    });
  }

  return (
    <>
      <PageTitle
        eyebrow="INVENTORY & ECONOMY"
        title="Inventory & economy"
        description="Add item and currency definitions to the draft here, publish to make them live, then grant items or move currency for a player in Players."
        actions={<>
          <button className="button secondary" onClick={() => w.openScreen("players")}>Open Players</button>
          <button className="button primary" disabled={w.busy || !draft.data} onClick={() => void publish()}><Rocket size={17} /> Publish</button>
        </>}
      />
      <div className="two-column">
        <Panel title="Items" subtitle="Draft catalog. Live means published." icon={<Boxes size={20} />}>
          {draft.isPending ? <p className="empty-text">Loading draft…</p> : items.length === 0 ? <p className="empty-text">No items yet.</p> : (
            <div className="table-wrap"><table><thead><tr><th>Key</th><th>Name</th><th>Category</th><th>Stack</th><th>Slot</th><th>Status</th><th /></tr></thead><tbody>
              {items.map((item) => <tr key={item.key}>
                <td><code>{item.key}</code></td>
                <td>{item.name}</td>
                <td>{item.category || "—"}</td>
                <td>{item.stackable ? item.max_stack : "single"}</td>
                <td>{itemSlot(item) ?? "—"}</td>
                <td>{liveItems.has(item.key) ? "live" : "draft only"}</td>
                <td><button className="icon-button" aria-label={`Remove item ${item.key}`} disabled={w.busy} onClick={() => void removeItem(item.key)}><Trash2 size={16} /></button></td>
              </tr>)}
            </tbody></table></div>
          )}
          <form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void addItem(); }}>
            <label>Item key<input value={itemKey} onChange={(event) => setItemKey(event.target.value)} placeholder="mana_potion" required /></label>
            <label>Item name<input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Mana Potion" required /></label>
            <label>Category<input value={itemCategory} onChange={(event) => setItemCategory(event.target.value)} placeholder="consumable" /></label>
            <label>Max stack<input type="number" min={1} value={itemMaxStack} onChange={(event) => setItemMaxStack(Number(event.target.value))} /></label>
            <label className="checkbox"><input type="checkbox" checked={itemStackable} onChange={(event) => { setItemStackable(event.target.checked); if (!event.target.checked) setItemMaxStack(1); }} /> Stackable</label>
            <div className="metadata-editor" role="group" aria-labelledby="item-metadata-label">
              <span id="item-metadata-label" className="metadata-label">Metadata</span>
              <p className="small-note">A map of item values. Values can be strings, numbers, booleans or JSON objects; set <code>slot</code> to make the item equippable.</p>
              {itemMetadata.map((row, index) => (
                <div className="metadata-row" key={index}>
                  <input aria-label={`Metadata key ${index + 1}`} value={row.key} placeholder="key" onChange={(event) => setItemMetadata(itemMetadata.map((item, i) => i === index ? { ...item, key: event.target.value } : item))} />
                  <input aria-label={`Metadata value ${index + 1}`} value={row.value} placeholder="value" onChange={(event) => setItemMetadata(itemMetadata.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} />
                  <button type="button" className="icon-button" aria-label={`Remove metadata ${index + 1}`} onClick={() => setItemMetadata(itemMetadata.filter((_, i) => i !== index))}><X size={16} /></button>
                </div>
              ))}
              <button type="button" className="button secondary small" onClick={() => setItemMetadata([...itemMetadata, { key: "", value: "" }])}><Plus size={16} /> Add metadata</button>
            </div>
            <button className="button secondary" disabled={w.busy || !draft.data}><Plus size={17} /> Add item</button>
          </form>
        </Panel>
        <Panel title="Currencies" subtitle="Draft catalog. Live means published." icon={<Coins size={20} />}>
          {draft.isPending ? <p className="empty-text">Loading draft…</p> : currencies.length === 0 ? <p className="empty-text">No currencies yet.</p> : (
            <div className="table-wrap"><table><thead><tr><th>Key</th><th>Name</th><th>Status</th><th /></tr></thead><tbody>
              {currencies.map((currency) => <tr key={currency.key}>
                <td><code>{currency.key}</code></td>
                <td>{currency.name}</td>
                <td>{liveCurrencies.has(currency.key) ? "live" : "draft only"}</td>
                <td><button className="icon-button" aria-label={`Remove currency ${currency.key}`} disabled={w.busy} onClick={() => void removeCurrency(currency.key)}><Trash2 size={16} /></button></td>
              </tr>)}
            </tbody></table></div>
          )}
          <form className="stack-form compact" onSubmit={(event) => { event.preventDefault(); void addCurrency(); }}>
            <label>Currency key<input value={currencyKey} onChange={(event) => setCurrencyKey(event.target.value)} placeholder="gold" required /></label>
            <label>Currency name<input value={currencyName} onChange={(event) => setCurrencyName(event.target.value)} placeholder="Gold" required /></label>
            <button className="button secondary" disabled={w.busy || !draft.data}><Plus size={17} /> Add currency</button>
          </form>
        </Panel>
      </div>
    </>
  );
}
