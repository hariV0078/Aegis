from __future__ import annotations

import os

import httpx
from fastapi import APIRouter
from sqlmodel import Session, select

from backend.database import engine
from backend.models.agent import AgentRun
from backend.services.audit_logger import read_log

router = APIRouter()


@router.get("")
def get_audit_log(limit: int = 50):
    return read_log(limit)


@router.get("/onchain/{agent_id}")
async def get_onchain_audit(agent_id: str):
    with Session(engine) as session:
        runs = session.exec(select(AgentRun).where(AgentRun.agent_id == agent_id).order_by(AgentRun.started_at.desc())).all()

    indexer_url = os.getenv("MIDNIGHT_INDEXER_URL", "https://indexer.testnet.midnight.network/api/v1/graphql")
    query = """
    query TransactionByHash($hash: HexEncoded!) {
      transactions(offset: { hash: $hash }) {
        hash
        block {
          height
          timestamp
        }
      }
    }
    """

    results: list[dict] = []
    async with httpx.AsyncClient(timeout=15.0) as client:
        for run in runs:
            if not run.midnight_tx_hash:
                continue

            block_number = None
            timestamp = run.midnight_confirmed_at.isoformat() if run.midnight_confirmed_at else None

            try:
                response = await client.post(
                    indexer_url,
                    json={"query": query, "variables": {"hash": run.midnight_tx_hash}},
                )
                response.raise_for_status()
                payload = response.json()
                transactions = ((payload.get("data") or {}).get("transactions") or [])
                if transactions:
                    transaction = transactions[0]
                    block = transaction.get("block") or {}
                    block_number = block.get("height")
                    timestamp = timestamp or (block.get("timestamp") and str(block.get("timestamp")))
            except Exception:
                pass

            results.append(
                {
                    "tx_hash": run.midnight_tx_hash,
                    "block_number": block_number,
                    "timestamp": timestamp,
                    "privacy_guaranteed": True,
                }
            )

    return results
