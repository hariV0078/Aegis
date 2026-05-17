from __future__ import annotations

import json

from backend.services.llm_router import call_llm
from backend.services.privacy import strip_pii

SYSTEM_PROMPT = """
You are an expert AI workflow designer for a privacy-preserving agent platform.

The user will describe an agent. You must generate a multi-step workflow using 
ONLY the nodes listed below. Pick the right nodes for the job — do not default 
to web_search unless the task genuinely needs internet data.

AVAILABLE NODES (use exact tool_name values):
INPUT:
  - file_upload      : user uploads audio/CSV/PDF/text file
  - webhook_trigger  : receive data from external system  
  - schedule_trigger : run on cron schedule
  - manual_input     : user types text directly

PRIVACY (always use these for sensitive data):
  - pii_stripper     : strip PII before ANY LLM node
  - reidentifier     : restore PII locally after LLM nodes
  - privacy_audit    : assert pii_transmitted == 0 gate
  - midnight_anchor  : write ZK proof to Midnight blockchain

TRANSFORM:
  - json_parser      : extract fields from JSON
  - csv_parser       : parse CSV rows
  - text_splitter    : chunk long text for LLM context
  - template_renderer: fill template with variables
  - set_variable     : assign/rename state fields
  - filter_if        : conditional branch A or B
  - merge            : combine outputs of parallel nodes

FILE:
  - file_read        : read uploaded file content
  - file_write       : write output to file

AI:
  - llm_prompt       : general LLM call
  - summarizer       : long text → short summary
  - classifier       : text → one of N categories
  - sentiment        : text → positive/negative/neutral

TOOLS:
  - web_search       : search the internet (only if needed)
  - http_call        : call external API
  - email_send       : send email
  - database_query   : query a database
  - code_runner      : run Python snippet

RULES (never violate):
1. If input is audio/text/file → start with file_upload or manual_input node
2. If data contains patient/financial/personal info → pii_stripper BEFORE any llm node
3. reidentifier MUST come after last llm node if pii_stripper was used
4. privacy_audit node always second-to-last
5. midnight_anchor always last
6. web_search only if task genuinely needs live internet data
7. Return ONLY valid JSON, no markdown, no explanation

Return this exact schema:
{
  "name": "...",
  "goal": "...",
  "tools": [],
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
    {"id": "n1", "type": "tool", "tool_name": "file_upload", "params": {}},
    {"id": "n2", "type": "tool", "tool_name": "pii_stripper", "params": {}}
  ]
}
""".strip()

ALLOWED_TOOLS = {
    "file_upload", "webhook_trigger", "schedule_trigger", "manual_input",
    "pii_stripper", "reidentifier", "privacy_audit", "midnight_anchor",
    "json_parser", "csv_parser", "text_splitter", "template_renderer", "set_variable", "filter_if", "merge",
    "file_read", "file_write",
    "llm_prompt", "summarizer", "classifier", "sentiment",
    "web_search", "http_call", "email_send", "database_query", "code_runner"
}

WORKFLOW_TEMPLATES = {
  "medical": ["file_upload","pii_stripper","text_splitter",
              "llm_prompt","summarizer","template_renderer",
              "reidentifier","privacy_audit","midnight_anchor","file_write"],
  "finance": ["file_upload","pii_stripper","csv_parser",
              "llm_prompt","classifier","reidentifier",
              "privacy_audit","midnight_anchor","email_send"],
  "legal":   ["file_upload","pii_stripper","text_splitter",
              "llm_prompt","summarizer","reidentifier",
              "privacy_audit","midnight_anchor","file_write"],
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
            "tool_name": "llm_prompt",
            "params": {"instruction": "Summarize the findings for the user"},
        },
    ],
    "edges": [
        {"from": "node-1", "to": "node-2"}
    ],
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

    # Extract nodes (try "nodes", then "workflow_nodes")
    nodes_raw = config.get("nodes", config.get("workflow_nodes", []))
    if not isinstance(nodes_raw, list) or not nodes_raw:
        normalized["workflow_nodes"] = DEFAULT_CONFIG["workflow_nodes"]
        normalized["edges"] = DEFAULT_CONFIG.get("edges", [])
    else:
        valid_nodes = []
        for i, node in enumerate(nodes_raw[:20]):
            if isinstance(node, dict):
                tool_name = node.get("tool_name") or node.get("type")
                if tool_name == "llm_call":
                    tool_name = "llm_prompt"
                if tool_name in ALLOWED_TOOLS:
                    valid_nodes.append({
                        "id": node.get("id", f"node-{i}"),
                        "type": "tool",
                        "tool_name": tool_name,
                        "params": node.get("params", node.get("config", {})),
                    })
        normalized["workflow_nodes"] = valid_nodes if valid_nodes else DEFAULT_CONFIG["workflow_nodes"]
        
        edges_raw = config.get("edges", [])
        if isinstance(edges_raw, list) and edges_raw:
            normalized["edges"] = edges_raw
        else:
            normalized["edges"] = DEFAULT_CONFIG.get("edges", [])
    return normalized


async def generate_agent_config(user_description: str, llm_provider: str, api_key: str | None = None) -> dict:
    clean_description, token_map = strip_pii(user_description)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": clean_description},
    ]

    raw_response = await call_llm(messages=messages, provider=llm_provider, api_key=api_key)
    
    cleaned_json = raw_response.strip()
    try:
        import re
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_response, re.DOTALL)
        if match:
            cleaned_json = match.group(1).strip()
        else:
            start = raw_response.find("{")
            end = raw_response.rfind("}")
            if start != -1 and end != -1 and end > start:
                cleaned_json = raw_response[start:end+1].strip()
    except Exception:
        pass

    try:
        parsed = json.loads(cleaned_json)
        config = _normalize_config(parsed if isinstance(parsed, dict) else {})
    except Exception:
        config = _normalize_config({})

    if not isinstance(config.get("name"), str) or not config["name"].strip():
        config["name"] = DEFAULT_CONFIG["name"]
    if not isinstance(config.get("goal"), str) or not config["goal"].strip():
        config["goal"] = DEFAULT_CONFIG["goal"]

    return {"config": config, "pii_stripped_count": len(token_map)}
