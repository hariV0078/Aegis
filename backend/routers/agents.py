from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.agent import Agent, AgentRun
from backend.services.agent_generator import generate_agent_config
from backend.services.agent_runner import run_agent
from backend.services.demo_workflows import MEDICAL_BILLING_DETECTOR
from backend.services.midnight_logger import schedule_midnight_anchor

router = APIRouter()


class CreateAgentRequest(BaseModel):
    description: str
    llm_provider: str = "groq"
    api_key: str | None = None
    workflow_json: dict | None = None


class RunAgentRequest(BaseModel):
    input_data: str
    llm_provider: str = "groq"
    api_key: str | None = None
    token_map: dict | None = None


class GenerateAgentRequest(BaseModel):
    description: str
    llm_provider: str = "groq"
    api_key: str | None = None


@router.post("")
async def create_agent(req: CreateAgentRequest, db: Session = Depends(get_session)):
    result = await generate_agent_config(req.description, req.llm_provider, req.api_key)
    config = result["config"]

    agent = Agent(
        name=config["name"],
        description=req.description,
        config_json=json.dumps(config),
        workflow_json=json.dumps(req.workflow_json) if req.workflow_json else None,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)

    return {"agent": agent, "pii_stripped_during_creation": result["pii_stripped_count"]}


@router.get("")
def list_agents(db: Session = Depends(get_session)):
    return db.exec(select(Agent).order_by(Agent.created_at.desc())).all()


@router.get("/{agent_id}")
def get_agent(agent_id: str, db: Session = Depends(get_session)):
    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.delete("/{agent_id}")
def delete_agent(agent_id: str, db: Session = Depends(get_session)):
    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    runs = db.exec(select(AgentRun).where(AgentRun.agent_id == agent_id)).all()
    for run in runs:
        db.delete(run)
    db.delete(agent)
    db.commit()
    return {"deleted": True, "agent_id": agent_id}


@router.post("/{agent_id}/run")
async def run_agent_endpoint(
    agent_id: str,
    req: RunAgentRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_session),
):
    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    config = json.loads(agent.config_json)
    workflow = json.loads(agent.workflow_json) if agent.workflow_json else None
    run_started_at = datetime.utcnow()
    agent.status = "running"
    db.add(agent)
    db.commit()

    result = await run_agent(
        agent_id=agent_id,
        config=config,
        input_data=req.input_data,
        llm_provider=req.llm_provider,
        api_key=req.api_key,
        token_map=req.token_map,
        workflow=workflow,
    )

    run = AgentRun(
        agent_id=agent_id,
        started_at=run_started_at,
        finished_at=datetime.utcnow(),
        status=result["status"],
        output_summary=str(result.get("output", ""))[:500],
        pii_items_stripped=result.get("pii_stripped", 0),
        llm_provider=req.llm_provider,
        midnight_status="queued",
        midnight_submitted_at=datetime.utcnow(),
    )
    agent.status = "idle" if result["status"] == "success" else "error"
    agent.total_runs += 1
    agent.last_run_at = run.finished_at
    db.add(run)
    db.add(agent)
    db.commit()

    token_map_hashes = result.get("token_map_hashes") or []
    token_map_hash = token_map_hashes[-1] if token_map_hashes else None
    background_tasks.add_task(
        schedule_midnight_anchor,
        run.id,
        agent_id,
        result,
        token_map_hash,
    )

    return result



@router.post("/generate")
async def generate_agent_endpoint(req: GenerateAgentRequest):
    """Generate an agent configuration using the LLM without persisting to the database."""
    result = await generate_agent_config(req.description, req.llm_provider, req.api_key)
    return result



class UpdateAgentRequest(BaseModel):
    description: str | None = None
    workflow_json: dict | None = None


@router.put("/{agent_id}")
def update_agent(agent_id: str, req: UpdateAgentRequest, db: Session = Depends(get_session)):
    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if req.description is not None:
        agent.description = req.description
    if req.workflow_json is not None:
        agent.workflow_json = json.dumps(req.workflow_json)
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


@router.get("/{agent_id}/runs")
def get_runs(agent_id: str, db: Session = Depends(get_session)):
    return db.exec(select(AgentRun).where(AgentRun.agent_id == agent_id).order_by(AgentRun.started_at.desc())).all()


@router.post("/demo/medical-billing")
async def create_demo_agent(db: Session = Depends(get_session)):
    """Create a demo medical billing anomaly detector agent with workflow."""
    agent = Agent(
        name="Medical Billing Anomaly Detector",
        description="Detects billing anomalies in medical records while preserving patient privacy through multi-node workflow execution.",
        config_json=json.dumps({
            "name": "Medical Billing Anomaly Detector",
            "goal": "Detect billing anomalies in medical records",
            "tools": ["web_search", "http_call", "email_send"],
            "trigger": "manual",
            "privacy_rules": {
                "strip_before_llm": True,
                "retention_policy": "no_store",
            },
        }),
        workflow_json=json.dumps(MEDICAL_BILLING_DETECTOR),
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    
    return {
        "agent": agent,
        "message": "Demo agent created with medical billing detector workflow",
        "workflow_nodes": len(MEDICAL_BILLING_DETECTOR.get("nodes", [])),
    }