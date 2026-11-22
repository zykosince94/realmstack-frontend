import { Plus, Trash2, X } from "lucide-react";
import type { Condition, ConditionType, Config, Rewards } from "../../api/types";
import { FieldIssue } from "../../components/ui";
import { conditionTypes, defaultCondition } from "../../lib/config";

// Form pieces shared by the achievement and quest editors. Both use the backend's
// closed condition set and reward shape, so one condition builder and one reward
// picker serve both. Every field takes the JSON path the backend uses in field errors
// ("conditions[0].stat_key" for an achievement, "stages[1].conditions[0].stat_key" for
// a quest), so server issues land next to the field they name.

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

/** Conditions per achievement or quest stage (spec 2.6, 2.7). */
export const MAX_CONDITIONS = 5;

/** Issues keyed by path inside the definition being edited. */
export type Issues = Record<string, string>;

/** Makes a DOM id from a field path. */
export function fieldId(prefix: string, path: string): string {
  return `${prefix}-${path}`.replace(/[^a-z0-9-]/gi, "-");
}

export function issueProps(issues: Issues, path: string, id: string) {
  return issues[path] ? { "aria-invalid": true, "aria-describedby": id } : {};
}

const keyFieldByType: Partial<Record<ConditionType, "item_key" | "currency_key" | "leaderboard_key" | "stat_key" | "flag_key">> = {
  item_granted: "item_key", item_consumed: "item_key", currency_earned: "currency_key", currency_spent: "currency_key",
  leaderboard_score: "leaderboard_key", stat: "stat_key", flag: "flag_key",
};

/** The issue paths a ConditionRow at `base` can show next to a field. */
export function conditionPaths(base: string, c: Condition): string[] {
  const out = [`${base}.type`];
  if (c.type !== "flag") out.push(`${base}.target`);
  const keyField = keyFieldByType[c.type];
  if (keyField) out.push(`${base}.${keyField}`);
  return out;
}

/** The issue paths a RewardsEditor at `base` can show next to a field. */
export function rewardPaths(base: string, r: Rewards | undefined): string[] {
  const out = [`${base}.xp`];
  (r?.items ?? []).forEach((_, i) => out.push(`${base}.items[${i}].item_key`, `${base}.items[${i}].quantity`));
  (r?.currencies ?? []).forEach((_, i) => out.push(`${base}.currencies[${i}].currency_key`, `${base}.currencies[${i}].amount`));
  return out;
}

/** Drops empty reward lists and a zero XP reward before saving. */
export function cleanRewards(rewards: Rewards | undefined): Rewards {
  const out: Rewards = {};
  if (rewards?.items?.length) out.items = rewards.items;
  if (rewards?.currencies?.length) out.currencies = rewards.currencies;
  if (rewards?.xp) out.xp = rewards.xp;
  return out;
}

/** One-line reward summary, e.g. "2 × health_potion · 10 credits · 50 XP". */
export function rewardSummary(rewards: Rewards | undefined): string {
  const parts = [
    ...(rewards?.items ?? []).map((r) => `${r.quantity} × ${r.item_key}`),
    ...(rewards?.currencies ?? []).map((r) => `${r.amount} ${r.currency_key}`),
    ...(rewards?.xp ? [`${rewards.xp} XP`] : []),
  ];
  return parts.length ? parts.join(" · ") : "No rewards";
}

/**
 * One condition in the builder. `path` is its JSON path (e.g. "conditions[0]");
 * `label` prefixes accessible names when several builders share a form ("Stage 2 ").
 */
export function ConditionRow({ path, number, label = "", idPrefix, condition, catalog, issues, onChange, onRemove }: {
  path: string;
  number: number;
  label?: string;
  idPrefix: string;
  condition: Condition;
  catalog: Catalog;
  issues: Issues;
  onChange: (condition: Condition) => void;
  onRemove: () => void;
}) {
  const id = (field: string) => fieldId(idPrefix, `${path}-${field}`);
  // Switching type starts from that type's own fields: the backend rejects fields that
  // do not belong to a condition type.
  const changeType = (type: ConditionType) => onChange(defaultCondition(type, {
    currency: catalog.currencies[0]?.key, leaderboard: catalog.leaderboards[0], stat: catalog.counters[0]?.key, flag: catalog.flags[0]?.key,
  }));
  const keySelect = (field: "item_key" | "currency_key" | "leaderboard_key" | "stat_key" | "flag_key", text: string, options: { key: string; name: string }[], allowAny = false) => (
    <label>{text}
      <select value={condition[field] ?? ""} onChange={(event) => {
        const next = { ...condition, [field]: event.target.value };
        if (allowAny && !event.target.value) delete next[field];
        onChange(next);
      }} {...issueProps(issues, `${path}.${field}`, id(field))}>
        {allowAny && <option value="">Any item</option>}
        {!allowAny && !options.some((o) => o.key === condition[field]) && <option value={condition[field] ?? ""}>{condition[field] ? `${condition[field]} (not defined)` : "Choose…"}</option>}
        {options.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
      </select>
      <FieldIssue id={id(field)} message={issues[`${path}.${field}`]} />
    </label>
  );
  return (
    <fieldset className="condition-row">
      <legend>{label}Condition {number}</legend>
      <label>Type
        <select aria-label={`${label}Condition ${number} type`} value={condition.type} onChange={(event) => changeType(event.target.value as ConditionType)} {...issueProps(issues, `${path}.type`, id("type"))}>
          {conditionTypes.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
        </select>
        <FieldIssue id={id("type")} message={issues[`${path}.type`]} />
      </label>
      {(condition.type === "item_granted" || condition.type === "item_consumed") && keySelect("item_key", "Item", catalog.items, true)}
      {(condition.type === "currency_earned" || condition.type === "currency_spent") && keySelect("currency_key", "Currency", catalog.currencies)}
      {condition.type === "leaderboard_score" && keySelect("leaderboard_key", "Leaderboard", catalog.leaderboards.map((key) => ({ key, name: key })))}
      {condition.type === "stat" && keySelect("stat_key", "Counter", catalog.counters)}
      {condition.type === "flag" && keySelect("flag_key", "Flag", catalog.flags)}
      {condition.type !== "flag" && (
        <label>{condition.type === "level_reached" ? "Level" : condition.type === "leaderboard_score" ? "Score" : "Target"}
          <input type="number" min={1} value={condition.target ?? 0} onChange={(event) => onChange({ ...condition, target: Number(event.target.value) })} {...issueProps(issues, `${path}.target`, id("target"))} />
          <FieldIssue id={id("target")} message={issues[`${path}.target`]} />
        </label>
      )}
      <button type="button" className="icon-button" aria-label={`Remove ${label.toLowerCase()}condition ${number}`} onClick={onRemove}><Trash2 size={17} /></button>
    </fieldset>
  );
}

/** Item, currency and XP rewards. `path` is the rewards' JSON path ("rewards", "stages[0].rewards"). */
export function RewardsEditor({ path, label = "", idPrefix, rewards, catalog, issues, onChange }: {
  path: string;
  label?: string;
  idPrefix: string;
  rewards: Rewards;
  catalog: Catalog;
  issues: Issues;
  onChange: (rewards: Rewards) => void;
}) {
  const items = rewards.items ?? [];
  const currencies = rewards.currencies ?? [];
  const id = (p: string) => fieldId(idPrefix, p);
  const lower = label.toLowerCase();
  return (
    <div className="rewards-editor">
      {items.map((reward, index) => {
        const p = `${path}.items[${index}]`;
        const max = catalog.items.find((item) => item.key === reward.item_key)?.max_stack;
        return (
          <div className="reward-row" key={`item-${index}`}>
            <label>Item reward
              <select value={reward.item_key} onChange={(event) => onChange({ ...rewards, items: items.map((r, i) => i === index ? { ...r, item_key: event.target.value } : r) })} {...issueProps(issues, `${p}.item_key`, id(`${p}.item_key`))}>
                {catalog.items.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
              </select>
              <FieldIssue id={id(`${p}.item_key`)} message={issues[`${p}.item_key`]} />
            </label>
            <label>Quantity{max !== undefined && <small> (max {max})</small>}
              <input type="number" min={1} max={max} value={reward.quantity} onChange={(event) => onChange({ ...rewards, items: items.map((r, i) => i === index ? { ...r, quantity: Number(event.target.value) } : r) })} {...issueProps(issues, `${p}.quantity`, id(`${p}.quantity`))} />
              <FieldIssue id={id(`${p}.quantity`)} message={issues[`${p}.quantity`]} />
            </label>
            <button type="button" className="icon-button" aria-label={`Remove ${lower}item reward ${index + 1}`} onClick={() => onChange({ ...rewards, items: items.filter((_, i) => i !== index) })}><X size={17} /></button>
          </div>
        );
      })}
      {currencies.map((reward, index) => {
        const p = `${path}.currencies[${index}]`;
        return (
          <div className="reward-row" key={`currency-${index}`}>
            <label>Currency reward
              <select value={reward.currency_key} onChange={(event) => onChange({ ...rewards, currencies: currencies.map((r, i) => i === index ? { ...r, currency_key: event.target.value } : r) })} {...issueProps(issues, `${p}.currency_key`, id(`${p}.currency_key`))}>
                {catalog.currencies.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              </select>
              <FieldIssue id={id(`${p}.currency_key`)} message={issues[`${p}.currency_key`]} />
            </label>
            <label>Amount
              <input type="number" min={1} value={reward.amount} onChange={(event) => onChange({ ...rewards, currencies: currencies.map((r, i) => i === index ? { ...r, amount: Number(event.target.value) } : r) })} {...issueProps(issues, `${p}.amount`, id(`${p}.amount`))} />
              <FieldIssue id={id(`${p}.amount`)} message={issues[`${p}.amount`]} />
            </label>
            <button type="button" className="icon-button" aria-label={`Remove ${lower}currency reward ${index + 1}`} onClick={() => onChange({ ...rewards, currencies: currencies.filter((_, i) => i !== index) })}><X size={17} /></button>
          </div>
        );
      })}
      <label>{label}XP reward
        <input type="number" min={0} value={rewards.xp ?? 0} onChange={(event) => onChange({ ...rewards, xp: Number(event.target.value) })} {...issueProps(issues, `${path}.xp`, id(`${path}.xp`))} />
        <FieldIssue id={id(`${path}.xp`)} message={issues[`${path}.xp`]} />
      </label>
      <div className="button-row">
        <button type="button" className="button secondary small" aria-label={`Add ${lower}item reward`} disabled={catalog.items.length === 0} onClick={() => onChange({ ...rewards, items: [...items, { item_key: catalog.items[0].key, quantity: 1 }] })}><Plus size={16} /> Item</button>
        <button type="button" className="button secondary small" aria-label={`Add ${lower}currency reward`} disabled={catalog.currencies.length === 0} onClick={() => onChange({ ...rewards, currencies: [...currencies, { currency_key: catalog.currencies[0].key, amount: 10 }] })}><Plus size={16} /> Currency</button>
      </div>
    </div>
  );
}

/** Issues the form cannot place next to a field; editors list them at the top. */
export function unplacedIssues(issues: Issues, shown: Iterable<string>): [string, string][] {
  const visible = new Set(shown);
  return Object.entries(issues).filter(([path]) => !visible.has(path));
}
