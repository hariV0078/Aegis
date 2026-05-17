from __future__ import annotations

import json
from datetime import datetime

from backend.services.audit_logger import log_event
from backend.services.llm_router import call_llm
from backend.services.privacy import count_pii_items, reidentify, strip_pii
from backend.services.workflow_executor import execute_workflow
from backend.tools.email_send import email_send
from backend.tools.http_call import http_call
from backend.tools.web_search import web_search

TOOL_MAP = {
    "web_search": web_search,
    "http_call": http_call,
    "email_send": email_send,
}


async def run_agent(
    agent_id: str,
    config: dict,
    input_data: str,
    llm_provider: str,
    api_key: str | None = None,
    token_map: dict | None = None,
    workflow: dict | None = None,
) -> dict:
    """Run an agent with either a workflow or single-tool fallback."""
    run_id = f"run_{agent_id}_{int(datetime.utcnow().timestamp())}"
    await log_event(run_id, "agent_run_started", {"agent_id": agent_id, "has_workflow": workflow is not None})

    # If workflow is provided, execute it
    if workflow:
        return await run_agent_workflow(agent_id, run_id, workflow, input_data, token_map, llm_provider, api_key)

    # Otherwise fall back to single-tool execution
    return await run_agent_single_tool(agent_id, run_id, config, input_data, token_map, llm_provider, api_key)


async def run_agent_workflow(
    agent_id: str,
    run_id: str,
    workflow: dict,
    input_data: str,
    token_map: dict | None = None,
    llm_provider: str = "groq",
    api_key: str | None = None,
) -> dict:
    """Execute a multi-node workflow while preserving token_map through all nodes."""
    try:
        result = await execute_workflow(
            workflow=workflow,
            input_data=input_data,
            token_map_initial=token_map,
            llm_provider=llm_provider,
            api_key=api_key,
        )

        await log_event(run_id, "workflow_executed", {
            "workflow_id": result.get("workflow_id"),
            "node_count": result.get("node_count"),
            "pii_stripped": result.get("pii_stripped"),
            "token_map_hashes": result.get("token_map_hashes"),
        })

        await log_event(run_id, "agent_run_completed", {"status": "success", "pii_transmitted": 0})

        return {
            "run_id": run_id,
            "status": result.get("status", "success"),
            "output": result.get("output", ""),
            "pii_stripped": result.get("pii_stripped", 0),
            "pii_transmitted": 0,
            "workflow_id": result.get("workflow_id"),
            "node_count": result.get("node_count"),
            "token_map_hashes": result.get("token_map_hashes", []),
            "node_outputs": result.get("node_outputs", []),
            "token_map": result.get("token_map", {}),
        }
    except Exception as exc:
        await log_event(run_id, "agent_run_failed", {"error": str(exc)})
        return {
            "run_id": run_id,
            "status": "error",
            "output": f"Workflow execution failed: {exc}",
            "pii_stripped": 0,
            "pii_transmitted": 0,
        }


async def run_agent_single_tool(
    agent_id: str,
    run_id: str,
    config: dict,
    input_data: str,
    token_map: dict | None = None,
    llm_provider: str = "groq",
    api_key: str | None = None,
) -> dict:
    """Execute a single-tool agent (fallback path)."""
    await log_event(run_id, "pii_stripped_start", {"agent_id": agent_id})

    clean_input, local_token_map = strip_pii(input_data)
    if token_map:
        local_token_map.update(token_map)
    pii_count = count_pii_items(local_token_map)

    await log_event(run_id, "pii_stripped", {"count": pii_count, "transmitted": 0})

    clean_input, local_token_map = strip_pii(input_data)
    if token_map:
        local_token_map.update(token_map)
    pii_count = count_pii_items(local_token_map)

    await log_event(run_id, "pii_stripped", {"count": pii_count, "transmitted": 0})

    reasoning_prompt = f"""
Agent goal: {config.get('goal', '')}
Anonymized input data: {clean_input}
Available tools: {config.get('tools', [])}
Steps to follow: {json.dumps(config.get('steps', []))}

Choose one tool and return ONLY JSON with fields tool, params, reasoning.
""".strip()

    llm_response = await call_llm(
        messages=[{"role": "user", "content": reasoning_prompt}],
        provider=llm_provider,
        api_key=api_key,
    )

    try:
        action = json.loads(llm_response)
        if not isinstance(action, dict):
            raise ValueError("Invalid action")
    except Exception:
        action = {
            "tool": "web_search",
            "params": {"query": clean_input[:120] or config.get("goal", "privacy agent"), "num_results": 3},
            "reasoning": "Fallback tool choice for the MVP.",
        }

    tool_name = action.get("tool", "web_search")
    tool_params = action.get("params", {})
    tool_fn = TOOL_MAP.get(tool_name, web_search)

    await log_event(
        run_id,
        "llm_decided_action",
        {"tool": tool_name if tool_name in TOOL_MAP else "web_search", "reasoning": action.get("reasoning", "")},
    )

    try:
        tool_result = await tool_fn(**tool_params)
        status = "success"
        output_text = reidentify(str(tool_result), local_token_map)
    except Exception as exc:
        status = "error"
        output_text = f"Tool execution failed: {exc}"

    await log_event(run_id, "agent_run_completed", {"status": status, "pii_transmitted": 0})

    return {
        "run_id": run_id,
        "status": status,
        "output": output_text,
        "pii_stripped": pii_count,
        "pii_transmitted": 0,
        "tool": tool_name if tool_name in TOOL_MAP else "web_search",
        "token_map": local_token_map,
    }
