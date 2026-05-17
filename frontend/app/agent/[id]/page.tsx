"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { PrivacyBadge } from "@/components/PrivacyBadge";
import { MidnightProofBadge } from "@/components/MidnightProofBadge";
import { Terminal, type TerminalLog } from "@/components/Terminal";
import { getAgent, getRuns, runAgent, type Agent, type AgentRun } from "@/lib/api";
import { loadKey } from "@/lib/keystore";

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const agentId = Array.isArray(params.id) ? params.id[0] : params.id;
  
  const [agent, setAgent] = useState<Agent | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [inputData, setInputData] = useState(
    "Review the latest customer feedback and surface three repeated defect patterns.",
  );
  
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState("");
  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [nextAgent, nextRuns] = await Promise.all([getAgent(agentId), getRuns(agentId)]);
        setAgent(nextAgent);
        setRuns(nextRuns);
        
        setTerminalLogs([
          {
            id: Date.now().toString(),
            timestamp: new Date().toISOString().split("T")[1].substring(0, 8),
            text: `Agent loaded successfully. Ready for input.`,
            type: "system",
          }
        ]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to load agent.");
      } finally {
        setLoading(false);
      }
    }

    if (agentId) {
      load();
    }
  }, [agentId]);

  useEffect(() => {
    if (!agentId) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const nextRuns = await getRuns(agentId);
        setRuns(nextRuns);
      } catch {
        // Keep the current view if background refresh fails.
      }
    }, 5000);

    return () => window.clearInterval(interval);
  }, [agentId]);

  const config = useMemo(() => {
    if (!agent) return null;
    try {
      return JSON.parse(agent.config_json) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [agent]);

  async function handleRun() {
    if (!agentId) return;
    
    setRunning(true);
    setError("");
    setResult("");
    
    const timeNow = new Date().toISOString().split("T")[1].substring(0, 8);
    setTerminalLogs(prev => [
      ...prev,
      {
        id: Date.now().toString() + "_start",
        timestamp: timeNow,
        text: `> INITIATING SEQUENCE: PROCESSING INPUT...`,
        type: "system"
      }
    ]);
    
    try {
      const stored = loadKey();
      
      setTerminalLogs(prev => [
        ...prev,
        {
          id: Date.now().toString() + "_auth",
          timestamp: new Date().toISOString().split("T")[1].substring(0, 8),
          text: `> CONNECTING TO LLM: ${stored?.provider ?? "groq"}`,
          type: "system"
        }
      ]);
      
      const response = await runAgent(agentId, {
        input_data: inputData,
        llm_provider: stored?.provider ?? "groq",
        api_key: stored?.key ?? null,
      });
      
      setResult(response.output);
      
      const nextRuns = await getRuns(agentId);
      const nextAgent = await getAgent(agentId);
      setRuns(nextRuns);
      setAgent(nextAgent);
      
      setTerminalLogs(prev => [
        ...prev,
        {
          id: Date.now().toString() + "_complete",
          timestamp: new Date().toISOString().split("T")[1].substring(0, 8),
          text: `> OUTPUT GENERATED:\n${response.output}`,
          type: "thought"
        }
      ]);
      
    } catch (cause) {
      const errMsg = cause instanceof Error ? cause.message : "Failed to run the agent.";
      setError(errMsg);
      
      setTerminalLogs(prev => [
        ...prev,
        {
          id: Date.now().toString() + "_error",
          timestamp: new Date().toISOString().split("T")[1].substring(0, 8),
          text: `> CRITICAL ERROR: ${errMsg}`,
          type: "error"
        }
      ]);
    } finally {
      setRunning(false);
    }
  }

  const latestRun = runs[0] ?? null;
  const piiStripped = latestRun?.pii_items_stripped ?? agent?.pii_transmitted ?? 0;
  
  // Calculate Uptime mock for the aesthetic
  const uptime = loading ? "..." : "99.98%";
  const signalStatus = running ? "TRANSMITTING" : "PALE CYAN STRENGTH";

  return (
    <div className="dashboard-layout">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand" style={{ marginBottom: "40px" }}>Aegis OS</div>
        <div className="stack" style={{ gap: "12px" }}>
          <div className="eyebrow" style={{ width: "fit-content" }}>Modules</div>
          <div className="metric__label" style={{ color: "var(--text-primary)" }}>&gt; Dashboard</div>
          <div className="metric__label">&gt; Privacy Proofs</div>
          <div className="metric__label">&gt; Network</div>
          <div className="metric__label">&gt; Settings</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="detail-header">
          <div>
            <h1 className="detail-title">{agent?.name ?? "AGENT 01 - RECON"}</h1>
            <p className="detail-description">{agent?.description ?? "Awaiting mission parameters..."}</p>
          </div>
          <PrivacyBadge
            piiStripped={piiStripped}
            piiTransmitted={agent?.pii_transmitted ?? 0}
            note={latestRun ? `Last run: ${new Date(latestRun.started_at).toLocaleString()}` : "No run history."}
          />
        </header>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="button" onClick={() => router.push(`/agent/${agentId}/edit`)}>Edit Workflow</button>
          </div>

        {/* Dashboard Vital Metrics */}
        <section className="detail-stats">
          <div className="metric-card">
            <div className="metric__label">Status</div>
            <div className={`metric__value ${running ? 'cyan' : ''}`}>{agent?.status ?? (loading ? "LOADING" : "IDLE")}</div>
          </div>
          <div className="metric-card">
            <div className="metric__label">Signal</div>
            <div className={`metric__value ${running ? 'cyan' : ''}`}>{signalStatus}</div>
          </div>
          <div className="metric-card">
            <div className="metric__label">Heartbeat</div>
            <div className="metric__value crimson">{uptime}</div>
          </div>
        </section>

        {/* Main Terminal Component */}
        <section className="terminal-section">
          <Terminal 
            logs={terminalLogs} 
            personaName={agent?.name ?? "AGENT 01 - RECON"}
            isStreaming={running || loading} 
          />
        </section>

        {/* Input & Execution Panel */}
        <section className="panel detail-panel" style={{ marginTop: "16px" }}>
          <div className="panel__header">
            <h2 className="panel__title">Command Interface</h2>
            <p className="panel__subcopy">Input data for processing. PII will be sanitized automatically.</p>
          </div>
          
          <div className="stack">
            <label className="field">
              <span className="field__label">Input Payload</span>
              <textarea
                className="textarea"
                value={inputData}
                onChange={(event) => setInputData(event.target.value)}
                disabled={running}
              />
            </label>
            
            <div className="button-row">
              <button 
                className="button" 
                type="button" 
                disabled={running || !inputData.trim() || loading} 
                onClick={handleRun}
              >
                {running ? "EXECUTING..." : "DEPLOY AGENT"}
              </button>
            </div>
          </div>
        </section>

        <section className="panel detail-panel" style={{ marginTop: "16px" }}>
          <div className="panel__header">
            <h2 className="panel__title">Run History</h2>
            <p className="panel__subcopy">Local execution records plus Midnight proof status when available.</p>
          </div>

          {runs.length === 0 ? (
            <div className="empty-state">No runs yet. Run the agent to see activity here.</div>
          ) : (
            <div className="run-history-table">
              <div className="run-history-table__row run-history-table__row--head">
                <span>Time</span>
                <span>Status</span>
                <span>PII Stripped</span>
                <span>Midnight</span>
              </div>
              {runs.map((run) => (
                <div key={run.id} className="run-history-table__row">
                  <span>{new Date(run.started_at).toLocaleString()}</span>
                  <span>{run.status}</span>
                  <span>{run.pii_items_stripped}</span>
                  <span>
                    <MidnightProofBadge midnightTxHash={run.midnight_tx_hash} midnightStatus={run.midnight_status} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
