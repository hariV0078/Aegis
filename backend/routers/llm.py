from __future__ import annotations

from fastapi import APIRouter

from backend.services.llm_router import available_providers

router = APIRouter()


@router.get("")
def status() -> dict:
    return {"providers": available_providers(), "default": "groq", "status": "ok"}
