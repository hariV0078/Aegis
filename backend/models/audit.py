from __future__ import annotations

from datetime import datetime
from typing import Optional
import uuid

from sqlmodel import Field, SQLModel


class AuditEntry(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    run_id: str
    event: str
    data_json: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    prev_hash: Optional[str] = None
    hash: Optional[str] = None
