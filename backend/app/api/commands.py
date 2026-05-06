from fastapi import APIRouter, Depends
from pymongo import MongoClient
import uuid
import os
from datetime import datetime, timezone, timedelta

from app.domain.commands import CreateTariffScenario
from app.domain.events import (
    TariffScenarioCreated,
    PriceTickRecorded,
    InstrumentListed,
    MeterReadingRecorded,
    TradeExecuted,
)
from app.domain.aggregates import TariffScenario, Instrument
from app.infrastructure.event_store import EventStore
from app.infrastructure.db import get_db, DB_NAME

router = APIRouter()

@router.post("/portfolios/{portfolio_id}/tariff-scenarios")
async def create_tariff_scenario(
    portfolio_id: str,
    command: CreateTariffScenario,
    client: MongoClient = Depends(get_db)
):
    event_store = EventStore(client, TariffScenario)

    command.portfolio_id = portfolio_id

    scenario_id = str(uuid.uuid4())

    scenario = TariffScenario(id=scenario_id)

    event = TariffScenarioCreated(
        scenario_id=scenario_id,
        portfolio_id=command.portfolio_id,
        region=command.region,
        from_date=command.from_date,
        to_date=command.to_date
    )

    scenario.record(event)

    event_store.save(scenario, scenario._pending_events)

    return {"scenario_id": scenario_id}


@router.post("/demo/seed-scenario")
async def seed_demo_scenario(client: MongoClient = Depends(get_db)):
    """
    Creates a realistic imbalance settlement scenario with multiple events
    for demonstrating fold() replay in the Event Inspector.
    """
    db = client[DB_NAME]
    events_col = db.trading_events

    stream_id = f"portfolio:brp-demo-{uuid.uuid4().hex[:8]}"
    base_time = datetime(2024, 12, 15, 13, 45, 0, tzinfo=timezone.utc)

    demo_events = [
        {
            "streamId": stream_id,
            "streamType": "Portfolio",
            "version": 1,
            "eventType": "TradeExecuted",
            "timestamp": base_time,
            "payload": {
                "trade_id": f"TRD-{uuid.uuid4().hex[:8]}",
                "portfolio_id": "brp-de-001",
                "instrument_id": "EPEX-DE-INTRA-QH",
                "price": 82.50,
                "quantity": 50,
            },
            "metadata": {"schemaVersion": 1, "correlationId": "isp-demo"},
        },
        {
            "streamId": stream_id,
            "streamType": "Portfolio",
            "version": 2,
            "eventType": "PriceTickRecorded",
            "timestamp": base_time + timedelta(minutes=5),
            "payload": {
                "instrument_id": "EPEX-DE-INTRA-QH",
                "price": 84.00,
            },
            "metadata": {"schemaVersion": 1},
        },
        {
            "streamId": stream_id,
            "streamType": "Portfolio",
            "version": 3,
            "eventType": "MeterReadingRecorded",
            "timestamp": base_time + timedelta(minutes=15),
            "payload": {
                "meter_id": "de-sub-4471",
                "reading": 1204.8,
            },
            "metadata": {"schemaVersion": 1, "reading_type": "isp_start"},
        },
        {
            "streamId": stream_id,
            "streamType": "Portfolio",
            "version": 4,
            "eventType": "TradeExecuted",
            "timestamp": base_time + timedelta(minutes=20),
            "payload": {
                "trade_id": f"TRD-{uuid.uuid4().hex[:8]}",
                "portfolio_id": "brp-de-001",
                "instrument_id": "EPEX-DE-INTRA-QH",
                "price": 86.20,
                "quantity": -20,
            },
            "metadata": {"schemaVersion": 1, "correlationId": "isp-demo"},
        },
        {
            "streamId": stream_id,
            "streamType": "Portfolio",
            "version": 5,
            "eventType": "MeterReadingRecorded",
            "timestamp": base_time + timedelta(minutes=30),
            "payload": {
                "meter_id": "de-sub-4471",
                "reading": 1243.0,
            },
            "metadata": {"schemaVersion": 1, "reading_type": "isp_end"},
        },
        {
            "streamId": stream_id,
            "streamType": "Portfolio",
            "version": 6,
            "eventType": "PriceTickRecorded",
            "timestamp": base_time + timedelta(minutes=31),
            "payload": {
                "instrument_id": "EPEX-DE-IMBAL-QH",
                "price": 850.00,
            },
            "metadata": {"schemaVersion": 1, "price_type": "imbalance_price"},
        },
        {
            "streamId": stream_id,
            "streamType": "Portfolio",
            "version": 7,
            "eventType": "MeterReadingRecorded",
            "timestamp": base_time + timedelta(hours=19, minutes=45),
            "payload": {
                "meter_id": "de-sub-4471",
                "reading": 1241.9,
            },
            "metadata": {
                "schemaVersion": 1,
                "reading_type": "isp_end",
                "corrects_version": 5,
                "correction_reason": "meter_calibration_adjustment",
            },
        },
    ]

    events_col.insert_many(demo_events)

    return {"stream_id": stream_id, "event_count": len(demo_events)}
