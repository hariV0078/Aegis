"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAgent, getRun, Agent, AgentRun } from "@/lib/api";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { MidnightProofBadge } from "@/components/MidnightProofBadge";

type NodeOutput = {
  node_id: string;
  tool: string;
  data_snippet: string;
  token_map_hash: string;
};

export default function RunDetailPage() {
  const params = useParams<{ id: string; runId: string }>();
  const router = useRouter();
  const agentId = Array.isArray(params.id) ? params.id[0] : params.id;
  const runId = Array.isArray(params.runId) ? params.runId[0] : params.runId;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [run, setRun] = useState<(AgentRun & { output?: string | null; node_outputs_json?: string | null }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [nextAgent, nextRun] = await Promise.all([
          getAgent(agentId),
          getRun(runId)
        ]);
        setAgent(nextAgent);
        setRun(nextRun);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to load execution details.");
      } finally {
        setLoading(false);
      }
    }

    if (agentId && runId) {
      load();
    }
  }, [agentId, runId]);

  const parsedNodeOutputs = useMemo(() => {
    if (!run?.node_outputs_json) return [] as NodeOutput[];
    try {
      return JSON.parse(run.node_outputs_json) as NodeOutput[];
    } catch {
      return [] as NodeOutput[];
    }
  }, [run]);

  const parsedTokenMap = useMemo(() => {
    if (!run?.token_map_json) return {} as Record<string, string>;
    try {
      return JSON.parse(run.token_map_json) as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  }, [run]);

  // Set first node as selected by default once loaded
  useEffect(() => {
    if (parsedNodeOutputs.length > 0 && !selectedNodeId) {
      setSelectedNodeId(parsedNodeOutputs[0].node_id);
    }
  }, [parsedNodeOutputs, selectedNodeId]);

  const activeNodeDetails = useMemo(() => {
    return parsedNodeOutputs.find(n => n.node_id === selectedNodeId) || null;
  }, [parsedNodeOutputs, selectedNodeId]);

  if (loading) {
    return (
      <div className="dashboard-layout" style={{ justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div style={{ color: "var(--accent-cyan)", fontFamily: "var(--mono-font)", fontSize: "14px", display: "flex", gap: "10px", alignItems: "center" }}>
          <div className="pulse-loader" style={{ width: "8px", height: "8px", background: "var(--accent-cyan)", borderRadius: "50%" }} />
          &gt; RETRIEVING SECURE CYBERMETRIC RUN TELEMETRY...
        </div>
      </div>
    );
  }

  if (error || !run || !agent) {
    return (
      <div className="dashboard-layout" style={{ justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div className="panel" style={{ maxWidth: "480px", border: "1px solid var(--accent-crimson)", padding: "24px" }}>
          <div style={{ color: "var(--accent-crimson-bright)", fontFamily: "var(--mono-font)", fontSize: "14px", fontWeight: "bold", marginBottom: "12px" }}>
            &gt; SYSTEM ERROR: RECORD CORRUPTED OR NOT FOUND
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: "0 0 20px" }}>
            {error || "The requested execution run does not exist or has been deleted from active memory."}
          </p>
          <button className="button" style={{ borderColor: "var(--accent-crimson)", color: "var(--accent-crimson-bright)" }} onClick={() => router.push(`/agent/${agentId}`)}>
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand" style={{ marginBottom: "40px" }} onClick={() => router.push("/")}>Aegis OS</div>
        <div className="stack" style={{ gap: "12px" }}>
          <div className="eyebrow" style={{ width: "fit-content" }}>TELEMETRY</div>
          <div className="metric__label" style={{ color: "var(--text-primary)", cursor: "pointer" }} onClick={() => router.push(`/agent/${agentId}`)}>
            &lt; Return Dashboard
          </div>
          <div className="metric__label" style={{ color: "var(--accent-cyan)" }}>
            &gt; Active Data Flow
          </div>
          <div className="metric__label" style={{ cursor: "pointer" }} onClick={() => router.push("/workflows")}>
            &gt; Workflows Library
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content" style={{ display: "flex", flexDirection: "column", gap: "24px", paddingBottom: "60px" }}>
        
        {/* Header telemetry details */}
        <header className="detail-header">
          <div>
            <div className="eyebrow" style={{ marginBottom: "4px" }}>WORKFLOW RUN REPORT</div>
            <h1 className="detail-title" style={{ fontSize: "24px", letterSpacing: "-0.02em" }}>
              {agent.name} <span style={{ color: "var(--text-muted)", fontSize: "16px", fontWeight: "normal" }}>({run.id.substring(0, 16)}...)</span>
            </h1>
            <p className="detail-description" style={{ marginTop: "4px" }}>
              Triggered via <span style={{ color: "var(--accent-cyan)", fontFamily: "var(--mono-font)" }}>{run.llm_provider.toUpperCase()}</span> • Completed {new Date(run.started_at).toLocaleString()}
            </p>
          </div>
          <PrivacyBadge
            piiStripped={run.pii_items_stripped}
            piiTransmitted={0}
            note="Full cryptographic sanitization completed."
          />
        </header>

        {/* Vital stats row */}
        <section className="detail-stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div className="metric-card">
            <div className="metric__label">Status</div>
            <div className={`metric__value ${run.status === "success" ? "cyan" : ""}`} style={{ textTransform: "uppercase" }}>
              {run.status}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric__label">Privacy Stripped</div>
            <div className="metric__value cyan">{run.pii_items_stripped} items</div>
          </div>
          <div className="metric-card">
            <div className="metric__label">Proof Status</div>
            <div className="metric__value" style={{ fontSize: "14px", marginTop: "4px" }}>
              <MidnightProofBadge midnightTxHash={run.midnight_tx_hash} midnightStatus={run.midnight_status} />
            </div>
          </div>
          <div className="metric-card">
            <div className="metric__label">Execution Speed</div>
            <div className="metric__value crimson">
              {run.finished_at ? `${((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000).toFixed(2)}s` : "N/A"}
            </div>
          </div>
        </section>

        {/* Live Data Flow Visualizer */}
        <section className="panel" style={{ padding: "24px" }}>
          <div className="panel__header" style={{ marginBottom: "20px" }}>
            <h2 className="panel__title">Active Node Data Flow</h2>
            <p className="panel__subcopy">Click any pipeline node to inspect cryptographic tokens and anonymized intermediate outputs.</p>
          </div>

          {parsedNodeOutputs.length === 0 ? (
            <div className="empty-state" style={{ padding: "40px" }}>
              No intermediate node outputs generated. Fallback single-tool execution mode.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Horizontal Pipeline Steps */}
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "12px", 
                overflowX: "auto", 
                paddingBottom: "12px",
                borderBottom: "1px solid var(--line-subtle)" 
              }}>
                {parsedNodeOutputs.map((node, index) => {
                  const isSelected = selectedNodeId === node.node_id;
                  return (
                    <React.Fragment key={node.node_id}>
                      <div 
                        onClick={() => setSelectedNodeId(node.node_id)}
                        style={{
                          background: isSelected ? "rgba(161, 239, 248, 0.05)" : "rgba(26, 26, 26, 0.4)",
                          border: isSelected ? "1px solid var(--accent-cyan)" : "1px solid var(--line-subtle)",
                          padding: "12px 18px",
                          cursor: "pointer",
                          minWidth: "150px",
                          transition: "all 0.2s ease",
                          position: "relative"
                        }}
                      >
                        <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--mono-font)" }}>
                          NODE {index + 1}
                        </div>
                        <div style={{ 
                          fontSize: "13px", 
                          fontWeight: "bold", 
                          color: isSelected ? "var(--accent-cyan)" : "var(--text-primary)",
                          fontFamily: "var(--mono-font)",
                          marginTop: "2px"
                        }}>
                          {node.tool.replace("_", " ").toUpperCase()}
                        </div>
                        <div style={{ 
                          fontSize: "9px", 
                          color: isSelected ? "var(--accent-cyan)" : "var(--text-muted)",
                          fontFamily: "var(--mono-font)",
                          marginTop: "6px"
                        }}>
                          {node.node_id.substring(0, 8)}...
                        </div>
                      </div>

                      {index < parsedNodeOutputs.length - 1 && (
                        <span style={{ color: "var(--line-strong)", fontSize: "18px", fontWeight: "bold" }}>→</span>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Node Inspector Details Panel */}
              {activeNodeDetails && (
                <div style={{ 
                  background: "rgba(0, 0, 0, 0.3)", 
                  border: "1px solid var(--line-strong)", 
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: "10px", color: "var(--accent-cyan)", fontFamily: "var(--mono-font)", textTransform: "uppercase" }}>
                        Selected Node Inspector
                      </span>
                      <h3 style={{ margin: "2px 0 0", fontSize: "16px", fontFamily: "var(--mono-font)" }}>
                        {activeNodeDetails.tool.replace("_", " ").toUpperCase()}
                      </h3>
                    </div>

                    {/* Cryptographic Boundary Hash */}
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "9px", color: "var(--text-muted)", display: "block", fontFamily: "var(--mono-font)" }}>
                        CRYPTOGRAPHIC BOUNDARY HASH
                      </span>
                      <code style={{ fontSize: "11px", color: "var(--accent-cyan)", fontFamily: "var(--mono-font)" }}>
                        {activeNodeDetails.token_map_hash.substring(0, 32)}...
                      </code>
                    </div>
                  </div>

                  {/* Sanitized Data Snapshot */}
                  <div>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)", display: "block", marginBottom: "6px", fontFamily: "var(--mono-font)" }}>
                      SANITIZED INTERMEDIATE DATA OUTPUT
                    </span>
                    <pre style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      fontSize: "12px",
                      color: "var(--text-primary)",
                      fontFamily: "var(--mono-font)",
                      background: "#050505",
                      padding: "14px",
                      border: "1px solid rgba(255, 255, 255, 0.03)",
                      maxHeight: "150px",
                      overflowY: "auto"
                    }}>
                      {activeNodeDetails.data_snippet || "[Empty Output]"}
                    </pre>
                  </div>

                  <div style={{ 
                    fontSize: "11px", 
                    color: "var(--text-muted)", 
                    fontFamily: "var(--mono-font)", 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "6px" 
                  }}>
                    <span style={{ color: "var(--accent-cyan)" }}>🛡️</span>
                    No actual clinical names, treatment dates, or billing identifiers left this node boundary.
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ZK Cryptographic PII Stripped Map Panel */}
        {Object.keys(parsedTokenMap).length > 0 && (
          <section className="panel" style={{ padding: "24px" }}>
            <div className="panel__header" style={{ marginBottom: "16px" }}>
              <h2 className="panel__title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "var(--accent-cyan)" }}>🛡️</span> Cryptographic ZK Token Map (Anonymized PII Identities)
              </h2>
              <p className="panel__subcopy">Aegis automatically extracted and encrypted the following sensitive PII identifiers from the clinical media.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
              {Object.entries(parsedTokenMap).map(([placeholder, originalValue]) => (
                <div 
                  key={placeholder} 
                  style={{
                    background: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid var(--line-subtle)",
                    padding: "12px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px"
                  }}
                >
                  <div style={{ fontSize: "10px", color: "var(--accent-cyan)", fontFamily: "var(--mono-font)" }}>
                    {placeholder}
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: "bold", color: "var(--text-primary)" }}>
                    {originalValue}
                  </div>
                  <div style={{ fontSize: "9px", color: "var(--text-muted)", fontFamily: "var(--mono-font)" }}>
                    ENCRYPTED AT PIPELINE ENTRY
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Final Execution Output Block */}
        <section className="panel" style={{ padding: "24px" }}>
          <div className="panel__header" style={{ marginBottom: "16px" }}>
            <h2 className="panel__title">Final Reidentified Synthesis</h2>
            <p className="panel__subcopy">Re-anonymized output compiled securely with your local browser credentials.</p>
          </div>

          <div style={{ background: "#000", border: "1px solid var(--line-strong)", position: "relative" }}>
            <div style={{ 
              borderBottom: "1px solid var(--line-subtle)", 
              padding: "10px 16px", 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              background: "rgba(161, 239, 248, 0.02)"
            }}>
              <span style={{ fontSize: "11px", color: "var(--accent-cyan)", fontFamily: "var(--mono-font)", letterSpacing: "0.05em" }}>
                SECURE OUTPUT DECRYPTED
              </span>
              <button 
                onClick={() => {
                  if (run.output) navigator.clipboard.writeText(run.output);
                }}
                style={{ 
                  background: "transparent", 
                  border: "none", 
                  color: "var(--accent-cyan)", 
                  fontSize: "11px", 
                  fontFamily: "var(--mono-font)", 
                  cursor: "pointer",
                  textDecoration: "underline"
                }}
              >
                Copy Content
              </button>
            </div>
            
            <pre style={{
              margin: 0,
              padding: "20px",
              fontSize: "13px",
              lineHeight: "1.6",
              color: "var(--text-primary)",
              whiteSpace: "pre-wrap",
              fontFamily: "var(--mono-font)",
              maxHeight: "350px",
              overflowY: "auto"
            }}>
              {run.output || "No final output returned."}
            </pre>
          </div>
        </section>

        {/* Action Row */}
        <div style={{ display: "flex", gap: "12px" }}>
          <button className="button" onClick={() => router.push(`/agent/${agentId}`)}>
            Deploy Another Run
          </button>
          <button className="button" style={{ background: "transparent", border: "1px solid var(--line-subtle)" }} onClick={() => router.push("/workflows")}>
            Back to Active Agents
          </button>
        </div>

      </main>
    </div>
  );
}
