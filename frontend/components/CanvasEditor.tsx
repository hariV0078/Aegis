"use client";

import React, { useState } from "react";

export type Node = {
  id: string;
  title: string;
  action: string;
};

export default function CanvasEditor({
  initialSteps,
  onChange,
}: {
  initialSteps?: Array<{ step?: number; action?: string }>;
  onChange?: (steps: Array<{ step: number; action: string }>) => void;
}) {
  const parsed: Node[] = (initialSteps || []).map((s, i) => ({
    id: String(i + 1),
    title: `Step ${s.step ?? i + 1}`,
    action: s.action ?? "",
  }));

  const [nodes, setNodes] = useState<Node[]>(parsed);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function pushChange(next: Node[]) {
    setNodes(next);
    if (onChange) {
      onChange(next.map((n, idx) => ({ step: idx + 1, action: n.action })));
    }
  }

  function addNode() {
    const next = [...nodes, { id: String(nodes.length + 1), title: `Step ${nodes.length + 1}`, action: "" }];
    pushChange(next);
  }

  function updateNode(id: string, action: string) {
    const next = nodes.map((n) => (n.id === id ? { ...n, action } : n));
    pushChange(next);
  }

  function removeNode(id: string) {
    const next = nodes.filter((n) => n.id !== id).map((n, idx) => ({ ...n, id: String(idx + 1), title: `Step ${idx + 1}` }));
    pushChange(next);
  }

  function moveNode(from: number, to: number) {
    if (from === to) return;
    const copy = [...nodes];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    const renumbered = copy.map((n, idx) => ({ ...n, id: String(idx + 1), title: `Step ${idx + 1}` }));
    pushChange(renumbered);
  }

  function onDragStart(index: number) {
    setDragIndex(index);
  }

  function onDrop(index: number) {
    if (dragIndex === null) return;
    moveNode(dragIndex, index);
    setDragIndex(null);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  return (
    <div style={{ border: "1px solid #333", padding: 12, borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong>Workflow Canvas (simple)</strong>
        <div>
          <button onClick={addNode} style={{ marginLeft: 8 }}>Add Node</button>
        </div>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {nodes.map((node, idx) => (
          <div key={node.id} draggable onDragStart={() => onDragStart(idx)} onDragOver={onDragOver} onDrop={() => onDrop(idx)} style={{ padding: 8, border: "1px solid #444", borderRadius: 6, background: "#0b0b0b", opacity: dragIndex === idx ? 0.6 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600 }}>{node.title}</div>
              <div>
                <button onClick={() => removeNode(node.id)} style={{ marginLeft: 8 }}>Remove</button>
                <button onClick={() => moveNode(idx, Math.max(0, idx - 1))} style={{ marginLeft: 8 }}>↑</button>
                <button onClick={() => moveNode(idx, Math.min(nodes.length - 1, idx + 1))} style={{ marginLeft: 8 }}>↓</button>
              </div>
            </div>
            <textarea
              value={node.action}
              onChange={(e) => updateNode(node.id, e.target.value)}
              placeholder="Describe action for this node"
              style={{ width: "100%", marginTop: 8, minHeight: 80 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
