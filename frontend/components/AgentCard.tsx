import Link from "next/link";

import type { Agent } from "@/lib/api";

type Props = {
  agent: Agent;
};

export function AgentCard({ agent }: Props) {
  return (
    <Link href={`/agent/${agent.id}`} className="agent-card">
      <div className="agent-card__topline">
        <span className={`status-pill status-pill--${agent.status}`}>{agent.status}</span>
        <span className="agent-card__runs">{agent.total_runs} runs</span>
      </div>
      <h3 className="agent-card__title">{agent.name}</h3>
      <p className="agent-card__description">{agent.description}</p>
      <div className="agent-card__footer">
        <span>PII transmitted: {agent.pii_transmitted}</span>
        <span>Open details →</span>
      </div>
    </Link>
  );
}
