"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { WorkflowBuilder, WorkflowDef } from "@/components/WorkflowBuilder";
import { createAgent, generateAgentConfig } from "@/lib/api";
import { loadKey } from "@/lib/keystore";

export default function WorkflowsPage() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [llmProvider, setLlmProvider] = useState("groq");
  const [apiKey, setApiKey] = useState("");
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [workflowState, setWorkflowState] = useState<WorkflowDef | undefined>(undefined);
  const [workflowKey, setWorkflowKey] = useState(0);

  useEffect(() => {
    const saved = loadKey();
    if (saved) {
      setLlmProvider(saved.provider);
      setApiKey(saved.key);
    }
  }, []);

  const handleGenerateNodes = async () => {
    if (!description.trim()) return;
    setGenerating(true);
    setError("");
    try {
      const { config } = await generateAgentConfig({
        description,
        llm_provider: llmProvider,
        api_key: apiKey || null,
      });
      
      const newWorkflow: WorkflowDef = {
        id: `workflow-${Date.now()}`,
        name: (config.name as string) || "Generated Agent",
        description: (config.goal as string) || description,
        nodes: Array.isArray(config.workflow_nodes) ? config.workflow_nodes.map(n => ({
          id: n.id || `node-${Math.random().toString(36).substring(7)}`,
          type: n.type || "tool",
          tool_name: n.tool_name,
          params: n.params || {}
        })) : [],
        edges: Array.isArray(config.edges) ? config.edges : []
      };

      setWorkflowState(newWorkflow);
      setWorkflowKey(prev => prev + 1); // Force remount of the canvas
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to generate workflow nodes.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveWorkflow = async (workflow: WorkflowDef) => {
    setCreatingAgent(true);
    try {
      const result = await createAgent({
        description: workflow.description || description || "Agent workflow",
        llm_provider: llmProvider,
        api_key: apiKey || null,
        workflow_json: workflow as unknown as Record<string, unknown>,
      });

      router.push(`/agent/${result.agent.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to create agent with workflow");
    } finally {
      setCreatingAgent(false);
    }
  };

  return (
    <main className="detail-shell">
      <section className="panel">
        <h1 className="title">Agent Builder</h1>
        <p className="subcopy">
          Design your privacy-first agent manually on the canvas or describe what you want and let AI build the nodes for you.
        </p>

        <div className="section stack">
          <label className="field">
            <span className="field__label">Describe your agent (Optional AI Generation)</span>
            <textarea
              className="textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="E.g., I want an agent that searches the web for medical costs and then sends an email with the summary."
            />
          </label>

          <div className="grid-2">
            <label className="field">
              <span className="field__label">LLM provider</span>
              <select className="input" value={llmProvider} onChange={(event) => setLlmProvider(event.target.value)}>
                <option value="groq">Groq</option>
                <option value="ollama">Ollama</option>
                <option value="byok_openai">OpenAI</option>
                <option value="byok_anthropic">Anthropic</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">API key</span>
              <input
                className="input"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Optional for local mock mode"
              />
            </label>
          </div>

          <div className="button-row">
            <button className="button" type="button" disabled={generating || !description.trim()} onClick={handleGenerateNodes}>
              {generating ? "Designing..." : "Design Workflow with AI"}
            </button>
            <span className="help-copy">Clicking this will populate the canvas below with tools matching your prompt.</span>
          </div>

          {error ? <div className="empty-state" style={{ color: "var(--accent-crimson-bright)" }}>{error}</div> : null}
        </div>
      </section>

      <section className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <WorkflowBuilder key={workflowKey} onSave={handleSaveWorkflow} initialWorkflow={workflowState} />
      </section>

      <div className="workflow-footer" style={{ padding: "24px 0" }}>
        <button
          onClick={() => router.back()}
          className="button button--secondary"
        >
          Back
        </button>
        <p className="help-copy" style={{ marginTop: "12px" }}>
          Workflows execute sequentially from top to bottom. Data is anonymized before the first node and re-identified after the last node.
        </p>
      </div>
    </main>
  );
}
