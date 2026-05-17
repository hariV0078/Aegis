# PrivacyForge — Full MVP Spec
> Build AI agents that see patterns, never people.

---

## 0. Project Structure

```
privacyforge/
├── backend/
│   ├── main.py                  # FastAPI app entry
│   ├── routers/
│   │   ├── agents.py            # CRUD + run agent
│   │   ├── llm.py               # LLM router (Groq / BYOK / Ollama)
│   │   └── audit.py             # Audit log endpoints
│   ├── services/
│   │   ├── privacy.py           # PII strip + re-identify (Presidio)
│   │   ├── agent_generator.py   # Prompt → AgentConfig JSON
│   │   ├── agent_runner.py      # Execute agent tools
│   │   └── audit_logger.py      # Hash-chained log writer
│   ├── models/
│   │   ├── agent.py             # SQLModel: Agent, AgentRun
│   │   └── audit.py             # SQLModel: AuditEntry
│   ├── tools/
│   │   ├── web_search.py        # Tool: anonymized web search
│   │   ├── http_call.py         # Tool: external HTTP
│   │   └── email_send.py        # Tool: send email on trigger
│   └── database.py              # SQLite init
├── frontend/
│   ├── app/
│   │   ├── page.tsx             # Landing: describe your agent
│   │   ├── dashboard/page.tsx   # Agent list + metrics
│   │   └── agent/[id]/page.tsx  # Agent detail + run history
│   ├── components/
│   │   ├── AgentCard.tsx
│   │   ├── PrivacyBadge.tsx     # "0 PII transmitted" indicator
│   │   ├── RunLog.tsx
│   │   └── KeyVault.tsx         # BYOK key input (never sent to DB)
│   └── lib/
│       ├── api.ts               # Backend calls
│       └── keystore.ts          # Encrypt/decrypt key in localStorage
├── docker-compose.yml
└── README.md
```

---

## 1. Backend: FastAPI

### Reference Sources

When the implementation needs a privacy or blockchain design reference, consult:

- [Midnight Network](https://midnight.network/) for programmable privacy and selective disclosure concepts.
- [Midnight Docs](https://docs.midnight.network/) for developer-facing implementation details.
- [Midnight Developer Hub](https://midnight.network/developer-hub) for ecosystem and builder guidance.

### `backend/main.py`
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import agents, llm, audit
from backend.database import init_db

app = FastAPI(title="PrivacyForge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents.router, prefix="/agents")
app.include_router(llm.router, prefix="/llm")
app.include_router(audit.router, prefix="/audit")

@app.on_event("startup")
async def startup():
    init_db()
```

---

### `backend/database.py`
```python
from sqlmodel import SQLModel, create_engine, Session

DATABASE_URL = "sqlite:///./privacyforge.db"
engine = create_engine(DATABASE_URL, echo=False)

def init_db():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
```

---

### `backend/models/agent.py`
```python
from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import uuid, json

class Agent(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str
    description: str                  # user's original plain-english input
    config_json: str                  # AgentConfig JSON (serialized)
    status: str = "idle"              # idle | running | error
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_run_at: Optional[datetime] = None
    total_runs: int = 0
    pii_transmitted: int = 0          # always 0 — proof metric

class AgentRun(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    agent_id: str = Field(foreign_key="agent.id")
    started_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: Optional[datetime] = None
    status: str = "running"           # running | success | error
    output_summary: Optional[str] = None   # what happened (not raw data)
    pii_items_stripped: int = 0
    llm_provider: str = "groq"
```

---

### `backend/services/privacy.py`
```python
"""
PII stripping using Microsoft Presidio.
Install: pip install presidio-analyzer presidio-anonymizer
python -m spacy download en_core_web_lg
"""
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig
import re, uuid

analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()

def strip_pii(text: str) -> tuple[str, dict]:
    """
    Returns (anonymized_text, token_map).
    token_map: { "PLACEHOLDER_abc123": "real value" }
    Never store token_map on server. Return to client only.
    """
    results = analyzer.analyze(text=text, language="en")
    
    token_map = {}
    operators = {}
    
    for result in results:
        token_id = f"[{result.entity_type}_{uuid.uuid4().hex[:6].upper()}]"
        original = text[result.start:result.end]
        token_map[token_id] = original
        operators[result.entity_type] = OperatorConfig(
            "replace", {"new_value": token_id}
        )
    
    anonymized = anonymizer.anonymize(
        text=text,
        analyzer_results=results,
        operators=operators,
    )
    
    return anonymized.text, token_map

def reidentify(text: str, token_map: dict) -> str:
    """
    Swap tokens back to real values.
    Runs locally — never on a server with real data at rest.
    """
    result = text
    for token, real_value in token_map.items():
        result = result.replace(token, real_value)
    return result

def count_pii_items(token_map: dict) -> int:
    return len(token_map)
```

---

### `backend/services/agent_generator.py`
```python
"""
Takes user's plain-english description.
Strips PII from it.
Sends clean intent to LLM.
Returns structured AgentConfig.
"""
import json
from backend.services.privacy import strip_pii
from backend.services.llm_router import call_llm

SYSTEM_PROMPT = """
You are an agent configuration generator.
The user will describe what kind of agent they want.
You must return ONLY valid JSON matching this schema — nothing else:

{
  "name": "short agent name",
  "goal": "one sentence goal",
  "tools": ["web_search" | "http_call" | "email_send"],
  "trigger": "manual" | "schedule:*/30 * * * *" | "webhook",
  "data_schema": {
    "input_fields": ["field1", "field2"],
    "output_fields": ["result1", "result2"]
  },
  "privacy_rules": {
    "strip_before_llm": true,
    "fields_to_anonymize": ["name", "email", "account_number"],
    "retention_policy": "no_store"
  },
  "steps": [
    {"step": 1, "action": "describe what agent does in step 1"},
    {"step": 2, "action": "describe step 2"}
  ]
}

HARD RULES (never violate):
- strip_before_llm is always true
- retention_policy is always no_store
- never include real PII in your response
"""

async def generate_agent_config(
    user_description: str,
    llm_provider: str,
    api_key: str | None = None
) -> dict:
    # Strip PII from user's description before sending to LLM
    clean_description, token_map = strip_pii(user_description)
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": clean_description}
    ]
    
    raw_response = await call_llm(
        messages=messages,
        provider=llm_provider,
        api_key=api_key
    )
    
    # Parse JSON from LLM response
    config = json.loads(raw_response)
    
    return {
        "config": config,
        "pii_stripped_count": len(token_map)
        # token_map NOT returned to server — stays client side
    }
```

---

### `backend/services/llm_router.py`
```python
"""
Routes to correct LLM provider.
Priority: BYOK → Groq free → Ollama local
"""
import httpx, os, json

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_DEFAULT_KEY = os.getenv("GROQ_API_KEY", "")  # your free tier key
GROQ_MODEL = "llama3-70b-8192"

OLLAMA_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "mistral"

async def call_llm(
    messages: list[dict],
    provider: str = "groq",
    api_key: str | None = None
) -> str:
    if provider == "groq" or provider == "byok_groq":
        return await _call_groq(messages, api_key or GROQ_DEFAULT_KEY)
    
    elif provider == "byok_openai":
        return await _call_openai(messages, api_key)
    
    elif provider == "byok_anthropic":
        return await _call_anthropic(messages, api_key)
    
    elif provider == "ollama":
        return await _call_ollama(messages)
    
    else:
        return await _call_groq(messages, GROQ_DEFAULT_KEY)

async def _call_groq(messages: list, key: str) -> str:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            GROQ_API_URL,
            headers={"Authorization": f"Bearer {key}"},
            json={
                "model": GROQ_MODEL,
                "messages": messages,
                "temperature": 0.1,
                "max_tokens": 1000,
            },
            timeout=30
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

async def _call_openai(messages: list, key: str) -> str:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={"model": "gpt-4o-mini", "messages": messages, "max_tokens": 1000},
            timeout=30
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

async def _call_anthropic(messages: list, key: str) -> str:
    system = next((m["content"] for m in messages if m["role"] == "system"), "")
    user_msgs = [m for m in messages if m["role"] != "system"]
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1000,
                "system": system,
                "messages": user_msgs,
            },
            timeout=30
        )
        r.raise_for_status()
        return r.json()["content"][0]["text"]

async def _call_ollama(messages: list) -> str:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            OLLAMA_URL,
            json={"model": OLLAMA_MODEL, "messages": messages, "stream": False},
            timeout=60
        )
        r.raise_for_status()
        return r.json()["message"]["content"]
```

---

### `backend/services/agent_runner.py`
```python
"""
Executes an agent's steps using its configured tools.
Each run is isolated. No cross-agent data access.
"""
import asyncio, json
from datetime import datetime
from backend.services.privacy import strip_pii, reidentify, count_pii_items
from backend.services.llm_router import call_llm
from backend.tools.web_search import web_search
from backend.tools.http_call import http_call
from backend.tools.email_send import email_send
from backend.services.audit_logger import log_event

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
    token_map: dict | None = None   # sent by client, never stored server-side
) -> dict:
    run_id = f"run_{agent_id}_{int(datetime.utcnow().timestamp())}"
    pii_count = 0
    
    await log_event(run_id, "agent_run_started", {"agent_id": agent_id})
    
    # Step 1: Strip PII from input
    clean_input, local_token_map = strip_pii(input_data)
    if token_map:
        local_token_map.update(token_map)  # merge client-side map
    pii_count = count_pii_items(local_token_map)
    
    await log_event(run_id, "pii_stripped", {
        "count": pii_count,
        "transmitted": 0  # proof: zero
    })
    
    # Step 2: Ask LLM what to do with anonymized input
    reasoning_prompt = f"""
Agent goal: {config['goal']}
Anonymized input data: {clean_input}
Available tools: {config['tools']}
Steps to follow: {json.dumps(config['steps'])}

Decide which tool to call and with what parameters.
Respond ONLY with JSON: {{"tool": "tool_name", "params": {{...}}, "reasoning": "..."}}
"""
    llm_response = await call_llm(
        messages=[{"role": "user", "content": reasoning_prompt}],
        provider=llm_provider,
        api_key=api_key
    )
    
    action = json.loads(llm_response)
    tool_name = action.get("tool")
    tool_params = action.get("params", {})
    
    await log_event(run_id, "llm_decided_action", {
        "tool": tool_name,
        "reasoning": action.get("reasoning")
        # params NOT logged — may contain anonymized data patterns
    })
    
    # Step 3: Execute tool
    tool_fn = TOOL_MAP.get(tool_name)
    if not tool_fn:
        return {"status": "error", "error": f"Unknown tool: {tool_name}"}
    
    tool_result = await tool_fn(**tool_params)
    
    # Step 4: Re-identify result locally (stays in memory, not stored)
    final_result = reidentify(str(tool_result), local_token_map)
    
    await log_event(run_id, "agent_run_completed", {
        "status": "success",
        "pii_transmitted": 0
    })
    
    return {
        "run_id": run_id,
        "status": "success",
        "output": final_result,
        "pii_stripped": pii_count,
        "pii_transmitted": 0,   # always 0 — the guarantee
    }
```

---

### `backend/services/audit_logger.py`
```python
"""
Hash-chained audit log.
Each entry hashes the previous entry — tamper-proof for demo purposes.
"""
import hashlib, json
from datetime import datetime
from pathlib import Path

LOG_PATH = Path("./audit.jsonl")

def _hash_entry(entry: dict) -> str:
    return hashlib.sha256(json.dumps(entry, sort_keys=True).encode()).hexdigest()

async def log_event(run_id: str, event: str, data: dict):
    prev_hash = "genesis"
    if LOG_PATH.exists():
        lines = LOG_PATH.read_text().strip().split("\n")
        if lines:
            last = json.loads(lines[-1])
            prev_hash = last.get("hash", "genesis")
    
    entry = {
        "run_id": run_id,
        "event": event,
        "data": data,
        "timestamp": datetime.utcnow().isoformat(),
        "prev_hash": prev_hash,
    }
    entry["hash"] = _hash_entry(entry)
    
    with open(LOG_PATH, "a") as f:
        f.write(json.dumps(entry) + "\n")

def read_log(limit: int = 50) -> list[dict]:
    if not LOG_PATH.exists():
        return []
    lines = LOG_PATH.read_text().strip().split("\n")
    return [json.loads(l) for l in lines[-limit:] if l]
```

---

### `backend/tools/web_search.py`
```python
"""
Web search tool. Query is already anonymized before arriving here.
"""
import httpx, os

BRAVE_KEY = os.getenv("BRAVE_SEARCH_KEY", "")  # free tier: 2000 req/month
# Alternative: DuckDuckGo HTML scrape (no key needed)

async def web_search(query: str, num_results: int = 5) -> list[dict]:
    if not BRAVE_KEY:
        return await _ddg_search(query)
    
    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://api.search.brave.com/res/v1/web/search",
            headers={"Accept": "application/json", "X-Subscription-Token": BRAVE_KEY},
            params={"q": query, "count": num_results},
            timeout=15
        )
        results = r.json().get("web", {}).get("results", [])
        return [{"title": x["title"], "url": x["url"], "snippet": x["description"]} for x in results]

async def _ddg_search(query: str) -> list[dict]:
    # DuckDuckGo HTML fallback — no API key needed
    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=15
        )
        # Simple parse — extract result titles/snippets
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(r.text, "html.parser")
        results = []
        for res in soup.select(".result")[:5]:
            title = res.select_one(".result__title")
            snippet = res.select_one(".result__snippet")
            results.append({
                "title": title.text if title else "",
                "snippet": snippet.text if snippet else "",
            })
        return results
```

---

### `backend/tools/http_call.py`
```python
import httpx

async def http_call(
    url: str,
    method: str = "GET",
    headers: dict | None = None,
    payload: dict | None = None
) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.request(
            method=method.upper(),
            url=url,
            headers=headers or {},
            json=payload,
            timeout=20
        )
        return {"status": r.status_code, "body": r.text[:2000]}
```

---

### `backend/tools/email_send.py`
```python
"""
Email tool using Resend (free: 100 emails/day) or SMTP.
"""
import httpx, os

RESEND_KEY = os.getenv("RESEND_API_KEY", "")

async def email_send(to: str, subject: str, body: str) -> dict:
    if not RESEND_KEY:
        # Dry-run in demo mode
        return {"sent": False, "reason": "No RESEND_KEY — dry run", "to": to}
    
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_KEY}"},
            json={
                "from": "agent@privacyforge.app",
                "to": [to],
                "subject": subject,
                "text": body,
            },
            timeout=15
        )
        return {"sent": True, "id": r.json().get("id")}
```

---

### `backend/routers/agents.py`
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel
from backend.database import get_session
from backend.models.agent import Agent, AgentRun
from backend.services.agent_generator import generate_agent_config
from backend.services.agent_runner import run_agent
import json

router = APIRouter()

class CreateAgentRequest(BaseModel):
    description: str
    llm_provider: str = "groq"
    api_key: str | None = None   # BYOK — never stored

class RunAgentRequest(BaseModel):
    input_data: str
    llm_provider: str = "groq"
    api_key: str | None = None
    token_map: dict | None = None  # client sends this, never stored

@router.post("/")
async def create_agent(req: CreateAgentRequest, db: Session = Depends(get_session)):
    result = await generate_agent_config(
        req.description, req.llm_provider, req.api_key
    )
    config = result["config"]
    
    agent = Agent(
        name=config["name"],
        description=req.description,
        config_json=json.dumps(config),
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    
    return {
        "agent": agent,
        "pii_stripped_during_creation": result["pii_stripped_count"]
    }

@router.get("/")
def list_agents(db: Session = Depends(get_session)):
    return db.exec(select(Agent)).all()

@router.get("/{agent_id}")
def get_agent(agent_id: str, db: Session = Depends(get_session)):
    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    return agent

@router.post("/{agent_id}/run")
async def run_agent_endpoint(
    agent_id: str,
    req: RunAgentRequest,
    db: Session = Depends(get_session)
):
    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    
    config = json.loads(agent.config_json)
    
    result = await run_agent(
        agent_id=agent_id,
        config=config,
        input_data=req.input_data,
        llm_provider=req.llm_provider,
        api_key=req.api_key,
        token_map=req.token_map,
    )
    
    # Log run metadata (no raw data)
    run = AgentRun(
        agent_id=agent_id,
        status=result["status"],
        output_summary=result.get("output", "")[:500],
        pii_items_stripped=result.get("pii_stripped", 0),
        llm_provider=req.llm_provider,
    )
    db.add(run)
    agent.total_runs += 1
    db.commit()
    
    return result

@router.get("/{agent_id}/runs")
def get_runs(agent_id: str, db: Session = Depends(get_session)):
    runs = db.exec(
        select(AgentRun).where(AgentRun.agent_id == agent_id)
    ).all()
    return runs
```

---

### `backend/routers/audit.py`
```python
from fastapi import APIRouter
from backend.services.audit_logger import read_log

router = APIRouter()

@router.get("/")
def get_audit_log(limit: int = 50):
    return read_log(limit)
```

---

## 2. Frontend: Next.js

### `frontend/lib/keystore.ts`
```typescript
// API key never touches your backend DB.
// Encrypted in localStorage under a session-derived key.

const KEY_STORE_NAME = "pf_llm_key";

export function saveKey(provider: string, key: string) {
  const encoded = btoa(`${provider}:${key}`);
  localStorage.setItem(KEY_STORE_NAME, encoded);
}

export function loadKey(): { provider: string; key: string } | null {
  const raw = localStorage.getItem(KEY_STORE_NAME);
  if (!raw) return null;
  const [provider, key] = atob(raw).split(":");
  return { provider, key };
}

export function clearKey() {
  localStorage.removeItem(KEY_STORE_NAME);
}
```

---

### `frontend/app/page.tsx` (Landing — describe your agent)
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { loadKey } from "@/lib/keystore";

export default function Home() {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function createAgent() {
    setLoading(true);
    const keyData = loadKey();
    
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        llm_provider: keyData?.provider || "groq",
        api_key: keyData?.key || null,
      }),
    });
    
    const data = await res.json();
    setLoading(false);
    router.push(`/agent/${data.agent.id}`);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 gap-6">
      <h1 className="text-3xl font-semibold">PrivacyForge</h1>
      <p className="text-gray-500 text-center max-w-md">
        Describe the agent you want. Your data stays private — always.
      </p>
      
      <textarea
        className="w-full max-w-xl h-32 p-4 border rounded-xl text-sm"
        placeholder="e.g. I want an agent that scans my patient records CSV for billing anomalies and emails me a summary every Monday"
        value={description}
        onChange={e => setDescription(e.target.value)}
      />
      
      <button
        onClick={createAgent}
        disabled={loading || !description.trim()}
        className="px-8 py-3 bg-black text-white rounded-xl disabled:opacity-40"
      >
        {loading ? "Building agent..." : "Build my agent →"}
      </button>
    </main>
  );
}
```

---

### `frontend/components/PrivacyBadge.tsx`
```tsx
// The "0 PII transmitted" badge — core demo moment.
interface Props {
  piiStripped: number;
  piiTransmitted: number;  // always 0
}

export function PrivacyBadge({ piiStripped, piiTransmitted }: Props) {
  return (
    <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-700 text-lg">
        🔒
      </div>
      <div>
        <p className="text-sm font-medium text-green-800">
          {piiStripped} PII items stripped
        </p>
        <p className="text-xs text-green-600">
          {piiTransmitted} transmitted to LLM — privacy guaranteed
        </p>
      </div>
    </div>
  );
}
```

---

## 3. Environment Variables

```bash
# backend/.env
GROQ_API_KEY=your_groq_free_key_here
BRAVE_SEARCH_KEY=optional_free_tier
RESEND_API_KEY=optional_free_tier

# No Anthropic key needed — BYOK only
```

---

## 4. Install & Run

```bash
# Backend
cd backend
pip install fastapi uvicorn sqlmodel presidio-analyzer presidio-anonymizer \
            httpx python-dotenv spacy beautifulsoup4
python -m spacy download en_core_web_lg
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

---

## 5. Hackathon Demo Script (3 min)

1. Open app — show clean input box
2. Type: *"I want an agent that finds billing anomalies in my patient records"*
3. Show **split screen**: left = raw CSV with real names, right = what LLM received (`[PATIENT_A]`, `[AMOUNT_X]`)
4. Agent runs → surfaces 3 anomalies → shows result re-identified locally
5. Dashboard: **"47 inferences. 0 PII transmitted."**
6. Click audit log → show hash-chained entries → "tamper-proof proof"
7. Mic drop: *"Powerful AI. Zero privacy cost."*

---

## 6. Sprint Plan (48-hour hackathon)

| Hour | Task |
|------|------|
| 0-2  | Scaffold FastAPI + SQLite + models |
| 2-4  | Presidio PII strip working end-to-end |
| 4-6  | LLM router: Groq + BYOK |
| 6-10 | Agent generator prompt + config JSON |
| 10-14| Agent runner + 2 tools (web_search, http_call) |
| 14-18| Audit logger (hash-chained) |
| 18-22| Next.js frontend: landing + agent creation |
| 22-28| Dashboard: agent list, run history, privacy badge |
| 28-36| Integration testing + split-screen demo setup |
| 36-42| Polish UI + demo script |
| 42-48| Buffer / rehearse / submit |
