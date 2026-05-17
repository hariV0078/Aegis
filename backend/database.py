from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

ROOT_DIR = Path(__file__).resolve().parents[1]
DATABASE_PATH = ROOT_DIR / "privacyforge.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH.as_posix()}"
engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False})


def _ensure_sqlite_column(table_name: str, column_name: str, column_type: str) -> None:
    with engine.begin() as connection:
        rows = connection.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
        existing_columns = {row[1] for row in rows}
        if column_name not in existing_columns:
            connection.exec_driver_sql(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")


def init_db() -> None:
    from backend.models import agent, audit  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _ensure_sqlite_column("agentrun", "midnight_tx_hash", "TEXT")
    _ensure_sqlite_column("agentrun", "midnight_status", "TEXT NOT NULL DEFAULT 'not_configured'")
    _ensure_sqlite_column("agentrun", "midnight_submitted_at", "DATETIME")
    _ensure_sqlite_column("agentrun", "midnight_confirmed_at", "DATETIME")
    _ensure_sqlite_column("agentrun", "output", "TEXT")
    _ensure_sqlite_column("agentrun", "node_outputs_json", "TEXT")
    _ensure_sqlite_column("agentrun", "token_map_json", "TEXT")


def get_session():
    with Session(engine) as session:
        yield session
