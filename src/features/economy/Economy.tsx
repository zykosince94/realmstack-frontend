import { Boxes, Coins } from "lucide-react";
import { useWorkspace } from "../../app/workspace";
import { DataTable, NotPublished, PageTitle, Panel } from "../../components/ui";
import { usePublished } from "../../hooks/queries";
import { itemSlot } from "../../lib/config";

/**
 * The environment's live item and currency catalogs. A player's own inventory and
 * balances, and the actions on them (grant, consume, equip, credit, deduct), are in
 * Players: players never use the dashboard, so those are management tasks per player.
 */
export function Economy() {
  const w = useWorkspace();
  const published = usePublished().data;
  const live = published?.config;
  const items = live?.items ?? [];
  const currencies = live?.currencies ?? [];

  return (
    <>
      <PageTitle eyebrow="INVENTORY & ECONOMY" title="Inventory & economy" description="The live item and currency catalog. Edit it in the configuration draft and publish. To grant items or move currency for a player, open the player in Players." actions={<button className="button secondary" onClick={() => w.openScreen("players")}>Open Players</button>} />
      {published && !published.version ? <section className="panel"><NotPublished /></section> : (
        <div className="two-column">
          <Panel title="Item catalog" subtitle={published ? `${items.length} live items · version ${published.version}` : "Loading…"} icon={<Boxes size={18} />}><DataTable columns={["Key", "Name", "Category", "Stack", "Slot"]} rows={items.map((item) => [item.key, item.name, item.category ?? "—", String(item.max_stack), itemSlot(item) ?? "—"])} empty="No items are published." /></Panel>
          <Panel title="Currency catalog" subtitle={`${currencies.length} live currency types`} icon={<Coins size={18} />}><DataTable columns={["Key", "Name"]} rows={currencies.map((currency) => [currency.key, currency.name])} empty="No currencies are published." /></Panel>
        </div>
      )}
    </>
  );
}
