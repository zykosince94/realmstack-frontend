import { ScrollText } from "lucide-react";
import type { QuestDefinition, QuestStat } from "../../api/types";
import { lanesOf, scheduleSummary } from "../../lib/quests";
import { rewardSummary } from "../goals/GoalFields";

/**
 * The narrow-screen fallback for the canvas: quests grouped by chain, in
 * draft order, with the same selection and issues. Prerequisites are
 * edited in the side panel here.
 */
export function QuestList({ quests, issueIndexes, selectedKey, stats, onEdit }: {
  quests: QuestDefinition[];
  issueIndexes: Set<number>;
  selectedKey: string | null;
  stats: Map<string, QuestStat>;
  onEdit: (index: number) => void;
}) {
  return (
    <div className="quest-list" aria-label="Quest list">
      {lanesOf(quests).map((chain) => {
        const members = quests.map((q, index) => ({ q, index })).filter(({ q }) => (q.chain ?? "") === chain);
        if (members.length === 0) return null;
        return (
          <section key={chain || "-"} className="quest-list-group">
            <h3>{chain || "No chain"}</h3>
            {members.map(({ q, index }) => {
              const stat = stats.get(q.key);
              const schedule = scheduleSummary(q);
              return (
                <article key={q.key} className={`quest-row ${selectedKey === q.key ? "selected" : ""} ${issueIndexes.has(index) ? "has-issues" : ""}`}>
                  <button type="button" className="card-select" onClick={() => onEdit(index)} aria-label={`Edit ${q.name}`}>
                    <div className="card-top"><ScrollText size={18} /><b>{q.name}</b></div>
                    <small className="card-key">{q.key}{issueIndexes.has(index) && <span className="issue-dot"> · has issues</span>}</small>
                    <small>{q.stages.length} stage{q.stages.length === 1 ? "" : "s"}{schedule && ` · ${schedule}`}{(q.requires_quests ?? []).length > 0 && ` · after ${(q.requires_quests ?? []).join(", ")}`}</small>
                    <small>{rewardSummary(q.rewards)}{stat && ` · ${stat.accepted} accepted · ${stat.completions_claimed} completed`}</small>
                  </button>
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
