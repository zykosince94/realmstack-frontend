import { memo, useEffect, useMemo } from "react";
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, useNodesState, type Connection, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { GripHorizontal, Repeat, Server, Sparkles, Timer } from "lucide-react";
import type { QuestDefinition, QuestStat } from "../../api/types";
import { LANE_HEIGHT, laneIndexForY, lanesOf, laneTop, NODE_WIDTH, placeNodes, wouldCreateCycle, type Position as XY, type QuestLayout } from "../../lib/quests";

// The quest graph canvas (spec 8): one custom node per quest, horizontal chain lanes,
// prerequisite edges drawn from the required quest to the quest that needs it, and
// drag-to-connect with loop prevention. React Flow owns pan, zoom, the minimap and
// dragging; the draft stays the source of truth, so every change is reported up and
// saved, and the canvas redraws from the saved draft.

type QuestNodeData = {
  quest: QuestDefinition;
  hasIssues: boolean;
  selected: boolean;
  stat?: QuestStat;
  onEdit: () => void;
};
type LaneData = { label: string; width: number };
type QuestNodeType = Node<QuestNodeData, "quest">;
type LaneNodeType = Node<LaneData, "lane">;

const QuestNode = memo(function QuestNode({ data }: NodeProps<QuestNodeType>) {
  const { quest } = data;
  return (
    <div className={`quest-node ${data.hasIssues ? "has-issues" : ""} ${data.selected ? "selected" : ""}`} style={{ width: NODE_WIDTH }}>
      <Handle type="target" position={Position.Left} aria-label={`Prerequisites of ${quest.name}`} />
      {/* nodrag: the title is for selecting; drag the node by the rest of the card. */}
      <button type="button" className="quest-node-title nodrag" onClick={data.onEdit} aria-label={`Edit ${quest.name}`}>
        <b>{quest.name}</b>
        <small>{quest.key}{data.hasIssues && <span className="issue-dot"> · has issues</span>}</small>
      </button>
      <div className="quest-node-meta" title="Drag to move; drop into a lane to set the chain">
        <GripHorizontal size={12} aria-hidden="true" />
        <span>{quest.stages.length} stage{quest.stages.length === 1 ? "" : "s"}</span>
        {quest.repeat !== "none" && <span className="badge" title={`Repeats ${quest.repeat}`}><Repeat size={11} /> {quest.repeat}</span>}
        {(quest.available_from || quest.available_until) && <span className="badge" title="Has an availability window"><Timer size={11} /> event</span>}
        {quest.auto_accept && <span className="badge" title="Accepted automatically"><Sparkles size={11} /> auto</span>}
        {quest.claimable_by === "server" && <span className="badge" title="Only the game server can claim"><Server size={11} /> server</span>}
      </div>
      {data.stat && <small className="quest-node-stats">{data.stat.accepted} accepted · {data.stat.completions_claimed} completed</small>}
      <Handle type="source" position={Position.Right} aria-label={`Quests that require ${quest.name}`} />
    </div>
  );
});

function LaneNode({ data }: NodeProps<LaneNodeType>) {
  return <div className="lane-node" style={{ width: data.width, height: LANE_HEIGHT }}><span>{data.label || "No chain"}</span></div>;
}

const nodeTypes = { quest: QuestNode, lane: LaneNode };

export function QuestCanvas({ quests, layout, issueIndexes, selectedKey, stats, onEdit, onMove, onConnect, onDisconnect, onRejectConnection }: {
  quests: QuestDefinition[];
  layout: QuestLayout;
  issueIndexes: Set<number>;
  selectedKey: string | null;
  stats: Map<string, QuestStat>;
  onEdit: (index: number) => void;
  /** A node was dropped: its new position and the chain of the lane it landed in. */
  onMove: (key: string, position: XY, chain: string) => void;
  onConnect: (prerequisite: string, dependent: string) => void;
  onDisconnect: (prerequisite: string, dependent: string) => void;
  onRejectConnection: (message: string) => void;
}) {
  const lanes = useMemo(() => lanesOf(quests), [quests]);
  const placed = useMemo(() => placeNodes(quests, layout), [quests, layout]);
  const built = useMemo<Node[]>(() => {
    const width = Math.max(1200, ...Object.values(placed).map((p) => p.x + NODE_WIDTH + 200));
    const laneNodes: LaneNodeType[] = lanes.map((label, i) => ({
      id: `lane:${i}`, type: "lane", position: { x: -60, y: laneTop(i) }, data: { label, width },
      draggable: false, selectable: false, connectable: false, deletable: false, focusable: false, zIndex: -1,
    }));
    const questNodes: QuestNodeType[] = quests.map((quest, index) => ({
      id: quest.key, type: "quest", position: placed[quest.key], deletable: false,
      data: {
        quest, hasIssues: issueIndexes.has(index), selected: quest.key === selectedKey, stat: stats.get(quest.key),
        onEdit: () => onEdit(index),
      },
    }));
    return [...laneNodes, ...questNodes];
  }, [lanes, placed, quests, issueIndexes, selectedKey, stats, onEdit]);

  // React Flow moves nodes locally while dragging; the saved draft resets them. Keep
  // each node's measured size when resetting: React Flow hides unmeasured nodes and
  // only re-measures when an element's size changes, so dropping it would hide them.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(built);
  useEffect(() => setNodes((current) => {
    const measured = new Map(current.map((n) => [n.id, n.measured]));
    return built.map((n) => ({ ...n, measured: measured.get(n.id) }));
  }), [built, setNodes]);

  const edges = useMemo<Edge[]>(() => quests.flatMap((q) => (q.requires_quests ?? [])
    .filter((req) => quests.some((other) => other.key === req))
    .map((req) => ({ id: `${req}->${q.key}`, source: req, target: q.key, markerEnd: { type: MarkerType.ArrowClosed }, ariaLabel: `${q.key} requires ${req}` }))), [quests]);

  const isQuest = (id: string | null | undefined) => Boolean(id) && quests.some((q) => q.key === id);
  const isValidConnection = (c: Connection | Edge) => isQuest(c.source) && isQuest(c.target) && !wouldCreateCycle(quests, c.source, c.target);

  return (
    <div className="quest-canvas" aria-label="Quest graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, node) => {
          if (node.type !== "quest") return;
          onMove(node.id, node.position, lanes[laneIndexForY(node.position.y, lanes.length)]);
        }}
        isValidConnection={isValidConnection}
        onConnect={(c) => {
          if (!c.source || !c.target) return;
          if (wouldCreateCycle(quests, c.source, c.target)) onRejectConnection("Prerequisites cannot form a loop.");
          else onConnect(c.source, c.target);
        }}
        onEdgesDelete={(deleted) => deleted.forEach((e) => onDisconnect(e.source, e.target))}
        fitView
        minZoom={0.2}
      >
        <Background gap={24} />
        <MiniMap pannable zoomable nodeColor={(n) => (n.type === "lane" ? "transparent" : "#45d6bd")} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export default QuestCanvas;
