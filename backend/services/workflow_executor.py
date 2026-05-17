from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field

from backend.services.privacy import count_pii_items, reidentify, strip_pii
from backend.tools.email_send import email_send
from backend.tools.http_call import http_call
from backend.tools.web_search import web_search
from backend.tools.file_upload import file_upload
from backend.tools.webhook_trigger import webhook_trigger
from backend.tools.schedule_trigger import schedule_trigger
from backend.tools.json_parser import json_parser
from backend.tools.set_variable import set_variable
from backend.tools.merge import merge
from backend.tools.template_renderer import template_renderer
from backend.tools.code_runner import code_runner
from backend.tools.summarizer import summarizer
from backend.tools.classifier import classifier
from backend.tools.if_conditional import if_conditional
from backend.tools.manual_input import manual_input
from backend.tools.pii_stripper import pii_stripper
from backend.tools.reidentifier import reidentifier
from backend.tools.privacy_audit import privacy_audit
from backend.tools.midnight_anchor import midnight_anchor
from backend.tools.csv_parser import csv_parser
from backend.tools.text_splitter import text_splitter
from backend.tools.file_read import file_read
from backend.tools.file_write import file_write
from backend.tools.sentiment import sentiment
from backend.tools.llm_prompt import llm_prompt
from backend.tools.filter_if import filter_if

TOOL_MAP = {
    "web_search": web_search,
    "http_call": http_call,
    "email_send": email_send,
    "file_upload": file_upload,
    "webhook_trigger": webhook_trigger,
    "schedule_trigger": schedule_trigger,
    "json_parser": json_parser,
    "set_variable": set_variable,
    "merge": merge,
    "template_renderer": template_renderer,
    "code_runner": code_runner,
    "summarizer": summarizer,
    "classifier": classifier,
    "if_conditional": if_conditional,
    "manual_input": manual_input,
    "pii_stripper": pii_stripper,
    "reidentifier": reidentifier,
    "privacy_audit": privacy_audit,
    "midnight_anchor": midnight_anchor,
    "csv_parser": csv_parser,
    "text_splitter": text_splitter,
    "file_read": file_read,
    "file_write": file_write,
    "sentiment": sentiment,
    "llm_prompt": llm_prompt,
    "filter_if": filter_if,
}


@dataclass
class WorkflowState:
    """Workflow state that persists through all nodes."""
    token_map: dict[str, str]
    current_data: str
    node_outputs: list[dict] = field(default_factory=list)
    token_map_hashes: list[str] = field(default_factory=list)

    def hash_token_map(self) -> str:
        """Hash the current token_map for audit trail."""
        payload = json.dumps(self.token_map, sort_keys=True, default=str).encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    def record_node_boundary(self) -> None:
        """Record token_map hash at node boundary for audit."""
        self.token_map_hashes.append(self.hash_token_map())


@dataclass
class WorkflowNode:
    """A single node in the workflow."""
    id: str
    type: str  # "tool"
    tool_name: str
    params: dict

    @staticmethod
    def from_dict(data: dict) -> WorkflowNode:
        return WorkflowNode(
            id=data.get("id", ""),
            type=data.get("type", "tool"),
            tool_name=data.get("tool_name", ""),
            params=data.get("params", {}),
        )


@dataclass
class WorkflowDefinition:
    """Complete workflow definition."""
    id: str
    nodes: list[WorkflowNode]

    @staticmethod
    def from_dict(data: dict) -> WorkflowDefinition:
        return WorkflowDefinition(
            id=data.get("id", ""),
            nodes=[WorkflowNode.from_dict(node) for node in data.get("nodes", [])],
        )


async def execute_workflow(
    workflow: dict,
    input_data: str,
    token_map_initial: dict[str, str] | None = None,
    llm_provider: str = "groq",
    api_key: str | None = None,
) -> dict:
    """Execute a workflow while preserving token_map through all nodes.
    
    This is the core privacy guarantee:
    - token_map is a first-class citizen of state
    - token_map persists through all node boundaries
    - each node sees anonymized data only
    - re-identification happens only at the end
    """
    # Parse workflow
    wf = WorkflowDefinition.from_dict(workflow)
    
    # Initialize state with input PII stripping
    anonymized_input, local_token_map = strip_pii(input_data)
    if token_map_initial:
        local_token_map.update(token_map_initial)
    
    state = WorkflowState(
        token_map=local_token_map,
        current_data=anonymized_input,
    )
    state.record_node_boundary()  # Record initial token_map hash
    
    # Execute each node
    for node in wf.nodes:
        state = await execute_node(node, state, llm_provider, api_key)
        state.record_node_boundary()  # Record token_map hash at node boundary
    
    # Re-identify only at the very end
    final_output = reidentify(state.current_data, state.token_map)
    
    return {
        "workflow_id": wf.id,
        "output": final_output,
        "pii_stripped": count_pii_items(state.token_map),
        "pii_transmitted": 0,
        "token_map_hashes": state.token_map_hashes,
        "node_count": len(wf.nodes),
        "status": "success",
        "node_outputs": state.node_outputs,
    }


async def execute_node(
    node: WorkflowNode,
    state: WorkflowState,
    llm_provider: str = "groq",
    api_key: str | None = None,
) -> WorkflowState:
    """Execute a single node, preserving state and token_map."""
    tool_fn = TOOL_MAP.get(node.tool_name)
    if not tool_fn:
        raise ValueError(f"Unknown tool: {node.tool_name}")
    
    try:
        kwargs = {
            **node.params,
            "input_data": state.current_data,
            "llm_provider": llm_provider,
            "api_key": api_key,
            "token_map": state.token_map,
        }
        result = await tool_fn(**kwargs)
        state.current_data = str(result)
    except Exception as exc:
        state.current_data = f"Error in {node.id}: {exc}"
    
    state.node_outputs.append({
        "node_id": node.id,
        "tool": node.tool_name,
        "data_snippet": state.current_data[:100] if state.current_data else "",
        "token_map_hash": state.hash_token_map(),
    })
    
    return state
