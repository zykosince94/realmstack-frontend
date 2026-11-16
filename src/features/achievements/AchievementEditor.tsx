import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { AchievementDefinition } from "../../api/types";
import { FieldIssue } from "../../components/ui";
import { defaultCondition } from "../../lib/config";
import { cleanRewards, ConditionRow, conditionPaths, issueProps, MAX_CONDITIONS, rewardPaths, RewardsEditor, unplacedIssues, type Catalog, type Issues } from "../goals/GoalFields";

export { catalogFrom, type Catalog } from "../goals/GoalFields";

/** The issue paths the form can show next to a field for `a` (used to find the rest). */
function visiblePaths(a: AchievementDefinition, isNew: boolean): string[] {
  return [
    ...(isNew ? ["key"] : []), "name", "description", "conditions",
    ...a.conditions.flatMap((c, i) => conditionPaths(`conditions[${i}]`, c)),
    ...rewardPaths("rewards", a.rewards),
  ];
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
  const unplaced = unplacedIssues(issues, visiblePaths(draft, isNew));
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
          <ConditionRow key={index} path={`conditions[${index}]`} number={index + 1} idPrefix="ach" condition={condition} catalog={catalog} issues={issues}
            onChange={(next) => set({ conditions: conditions.map((c, i) => i === index ? next : c) })}
            onRemove={() => set({ conditions: conditions.filter((_, i) => i !== index) })} />
        ))}
        <button type="button" className="button secondary small" disabled={conditions.length >= MAX_CONDITIONS} onClick={() => set({ conditions: [...conditions, defaultCondition("stat", { stat: catalog.counters[0]?.key })] })}><Plus size={14} /> Add condition</button>
        <h4>Rewards</h4>
        <RewardsEditor path="rewards" idPrefix="ach" rewards={rewards} catalog={catalog} issues={issues} onChange={(next) => set({ rewards: next })} />
        <div className="button-row">
          <button className="button primary" disabled={busy}>{isNew ? "Add to draft" : "Save to draft"}</button>
          {!isNew && <button type="button" className="button ghost-danger" disabled={busy} onClick={onDelete}>Delete</button>}
        </div>
      </form>
    </aside>
  );
}
