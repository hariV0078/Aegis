import unittest
import os
import hashlib
from datetime import datetime, timezone
from sqlmodel import SQLModel, Session, create_engine

# Import objects under test
from backend.services.midnight_logger import (
    build_commitment,
    _attempt_midnight_submit,
    log_run,
    finalize_run_midnight_anchor,
)
from backend.models.agent import Agent, AgentRun
import backend.services.midnight_logger as midnight_logger


class TestMidnightIntegration(unittest.TestCase):
    def setUp(self):
        # Set up a clean in-memory SQLite database for database-related assertions
        self.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        SQLModel.metadata.create_all(self.engine)
        
        # Monkeypatch the engine inside midnight_logger to point to our clean in-memory DB
        self.original_engine = midnight_logger.engine
        midnight_logger.engine = self.engine

    def tearDown(self):
        # Restore the original engine monkeypatch
        midnight_logger.engine = self.original_engine
        if "MIDNIGHT_MOCK_TX_HASH" in os.environ:
            del os.environ["MIDNIGHT_MOCK_TX_HASH"]

    def test_build_commitment_is_deterministic(self):
        """Verify build_commitment correctly generates a deterministic SHA-256 hash."""
        agent_id = "test-agent-id-123"
        pii_count = 5
        token_map_hash = hashlib.sha256(b"dummy-tokens").hexdigest()
        timestamp = datetime.now(timezone.utc).isoformat()

        # Generate commitment
        h1 = build_commitment(agent_id, pii_count, token_map_hash, timestamp)
        h2 = build_commitment(agent_id, pii_count, token_map_hash, timestamp)

        # Assert determinism and SHA-256 structure
        self.assertEqual(h1, h2)
        self.assertEqual(len(h1), 64)  # 256-bit hash is 64 hex characters

    def test_mock_submission_with_mock_env(self):
        """Verify _attempt_midnight_submit responds correctly with simulated mock environmental variables."""
        # 1. Test unconfigured state
        tx_hash, status = self.run_async(_attempt_midnight_submit("some-commitment"))
        self.assertIsNone(tx_hash)
        self.assertEqual(status, "not_configured")

        # 2. Test configured mock state
        os.environ["MIDNIGHT_MOCK_TX_HASH"] = "0xmockmidnighttx1234567890abcdef"
        tx_hash, status = self.run_async(_attempt_midnight_submit("some-commitment"))
        self.assertEqual(tx_hash, "0xmockmidnighttx1234567890abcdef")
        self.assertEqual(status, "confirmed")

    def test_finalize_midnight_anchor_updates_db(self):
        """Verify that finalize_run_midnight_anchor correctly stores anchoring proof on database AgentRun."""
        # Setup mock tx hash environment
        os.environ["MIDNIGHT_MOCK_TX_HASH"] = "0xconfirmedtxhash"

        # Create a mock agent and run in our testing database
        with Session(self.engine) as session:
            agent = Agent(
                id="agent-uuid-999",
                name="Test Compliance Agent",
                description="Verifies ZK Proof anchoring pipeline",
                config_json="{}",
            )
            run = AgentRun(
                id="run-uuid-777",
                agent_id="agent-uuid-999",
                status="success",
                midnight_status="not_configured",
            )
            session.add(agent)
            session.add(run)
            session.commit()

        # Invoke the background task handler
        run_result = {
            "run_id": "run-uuid-777",
            "pii_stripped": 3,
            "status": "success"
        }
        token_map_hash = hashlib.sha256(b"compliance-anchoring").hexdigest()

        self.run_async(
            finalize_run_midnight_anchor(
                run_id="run-uuid-777",
                agent_id="agent-uuid-999",
                run_result=run_result,
                token_map_hash=token_map_hash,
            )
        )

        # Assert data was successfully committed in SQLite database
        with Session(self.engine) as session:
            updated_run = session.get(AgentRun, "run-uuid-777")
            self.assertIsNotNone(updated_run)
            self.assertEqual(updated_run.midnight_status, "confirmed")
            self.assertEqual(updated_run.midnight_tx_hash, "0xconfirmedtxhash")
            self.assertIsNotNone(updated_run.midnight_confirmed_at)

    def run_async(self, coro):
        """Helper to run async functions synchronously in standard unittest suite."""
        import asyncio
        return asyncio.run(coro)


if __name__ == "__main__":
    unittest.main()
