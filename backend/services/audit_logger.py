from __future__ import annotations

from datetime import datetime
from pathlib import Path
import hashlib
import json

ROOT_DIR = Path(__file__).resolve().parents[2]
LOG_PATH = ROOT_DIR / "backend" / "audit.jsonl"


def _hash_entry(entry: dict) -> str:
    payload = json.dumps(entry, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


async def log_event(run_id: str, event: str, data: dict) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    prev_hash = "genesis"
    if LOG_PATH.exists():
        lines = [line for line in LOG_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]
        if lines:
            try:
                prev_hash = json.loads(lines[-1]).get("hash", "genesis")
            except Exception:
                prev_hash = "genesis"

    entry = {
        "run_id": run_id,
        "event": event,
        "data": data,
        "timestamp": datetime.utcnow().isoformat(),
        "prev_hash": prev_hash,
    }
    entry["hash"] = _hash_entry(entry)

    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, default=str) + "\n")


def read_log(limit: int = 50) -> list[dict]:
    if not LOG_PATH.exists():
        return []
    lines = [line for line in LOG_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]
    entries: list[dict] = []
    for line in lines[-limit:]:
        try:
            entries.append(json.loads(line))
        except Exception:
            continue
    return entries
