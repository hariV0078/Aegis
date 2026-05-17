"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAgent, generateAgentConfig } from "@/lib/api";
import CanvasEditor from "@/components/CanvasEditor";

export default function CreatePage() {
  const router = useRouter();
  const [description, setDescription] = useState("Create an agent to analyze customer support logs and highlight recurring billing issues.");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setGenerated(null);
    try {
      const resp = await generateAgentConfig({ description, llm_provider: "mock" });
      setGenerated(JSON.stringify(resp.config, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!generated) return;
    setLoading(true);
    setError(null);
    try {
      const workflow = JSON.parse(generated);
      const resp = await createAgent({ description, llm_provider: "mock", workflow_json: workflow });
      const agentId = resp.agent?.id;
      setGenerated(null);
      setDescription("");
      // Navigate to edit canvas for the newly created agent
      if (agentId) {
        router.push(`/agent/${agentId}/edit`);
      } else {
        alert("Agent created — open Dashboard to view and edit the canvas.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Create Agent</h1>
      <p>Describe the agent you want. You can generate a workflow using the LLM, then edit before creating.</p>

      <div style={{ marginTop: 12 }}>
        <label style={{ display: "block", marginBottom: 8 }}>Agent Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: "100%", height: 120 }} />
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button onClick={handleGenerate} disabled={loading}>{loading ? "Generating…" : "Generate with LLM"}</button>
        <button onClick={handleCreate} disabled={loading || !generated}>Create Agent from Workflow</button>
      </div>

      {error && <div style={{ color: "crimson", marginTop: 12 }}>{error}</div>}

      {generated && (
        <div style={{ marginTop: 20 }}>
          <h2>Generated Workflow / Config</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 12 }}>
            <textarea value={generated} onChange={(e) => setGenerated(e.target.value)} style={{ width: "100%", height: 320, fontFamily: "monospace" }} />
            <div>
              <CanvasEditor
                initialSteps={JSON.parse(generated).steps}
                onChange={(steps) => {
                  const cfg = JSON.parse(generated);
                  cfg.steps = steps;
                  setGenerated(JSON.stringify(cfg, null, 2));
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
