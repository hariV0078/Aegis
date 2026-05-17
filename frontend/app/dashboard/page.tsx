"use client";

import { useEffect, useState } from "react";

import { AgentCard } from "@/components/AgentCard";
import { KeyVault } from "@/components/KeyVault";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { getAuditLog, listAgents, deleteAgent, type Agent } from "@/lib/api";

export default function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [auditEntries, setAuditEntries] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "management">("overview");

  useEffect(() => {
    async function load() {
      try {
        const [nextAgents, nextAudit] = await Promise.all([listAgents(), getAuditLog(8)]);
        setAgents(nextAgents);
        setAuditEntries(nextAudit);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const handleDeleteAgent = async (agentId: string) => {
    if (!confirm("Are you sure you want to delete this agent? All runs and history will be lost.")) {
      return;
    }
    try {
      await deleteAgent(agentId);
      setAgents((prev) => prev.filter((a) => a.id !== agentId));
    } catch (error) {
      console.error("Failed to delete agent:", error);
      alert("Failed to delete agent. See console for details.");
    }
  };

  const totalRuns = agents.reduce((sum, agent) => sum + agent.total_runs, 0);

  return (
    <main className="detail-shell">
      <section className="panel">
        <div className="dashboard-header">
          <div>
            <h1 className="detail-title">Dashboard</h1>
            <p className="detail-description">Track agents, runs, and the privacy proof from one screen.</p>
          </div>
          <PrivacyBadge piiStripped={agents.reduce((sum, agent) => sum + agent.pii_transmitted, 0)} piiTransmitted={0} />
        </div>

        <div className="mini-grid section" style={{ marginTop: 18 }}>
          <div className="mini-stat">
            <div className="mini-stat__label">Agents</div>
            <div className="mini-stat__value">{agents.length}</div>
          </div>
          <div className="mini-stat">
            <div className="mini-stat__label">Runs</div>
            <div className="mini-stat__value">{totalRuns}</div>
          </div>
          <div className="mini-stat">
            <div className="mini-stat__label">Audit events</div>
            <div className="mini-stat__value">{auditEntries.length}</div>
          </div>
        </div>
      </section>

      <div className="tabs-container">
        <div className="tabs-list">
          <button 
            className="tab-trigger" 
            data-state={activeTab === "overview" ? "active" : "inactive"}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>
          <button 
            className="tab-trigger" 
            data-state={activeTab === "management" ? "active" : "inactive"}
            onClick={() => setActiveTab("management")}
          >
            Management
          </button>
        </div>

        <div className="tab-content" data-state={activeTab === "overview" ? "active" : "inactive"}>
          <div className="detail-shell">
            <KeyVault />

            <section className="section">
              <h2 className="section__title">Agents</h2>
              {loading ? <div className="empty-state">Loading agents...</div> : null}
              {!loading && agents.length === 0 ? <div className="empty-state">No agents yet. Create one from the home page.</div> : null}
              {agents.length > 0 ? <div className="agent-grid">{agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}</div> : null}
            </section>

            <section className="section">
              <h2 className="section__title">Latest audit events</h2>
              {auditEntries.length === 0 ? <div className="empty-state">No audit events have been written yet.</div> : null}
              {auditEntries.length > 0 ? (
                <div className="run-log">
                  {auditEntries.map((entry, index) => (
                    <article key={`${String(entry.run_id ?? index)}-${index}`} className="run-log__item">
                      <div className="run-log__row">
                        <span className="status-pill status-pill--success">{String(entry.event ?? "event")}</span>
                        <span className="run-log__meta">{String(entry.run_id ?? "-")}</span>
                      </div>
                      <div className="run-log__summary">{String((entry.data as { status?: string } | undefined)?.status ?? "Logged event")}</div>
                      <div className="run-log__time">{String(entry.timestamp ?? "")}</div>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        </div>

        <div className="tab-content" data-state={activeTab === "management" ? "active" : "inactive"}>
          <section className="section">
            <h2 className="section__title">Agents Management</h2>
            <p className="detail-description" style={{ marginBottom: "24px" }}>
              Manage your active agents. Deleting an agent will permanently remove all associated runs and logs.
            </p>
            
            {loading ? <div className="empty-state">Loading agents...</div> : null}
            {!loading && agents.length === 0 ? <div className="empty-state">No agents available to manage.</div> : null}
            
            {agents.length > 0 ? (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Description</th>
                      <th>Total Runs</th>
                      <th>Created At</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map(agent => (
                      <tr key={agent.id}>
                        <td style={{ color: "var(--accent-cyan)", fontWeight: 500 }}>{agent.name}</td>
                        <td style={{ color: "var(--text-muted)" }}>
                          {agent.description.length > 50 ? agent.description.substring(0, 50) + "..." : agent.description}
                        </td>
                        <td>{agent.total_runs}</td>
                        <td style={{ color: "var(--text-muted)" }}>
                          {new Date(agent.created_at).toLocaleString()}
                        </td>
                        <td>
                          <button 
                            className="action-button--danger"
                            onClick={() => handleDeleteAgent(agent.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
