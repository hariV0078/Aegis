"use client";

import React, { useCallback, useRef, useState } from "react";
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MiniMap,
} from "reactflow";
import "reactflow/dist/style.css";
import { NodePanel } from "./NodePanel";

export interface WorkflowNode {
  id: string;
  type: string;
  tool_name: string;
  params: Record<string, unknown>;
}

export interface WorkflowDef {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges?: { from: string; to: string }[];
}

interface WorkflowBuilderProps {
  onSave?: (workflow: WorkflowDef) => Promise<void>;
  initialWorkflow?: WorkflowDef;
}

const TOOL_TYPES = [
  // Input Nodes (Blue)
  { id: "manual_input", label: "Manual Input", color: "#4A90E2" },
  { id: "file_upload", label: "File Upload", color: "#4A90E2" },
  { id: "webhook_trigger", label: "Webhook Trigger", color: "#4A90E2" },
  { id: "schedule_trigger", label: "Schedule Trigger", color: "#4A90E2" },
  
  // Privacy Nodes (Shield/Teal)
  { id: "pii_stripper", label: "PII Stripper", color: "#1ABC9C" },
  { id: "reidentifier", label: "Re-identifier", color: "#1ABC9C" },
  { id: "privacy_audit", label: "Privacy Audit", color: "#1ABC9C" },
  { id: "midnight_anchor", label: "Midnight Anchor", color: "#1ABC9C" },

  // Data Transform Nodes (Green)
  { id: "json_parser", label: "JSON Parser", color: "#50E3C2" },
  { id: "csv_parser", label: "CSV Parser", color: "#50E3C2" },
  { id: "text_splitter", label: "Text Splitter", color: "#50E3C2" },
  { id: "set_variable", label: "Set Variable", color: "#50E3C2" },
  { id: "filter_if", label: "Filter/IF", color: "#50E3C2" },
  { id: "merge", label: "Merge", color: "#50E3C2" },
  { id: "template_renderer", label: "Template Renderer", color: "#50E3C2" },
  
  // File & Storage (Brown)
  { id: "file_read", label: "File Read", color: "#D35400" },
  { id: "file_write", label: "File Write", color: "#D35400" },

  // Code & Compute (Orange)
  { id: "code_runner", label: "Code Runner", color: "#F5A623" },
  
  // AI & LLM (Purple)
  { id: "llm_prompt", label: "LLM Prompt", color: "#BD10E0" },
  { id: "summarizer", label: "Summarizer", color: "#BD10E0" },
  { id: "classifier", label: "Classifier", color: "#BD10E0" },
  { id: "sentiment", label: "Sentiment", color: "#BD10E0" },
  
  // Flow Control (Black/Grey)
  { id: "if_conditional", label: "IF/Conditional", color: "#4A4A4A" },
  
  // Current generic / communication ones (Red/Cyan)
  { id: "web_search", label: "Web Search", color: "#FF6B6B" },
  { id: "http_call", label: "HTTP Call", color: "#4ECDC4" },
  { id: "email_send", label: "Email Send", color: "#45B7D1" },
  { id: "database_query", label: "Database Query", color: "#96CEB4" },
  { id: "llm_call", label: "Legacy LLM Call", color: "#FFEAA7" },
];

export function WorkflowBuilder({ onSave, initialWorkflow }: WorkflowBuilderProps) {
  const initialReactFlowNodes: Node[] = (initialWorkflow?.nodes || []).map((n, i) => {
    const tool = TOOL_TYPES.find((t) => t.id === n.tool_name) || TOOL_TYPES[0];
    return {
      id: n.id,
      data: { label: tool.label, toolType: n.tool_name, params: n.params },
      position: { x: 50 + (i * 200), y: 100 }, // Lay them out horizontally
      style: {
        background: tool.color,
        border: "2px solid #333",
        borderRadius: "8px",
        padding: "10px",
        color: "#fff",
        fontWeight: "bold",
        cursor: "pointer",
      },
    };
  });

  const initialReactFlowEdges: Edge[] = (initialWorkflow?.edges || []).map((e, i) => ({
    id: `edge-${i}`,
    source: e.from,
    target: e.to,
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialReactFlowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialReactFlowEdges);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState(initialWorkflow?.name || "New Agent Workflow");
  const [workflowDescription, setWorkflowDescription] = useState(
    initialWorkflow?.description || "",
  );
  const [saving, setSaving] = useState(false);
  const nodeIdCounter = useRef(initialReactFlowNodes.length);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges],
  );

  const addNode = (toolType: string) => {
    const tool = TOOL_TYPES.find((t) => t.id === toolType);
    if (!tool) return;

    const newId = `node-${nodeIdCounter.current++}`;
    const newNode: Node = {
      id: newId,
      data: { label: tool.label, toolType: toolType, params: {} },
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      style: {
        background: tool.color,
        border: "2px solid #333",
        borderRadius: "8px",
        padding: "10px",
        color: "#fff",
        fontWeight: "bold",
        cursor: "pointer",
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNode(newId);
  };

  const deleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
  };

  const updateNodeParams = (nodeId: string, params: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, params } }
          : n,
      ),
    );
  };

  const buildWorkflowDef = (): WorkflowDef => {
    const workflowNodes: WorkflowNode[] = nodes.map((node) => ({
      id: node.id,
      type: "tool",
      tool_name: node.data.toolType,
      params: node.data.params || {},
    }));

    return {
      id: `workflow-${Date.now()}`,
      name: workflowName,
      description: workflowDescription,
      nodes: workflowNodes,
      edges: edges.map((e) => ({ from: e.source, to: e.target })),
    };
  };

  const handleSave = async () => {
    if (nodes.length === 0) {
      alert("Add at least one node to the workflow");
      return;
    }

    setSaving(true);
    try {
      const workflow = buildWorkflowDef();
      if (onSave) {
        await onSave(workflow);
        alert("Workflow saved successfully!");
      }
    } catch (error) {
      alert(`Error saving workflow: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const selectedNodeData = nodes.find((n) => n.id === selectedNode)?.data;

  return (
    <div className="workflow-builder">
      <div className="workflow-builder__header">
        <div>
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            placeholder="Workflow name"
            className="workflow-builder__input"
          />
          <textarea
            value={workflowDescription}
            onChange={(e) => setWorkflowDescription(e.target.value)}
            placeholder="Workflow description"
            className="workflow-builder__textarea"
          />
        </div>
        <button onClick={handleSave} disabled={saving} className="btn btn--primary">
          {saving ? "Saving..." : "Save Workflow"}
        </button>
      </div>

      <div className="workflow-builder__container">
        <div className="workflow-builder__tools">
          <h3>Tools</h3>
          {TOOL_TYPES.map((tool) => (
            <button
              key={tool.id}
              onClick={() => addNode(tool.id)}
              className="workflow-builder__tool-btn"
              style={{ borderLeft: `4px solid ${tool.color}` }}
            >
              {tool.label}
            </button>
          ))}
        </div>

        <div className="workflow-builder__canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNode(node.id)}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {selectedNode && selectedNodeData && (
          <NodePanel
            nodeId={selectedNode}
            nodeLabel={selectedNodeData.label}
            toolType={selectedNodeData.toolType}
            params={selectedNodeData.params || {}}
            onUpdateParams={(params) => updateNodeParams(selectedNode, params)}
            onDelete={() => deleteNode(selectedNode)}
          />
        )}
      </div>

      <div className="workflow-builder__stats">
        <span>{nodes.length} nodes</span>
        <span>{edges.length} connections</span>
      </div>
    </div>
  );
}
