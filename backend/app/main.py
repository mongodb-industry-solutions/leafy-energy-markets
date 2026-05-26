import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

# Resolve project root (backend/app/main.py -> backend -> project root)
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

load_dotenv(os.path.join(_PROJECT_ROOT, 'deploy', '.env'), override=True)
load_dotenv(os.path.join(_PROJECT_ROOT, 'backend', '.env'), override=True)

# Clear shell-level Anthropic SDK env vars that would hijack LLM routing.
# The backend manages its own LLM config via deploy/.env.
for _var in ("ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL"):
    if not os.environ.get(_var, "").startswith("sk-ant-"):
        os.environ.pop(_var, None)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import commands, queries, telemetry, search, advisor, audit, trading
from app.infrastructure.db import get_client, close_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: get_client() eagerly pings and warms the pool
    get_client()
    yield
    # Shutdown: drain pool and release connections
    close_client()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(commands.router, prefix="/api")
app.include_router(queries.router, prefix="/api")
app.include_router(telemetry.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(advisor.router, prefix="/api")
app.include_router(audit.router, prefix="/api")
app.include_router(trading.router, prefix="/api")

@app.get("/")
def health():
    return "Server is running"
