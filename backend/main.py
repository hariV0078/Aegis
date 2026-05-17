from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response

from backend.database import init_db
from backend.routers import agents, audit, llm

app = FastAPI(title="PrivacyForge API")

# CORS middleware must be added before routers to handle preflight requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Catch-all OPTIONS handler for CORS preflight
@app.options("/{path:path}")
async def options_handler(path: str) -> Response:
    return Response(
        headers={
            "Access-Control-Allow-Origin": "http://localhost:3000",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "3600",
        }
    )


app.include_router(agents.router, prefix="/agents", tags=["agents"])
app.include_router(llm.router, prefix="/llm", tags=["llm"])
app.include_router(audit.router, prefix="/audit", tags=["audit"])


@app.on_event("startup")
async def startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
