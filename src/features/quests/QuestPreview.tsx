import type { PlayerQuest } from "../../api/types";

export type QuestAction = "accept" | "abandon" | "claim";

/** Human labels for quest statuses (spec 6.5). */
export const statusLabels: Record<PlayerQuest["status"], string> = {
  claimed: "claimed", locked: "locked", upcoming: "upcoming", expired: "expired", completed: "completed", active: "active", available: "available",
};

/**
 * How the demo player sees one quest: status, current stage and the actions the API
 * would allow. The buttons only offer what the status permits; the server still
 * checks everything.
 */
export function QuestPreview({ quest, canActAsServer, busy, onAction }: {
  quest?: PlayerQuest;
  canActAsServer: boolean;
  busy: boolean;
  onAction: (quest: PlayerQuest, action: QuestAction) => void;
}) {
  if (!quest) return <div className="quest-preview"><small>Not published yet.</small></div>;
  const stage = quest.current_stage !== null ? quest.stages[quest.current_stage] : null;
  const claimable = quest.claimable.stages.length > 0 || quest.claimable.completion;
  const canClaim = claimable && (quest.claimable_by === "player" || canActAsServer);
  return (
    <div className="quest-preview nodrag" aria-label={`Player view of ${quest.key}`}>
      <span className={`status-pill ${quest.status}`}>{statusLabels[quest.status]}</span>
      {quest.status === "locked" && <small>Needs {[...quest.locked_by.quests, ...quest.locked_by.achievements].join(", ")}</small>}
      {stage && (
        <small>Stage {quest.current_stage! + 1}/{quest.stages.length}: {stage.name}
          {(stage.progress ?? []).filter((p) => p.type !== "flag").map((p, i) => <span key={i}> · {p.current}/{p.target}</span>)}
        </small>
      )}
      {quest.auto_accepted && quest.status === "active" && <small>Auto-accepted</small>}
      {quest.resets_at && <small>Resets {new Date(quest.resets_at).toISOString().slice(0, 16).replace("T", " ")} UTC</small>}
      <div className="button-row">
        {quest.status === "available" && <button type="button" className="button secondary small" disabled={busy} onClick={() => onAction(quest, "accept")}>Accept</button>}
        {quest.status === "active" && <button type="button" className="button secondary small" disabled={busy} onClick={() => onAction(quest, "abandon")}>Abandon</button>}
        {canClaim && <button type="button" className="button primary small" disabled={busy} onClick={() => onAction(quest, "claim")}>{quest.claimable_by === "player" ? "Claim" : "Claim as server"}</button>}
      </div>
      {claimable && !canClaim && <small>Only the game server can claim this. Add a server credential in Inventory &amp; economy.</small>}
    </div>
  );
}
