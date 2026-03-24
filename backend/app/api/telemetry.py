import asyncio
import json
import logging
import os
import random
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pymongo.errors import CollectionInvalid, OperationFailure

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Pydantic Models ─────────────────────────────────────────

class TelemetryConfig(BaseModel):
    concurrent_writers: int = Field(default=5, ge=1, le=200)
    events_per_second: int = Field(default=1000, ge=10, le=400000)
    batch_size: int = Field(default=100, ge=1, le=5000)
    event_types: List[str] = Field(default=["price_ticks", "meter_readings", "trades"])


class TelemetryMetrics(BaseModel):
    actual_throughput: float = 0.0
    write_latency_p50_ms: float = 0.0
    write_latency_p95_ms: float = 0.0
    write_latency_p99_ms: float = 0.0
    total_events_inserted: int = 0
    active_writers: int = 0
    batch_size: int = 0
    errors: int = 0


# ── Load Generator ──────────────────────────────────────────

class TelemetryLoadGenerator:
    def __init__(self):
        self._running = False
        self._tasks: list[asyncio.Task] = []
        self._config: Optional[TelemetryConfig] = None
        self._total_events = 0
        self._errors = 0
        self._latencies: deque[float] = deque(maxlen=1000)
        self._event_timestamps: deque[float] = deque(maxlen=50000)
        self._lock = asyncio.Lock()
        self._last_error: str = ""
        self._client = None
        self._collection = None
        self._base_time: Optional[datetime] = None
        self._start_monotonic: float = 0.0

    def _get_collection(self):
        if self._client is None:
            from app.infrastructure.db import get_client
            db_name = os.getenv("MONGO_DB_NAME", "leafy-energy-markets")
            self._client = get_client()
            db = self._client[db_name]

            # Create time-series collection if it doesn't exist.
            # CollectionInvalid: collection already exists
            # OperationFailure: exists as a different type, or Atlas permission issue
            try:
                db.create_collection(
                    "telemetry_events",
                    timeseries={
                        "timeField": "timestamp",
                        "metaField": "event_type",
                        "granularity": "seconds",
                    },
                )
            except (CollectionInvalid, OperationFailure):
                pass  # Collection already exists or cannot be created — use as-is

            self._collection = db["telemetry_events"]
        return self._collection

    async def start(self, config: TelemetryConfig):
        if self._running:
            raise HTTPException(status_code=409, detail="Generator already running")

        self._running = True
        self._config = config
        self._total_events = 0
        self._errors = 0
        self._latencies.clear()
        self._event_timestamps.clear()
        self._base_time = datetime.now(timezone.utc)
        self._start_monotonic = time.monotonic()

        # Ensure collection exists
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._get_collection)

        # Target events per writer per second
        per_writer_rate = config.events_per_second / config.concurrent_writers

        for i in range(config.concurrent_writers):
            task = asyncio.create_task(
                self._writer_loop(i, config.batch_size, per_writer_rate, config.event_types)
            )
            self._tasks.append(task)

    async def stop(self):
        self._running = False
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

    def _generate_event(self, event_types: List[str], timestamp: Optional[datetime] = None) -> dict:
        event_type = random.choice(event_types)
        now = timestamp or datetime.now(timezone.utc)

        if event_type == "price_ticks":
            return {
                "timestamp": now,
                "event_type": "price_tick",
                "instrument_id": f"INST-{random.randint(1, 100):03d}",
                "price": round(random.uniform(20.0, 150.0), 2),
                "volume": random.randint(1, 1000),
                "exchange": random.choice(["EPEX", "NordPool", "GME", "N2EX"]),
            }
        elif event_type == "meter_readings":
            return {
                "timestamp": now,
                "event_type": "meter_reading",
                "meter_id": f"MTR-{random.randint(1, 500):04d}",
                "reading_kwh": round(random.uniform(0.5, 50.0), 3),
                "quality": random.choice(["measured", "estimated", "validated"]),
            }
        else:  # trades
            return {
                "timestamp": now,
                "event_type": "trade",
                "trade_id": f"TRD-{random.randint(100000, 999999)}",
                "instrument_id": f"INST-{random.randint(1, 100):03d}",
                "price": round(random.uniform(30.0, 120.0), 2),
                "quantity": random.randint(1, 500),
                "side": random.choice(["buy", "sell"]),
            }

    async def _writer_loop(
        self,
        writer_id: int,
        batch_size: int,
        target_rate: float,
        event_types: List[str],
    ):
        collection = self._get_collection()
        loop = asyncio.get_event_loop()
        interval = batch_size / target_rate if target_rate > 0 else 1.0

        while self._running:
            try:
                elapsed = time.monotonic() - self._start_monotonic
                batch_ts = self._base_time + timedelta(seconds=elapsed) if self._base_time else datetime.now(timezone.utc)
                batch = [self._generate_event(event_types, batch_ts) for _ in range(batch_size)]

                t0 = time.monotonic()
                await loop.run_in_executor(None, lambda: collection.insert_many(batch))
                latency_ms = (time.monotonic() - t0) * 1000

                now = time.monotonic()
                async with self._lock:
                    self._total_events += batch_size
                    self._latencies.append(latency_ms)
                    for _ in range(batch_size):
                        self._event_timestamps.append(now)

                # Throttle to target rate
                elapsed = time.monotonic() - t0
                sleep_time = interval - elapsed
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Writer %d error: %s: %s", writer_id, type(exc).__name__, exc)
                async with self._lock:
                    self._errors += 1
                    self._last_error = f"{type(exc).__name__}: {exc}"
                await asyncio.sleep(0.1)

    def _percentile(self, data: list[float], p: float) -> float:
        if not data:
            return 0.0
        sorted_data = sorted(data)
        idx = int(len(sorted_data) * p / 100)
        idx = min(idx, len(sorted_data) - 1)
        return round(sorted_data[idx], 2)

    def get_metrics(self) -> TelemetryMetrics:
        latencies = list(self._latencies)
        now = time.monotonic()
        # Sliding 5-second window for throughput
        window = 5.0
        recent = [t for t in self._event_timestamps if now - t <= window]
        throughput = len(recent) / window if recent else 0.0

        return TelemetryMetrics(
            actual_throughput=round(throughput, 1),
            write_latency_p50_ms=self._percentile(latencies, 50),
            write_latency_p95_ms=self._percentile(latencies, 95),
            write_latency_p99_ms=self._percentile(latencies, 99),
            total_events_inserted=self._total_events,
            active_writers=len(self._tasks),
            batch_size=self._config.batch_size if self._config else 0,
            errors=self._errors,
        )

    async def stream_metrics(self) -> AsyncGenerator[str, None]:
        while self._running:
            metrics = self.get_metrics()
            data = json.dumps(metrics.model_dump())
            yield f"data: {data}\n\n"
            await asyncio.sleep(1)
        # Send final metrics after stop
        metrics = self.get_metrics()
        data = json.dumps(metrics.model_dump())
        yield f"data: {data}\n\n"


# ── Singleton ───────────────────────────────────────────────

generator = TelemetryLoadGenerator()


# ── Endpoints ───────────────────────────────────────────────

@router.post("/telemetry/start")
async def start_telemetry(config: TelemetryConfig):
    await generator.start(config)
    return {"status": "started", "config": config.model_dump()}


@router.post("/telemetry/stop")
async def stop_telemetry():
    await generator.stop()
    return {"status": "stopped"}


@router.get("/telemetry/stream")
async def stream_telemetry():
    if not generator._running:
        raise HTTPException(status_code=400, detail="Generator not running")
    return StreamingResponse(
        generator.stream_metrics(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class EventBatch(BaseModel):
    events: List[dict]


@router.post("/telemetry/events")
async def ingest_events(batch: EventBatch):
    """Ingest a batch of telemetry events from the frontend simulation into MongoDB."""
    if not batch.events:
        return {"inserted": 0}
    try:
        from app.infrastructure.db import get_client
        db_name = os.getenv("MONGO_DB_NAME", "leafy-energy-markets")
        client = get_client()
        db = client[db_name]

        # Create time-series collection if needed
        try:
            db.create_collection(
                "telemetry_events",
                timeseries={
                    "timeField": "timestamp",
                    "metaField": "event_type",
                    "granularity": "seconds",
                },
            )
        except (CollectionInvalid, OperationFailure):
            pass

        coll = db["telemetry_events"]
        # Add timestamps to events that don't have them
        for evt in batch.events:
            if "timestamp" not in evt:
                evt["timestamp"] = datetime.now(timezone.utc)
            elif isinstance(evt["timestamp"], str):
                evt["timestamp"] = datetime.fromisoformat(evt["timestamp"].replace("Z", "+00:00"))
        coll.insert_many(batch.events)
        return {"inserted": len(batch.events)}
    except Exception as e:
        return {"inserted": 0, "error": str(e)}


@router.get("/telemetry/status")
async def telemetry_status():
    return {
        "running": generator._running,
        "metrics": generator.get_metrics().model_dump() if generator._running else None,
        "last_error": generator._last_error or None,
    }


# ── Portfolio Projection ─────────────────────────────────────

# Map INST-001..INST-014 to the 14 portfolio instruments from mock-data.ts
PORTFOLIO_INSTRUMENTS = [
    {"id": "P001", "instrument": "DE Baseload Q2-26", "type": "POWER", "quantity": 500, "avgPrice": 72.4, "basePrice": 78.9},
    {"id": "P002", "instrument": "FR Peakload M03-26", "type": "POWER", "quantity": 200, "avgPrice": 95.1, "basePrice": 91.3},
    {"id": "P003", "instrument": "TTF Gas Apr-26", "type": "GAS", "quantity": 1000, "avgPrice": 31.2, "basePrice": 34.8},
    {"id": "P004", "instrument": "EUA Carbon Dec-26", "type": "CARBON", "quantity": 300, "avgPrice": 68.5, "basePrice": 72.1},
    {"id": "P005", "instrument": "NL Wind PPA 2026", "type": "RENEWABLE", "quantity": 800, "avgPrice": 52.0, "basePrice": 54.3},
    {"id": "P006", "instrument": "DE Solar PPA H2-26", "type": "RENEWABLE", "quantity": 600, "avgPrice": 48.5, "basePrice": 50.1},
    {"id": "P007", "instrument": "UK Baseload Q3-26", "type": "POWER", "quantity": 350, "avgPrice": 85.2, "basePrice": 82.7},
    {"id": "P008", "instrument": "NBP Gas Jun-26", "type": "GAS", "quantity": 450, "avgPrice": 78.9, "basePrice": 81.4},
    {"id": "P009", "instrument": "IT Peakload Q2-26", "type": "POWER", "quantity": 150, "avgPrice": 102.3, "basePrice": 108.7},
    {"id": "P010", "instrument": "ES Solar PPA 2026", "type": "RENEWABLE", "quantity": 400, "avgPrice": 45.0, "basePrice": 46.8},
    {"id": "P011", "instrument": "NO Hydro PPA Q2-26", "type": "RENEWABLE", "quantity": 550, "avgPrice": 38.2, "basePrice": 40.5},
    {"id": "P012", "instrument": "EUA Carbon Mar-26", "type": "CARBON", "quantity": 200, "avgPrice": 65.0, "basePrice": 71.3},
    {"id": "P013", "instrument": "FR Baseload Cal-27", "type": "POWER", "quantity": 250, "avgPrice": 69.8, "basePrice": 73.2},
    {"id": "P014", "instrument": "DE Peakload M04-26", "type": "POWER", "quantity": 180, "avgPrice": 98.4, "basePrice": 94.1},
]


class PortfolioProjection:
    """Derives portfolio state from telemetry price data."""

    def __init__(self):
        self._prices: dict[str, float] = {}
        for i, inst in enumerate(PORTFOLIO_INSTRUMENTS):
            self._prices[f"INST-{i+1:03d}"] = inst["basePrice"]

    def update_price(self, instrument_id: str, price: float):
        idx_str = instrument_id.replace("INST-", "")
        try:
            idx = int(idx_str)
        except ValueError:
            return
        if 1 <= idx <= 14:
            # Blend toward new price (EMA-like smoothing)
            key = f"INST-{idx:03d}"
            old = self._prices.get(key, price)
            self._prices[key] = old * 0.9 + price * 0.1

    def get_snapshot(self) -> dict:
        positions = []
        total_pnl = 0.0
        portfolio_value = 0.0

        for i, inst in enumerate(PORTFOLIO_INSTRUMENTS):
            key = f"INST-{i+1:03d}"
            current_price = round(self._prices.get(key, inst["basePrice"]), 2)
            unrealized_pnl = round((current_price - inst["avgPrice"]) * inst["quantity"], 2)
            total_pnl += unrealized_pnl
            portfolio_value += current_price * inst["quantity"]

            positions.append({
                "id": inst["id"],
                "instrument": inst["instrument"],
                "type": inst["type"],
                "quantity": inst["quantity"],
                "avgPrice": inst["avgPrice"],
                "currentPrice": current_price,
                "unrealizedPnl": unrealized_pnl,
            })

        exposure = []
        for h in range(24):
            import math
            mwh = round(150 + 250 * math.sin((h - 6) * math.pi / 12) + (random.random() - 0.5) * 60)
            exposure.append({"hour": h, "mwh": mwh})

        summary = {
            "totalPnl": round(total_pnl, 2),
            "netExposureMwh": 4520 + random.randint(-50, 50),
            "activePositions": 14,
            "portfolioValue": round(portfolio_value, 2),
            "pnlDelta": f"+{round(total_pnl / portfolio_value * 100, 1)}%" if portfolio_value > 0 else "+0%",
        }

        return {
            "positions": positions,
            "summary": summary,
            "exposure": exposure,
        }

    def get_scenario_snapshot(self) -> dict:
        # Derive scenario pricing from current portfolio prices
        avg_price = sum(self._prices.values()) / len(self._prices) if self._prices else 74.2
        price_factor = avg_price / 74.2  # normalize against baseline

        hourly_pnl = []
        baseline_total = 0
        dynamic_total = 0

        for h in range(24):
            import math
            base = round((120 + 80 * math.sin((h - 6) * math.pi / 12)) * price_factor + (random.random() - 0.5) * 20)
            dyn = round(base * (0.82 + random.random() * 0.12))
            hourly_pnl.append({
                "hour": h,
                "baseline": base,
                "dynamic": dyn,
                "difference": base - dyn,
            })
            baseline_total += base
            dynamic_total += dyn

        savings_abs = baseline_total - dynamic_total
        savings_pct = round((savings_abs / baseline_total) * 100) if baseline_total > 0 else 0

        return {
            "hourlyPnl": hourly_pnl,
            "baselineCost": baseline_total,
            "dynamicCost": dynamic_total,
            "savingsAbsolute": savings_abs,
            "savingsPercent": savings_pct,
        }


# Singleton projection (lives alongside the generator)
portfolio_projection = PortfolioProjection()


# Patch the generator to feed prices into the projection
_original_generate_event = TelemetryLoadGenerator._generate_event


def _patched_generate_event(self, event_types, timestamp=None):
    event = _original_generate_event(self, event_types, timestamp)
    if event.get("event_type") == "price_tick":
        portfolio_projection.update_price(event["instrument_id"], event["price"])
    return event


TelemetryLoadGenerator._generate_event = _patched_generate_event


# ── Dashboard SSE Endpoints ──────────────────────────────────

@router.get("/dashboard/stream")
async def dashboard_stream():
    async def generate():
        while generator._running:
            snapshot = portfolio_projection.get_snapshot()
            yield f"data: {json.dumps(snapshot)}\n\n"
            await asyncio.sleep(1)
        # Final snapshot
        snapshot = portfolio_projection.get_snapshot()
        yield f"data: {json.dumps(snapshot)}\n\n"

    if not generator._running:
        raise HTTPException(status_code=400, detail="Generator not running")
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/dashboard/snapshot")
async def dashboard_snapshot():
    return portfolio_projection.get_snapshot()


@router.get("/scenarios/stream")
async def scenarios_stream():
    async def generate():
        while generator._running:
            snapshot = portfolio_projection.get_scenario_snapshot()
            yield f"data: {json.dumps(snapshot)}\n\n"
            await asyncio.sleep(1)
        snapshot = portfolio_projection.get_scenario_snapshot()
        yield f"data: {json.dumps(snapshot)}\n\n"

    if not generator._running:
        raise HTTPException(status_code=400, detail="Generator not running")
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
