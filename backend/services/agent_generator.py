from __future__ import annotations

import json

from backend.services.llm_router import call_llm
from backend.services.privacy import strip_pii

SYSTEM_PROMPT = """
You are an agent configuration generator.
Return ONLY valid JSON with this shape:
{
  "name": "short agent name",
  "goal": "one sentence goal",
  "tools": ["web_search"],
  "trigger": "manual",
  "data_schema": {
    "input_fields": ["input_data"],
    "output_fields": ["summary", "evidence"]
  },
  "privacy_rules": {
    "strip_before_llm": true,
    "fields_to_anonymize": ["name", "email", "account_number"],
    "retention_policy": "no_store"
  },
  "workflow_nodes": [
    {
      "id": "node-1",
      "type": "tool",
      "tool_name": "web_search",
      "params": {"query": "..."}
    }
  ]
}
Hard rules:
- strip_before_llm must stay true
- retention_policy must stay no_store
- Valid tool_names for workflow_nodes: web_search, http_call, email_send, database_query, llm_call
""".strip()

ALLOWED_TOOLS = {
    "classifier",
    "code_runner",
    "csv_parser",
    "email_send",
    "file_read",
    "file_upload",
    "file_write",
    "filter_if",
    "filter_node",
    "http_call",
    "if_conditional",
    "json_parser",
    "llm_prompt",
    "llm_call",
    "manual_input",
    "merge",
    "midnight_anchor",
    "pii_stripper",
    "privacy_audit",
    "reidentifier",
    "schedule_trigger",
    "sentiment",
    "set_variable",
    "summarizer",
    "template_renderer",
    "text_splitter",
    "web_search",
    "webhook_trigger"
}

DEFAULT_CONFIG = {
    "name": "privacy-agent",
    "goal": "Analyze anonymized input and surface patterns without exposing private data.",
    "tools": ["web_search"],
    "trigger": "manual",
    "data_schema": {
        "input_fields": ["input_data"],
        "output_fields": ["summary", "evidence"],
    },
    "privacy_rules": {
        "strip_before_llm": True,
        "fields_to_anonymize": ["name", "email", "account_number"],
        "retention_policy": "no_store",
    },
    "workflow_nodes": [
        {
            "id": "node-1",
            "type": "tool",
            "tool_name": "web_search",
            "params": {"query": "gather relevant signals"},
        },
        {
            "id": "node-2",
            "type": "tool",
            "tool_name": "llm_call",
            "params": {"instruction": "Summarize the findings for the user"},
        },
    ],
    "edges": [
        {"from": "node-1", "to": "node-2"}
    ]
}


def _normalize_config(config: dict) -> dict:
    normalized = {**DEFAULT_CONFIG, **{key: value for key, value in config.items() if key in DEFAULT_CONFIG}}
    tools = config.get("tools", ["web_search"])
    if not isinstance(tools, list) or any(tool not in ALLOWED_TOOLS for tool in tools):
        normalized["tools"] = ["web_search"]
    else:
        normalized["tools"] = tools

    privacy_rules = config.get("privacy_rules", {})
    normalized["privacy_rules"] = {
        **DEFAULT_CONFIG["privacy_rules"],
        **{key: value for key, value in privacy_rules.items() if key in DEFAULT_CONFIG["privacy_rules"]},
    }
    normalized["privacy_rules"]["strip_before_llm"] = True
    normalized["privacy_rules"]["retention_policy"] = "no_store"

    workflow_nodes = config.get("workflow_nodes", [])
    if not isinstance(workflow_nodes, list) or not workflow_nodes:
        normalized["workflow_nodes"] = DEFAULT_CONFIG["workflow_nodes"]
    else:
        valid_nodes = []
        for i, node in enumerate(workflow_nodes[:15]):
            if isinstance(node, dict) and node.get("tool_name") in ALLOWED_TOOLS:
                valid_nodes.append({
                    "id": node.get("id", f"node-{i}"),
                    "type": node.get("type", "tool"),
                    "tool_name": node.get("tool_name"),
                    "params": node.get("params", {}),
                })
        normalized["workflow_nodes"] = valid_nodes if valid_nodes else DEFAULT_CONFIG["workflow_nodes"]

    edges = config.get("edges", [])
    normalized["edges"] = edges if isinstance(edges, list) else []
    return normalized


async def generate_agent_config(user_description: str, llm_provider: str, api_key: str | None = None) -> dict:
    clean_description, token_map = strip_pii(user_description)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": clean_description},
    ]

    raw_response = await call_llm(messages=messages, provider=llm_provider, api_key=api_key)
    try:
        parsed = json.loads(raw_response)
        config = _normalize_config(parsed if isinstance(parsed, dict) else {})
    except Exception:
        config = _normalize_config({})

    if not isinstance(config.get("name"), str) or not config["name"].strip():
        config["name"] = DEFAULT_CONFIG["name"]
    if not isinstance(config.get("goal"), str) or not config["goal"].strip():
        config["goal"] = DEFAULT_CONFIG["goal"]

    return {"config": config, "pii_stripped_count": len(token_map)}
