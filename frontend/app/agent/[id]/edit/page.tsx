"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import CanvasEditor from "@/components/CanvasEditor";
import { getAgent, updateAgent } from "@/lib/api";

export default function EditAgentCanvasPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [agent, setAgent] = useState<any | null>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!agentId) return;
      try {
        const a = await getAgent(agentId);
        setAgent(a);
        const wf = a.workflow_json ? JSON.parse(a.workflow_json) : null;
        setSteps(wf?.steps ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [agentId]);

  async function handleSave() {
    if (!agentId) return;
    setSaving(true);
    setError(null);
    try {
      const workflow = { ...(agent?.workflow_json ? JSON.parse(agent.workflow_json) : {}), steps };
      await updateAgent(agentId, { workflow_json: workflow });
      alert("Workflow saved.");
      router.push(`/agent/${agentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Edit Agent Workflow</h1>
      {loading ? (
        <div>Loading…</div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <div style={{ marginBottom: 8 }}>Agent: {agent?.name}</div>
            <CanvasEditor initialSteps={steps} onChange={(s) => setSteps(s)} />
          </div>

          {error && <div style={{ color: "crimson" }}>{error}</div>}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Workflow"}</button>
            <button onClick={() => router.push(`/agent/${agentId}`)}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
