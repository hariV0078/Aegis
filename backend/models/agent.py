from __future__ import annotations

from datetime import datetime
from typing import Optional
import uuid

from sqlmodel import Field, SQLModel


class Agent(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str
    description: str
    config_json: str
    workflow_json: Optional[str] = None
    status: str = "idle"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_run_at: Optional[datetime] = None
    total_runs: int = 0
    pii_transmitted: int = 0


class AgentRun(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    agent_id: str = Field(foreign_key="agent.id")
    started_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: Optional[datetime] = None
    status: str = "running"
    output_summary: Optional[str] = None
    output: Optional[str] = None
    node_outputs_json: Optional[str] = None
    pii_items_stripped: int = 0
    llm_provider: str = "groq"
    midnight_tx_hash: Optional[str] = None
    midnight_status: str = "not_configured"
    midnight_submitted_at: Optional[datetime] = None
    midnight_confirmed_at: Optional[datetime] = None
