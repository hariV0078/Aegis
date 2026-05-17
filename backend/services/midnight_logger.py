from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlmodel import Session, select

from backend.database import engine
from backend.models.agent import AgentRun


@dataclass(frozen=True)
class MidnightSubmission:
    run_id: str
    commitment: str
    midnight_tx_hash: str | None
    midnight_status: str


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_commitment(agent_id: str, pii_count: int, token_map_hash: str, timestamp: str) -> str:
    payload = f"{agent_id}{pii_count}0{token_map_hash}{timestamp}"
    return _sha256(payload)


async def _attempt_midnight_submit(commitment: str) -> tuple[str | None, str]:
    """Placeholder submission bridge.

    The repo does not yet include the Midnight toolchain or wallet wiring needed to
    submit a real contract call. When MIDNIGHT_MOCK_TX_HASH is set, we use that for
    local demo wiring; otherwise we return a disabled status and keep the app local-only.
    """
    mock_tx_hash = os.getenv("MIDNIGHT_MOCK_TX_HASH")
    if mock_tx_hash:
        return mock_tx_hash, "confirmed"

    if not os.getenv("MIDNIGHT_RPC_URL") or not os.getenv("MIDNIGHT_CONTRACT_ADDRESS"):
        return None, "not_configured"

    return None, "pending"


async def log_run(run_result: dict, agent_id: str, token_map_hash: str | None) -> MidnightSubmission:
    if not token_map_hash:
        return MidnightSubmission(
            run_id=run_result["run_id"],
            commitment="",
            midnight_tx_hash=None,
            midnight_status="not_configured",
        )

    timestamp = _utc_iso()
    commitment = build_commitment(
        agent_id=agent_id,
        pii_count=int(run_result.get("pii_stripped", 0)),
        token_map_hash=token_map_hash,
        timestamp=timestamp,
    )

    midnight_tx_hash, midnight_status = await _attempt_midnight_submit(commitment)
    return MidnightSubmission(
        run_id=run_result["run_id"],
        commitment=commitment,
        midnight_tx_hash=midnight_tx_hash,
        midnight_status=midnight_status,
    )


async def finalize_run_midnight_anchor(
    run_id: str,
    agent_id: str,
    run_result: dict,
    token_map_hash: str | None,
) -> None:
    submission = await log_run(run_result, agent_id=agent_id, token_map_hash=token_map_hash)

    with Session(engine) as session:
        run = session.exec(select(AgentRun).where(AgentRun.id == run_id)).first()
        if not run:
            return

        run.midnight_tx_hash = submission.midnight_tx_hash
        run.midnight_status = submission.midnight_status
        if submission.midnight_tx_hash:
            run.midnight_confirmed_at = datetime.now(timezone.utc)
        else:
            run.midnight_confirmed_at = None
        session.add(run)
        session.commit()


async def schedule_midnight_anchor(
    run_id: str,
    agent_id: str,
    run_result: dict,
    token_map_hash: str | None,
) -> None:
    await finalize_run_midnight_anchor(run_id, agent_id, run_result, token_map_hash)