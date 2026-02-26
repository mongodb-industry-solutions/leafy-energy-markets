import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

# Resolve project root (backend/app/main.py -> backend -> project root)
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# Load env files: backend/.env first, then deploy/.env as fallback.
# load_dotenv does NOT override already-set vars, so the first file wins.
load_dotenv(os.path.join(_PROJECT_ROOT, 'backend', '.env'))
load_dotenv(os.path.join(_PROJECT_ROOT, 'deploy', '.env'))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import commands, queries, telemetry, search, advisor
from app.infrastructure.db import get_client, close_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: verify MongoDB is reachable
    client = get_client()
    client.admin.command("ping")
    yield
    # Shutdown: close the connection pool
    close_client()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(commands.router, prefix="/api")
app.include_router(queries.router, prefix="/api")
app.include_router(telemetry.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(advisor.router, prefix="/api")

@app.get("/")
def read_root():
    return {"Hello": "World"}
