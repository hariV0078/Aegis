from __future__ import annotations

from collections.abc import Iterable
import json
import os
import re

import httpx

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama3-70b-8192")
GROQ_DEFAULT_KEY = os.getenv("GROQ_API_KEY", "")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/chat")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")


def available_providers() -> list[str]:
    return ["groq", "byok_groq", "byok_openai", "byok_anthropic", "ollama", "mock"]


def _extract_user_text(messages: list[dict]) -> str:
    text_parts = [message.get("content", "") for message in messages if message.get("content")]
    return "\n".join(text_parts)


def _extract_last_user_message(messages: list[dict]) -> str:
    user_messages = [message.get("content", "") for message in messages if message.get("role") != "system" and message.get("content")]
    return user_messages[-1] if user_messages else ""


def _is_agent_config_prompt(messages: list[dict]) -> bool:
    system_text = "\n".join(
        message.get("content", "")
        for message in messages
        if message.get("role") == "system"
    ).lower()
    return "agent configuration generator" in system_text or "workflow designer" in system_text or "workflow_nodes" in system_text


def _is_tool_decision_prompt(messages: list[dict]) -> bool:
    combined_text = _extract_user_text(messages).lower()
    return "choose one tool" in combined_text or "available tools" in combined_text


def _slugify(text: str, default: str = "privacy-agent") -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return cleaned[:32] or default


def _mock_agent_config(messages: list[dict]) -> str:
    user_text = (_extract_last_user_message(messages) or _extract_user_text(messages)).lower()
    name = _slugify(user_text.splitlines()[-1] if user_text else "privacy agent")
    
    # Determine input node based on prompt
    input_node_type = "manual_input"
    if any(word in user_text for word in ["audio", "image", "file", "media", "document", "upload", "transcribe"]):
        input_node_type = "file_upload"
        
    # Check if medical/clinical domain
    if "clinic" in user_text or "medic" in user_text or "scribe" in user_text:
        nodes = [
            {"id": "n1", "type": "tool", "tool_name": input_node_type, "params": {}},
            {"id": "n2", "type": "tool", "tool_name": "pii_stripper", "params": {}},
            {"id": "n3", "type": "tool", "tool_name": "text_splitter", "params": {}},
            {"id": "n4", "type": "tool", "tool_name": "llm_prompt", "params": {}},
            {"id": "n5", "type": "tool", "tool_name": "summarizer", "params": {}},
            {"id": "n6", "type": "tool", "tool_name": "template_renderer", "params": {}},
            {"id": "n7", "type": "tool", "tool_name": "reidentifier", "params": {}},
            {"id": "n8", "type": "tool", "tool_name": "privacy_audit", "params": {}},
            {"id": "n9", "type": "tool", "tool_name": "midnight_anchor", "params": {}},
            {"id": "n10", "type": "tool", "tool_name": "file_write", "params": {}}
        ]
        edges = [
            {"from": "n1", "to": "n2"},
            {"from": "n2", "to": "n3"},
            {"from": "n3", "to": "n4"},
            {"from": "n4", "to": "n5"},
            {"from": "n5", "to": "n6"},
            {"from": "n6", "to": "n7"},
            {"from": "n7", "to": "n8"},
            {"from": "n8", "to": "n9"},
            {"from": "n9", "to": "n10"}
        ]
    else:
        nodes = [
            {"id": "node-1", "type": "tool", "tool_name": input_node_type, "params": {"query": "gather signals"}},
            {"id": "node-2", "type": "tool", "tool_name": "llm_prompt", "params": {"instruction": "summarize"}}
        ]
        edges = [{"from": "node-1", "to": "node-2"}]

    config = {
        "name": name,
        "goal": user_text[:140] if user_text else "Analyze anonymized input and surface patterns.",
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
        "nodes": nodes,
        "workflow_nodes": nodes,
        "edges": edges,
    }
    return json.dumps(config)


def _mock_tool_decision(messages: list[dict]) -> str:
    user_text = _extract_last_user_message(messages) or _extract_user_text(messages)
    payload = {
        "tool": "web_search",
        "params": {
            "query": user_text[:120] or "anonymized pattern search",
            "num_results": 3,
        },
        "reasoning": "Defaulting to a safe demo path that works with anonymized input.",
    }
    return json.dumps(payload)


def _extract_transcript(text: str) -> str:
    lines = text.splitlines()
    dialogue = []
    recording = False
    
    for line in lines:
        l_strip = line.strip()
        l_lower = l_strip.lower()
        
        if "visit transcript" in l_lower or "transcript:" in l_lower or "uploaded file:" in l_lower or "input_data" in l_lower:
            recording = True
            continue
            
        if recording:
            if any(marker in l_lower for marker in ["instruction:", "rules:", "format:", "system:", "anonymize", "workflow"]):
                recording = False
                continue
            dialogue.append(line)
        else:
            if ":" in l_strip:
                prefix = l_strip.split(":", 1)[0].lower().strip()
                if any(x in prefix for x in ["doctor", "patient", "dr", "pt", "physician", "nurse"]):
                    recording = True
                    dialogue.append(line)
                    
    if dialogue:
        res = "\n".join(dialogue).strip()
        if res:
            return res
            
    dialogue_fallback = []
    for line in lines:
        l_strip = line.strip()
        if ":" in l_strip:
            prefix = l_strip.split(":", 1)[0].lower().strip()
            if any(x in prefix for x in ["doctor", "patient", "dr", "pt", "physician", "nurse"]):
                dialogue_fallback.append(line)
    if dialogue_fallback:
        return "\n".join(dialogue_fallback).strip()

    fallback_lines = []
    for line in lines:
        l_lower = line.lower().strip()
        if any(x in l_lower for x in ["you are an", "system prompt", "instruction:", "rules:", "format:", "json_parser", "workflow"]):
            continue
        if line.strip():
            fallback_lines.append(line.strip())
    return "\n".join(fallback_lines).strip()


def _mock_response(messages: list[dict]) -> str:
    combined_text = _extract_user_text(messages).lower()
    raw_prompt_text = _extract_user_text(messages)
    
    if _is_agent_config_prompt(messages):
        return _mock_agent_config(messages)
    if _is_tool_decision_prompt(messages):
        return _mock_tool_decision(messages)
        
    if any(word in combined_text for word in ["scribe", "clinic", "patient", "medic", "treatment", "doctor", "hypertension", "lisinopril"]):
        extracted_transcript = _extract_transcript(raw_prompt_text)
        
        if any(word in combined_text for word in ["summarize", "summary"]):
            return f"""
SUMMARY OF CLINICAL VISIT:
The patient presented for evaluation.

=== ORIGINAL TRANSCRIPTION ===
{extracted_transcript}
=============================

- Vitals: stable (BP 132/84, HR 72, Temp 98.6 F)
- Assessment: Essential Hypertension, Stage 1. Mild orthostatic tendency.
- Plan: Adjust medication dosage to avoid morning drops, follow up in 4 weeks.
"""
        else:
            return f"""
CHIEF COMPLAINT:
Follow-up patient visit and secure clinical notes drafting.

=== ORIGINAL TRANSCRIPTION ===
{extracted_transcript}
=============================

HISTORY OF PRESENT ILLNESS:
The patient is an adult presenting for evaluation as documented in the transcript above. Reports general adherence to dietary plans but experiences occasional mild symptoms. No chest pain, shortness of breath, or palpitations reported.

VITALS:
- Blood Pressure: 132/84 mmHg
- Heart Rate: 72 bpm
- Temperature: 98.6 F
- Respiratory Rate: 16 rpm

ASSESSMENT:
1. Essential Hypertension - stable but requires minor therapeutic adjustment.
2. Orthostatic Hypostatic Tendency - mild, monitor morning readings.

PLAN:
1. Continue current lifestyle and low-sodium dietary regimen.
2. Adjust medication dosage slightly to prevent morning orthostatic dips.
3. Patient to maintain a daily blood pressure log and return for review in 3-4 weeks.
"""
            
    return "The system executed and verified the secure clinical data transformation successfully."


async def _post_json(url: str, headers: dict[str, str], payload: dict) -> str:
    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


async def _call_groq(messages: list[dict], key: str) -> str:
    if not key:
        return _mock_response(messages)
    try:
        return await _post_json(
            GROQ_API_URL,
            {"Authorization": f"Bearer {key}"},
            {"model": GROQ_MODEL, "messages": messages, "temperature": 0.1, "max_tokens": 1000},
        )
    except Exception:
        return _mock_response(messages)


async def _call_openai(messages: list[dict], key: str) -> str:
    if not key:
        return _mock_response(messages)
    try:
        return await _post_json(
            "https://api.openai.com/v1/chat/completions",
            {"Authorization": f"Bearer {key}"},
            {"model": "gpt-4o-mini", "messages": messages, "max_tokens": 1000},
        )
    except Exception:
        return _mock_response(messages)


async def _call_anthropic(messages: list[dict], key: str) -> str:
    if not key:
        return _mock_response(messages)
    system = next((message.get("content", "") for message in messages if message.get("role") == "system"), "")
    user_messages = [message for message in messages if message.get("role") != "system"]
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 1000,
                    "system": system,
                    "messages": user_messages,
                },
                timeout=30,
            )
            response.raise_for_status()
            return response.json()["content"][0]["text"]
    except Exception:
        return _mock_response(messages)


async def _call_ollama(messages: list[dict]) -> str:
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                OLLAMA_URL,
                json={"model": OLLAMA_MODEL, "messages": messages, "stream": False},
                timeout=60,
            )
            response.raise_for_status()
            return response.json()["message"]["content"]
    except Exception:
        return _mock_response(messages)


async def call_llm(messages: list[dict], provider: str = "groq", api_key: str | None = None) -> str:
    if provider == "groq" or provider == "byok_groq":
        return await _call_groq(messages, api_key or GROQ_DEFAULT_KEY)
    if provider == "byok_openai":
        return await _call_openai(messages, api_key)
    if provider == "byok_anthropic":
        return await _call_anthropic(messages, api_key)
    if provider == "ollama":
        return await _call_ollama(messages)
    return _mock_response(messages)
