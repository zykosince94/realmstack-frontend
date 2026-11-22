import { useRef, useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, X } from "lucide-react";
import type { QuestDefinition, QuestStage } from "../../api/types";
import { FieldIssue } from "../../components/ui";
import { defaultCondition } from "../../lib/config";
import { fromUTCInput, moveItem, toUTCInput, wouldCreateCycle } from "../../lib/quests";
import { cleanRewards, ConditionRow, conditionPaths, fieldId, issueProps, MAX_CONDITIONS, rewardPaths, RewardsEditor, unplacedIssues, type Catalog, type Issues } from "../goals/GoalFields";

/** Stages per quest. */
export const MAX_STAGES = 20;

const id = (path: string) => fieldId("quest", path);

/** The issue paths the form can place next to a field (the rest are listed on top). */
function visiblePaths(q: QuestDefinition, isNew: boolean): string[] {
  return [
    ...(isNew ? ["key"] : []), "name", "description", "chain", "repeat", "claimable_by", "available_from", "available_until", "stages",
    ...(q.requires_quests ?? []).map((_, i) => `requires_quests[${i}]`),
    ...(q.requires_achievements ?? []).map((_, i) => `requires_achievements[${i}]`),
    ...q.stages.flatMap((s, i) => [
      `stages[${i}].key`, `stages[${i}].name`, `stages[${i}].conditions`,
      ...s.conditions.flatMap((c, j) => conditionPaths(`stages[${i}].conditions[${j}]`, c)),
      ...rewardPaths(`stages[${i}].rewards`, s.rewards),
    ]),
    ...rewardPaths("rewards", q.rewards),
  ];
}

/** Checkboxes for prerequisites. Each issue at requires_x[i] shows next to that key. */
function PrerequisitePicker({ legend, field, options, selected, issues, disabledReason, onChange }: {
  legend: string;
  field: "requires_quests" | "requires_achievements";
  options: { key: string; name: string }[];
  selected: string[];
  issues: Issues;
  disabledReason: (key: string) => string | null;
  onChange: (next: string[]) => void;
}) {
  // Keys the draft no longer defines still show (checked), so they can be removed.
  const all = [...options, ...selected.filter((k) => !options.some((o) => o.key === k)).map((key) => ({ key, name: `${key} (not in draft)` }))];
  return (
    <fieldset className="prerequisites">
      <legend>{legend}</legend>
      {all.length === 0 && <small>None to choose from yet.</small>}
      {all.map((o) => {
        const index = selected.indexOf(o.key);
        const path = `${field}[${index}]`;
        const reason = index < 0 ? disabledReason(o.key) : null;
        return (
          <label key={o.key} className="checkbox" title={reason ?? ""}>
            <input type="checkbox" checked={index >= 0} disabled={reason !== null}
              onChange={(event) => onChange(event.target.checked ? [...selected, o.key] : selected.filter((k) => k !== o.key))}
              {...(index >= 0 ? issueProps(issues, path, id(path)) : {})} />
            {o.name}{reason && <small> — {reason}</small>}
            {index >= 0 && <FieldIssue id={id(path)} message={issues[path]} />}
          </label>
        );
      })}
    </fieldset>
  );
}

/** One stage: drag handle, move buttons, key/name, conditions and stage rewards. */
function StageCard({ sortId, index, count, stage, catalog, issues, onChange, onMove, onRemove }: {
  sortId: string;
  index: number;
  count: number;
  stage: QuestStage;
  catalog: Catalog;
  issues: Issues;
  onChange: (stage: QuestStage) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: sortId });
  const n = index + 1;
  const base = `stages[${index}]`;
  const label = `Stage ${n} `;
  return (
    <section ref={setNodeRef} className={`stage-card ${isDragging ? "dragging" : ""}`} style={{ transform: CSS.Transform.toString(transform), transition }} aria-label={`Stage ${n}`}>
      <div className="stage-head">
        <button type="button" ref={setActivatorNodeRef} className="icon-button drag-handle" aria-label={`Drag stage ${n}`} {...attributes} {...listeners}><GripVertical size={17} /></button>
        <b>Stage {n}</b>
        <span className="stage-tools">
          <button type="button" className="icon-button" aria-label={`Move stage ${n} up`} disabled={index === 0} onClick={() => onMove(index - 1)}><ArrowUp size={16} /></button>
          <button type="button" className="icon-button" aria-label={`Move stage ${n} down`} disabled={index === count - 1} onClick={() => onMove(index + 1)}><ArrowDown size={16} /></button>
          <button type="button" className="icon-button" aria-label={`Remove stage ${n}`} disabled={count === 1} onClick={onRemove}><Trash2 size={16} /></button>
        </span>
      </div>
      <div className="two-fields">
        <label>{label}key<input value={stage.key} onChange={(event) => onChange({ ...stage, key: event.target.value })} required {...issueProps(issues, `${base}.key`, id(`${base}.key`))} /><FieldIssue id={id(`${base}.key`)} message={issues[`${base}.key`]} /></label>
        <label>{label}name<input value={stage.name} onChange={(event) => onChange({ ...stage, name: event.target.value })} required {...issueProps(issues, `${base}.name`, id(`${base}.name`))} /><FieldIssue id={id(`${base}.name`)} message={issues[`${base}.name`]} /></label>
      </div>
      <FieldIssue id={id(`${base}.conditions`)} message={issues[`${base}.conditions`]} />
      {stage.conditions.map((condition, j) => (
        <ConditionRow key={j} path={`${base}.conditions[${j}]`} number={j + 1} label={label} idPrefix="quest" condition={condition} catalog={catalog} issues={issues}
          onChange={(next) => onChange({ ...stage, conditions: stage.conditions.map((c, k) => k === j ? next : c) })}
          onRemove={() => onChange({ ...stage, conditions: stage.conditions.filter((_, k) => k !== j) })} />
      ))}
      <button type="button" className="button secondary small" aria-label={`Add condition to stage ${n}`} disabled={stage.conditions.length >= MAX_CONDITIONS}
        onClick={() => onChange({ ...stage, conditions: [...stage.conditions, defaultCondition("stat", { stat: catalog.counters[0]?.key })] })}><Plus size={16} /> Condition</button>
      <details className="stage-rewards" open={Boolean(stage.rewards && (stage.rewards.items?.length || stage.rewards.currencies?.length || stage.rewards.xp))}>
        <summary>Stage {n} reward</summary>
        <RewardsEditor path={`${base}.rewards`} label={label} idPrefix="quest" rewards={stage.rewards ?? {}} catalog={catalog} issues={issues} onChange={(rewards) => onChange({ ...stage, rewards })} />
      </details>
    </section>
  );
}

/** The side-panel editor for one quest. */
export function QuestEditor({ initial, isNew, quests, achievements, chains, catalog, issues, busy, onSave, onDelete, onClose }: {
  initial: QuestDefinition;
  isNew: boolean;
  /** Every quest in the draft (for prerequisite options and loop checks). */
  quests: QuestDefinition[];
  achievements: { key: string; name: string }[];
  chains: string[];
  catalog: Catalog;
  issues: Issues;
  busy: boolean;
  onSave: (quest: QuestDefinition) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<QuestDefinition>(initial);
  // dnd-kit needs a stable id per stage that survives reordering and key edits.
  const nextId = useRef(initial.stages.length);
  const [stageIds, setStageIds] = useState(() => initial.stages.map((_, i) => `stage-${i}`));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const set = (patch: Partial<QuestDefinition>) => setDraft((d) => ({ ...d, ...patch }));
  const stages = draft.stages;
  const setStages = (next: QuestStage[], ids: string[]) => { set({ stages: next }); setStageIds(ids); };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= stages.length) return;
    setStages(moveItem(stages, from, to), moveItem(stageIds, from, to));
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) move(stageIds.indexOf(String(active.id)), stageIds.indexOf(String(over.id)));
  };
  const others = quests.filter((q) => q.key !== initial.key || isNew);
  // Loop checks use the quest as edited (its own prerequisites may have changed).
  const graph = [...others.filter((q) => q.key !== draft.key), draft];
  const unplaced = unplacedIssues(issues, visiblePaths(draft, isNew));

  function submit() {
    onSave({
      ...draft,
      chain: draft.chain?.trim() || undefined,
      requires_quests: draft.requires_quests ?? [],
      requires_achievements: draft.requires_achievements ?? [],
      stages: stages.map((s) => ({ ...s, rewards: cleanRewards(s.rewards) })),
      rewards: cleanRewards(draft.rewards),
    });
  }

  return (
    <aside className="side-panel quest-panel" aria-label="Quest editor">
      <div className="panel-heading"><div><h3>{isNew ? "New quest" : draft.name || draft.key}</h3><p>{isNew ? "Saved to the draft; publish to make it live." : `Key ${draft.key}`}</p></div><button className="icon-button" aria-label="Close editor" onClick={onClose}><X size={19} /></button></div>
      {unplaced.length > 0 && <ul className="field-issue" role="alert">{unplaced.map(([path, message]) => <li key={path}>{path ? `${path}: ` : ""}{message}</li>)}</ul>}
      <form className="stack-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        {isNew && <label>Key<input value={draft.key} onChange={(event) => set({ key: event.target.value })} placeholder="into_the_mine" required {...issueProps(issues, "key", id("key"))} /><FieldIssue id={id("key")} message={issues.key} /></label>}
        <label>Name<input value={draft.name} onChange={(event) => set({ name: event.target.value })} required {...issueProps(issues, "name", id("name"))} /><FieldIssue id={id("name")} message={issues.name} /></label>
        <label>Description<textarea value={draft.description ?? ""} onChange={(event) => set({ description: event.target.value })} rows={2} {...issueProps(issues, "description", id("description"))} /><FieldIssue id={id("description")} message={issues.description} /></label>
        <label>Chain <small>(groups quests into a lane, e.g. Main Story)</small>
          <input list="quest-chains" value={draft.chain ?? ""} onChange={(event) => set({ chain: event.target.value })} {...issueProps(issues, "chain", id("chain"))} />
          <datalist id="quest-chains">{chains.map((c) => <option key={c} value={c} />)}</datalist>
          <FieldIssue id={id("chain")} message={issues.chain} />
        </label>
        <div className="two-fields">
          <label>Repeat
            <select value={draft.repeat ?? "none"} onChange={(event) => set({ repeat: event.target.value as QuestDefinition["repeat"] })} {...issueProps(issues, "repeat", id("repeat"))}>
              <option value="none">Once</option>
              <option value="daily">Daily (resets 00:00 UTC)</option>
              <option value="weekly">Weekly (resets Monday 00:00 UTC)</option>
            </select>
            <FieldIssue id={id("repeat")} message={issues.repeat} />
          </label>
          <label>Claim policy
            <select value={draft.claimable_by ?? "player"} onChange={(event) => set({ claimable_by: event.target.value as "player" | "server" })} {...issueProps(issues, "claimable_by", id("claimable_by"))}>
              <option value="player">Player claims</option>
              <option value="server">Game server claims</option>
            </select>
          </label>
        </div>
        <label className="checkbox"><input type="checkbox" checked={draft.auto_accept ?? false} onChange={(event) => set({ auto_accept: event.target.checked })} /> Auto-accept when available</label>
        <div className="two-fields">
          <label>Available from (UTC)
            <input type="datetime-local" value={toUTCInput(draft.available_from)} onChange={(event) => set({ available_from: fromUTCInput(event.target.value) })} {...issueProps(issues, "available_from", id("available_from"))} />
            <FieldIssue id={id("available_from")} message={issues.available_from} />
          </label>
          <label>Available until (UTC)
            <input type="datetime-local" value={toUTCInput(draft.available_until)} onChange={(event) => set({ available_until: fromUTCInput(event.target.value) })} {...issueProps(issues, "available_until", id("available_until"))} />
            <FieldIssue id={id("available_until")} message={issues.available_until} />
          </label>
        </div>
        <PrerequisitePicker legend="Required quests" field="requires_quests" options={others.filter((q) => q.key !== draft.key).map((q) => ({ key: q.key, name: q.name }))}
          selected={draft.requires_quests ?? []} issues={issues}
          disabledReason={(key) => draft.key && wouldCreateCycle(graph, key, draft.key) ? "would create a loop" : null}
          onChange={(next) => set({ requires_quests: next })} />
        <PrerequisitePicker legend="Required achievements" field="requires_achievements" options={achievements} selected={draft.requires_achievements ?? []} issues={issues}
          disabledReason={() => null} onChange={(next) => set({ requires_achievements: next })} />

        <h4>Stages <small>(complete in order · {stages.length}/{MAX_STAGES})</small></h4>
        <p className="small-note">Counted conditions (counters, items, currency, XP) count everything since the quest was accepted, whichever stage is current. When a step must happen after an earlier one, have the game server set a flag.</p>
        <FieldIssue id={id("stages")} message={issues.stages} />
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={stageIds} strategy={verticalListSortingStrategy}>
            {stages.map((stage, index) => (
              <StageCard key={stageIds[index]} sortId={stageIds[index]} index={index} count={stages.length} stage={stage} catalog={catalog} issues={issues}
                onChange={(next) => set({ stages: stages.map((s, i) => i === index ? next : s) })}
                onMove={(to) => move(index, to)}
                onRemove={() => setStages(stages.filter((_, i) => i !== index), stageIds.filter((_, i) => i !== index))} />
            ))}
          </SortableContext>
        </DndContext>
        <button type="button" className="button secondary small" disabled={stages.length >= MAX_STAGES} onClick={() => {
          const n = stages.length + 1;
          setStages([...stages, { key: `stage_${n}`, name: `Stage ${n}`, conditions: [defaultCondition("flag", { flag: catalog.flags[0]?.key })] }], [...stageIds, `stage-${nextId.current++}`]);
        }}><Plus size={16} /> Add stage</button>

        <h4>Completion reward</h4>
        <RewardsEditor path="rewards" label="Completion " idPrefix="quest" rewards={draft.rewards ?? {}} catalog={catalog} issues={issues} onChange={(rewards) => set({ rewards })} />
        <div className="button-row">
          <button className="button primary" disabled={busy}>{isNew ? "Add to draft" : "Save to draft"}</button>
          {!isNew && <button type="button" className="button ghost-danger" disabled={busy} onClick={onDelete}>Delete</button>}
        </div>
      </form>
    </aside>
  );
}
