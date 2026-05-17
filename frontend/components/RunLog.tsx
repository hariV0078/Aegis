import type { AgentRun } from "@/lib/api";

type Props = {
  runs: AgentRun[];
};

export function RunLog({ runs }: Props) {
  if (runs.length === 0) {
    return <div className="empty-state">No runs yet. Run the agent to see activity here.</div>;
  }

  return (
    <div className="run-log">
      {runs.map((run) => (
        <article key={run.id} className="run-log__item">
          <div className="run-log__row">
            <span className={`status-pill status-pill--${run.status}`}>{run.status}</span>
            <span className="run-log__meta">{run.llm_provider}</span>
          </div>
          <div className="run-log__meta">PII stripped: {run.pii_items_stripped}</div>
          <div className="run-log__summary">{run.output_summary ?? "No summary"}</div>
          <div className="run-log__time">{new Date(run.started_at).toLocaleString()}</div>
        </article>
      ))}
    </div>
  );
}
