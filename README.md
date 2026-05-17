# PrivacyForge MVP

PrivacyForge is a privacy-first agent builder demo. The MVP centers on one controlled flow:

1. Describe the agent you want.
2. Strip PII before the LLM sees the text.
3. Generate a constrained agent config.
4. Run one tool-backed agent action.
5. Re-identify results locally and show the privacy proof in the UI.

## Stack

- Backend: FastAPI, SQLModel, SQLite
- Frontend: Next.js, TypeScript, plain CSS
- Privacy: Presidio-compatible stripping with a local fallback for development
- Audit: append-only JSONL log for the MVP

## Reference Materials

Use these when you need a privacy-design or blockchain reference while working on the app:

- [Midnight Network](https://midnight.network/) - programmable privacy, selective disclosure, and dual-state ledger concepts
- [Midnight Docs](https://docs.midnight.network/) - developer documentation and implementation details
- [Midnight Developer Hub](https://midnight.network/developer-hub) - ecosystem and builder resources

## Project Layout

- `backend/` - API, models, services, tools
- `frontend/` - Next.js app, dashboard, and agent views
- `docker-compose.yml` - local orchestration entry point

## Run Locally

### Backend

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` in `frontend/.env.local` if you want the UI to point at the backend explicitly.

## MVP Scope

The initial implementation keeps the demo focused and reliable:

- manual runs only
- one tool decision per run
- constrained JSON output from the agent generator
- privacy counters derived from runtime data
- local re-identification only

## Midnight Integration

- Midnight proof fields are stored per run in SQLite so the UI can show proof status.
- The agent detail page includes a Midnight badge that links to the testnet explorer when a tx hash exists.
- The chain submission seam is configured to stay local-first unless Midnight testnet settings are supplied.
