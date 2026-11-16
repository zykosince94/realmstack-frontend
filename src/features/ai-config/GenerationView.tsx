import { AlertTriangle, Check, Loader2, Rocket, X } from "lucide-react";
import type { AIGeneration, Config } from "../../api/types";
import { answerOf, generates, operationLabel, proposalRows, usageLabel } from "../../lib/ai";
import { runningStatuses } from "../../hooks/queries";

/**
 * One generation as a review: what the AI proposes, whether it validates, and the two
 * human steps: apply to the draft, then publish. An invalid proposal shows why and
 * offers no Apply button; the server would refuse it anyway.
 */
export function GenerationView({ generation: g, draft, busy, published, onApply, onDiscard, onPublish }: {
  generation: AIGeneration;
  draft: Config | undefined;
  busy: boolean;
  /** True once the applied proposal has been published in this session. */
  published: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onPublish: () => void;
}) {
  const running = runningStatuses.includes(g.status);
  const rows = proposalRows(g.proposal, draft);
  const answer = answerOf(g);
  const finished = ["valid", "invalid", "answered", "failed"].includes(g.status);
  return (
    <section className="panel generation" aria-label={`Generation ${operationLabel(g.operation)}`}>
      <div className="panel-heading">
        <div>
          <h3>{operationLabel(g.operation)} <span className={`status-pill ${g.status}`}>{g.status}</span></h3>
          <p>{g.model} · {new Date(g.created_at).toLocaleString()} · {usageLabel(g.usage)}</p>
        </div>
      </div>
      {running && <p className="generation-running" role="status"><Loader2 size={16} className="spin" /> Generating… this can take a minute. You can leave this screen; it keeps running.</p>}
      {g.error && <div className="notice error" role="alert"><span><X size={16} /></span>{g.error.message} <code>{g.error.code}</code></div>}
      {g.notes && <p className="generation-notes">{g.notes}</p>}

      {answer.text && <p className="generation-answer">{answer.text}</p>}
      {answer.cases && (
        <ol className="test-cases">{answer.cases.map((c, i) => (
          <li key={i}><b>{c.name}</b> <span className={`badge ${c.kind}`}>{c.kind}</span><p>{c.description}</p>
            {c.steps.length > 0 && <ol>{c.steps.map((s, j) => <li key={j}>{s}</li>)}</ol>}<small>Expected: {c.expected}</small></li>
        ))}</ol>
      )}

      {generates(g.operation) && rows.length > 0 && (
        <div className="table-wrap"><table aria-label="Proposed definitions">
          <thead><tr><th>Collection</th><th>Key</th><th>Name</th><th>Change</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={`${r.collection}:${r.key}`}><td>{r.collection}</td><td><code>{r.key}</code></td><td>{r.name}</td><td><span className={`badge ${r.change}`}>{r.change}</span></td></tr>)}</tbody>
        </table></div>
      )}

      {g.errors.length > 0 && (
        <div className="issue-bar" role="status">
          <AlertTriangle size={16} /><b>This proposal can't be applied: {g.errors.length} validation issue{g.errors.length === 1 ? "" : "s"}</b>
          <ul>{g.errors.slice(0, 12).map((e) => <li key={e.field}><code>{e.field}</code> {e.message}</li>)}</ul>
        </div>
      )}

      {g.proposal && <details className="generation-json"><summary>Proposal JSON</summary><pre>{JSON.stringify(g.proposal, null, 2)}</pre></details>}

      <div className="button-row">
        {g.status === "valid" && <button className="button primary" disabled={busy} onClick={onApply}><Check size={15} /> Apply to draft</button>}
        {finished && <button className="button secondary" disabled={busy} onClick={onDiscard}>Discard</button>}
        {g.status === "applied" && !published && <button className="button primary" disabled={busy} onClick={onPublish}><Rocket size={15} /> Publish draft</button>}
      </div>
      {g.status === "valid" && <p className="small-note">Applying changes only the draft. Nothing reaches players until you publish.</p>}
      {g.status === "applied" && <p className="small-note">{published ? "Published." : "Applied to the draft. Review it in the editors, then publish to make it live."}</p>}
    </section>
  );
}
