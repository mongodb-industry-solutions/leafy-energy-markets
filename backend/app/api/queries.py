from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import MongoClient

from app.domain.aggregates import TariffScenario, Instrument
from app.infrastructure.event_store import EventStore
from app.infrastructure.db import get_db, DB_NAME

router = APIRouter()

@router.get("/tariff-scenarios/{scenario_id}")
async def get_tariff_scenario(scenario_id: str, client: MongoClient = Depends(get_db)):
    db_name = DB_NAME
    db = client[db_name]
    scenarios_collection = db.tariff_scenarios

    scenario = scenarios_collection.find_one({"_id": scenario_id})

    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")

    return scenario

# ── Event Stream / Audit Endpoints ──────────────────────────

@router.get("/events/streams")
async def list_event_streams(client: MongoClient = Depends(get_db)):
    """List all event streams with summary info."""
    store = EventStore(client, TariffScenario)
    return store.get_all_streams()

@router.get("/events/stream/{stream_id}")
async def get_event_stream(
    stream_id: str,
    up_to_version: int | None = Query(None),
    client: MongoClient = Depends(get_db),
):
    """Get all events for a stream, optionally up to a specific version."""
    store = EventStore(client, TariffScenario)
    events = store.get_event_stream(stream_id, up_to_version)
    if not events:
        raise HTTPException(status_code=404, detail="Stream not found")
    return {"streamId": stream_id, "events": events}

@router.get("/events/stream/{stream_id}/replay")
async def replay_stream(
    stream_id: str,
    up_to_version: int | None = Query(None),
    client: MongoClient = Depends(get_db),
):
    """
    Demonstrates fold() — returns state at each step.
    Returns: { steps: [{ version, event, stateAfter }, ...] }
    """
    store = EventStore(client, TariffScenario)
    steps = store.replay_stream(stream_id, up_to_version)
    if not steps:
        raise HTTPException(status_code=404, detail="Stream not found")
    return {"streamId": stream_id, "steps": steps}
