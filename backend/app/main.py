import asyncio
import logging
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
from app.infrastructure.db import get_client, close_client, DB_NAME

logger = logging.getLogger(__name__)


async def _simulator_watchdog(db) -> None:
    """Restart the trading simulator if its asyncio task dies unexpectedly."""
    while True:
        await asyncio.sleep(30)
        sim = trading.simulator
        if not sim._running:
            continue
        if sim._task is None or sim._task.done():
            logger.warning("Trading simulator task died — restarting")
            sim._running = False  # reset flag so start() doesn't early-return
            sim.start(db=db)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: warm DB pool, auto-start trading simulator, launch watchdog
    client = get_client()
    db = client[DB_NAME]
    trading.simulator.start(db=db)
    watchdog = asyncio.create_task(_simulator_watchdog(db))
    yield
    # Shutdown: cancel watchdog, stop simulator, drain pool
    watchdog.cancel()
    await trading.simulator.stop()
    close_client()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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
