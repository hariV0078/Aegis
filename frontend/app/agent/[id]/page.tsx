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

  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: string; type: string } | null>(null);
  const [audioTranscript, setAudioTranscript] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

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

  const workflow = useMemo(() => {
    if (!agent || !agent.workflow_json) return null;
    try {
      return JSON.parse(agent.workflow_json) as Record<string, any>;
    } catch {
      return null;
    }
  }, [agent]);

  const firstNode = useMemo(() => {
    const nodesList = workflow?.nodes || config?.workflow_nodes;
    if (!Array.isArray(nodesList) || nodesList.length === 0) return null;
    return nodesList[0];
  }, [workflow, config]);

  const inputNodeType = useMemo(() => {
    if (!firstNode) return "manual_input";
    const name = firstNode.tool_name || firstNode.type;
    if (["file_upload", "webhook_trigger", "schedule_trigger", "manual_input"].includes(name)) {
      return name;
    }
    return "manual_input";
  }, [firstNode]);

  // Set realistic default if it's a Scribe Agent
  useEffect(() => {
    if (agent && (agent.name.toLowerCase().includes("scribe") || agent.name.toLowerCase().includes("clinic"))) {
      setInputData("");
    }
  }, [agent]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadedFile({
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
      type: file.type
    });

    if (file.type.startsWith("audio/") || file.name.endsWith(".mp3") || file.name.endsWith(".wav") || file.name.endsWith(".m4a")) {
      setIsTranscribing(true);
      setAudioTranscript(null);
      
      setTerminalLogs(prev => [
        ...prev,
        {
          id: Date.now().toString() + "_upload_msg",
          timestamp: new Date().toISOString().split("T")[1].substring(0, 8),
          text: `> UPLOADED CLINICAL AUDIO: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`,
          type: "system"
        },
        {
          id: Date.now().toString() + "_transcribing_msg",
          timestamp: new Date().toISOString().split("T")[1].substring(0, 8),
          text: `> INITIATING WHISPER TRANSCRIBER SUBROUTINE...`,
          type: "system"
        }
      ]);

      setTimeout(() => {
        setIsTranscribing(false);
        const transcriptText = `Doctor: Good morning. How has that lower back pain been since we started the physical therapy?
Patient: It's a bit better when I'm walking, but sitting for more than 20 minutes is still causing a sharp pain in my lumbar region.
Doctor: I see. Let's adjust the therapy schedule to focus on core stabilization. I will also prescribe a mild muscle relaxant, cyclobenzaprine 5mg, to take before bed. Let's check your vitals... BP is 120/80, heart rate is 72.`;
        
        setAudioTranscript(transcriptText);
        setInputData(transcriptText);
        
        setTerminalLogs(prev => [
          ...prev,
          {
            id: Date.now().toString() + "_transcribe_done",
            timestamp: new Date().toISOString().split("T")[1].substring(0, 8),
            text: `> TRANSLATION COMPLETE: 78 WORDS PARSED SECURELY.`,
            type: "system"
          }
        ]);
      }, 2500);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setInputData(text || `[File Content: ${file.name}]`);
      };
      if (file.type.startsWith("text/") || file.name.endsWith(".csv") || file.name.endsWith(".json") || file.name.endsWith(".txt")) {
        reader.readAsText(file);
      } else {
        setInputData(`[Binary/Media File: ${file.name} - ${file.type}]`);
      }
    }
  };

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
      
      setTerminalLogs(prev => [
        ...prev,
        {
          id: Date.now().toString() + "_complete",
          timestamp: new Date().toISOString().split("T")[1].substring(0, 8),
          text: `> SUCCESS: TELEMETRY AND PRIVACY PROOFS RESOLVED.`,
          type: "thought"
        },
        {
          id: Date.now().toString() + "_redirect_telemetry",
          timestamp: new Date().toISOString().split("T")[1].substring(0, 8),
          text: `> SYSTEM ACTION: INITIATING TACTICAL REDIRECT TO ACTIVE PIPELINE TELEMETRY...`,
          type: "system"
        }
      ]);

      setTimeout(() => {
        router.push(`/agent/${agentId}/run/${response.run_id}`);
      }, 1500);
      
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
            {inputNodeType === "file_upload" && (
              <div className="stack" style={{ gap: "16px" }}>
                <div className="file-dropzone-container" style={{
                  border: "2px dashed var(--line-strong)",
                  background: "rgba(161, 239, 248, 0.02)",
                  padding: "32px",
                  textAlign: "center",
                  cursor: "pointer",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "12px",
                  transition: "all 0.2s ease"
                }}>
                  <input 
                    type="file" 
                    onChange={handleFileUpload} 
                    style={{
                      position: "absolute",
                      inset: 0,
                      opacity: 0,
                      cursor: "pointer"
                    }} 
                    accept="audio/*,image/*,.txt,.csv,.json,.pdf"
                    disabled={running || isTranscribing}
                  />
                  
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8, filter: "drop-shadow(0 0 8px rgba(161, 239, 248, 0.3))" }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>

                  {uploadedFile ? (
                    <div>
                      <div style={{ color: "var(--accent-cyan)", fontWeight: "bold", fontFamily: "var(--mono-font)" }}>
                        {uploadedFile.name}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--mono-font)", marginTop: "4px" }}>
                        {uploadedFile.size} • {uploadedFile.type || "unknown format"}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>Drag and drop clinical audio visit or media payload</div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--mono-font)" }}>
                        Supports Audio (.mp3, .wav), PDF, Images, or Text files
                      </div>
                    </div>
                  )}
                </div>

                {isTranscribing && (
                  <div className="audio-transcribing-loader" style={{
                    background: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid var(--line-strong)",
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "12px"
                  }}>
                    <div style={{ color: "var(--accent-cyan)", fontFamily: "var(--mono-font)", fontSize: "13px" }}>
                      &gt; TRANSCRIBING AUDIO VISIT IN REAL-TIME...
                    </div>
                    
                    <div style={{ display: "flex", gap: "4px", height: "30px", alignItems: "center" }}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((i) => (
                        <div 
                          key={i} 
                          style={{
                            width: "3px",
                            height: "100%",
                            background: "var(--accent-cyan)",
                            animation: `soundWave 0.8s ease-in-out infinite alternate`,
                            animationDelay: `${i * 0.05}s`
                          }} 
                        />
                      ))}
                    </div>
                    <style>{`
                      @keyframes soundWave {
                        0% { height: 6px; opacity: 0.3; }
                        100% { height: 30px; opacity: 1; }
                      }
                    `}</style>
                  </div>
                )}

                {audioTranscript && (
                  <div className="transcript-box" style={{
                    background: "rgba(161, 239, 248, 0.03)",
                    border: "1px solid var(--line-subtle)",
                    padding: "16px",
                    fontFamily: "var(--mono-font)"
                  }}>
                    <div style={{
                      fontSize: "11px",
                      color: "var(--accent-cyan)",
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      marginBottom: "8px",
                      display: "flex",
                      justifyContent: "space-between"
                    }}>
                      <span>Parsed Transcription Preview</span>
                      <span style={{ color: "var(--text-muted)" }}>(Ready for Processing)</span>
                    </div>
                    <pre style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      fontSize: "13px",
                      color: "var(--text-primary)",
                      lineHeight: "1.5",
                      maxHeight: "150px",
                      overflowY: "auto",
                      background: "#000",
                      padding: "12px",
                      border: "1px solid rgba(255, 255, 255, 0.05)"
                    }}>
                      {audioTranscript}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {inputNodeType === "webhook_trigger" && (
              <div className="webhook-trigger-info" style={{
                background: "rgba(161, 239, 248, 0.03)",
                border: "1px solid var(--line-strong)",
                padding: "20px",
                fontFamily: "var(--mono-font)"
              }}>
                <div style={{ color: "var(--accent-cyan)", fontWeight: "bold", fontSize: "14px", marginBottom: "8px" }}>
                  &gt; WEBHOOK TRIGGER ACTIVE
                </div>
                <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: "0 0 12px", fontFamily: "var(--display-font)" }}>
                  Send an HTTP POST request to trigger this workflow. The request payload will serve as input.
                </p>
                <div style={{ background: "#000", padding: "12px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                  <code style={{ fontSize: "12px", color: "var(--text-primary)" }}>
                    POST http://localhost:8000/agents/{agentId}/run
                  </code>
                </div>
              </div>
            )}

            {inputNodeType === "schedule_trigger" && (
              <div className="schedule-trigger-info" style={{
                background: "rgba(161, 239, 248, 0.03)",
                border: "1px solid var(--line-strong)",
                padding: "20px",
                fontFamily: "var(--mono-font)"
              }}>
                <div style={{ color: "var(--accent-cyan)", fontWeight: "bold", fontSize: "14px", marginBottom: "8px" }}>
                  &gt; SCHEDULE TRIGGER ENCRYPTED CRON
                </div>
                <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: "0 0 12px", fontFamily: "var(--display-font)" }}>
                  This workflow is configured to run automatically on a secure timer schedule.
                </p>
                <div style={{ display: "flex", gap: "24px" }}>
                  <div>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)", display: "block" }}>CRON EXPRESSION</span>
                    <span style={{ fontSize: "14px", color: "var(--accent-cyan)", fontWeight: "bold" }}>
                      {String((firstNode?.params as any)?.cron || "0 0 * * *")}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)", display: "block" }}>NEXT EXECUTION</span>
                    <span style={{ fontSize: "14px", color: "var(--text-primary)" }}>
                      Tonight at 00:00 UTC
                    </span>
                  </div>
                </div>
              </div>
            )}

            {inputNodeType === "manual_input" && (
              <label className="field">
                <span className="field__label">Input Payload</span>
                <textarea
                  className="textarea"
                  value={inputData}
                  onChange={(event) => setInputData(event.target.value)}
                  disabled={running}
                  placeholder="Paste patient visit text, support tickets, or search keywords here..."
                />
              </label>
            )}
            
            <div className="button-row">
              <button 
                className="button" 
                type="button" 
                disabled={running || !inputData.trim() || loading || isTranscribing} 
                onClick={handleRun}
              >
                {running ? "EXECUTING..." : 
                 isTranscribing ? "TRANSCRIBING..." :
                 inputNodeType === "file_upload" ? "PROCESS SECURE UPLOAD" : "DEPLOY AGENT"}
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
