import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { AchievementDefinition, Condition, ConditionType, Config, Rewards } from "../../api/types";
import { FieldIssue } from "../../components/ui";
import { conditionTypes, defaultCondition } from "../../lib/config";

/** What conditions and rewards can reference, taken from the current draft. */
export type Catalog = {
  items: { key: string; name: string; max_stack: number }[];
  currencies: { key: string; name: string }[];
  leaderboards: string[];
  counters: { key: string; name: string }[];
  flags: { key: string; name: string }[];
};

export function catalogFrom(config: Config | undefined): Catalog {
  const stats = config?.stats ?? [];
  return {
    items: (config?.items ?? []).map(({ key, name, max_stack }) => ({ key, name, max_stack })),
    currencies: config?.currencies ?? [],
    leaderboards: (config?.leaderboards ?? []).map((board) => board.key),
    counters: stats.filter((s) => s.kind === "counter"),
    flags: stats.filter((s) => s.kind === "flag"),
  };
}

export const MAX_CONDITIONS = 5;

/** Issues are keyed by path inside the achievement, e.g. "conditions[0].stat_key". */
type Issues = Record<string, string>;

function issueProps(issues: Issues, path: string, id: string) {
  return issues[path] ? { "aria-invalid": true, "aria-describedby": id } : {};
}

function ConditionRow({ index, condition, catalog, issues, onChange, onRemove }: {
  index: number;
  condition: Condition;
  catalog: Catalog;
  issues: Issues;
  onChange: (condition: Condition) => void;
  onRemove: () => void;
}) {
  const base = `conditions[${index}]`;
  const id = (field: string) => `ach-${base}-${field}`.replace(/[^a-z0-9-]/gi, "-");
  const changeType = (type: ConditionType) => onChange(defaultCondition(type, {
    currency: catalog.currencies[0]?.key, leaderboard: catalog.leaderboards[0], stat: catalog.counters[0]?.key, flag: catalog.flags[0]?.key,
  }));
  const keySelect = (field: "item_key" | "currency_key" | "leaderboard_key" | "stat_key" | "flag_key", label: string, options: { key: string; name: string }[], allowAny = false) => (
    <label>{label}
      <select value={condition[field] ?? ""} onChange={(event) => {
        const next = { ...condition, [field]: event.target.value };
        if (allowAny && !event.target.value) delete next[field];
        onChange(next);
      }} {...issueProps(issues, `${base}.${field}`, id(field))}>
        {allowAny && <option value="">Any item</option>}
        {!allowAny && !options.some((o) => o.key === condition[field]) && <option value={condition[field] ?? ""}>{condition[field] ? `${condition[field]} (not defined)` : "Choose…"}</option>}
        {options.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
      </select>
      <FieldIssue id={id(field)} message={issues[`${base}.${field}`]} />
    </label>
  );
  return (
    <fieldset className="condition-row">
      <legend>Condition {index + 1}</legend>
      <label>Type
        <select aria-label={`Condition ${index + 1} type`} value={condition.type} onChange={(event) => changeType(event.target.value as ConditionType)} {...issueProps(issues, `${base}.type`, id("type"))}>
          {conditionTypes.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
        </select>
        <FieldIssue id={id("type")} message={issues[`${base}.type`]} />
      </label>
      {(condition.type === "item_granted" || condition.type === "item_consumed") && keySelect("item_key", "Item", catalog.items, true)}
      {(condition.type === "currency_earned" || condition.type === "currency_spent") && keySelect("currency_key", "Currency", catalog.currencies)}
      {condition.type === "leaderboard_score" && keySelect("leaderboard_key", "Leaderboard", catalog.leaderboards.map((key) => ({ key, name: key })))}
      {condition.type === "stat" && keySelect("stat_key", "Counter", catalog.counters)}
      {condition.type === "flag" && keySelect("flag_key", "Flag", catalog.flags)}
      {condition.type !== "flag" && (
        <label>{condition.type === "level_reached" ? "Level" : condition.type === "leaderboard_score" ? "Score" : "Target"}
          <input type="number" min={1} value={condition.target ?? 0} onChange={(event) => onChange({ ...condition, target: Number(event.target.value) })} {...issueProps(issues, `${base}.target`, id("target"))} />
          <FieldIssue id={id("target")} message={issues[`${base}.target`]} />
        </label>
      )}
      <button type="button" className="icon-button" aria-label={`Remove condition ${index + 1}`} onClick={onRemove}><Trash2 size={15} /></button>
    </fieldset>
  );
}

function RewardsEditor({ rewards, catalog, issues, onChange }: { rewards: Rewards; catalog: Catalog; issues: Issues; onChange: (rewards: Rewards) => void }) {
  const items = rewards.items ?? [];
  const currencies = rewards.currencies ?? [];
  const id = (path: string) => `ach-${path}`.replace(/[^a-z0-9-]/gi, "-");
  return (
    <div className="rewards-editor">
      {items.map((reward, index) => {
        const path = `rewards.items[${index}]`;
        const max = catalog.items.find((item) => item.key === reward.item_key)?.max_stack;
        return (
          <div className="reward-row" key={`item-${index}`}>
            <label>Item reward
              <select value={reward.item_key} onChange={(event) => onChange({ ...rewards, items: items.map((r, i) => i === index ? { ...r, item_key: event.target.value } : r) })} {...issueProps(issues, `${path}.item_key`, id(`${path}.item_key`))}>
                {catalog.items.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
              </select>
              <FieldIssue id={id(`${path}.item_key`)} message={issues[`${path}.item_key`]} />
            </label>
            <label>Quantity{max !== undefined && <small> (max {max})</small>}
              <input type="number" min={1} max={max} value={reward.quantity} onChange={(event) => onChange({ ...rewards, items: items.map((r, i) => i === index ? { ...r, quantity: Number(event.target.value) } : r) })} {...issueProps(issues, `${path}.quantity`, id(`${path}.quantity`))} />
              <FieldIssue id={id(`${path}.quantity`)} message={issues[`${path}.quantity`]} />
            </label>
            <button type="button" className="icon-button" aria-label={`Remove item reward ${index + 1}`} onClick={() => onChange({ ...rewards, items: items.filter((_, i) => i !== index) })}><X size={15} /></button>
          </div>
        );
      })}
      {currencies.map((reward, index) => {
        const path = `rewards.currencies[${index}]`;
        return (
          <div className="reward-row" key={`currency-${index}`}>
            <label>Currency reward
              <select value={reward.currency_key} onChange={(event) => onChange({ ...rewards, currencies: currencies.map((r, i) => i === index ? { ...r, currency_key: event.target.value } : r) })} {...issueProps(issues, `${path}.currency_key`, id(`${path}.currency_key`))}>
                {catalog.currencies.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              </select>
              <FieldIssue id={id(`${path}.currency_key`)} message={issues[`${path}.currency_key`]} />
            </label>
            <label>Amount
              <input type="number" min={1} value={reward.amount} onChange={(event) => onChange({ ...rewards, currencies: currencies.map((r, i) => i === index ? { ...r, amount: Number(event.target.value) } : r) })} {...issueProps(issues, `${path}.amount`, id(`${path}.amount`))} />
              <FieldIssue id={id(`${path}.amount`)} message={issues[`${path}.amount`]} />
            </label>
            <button type="button" className="icon-button" aria-label={`Remove currency reward ${index + 1}`} onClick={() => onChange({ ...rewards, currencies: currencies.filter((_, i) => i !== index) })}><X size={15} /></button>
          </div>
        );
      })}
      <label>XP reward
        <input type="number" min={0} value={rewards.xp ?? 0} onChange={(event) => onChange({ ...rewards, xp: Number(event.target.value) })} {...issueProps(issues, "rewards.xp", id("rewards.xp"))} />
        <FieldIssue id={id("rewards.xp")} message={issues["rewards.xp"]} />
      </label>
      <div className="button-row">
        <button type="button" className="button secondary small" disabled={catalog.items.length === 0} onClick={() => onChange({ ...rewards, items: [...items, { item_key: catalog.items[0].key, quantity: 1 }] })}><Plus size={14} /> Item</button>
        <button type="button" className="button secondary small" disabled={catalog.currencies.length === 0} onClick={() => onChange({ ...rewards, currencies: [...currencies, { currency_key: catalog.currencies[0].key, amount: 10 }] })}><Plus size={14} /> Currency</button>
      </div>
    </div>
  );
}

/** The issue paths the form can show next to a field for `a` (used to find the rest). */
function visiblePaths(a: AchievementDefinition, isNew: boolean): Set<string> {
  const paths = new Set(["name", "description", "conditions", "rewards.xp"]);
  if (isNew) paths.add("key");
  a.conditions.forEach((c, i) => {
    const base = `conditions[${i}]`;
    paths.add(`${base}.type`);
    if (c.type !== "flag") paths.add(`${base}.target`);
    const keyField = { item_granted: "item_key", item_consumed: "item_key", currency_earned: "currency_key", currency_spent: "currency_key", leaderboard_score: "leaderboard_key", stat: "stat_key", flag: "flag_key" }[c.type as string];
    if (keyField) paths.add(`${base}.${keyField}`);
  });
  (a.rewards?.items ?? []).forEach((_, i) => { paths.add(`rewards.items[${i}].item_key`); paths.add(`rewards.items[${i}].quantity`); });
  (a.rewards?.currencies ?? []).forEach((_, i) => { paths.add(`rewards.currencies[${i}].currency_key`); paths.add(`rewards.currencies[${i}].amount`); });
  return paths;
}

/** Drops empty reward lists and a zero XP reward before saving. */
function cleanRewards(rewards: Rewards): Rewards {
  const out: Rewards = {};
  if (rewards.items?.length) out.items = rewards.items;
  if (rewards.currencies?.length) out.currencies = rewards.currencies;
  if (rewards.xp) out.xp = rewards.xp;
  return out;
}

/** The side-panel editor for one achievement. */
export function AchievementEditor({ initial, isNew, catalog, issues, busy, onSave, onDelete, onClose }: {
  initial: AchievementDefinition;
  isNew: boolean;
  catalog: Catalog;
  issues: Issues;
  busy: boolean;
  onSave: (achievement: AchievementDefinition) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<AchievementDefinition>(initial);
  const conditions = draft.conditions;
  const rewards = draft.rewards ?? {};
  const set = (patch: Partial<AchievementDefinition>) => setDraft((d) => ({ ...d, ...patch }));
  // Issues with no field on screen (for example a target on a condition since changed
  // to a flag) are listed at the top, so no server message is ever silently dropped.
  const shown = visiblePaths(draft, isNew);
  const unplaced = Object.entries(issues).filter(([path]) => !shown.has(path));
  return (
    <aside className="side-panel" aria-label="Achievement editor">
      <div className="panel-heading"><div><h3>{isNew ? "New achievement" : draft.name || draft.key}</h3><p>{isNew ? "Saved to the draft; publish to make it live." : `Key ${draft.key}`}</p></div><button className="icon-button" aria-label="Close editor" onClick={onClose}><X size={17} /></button></div>
      {unplaced.length > 0 && <ul className="field-issue" role="alert">{unplaced.map(([path, message]) => <li key={path}>{path ? `${path}: ` : ""}{message}</li>)}</ul>}
      <form className="stack-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...draft, rewards: cleanRewards(rewards) }); }}>
        {isNew && <label>Key<input value={draft.key} onChange={(event) => set({ key: event.target.value })} placeholder="troll_slayer" required {...issueProps(issues, "key", "ach-key")} /><FieldIssue id="ach-key" message={issues.key} /></label>}
        <label>Name<input value={draft.name} onChange={(event) => set({ name: event.target.value })} required {...issueProps(issues, "name", "ach-name")} /><FieldIssue id="ach-name" message={issues.name} /></label>
        <label>Description<textarea value={draft.description ?? ""} onChange={(event) => set({ description: event.target.value })} rows={2} {...issueProps(issues, "description", "ach-description")} /><FieldIssue id="ach-description" message={issues.description} /></label>
        <div className="toggle-row">
          <label className="checkbox"><input type="checkbox" checked={draft.hidden ?? false} onChange={(event) => set({ hidden: event.target.checked })} /> Hidden until completed</label>
          <label>Claim policy
            <select value={draft.claimable_by ?? "player"} onChange={(event) => set({ claimable_by: event.target.value as "player" | "server" })}>
              <option value="player">Player claims</option>
              <option value="server">Game server claims</option>
            </select>
          </label>
        </div>
        {draft.claimable_by !== "server" && conditions.some((c) => c.type === "leaderboard_score") && <p className="small-note">Scores are submitted by players; consider letting only the game server claim this achievement.</p>}
        <h4>Conditions <small>(all must be met · {conditions.length}/{MAX_CONDITIONS})</small></h4>
        <FieldIssue id="ach-conditions" message={issues.conditions} />
        {conditions.map((condition, index) => (
          <ConditionRow key={index} index={index} condition={condition} catalog={catalog} issues={issues}
            onChange={(next) => set({ conditions: conditions.map((c, i) => i === index ? next : c) })}
            onRemove={() => set({ conditions: conditions.filter((_, i) => i !== index) })} />
        ))}
        <button type="button" className="button secondary small" disabled={conditions.length >= MAX_CONDITIONS} onClick={() => set({ conditions: [...conditions, defaultCondition("stat", { stat: catalog.counters[0]?.key })] })}><Plus size={14} /> Add condition</button>
        <h4>Rewards</h4>
        <RewardsEditor rewards={rewards} catalog={catalog} issues={issues} onChange={(next) => set({ rewards: next })} />
        <div className="button-row">
          <button className="button primary" disabled={busy}>{isNew ? "Add to draft" : "Save to draft"}</button>
          {!isNew && <button type="button" className="button ghost-danger" disabled={busy} onClick={onDelete}>Delete</button>}
        </div>
      </form>
    </aside>
  );
}
