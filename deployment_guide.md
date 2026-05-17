# Aegis Production Deployment Guide

This guide outlines the production deployment architectures, configurations, and commands required to deploy the **Aegis** secure AI orchestrator to cloud environments.

---

## 📋 System Requirements & Environment Check

Before deploying, ensure you have configured your environment variable keys:

| Environment Variable | Description | Recommended Scope |
| :--- | :--- | :--- |
| `GROQ_API_KEY` | enterprise AI generation fallback token | Backend |
| `OLLAMA_URL` | Local mistral interface (optional) | Backend |
| `DATABASE_URL` | Production PostgreSQL connection string | Backend |
| `MIDNIGHT_TESTNET_ENDPOINT` | Midnight ZK Ledger remote gateway node | Backend relayer |
| `NEXT_PUBLIC_API_BASE_URL` | Public secure gateway URL of the deployed FastAPI | Frontend build-time |

---

## 🐳 Option 1: Containerized On-Premise Deployment (Docker Compose)

Deploy the entire stack (FastAPI backend + Next.js frontend + SQLite DB) locally or to a virtual machine in a single command.

### 1. Build and Launch Containers
Run this command from the root directory of the workspace:
```bash
docker-compose up --build -d
```

### 2. Verify Stack Status
Verify that all services are healthy and running:
```bash
docker-compose ps
```
- **Backend Service**: Available at `http://localhost:8000`
- **Frontend Panel**: Available at `http://localhost:3000`

### 3. Log Inspection
To view server logs in real-time:
```bash
docker-compose logs -f backend
```

---

## ☁️ Option 2: Full Cloud Serverless Deployment (Vercel & Railway)

For high-availability, high-performance cloud hosting, we split the frontend and backend architectures:

### 🟩 Part A: Backend (Railway / Render)
FastAPI runs as a persistent service connected to a PostgreSQL database instance.

1. **Create Database**: Provision a production PostgreSQL instance on Railway.
2. **Configure App variables**:
   - Set `DATABASE_URL` to your PostgreSQL connection string.
   - Set your runtime variables (`GROQ_API_KEY`, `MIDNIGHT_TESTNET_ENDPOINT`).
3. **Build Command**: Aegis automatically runs migrations and binds to the specified port:
   ```bash
   pip install -r backend/requirements.txt && uvicorn backend.main:app --host 0.0.0.0 --port $PORT
   ```

---

### 🟪 Part B: Frontend (Vercel)
The Next.js 14 App Router is deployed directly to Vercel for instantaneous serverless edge delivery.

1. **Import Workspace**: Link your GitHub repository to Vercel.
2. **Environment Configuration**: Add the single required build-time variable:
   - `NEXT_PUBLIC_API_BASE_URL`: The production URL of your FastAPI backend (e.g. `https://aegis-backend.railway.app`).
3. **Deploy**: Vercel handles the static production bundling, routes, and optimizations automatically.

---

## 🔒 Smart Contract & Ledger Deployment (Midnight)

To migrate the compliant auditing log to active public ledger environments:

1. **Contract Compilation**: Compile the ZK-proof logic from the compact file:
   ```bash
   cd midnight
   npx compactc contracts/AuditLog.compact
   ```
2. **Relayer Configuration**: Add the generated contract ABI and the credentials of your private staking key to the backend relayer environment. Aegis will automatically route and anchor compliance commitments.
