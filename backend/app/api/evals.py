"""RAGAS evaluation API — trigger runs and fetch stored results."""

import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends

from app.infrastructure.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter()

DB_NAME = os.getenv("MONGO_DB_NAME", "leafy-energy-markets")

# In-process run status (sufficient for single-process demo)
_run_status: dict = {
    "status": "idle",       # idle | running | completed | failed
    "started_at": None,
    "completed_at": None,
    "run_id": None,
    "error": None,
}


async def _execute_eval(db) -> None:
    global _run_status
    try:
        from ragas_evals.runner import run_ragas_evaluation

        run_tag = datetime.now(timezone.utc).strftime("run-%Y%m%d-%H%M%S")
        result = await run_ragas_evaluation(db, run_tag=run_tag)

        _run_status["status"] = "completed"
        _run_status["completed_at"] = datetime.now(timezone.utc).isoformat()
        _run_status["run_id"] = result.get("_id")
        _run_status["error"] = None
    except Exception as exc:
        logger.exception("RAGAS evaluation failed")
        _run_status["status"] = "failed"
        _run_status["error"] = str(exc)
        _run_status["completed_at"] = datetime.now(timezone.utc).isoformat()


@router.post("/evals/run")
async def trigger_run(background_tasks: BackgroundTasks, client=Depends(get_db)):
    """Trigger a RAGAS evaluation run in the background."""
    if _run_status["status"] == "running":
        return {"status": "already_running", "message": "An evaluation is already in progress."}

    db = client[DB_NAME]
    _run_status["status"] = "running"
    _run_status["started_at"] = datetime.now(timezone.utc).isoformat()
    _run_status["completed_at"] = None
    _run_status["run_id"] = None
    _run_status["error"] = None

    background_tasks.add_task(_execute_eval, db)
    return {"status": "started", "message": "RAGAS evaluation started in the background."}


@router.get("/evals/status")
async def get_status():
    """Get the current evaluation run status."""
    return _run_status


@router.get("/evals/results")
async def get_results(limit: int = 10, client=Depends(get_db)):
    """Fetch recent completed evaluation runs (without per-question details)."""
    db = client[DB_NAME]
    runs = list(
        db["rag_evals"]
        .find({"status": "completed"}, {"questions": 0})
        .sort("timestamp", -1)
        .limit(limit)
    )
    for r in runs:
        r["_id"] = str(r["_id"])
        ts = r.get("timestamp")
        if hasattr(ts, "isoformat"):
            r["timestamp"] = ts.isoformat()
    return runs


@router.get("/evals/results/latest")
async def get_latest(client=Depends(get_db)):
    """Fetch the most recent completed evaluation (with per-question breakdown)."""
    db = client[DB_NAME]
    doc = db["rag_evals"].find_one({"status": "completed"}, sort=[("timestamp", -1)])
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    ts = doc.get("timestamp")
    if hasattr(ts, "isoformat"):
        doc["timestamp"] = ts.isoformat()
    return doc


@router.get("/evals/interactions")
async def get_interactions(limit: int = 50, client=Depends(get_db)):
    """Return recent advisor interactions for query term analysis / bubble chart."""
    db = client[DB_NAME]
    docs = list(
        db["advisor_interactions"]
        .find({}, {"question": 1, "tool_calls": 1, "timestamp": 1, "_id": 0})
        .sort("timestamp", -1)
        .limit(limit)
    )
    for d in docs:
        ts = d.get("timestamp")
        if hasattr(ts, "isoformat"):
            d["timestamp"] = ts.isoformat()
    return docs
