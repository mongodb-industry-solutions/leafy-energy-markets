"""
trading.py — In-memory trading simulation engine for European energy markets.

Simulates 8 energy assets generating three event families:
  - AssetTelemetry  (MeterReadingRecorded, PerformanceVarianceDetected)
  - WeatherForecast (WindForecastUpdated, SolarIrradianceForecastUpdated, WeatherAlertIssued)
  - TradingPosition (PositionGapDetected, TradeExecuted, PnlSnapshotRecorded, CapacityAllocationSet)

No MongoDB interaction — pure in-memory simulation.
"""

from __future__ import annotations

import asyncio
import json
import random
import uuid
from collections import deque
from datetime import datetime, timezone, timedelta
from typing import Any

import logging
import os

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.infrastructure.db import get_db, DB_NAME

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter()

# ---------------------------------------------------------------------------
# Asset catalogue
# ---------------------------------------------------------------------------

ASSETS = [
    {"id": "ASSET-WIND-NL-001",    "type": "wind",    "region": "NL", "name": "Hollandse Kust Wind",  "capacityMw": 200},
    {"id": "ASSET-WIND-UK-001",    "type": "wind",    "region": "UK", "name": "Hornsea Wind Farm",     "capacityMw": 150},
    {"id": "ASSET-SOLAR-ES-001",   "type": "solar",   "region": "ES", "name": "Algarrobico Solar",     "capacityMw": 180},
    {"id": "ASSET-SOLAR-PT-001",   "type": "solar",   "region": "PT", "name": "Sines Solar Park",      "capacityMw": 120},
    {"id": "ASSET-HYDRO-NO-001",   "type": "hydro",   "region": "NO", "name": "Nordland Hydro",        "capacityMw": 300},
    {"id": "ASSET-GAS-DE-001",     "type": "gas",     "region": "DE", "name": "Rhine CCGT",            "capacityMw": 400},
    {"id": "ASSET-BATTERY-NL-001", "type": "battery", "region": "NL", "name": "Rotterdam BESS",        "capacityMw": 50},
    {"id": "ASSET-BIOMASS-FR-001", "type": "biomass", "region": "FR", "name": "Gironde Biomass",       "capacityMw": 80},
]

# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------


class AllocationRequest(BaseModel):
    assetType: str       # wind|solar|hydro|gas|battery|biomass
    targetMwh: float
    marketChannel: str   # day_ahead|intraday|flexibility|ppa
    priceFloorEur: float = 0.0


# ---------------------------------------------------------------------------
# TradingSimulator
# ---------------------------------------------------------------------------


class TradingSimulator:
    def __init__(self) -> None:
        self._running = False
        self._task: asyncio.Task | None = None
        self._assets: dict[str, dict] = {}
        self._portfolio: dict[str, Any] = {}
        self._prices: dict[str, Any] = {}
        self._alerts: deque = deque(maxlen=20)
        self._recent_events: deque = deque(maxlen=50)
        self._last_gap_event: datetime = datetime.min.replace(tzinfo=timezone.utc)
        self._last_pnl_snapshot: datetime = datetime.min.replace(tzinfo=timezone.utc)
        self._asset_rotation_idx: int = 0
        self._dismissed_alerts: set[str] = set()
        self._db = None  # MongoDB database reference (set on start)
        self._persist_errors: int = 0
        self._persist_task: asyncio.Task | None = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self, db=None) -> None:
        if self._running:
            return
        self._db = db
        self._persist_errors = 0
        if db is not None:
            self._ensure_timeseries_collection(db)
        self._init_state()
        self._running = True
        self._task = asyncio.create_task(self._tick_loop())

    @staticmethod
    def _ensure_timeseries_collection(db) -> None:
        """Create trading_events (time series) and trading_event_log (change stream projection)."""
        try:
            existing = set(db.list_collection_names())
        except Exception as e:
            logger.warning("Could not list collections: %s — skipping collection setup", e)
            return

        # ── Analytical layer ─────────────────────────────────────────────────
        if "trading_events" not in existing:
            try:
                db.create_collection(
                    "trading_events",
                    timeseries={
                        "timeField": "timestamp",
                        "metaField": "streamType",
                        "granularity": "seconds",
                    },
                    expireAfterSeconds=86400 * 7,  # 7-day TTL
                )
                logger.info("Created trading_events time series collection (7-day TTL)")
            except Exception as e:
                logger.warning("Could not create time series collection: %s (will use regular)", e)

        # ── Change Stream projection layer ───────────────────────────────────
        # Time series collections don't support change streams (MongoDB limitation).
        # trading_event_log is a regular collection that mirrors every insert and
        # is the target for all change stream / WebSocket consumers.
        if "trading_event_log" not in existing:
            try:
                db.create_collection("trading_event_log")
                db["trading_event_log"].create_index(
                    [("timestamp", 1)],
                    expireAfterSeconds=3600,  # 1-hour rolling window keeps it small
                    name="ttl_timestamp",
                )
                logger.info("Created trading_event_log collection (1-hour TTL)")
            except Exception as e:
                logger.warning("Could not create trading_event_log: %s", e)

    async def stop(self) -> None:
        self._running = False
        for task in (self._task, self._persist_task):
            if task is not None and not task.done():
                task.cancel()
        self._task = None
        self._persist_task = None

    # ------------------------------------------------------------------
    # State initialisation
    # ------------------------------------------------------------------

    def _init_state(self) -> None:
        self._assets = {}
        for asset_def in ASSETS:
            asset = dict(asset_def)
            a_type = asset["type"]
            capacity = asset["capacityMw"]

            if a_type == "wind":
                util = random.uniform(0.60, 0.90)
            elif a_type == "solar":
                util = random.uniform(0.60, 0.90)
            elif a_type == "hydro":
                util = random.uniform(0.70, 0.90)
            elif a_type == "gas":
                util = random.uniform(0.50, 0.80)
            elif a_type == "battery":
                util = random.uniform(0.20, 0.60)
            else:  # biomass
                util = random.uniform(0.80, 0.95)

            current = util * capacity
            forecast = current * (0.95 + random.random() * 0.10)
            asset.update({
                "currentOutputMw": round(current, 2),
                "forecastOutputMw": round(forecast, 2),
                "varianceMw": round(current - forecast, 2),
                "utilizationPct": round(util * 100, 1),
                "status": "online",
                "sensorStatus": "ok",
                "lastUpdated": datetime.now(timezone.utc).isoformat(),
            })
            self._assets[asset["id"]] = asset

        # Compute daily revenue target from fleet capacity:
        # total capacity × avg utilisation (~70%) × avg price (~€72/MWh) × 8h trading window
        total_capacity = sum(a["capacityMw"] for a in self._assets.values())
        avg_price = (self._prices.get("dayAhead", 72.0) + self._prices.get("intraday", 74.5)) / 2
        daily_target = round(total_capacity * 0.70 * avg_price * 8, 0)

        self._portfolio = {
            "allocationsByType": {
                "wind":    {"targetMwh": 0.0, "marketChannel": "day_ahead",  "priceFloorEur": 0.0},
                "solar":   {"targetMwh": 0.0, "marketChannel": "day_ahead",  "priceFloorEur": 0.0},
                "hydro":   {"targetMwh": 0.0, "marketChannel": "intraday",   "priceFloorEur": 0.0},
                "gas":     {"targetMwh": 0.0, "marketChannel": "day_ahead",  "priceFloorEur": 0.0},
                "battery": {"targetMwh": 0.0, "marketChannel": "flexibility","priceFloorEur": 0.0},
                "biomass": {"targetMwh": 0.0, "marketChannel": "day_ahead",  "priceFloorEur": 0.0},
            },
            "committedMwh": 0.0,
            "forecastMwh": 0.0,
            "netGapMwh": 0.0,
            "gapType": "balanced",
            "realisedPnlEur": 0.0,
            "fleetGenerationValueEur": 0.0,
            "dailyTargetEur": daily_target,
            "tradeLog": [],
        }

        self._prices = {
            "dayAhead":   round(72.0 + random.random() * 4, 2),
            "intraday":   round(74.5 + random.random() * 5, 2),
            "flexibility": round(68.0 + random.random() * 3, 2),
            "bestChannel": "intraday",
        }

    # ------------------------------------------------------------------
    # Background tick loop
    # ------------------------------------------------------------------

    async def _tick_loop(self) -> None:
        while self._running:
            try:
                await self._do_tick()
            except Exception as exc:
                logger.warning("Simulator tick error (will retry in 5s): %s", exc, exc_info=True)
            await asyncio.sleep(5)

    async def _do_tick(self) -> None:
        now = datetime.now(timezone.utc)
        events_this_tick: list[dict] = []

        # 1. Weather event (27% probability)
        if random.random() < 0.27:
            ev = self._gen_weather_event(now)
            if ev:
                events_this_tick.append(ev)

        # 2. Meter readings: pick 1-2 assets from rotation
        asset_ids = list(self._assets.keys())
        n_assets = len(asset_ids)
        n_readings = random.randint(1, 2)
        for _ in range(n_readings):
            idx = self._asset_rotation_idx % n_assets
            self._asset_rotation_idx += 1
            asset = self._assets[asset_ids[idx]]
            # Random walk ±3% of capacity per tick toward forecast
            capacity = asset["capacityMw"]
            drift_to_forecast = (asset["forecastOutputMw"] - asset["currentOutputMw"]) * 0.15
            noise = random.uniform(-0.03, 0.03) * capacity
            new_output = asset["currentOutputMw"] + drift_to_forecast + noise
            new_output = max(0.0, min(capacity, new_output))
            asset["currentOutputMw"] = round(new_output, 2)
            asset["utilizationPct"] = round(new_output / capacity * 100, 1)
            asset["varianceMw"] = round(new_output - asset["forecastOutputMw"], 2)
            asset["lastUpdated"] = now.isoformat()
            events_this_tick.append(self._gen_meter_reading(asset, now))

        # 3. Check variance for performance events (30% chance per asset that is off)
        for asset in self._assets.values():
            if asset["status"] != "online":
                continue
            capacity = asset["capacityMw"]
            if capacity > 0 and abs(asset["varianceMw"] / capacity) > 0.10:
                if random.random() < 0.30:
                    events_this_tick.append(self._gen_performance_variance(asset, now))

        # 4. Compute gap
        gap_info = self._compute_gap()
        self._portfolio["forecastMwh"] = round(gap_info["forecastMwh"], 2)
        self._portfolio["committedMwh"] = round(gap_info["committedMwh"], 2)
        self._portfolio["netGapMwh"] = round(gap_info["gapMwh"], 2)
        self._portfolio["gapType"] = gap_info["gapType"]

        # 5. Gap alert if significant and cooldown elapsed
        elapsed_gap = (now - self._last_gap_event).total_seconds()
        if abs(gap_info["gapMwh"]) > 50 and elapsed_gap > 30:
            ev = self._gen_gap_event(gap_info, now)
            events_this_tick.append(ev)
            # Add to alerts deque
            alert = dict(ev)
            alert["id"] = ev["id"]
            self._alerts.append(alert)
            self._last_gap_event = now

        # 6. (algorithmic auto-trades removed — trader executes manually via allocations)

        # 7. PnL snapshot every 5s
        elapsed_pnl = (now - self._last_pnl_snapshot).total_seconds()
        if elapsed_pnl > 5:
            events_this_tick.append(self._gen_pnl_snapshot(now))
            self._last_pnl_snapshot = now

        # 8. Update prices (random walk)
        self._update_prices(gap_info)

        # 9. Push events to deque (most recent first)
        for ev in reversed(events_this_tick):
            self._recent_events.appendleft(ev)

        # 10. Persist to MongoDB (non-blocking, skip if previous write still running)
        if events_this_tick and self._db is not None:
            if self._persist_task is None or self._persist_task.done():
                self._persist_task = asyncio.create_task(self._persist_events(events_this_tick))

    # ------------------------------------------------------------------
    # MongoDB persistence (async, non-blocking)
    # ------------------------------------------------------------------

    async def _persist_events(self, events: list[dict]) -> None:
        """Batch-insert trading events to MongoDB. Fails silently — never blocks the simulator.

        Writes to two collections:
        - trading_events      — time series collection (analytics, 7-day TTL, bucketed storage)
        - trading_event_log   — regular collection (change stream projection, 1-hour TTL)

        PyMongo mutates docs in-place to add _id during insert_many, so the second
        write reuses the same _id values — allowing cross-collection lookups by id.
        """
        try:
            docs = [
                {
                    "streamId": ev.get("streamId", "PORTFOLIO-001"),
                    "streamType": ev.get("streamType", "TradingPosition"),
                    "eventType": ev["eventType"],
                    "timestamp": datetime.fromisoformat(ev["timestamp"]) if isinstance(ev.get("timestamp"), str) else ev.get("timestamp", datetime.now(timezone.utc)),
                    "payload": ev.get("payload", {}),
                    "metadata": {"source": "trading-simulator", "schemaVersion": 1},
                }
                for ev in events
            ]
            # Write 1: time series (adds _id in-place to each doc)
            await asyncio.to_thread(self._db["trading_events"].insert_many, docs, ordered=False)
            # Write 2: change stream projection (reuses same _id)
            await asyncio.to_thread(self._db["trading_event_log"].insert_many, docs, ordered=False)
            self._persist_errors = 0  # reset on success
        except Exception:
            self._persist_errors += 1
            if self._persist_errors <= 3:
                logger.warning("Failed to persist %d trading events (attempt %d)", len(events), self._persist_errors)
            if self._persist_errors >= 10:
                logger.warning("MongoDB persistence disabled after %d failures", self._persist_errors)
                self._db = None

    # ------------------------------------------------------------------
    # Gap computation
    # ------------------------------------------------------------------

    def _compute_gap(self) -> dict:
        forecast_total = sum(
            a["forecastOutputMw"] for a in self._assets.values() if a["status"] == "online"
        )
        committed_total = sum(
            alloc["targetMwh"]
            for alloc in self._portfolio["allocationsByType"].values()
        )
        gap = forecast_total - committed_total
        if gap > 10:
            gap_type = "surplus"
        elif gap < -10:
            gap_type = "shortfall"
        else:
            gap_type = "balanced"
        # Dominant type: asset type with highest current output
        type_output: dict[str, float] = {}
        for a in self._assets.values():
            if a["status"] == "online":
                type_output[a["type"]] = type_output.get(a["type"], 0.0) + a["currentOutputMw"]
        dominant_type = max(type_output, key=lambda k: type_output[k]) if type_output else "portfolio"
        return {
            "gapMwh": round(gap, 2),
            "gapType": gap_type,
            "forecastMwh": round(forecast_total, 2),
            "committedMwh": round(committed_total, 2),
            "dominantType": dominant_type,
        }

    # ------------------------------------------------------------------
    # Price update
    # ------------------------------------------------------------------

    def _update_prices(self, gap_info: dict) -> None:
        da = self._prices["dayAhead"] + random.uniform(-1.5, 1.5)
        intra = self._prices["intraday"] + random.uniform(-2.0, 2.0)
        flex = self._prices["flexibility"] + random.uniform(-1.0, 1.0)
        # Clamp to realistic ranges
        da = max(30.0, min(180.0, da))
        intra = max(28.0, min(190.0, intra))
        flex = max(20.0, min(140.0, flex))
        self._prices["dayAhead"] = round(da, 2)
        self._prices["intraday"] = round(intra, 2)
        self._prices["flexibility"] = round(flex, 2)

        # Best channel: highest price (we are sellers / IPP)
        # Only pick cheapest when in shortfall (need to buy)
        channels = [("dayAhead", da), ("intraday", intra), ("flexibility", flex)]
        if gap_info["gapType"] == "shortfall":
            best = min(channels, key=lambda x: x[1])[0]
        else:
            best = max(channels, key=lambda x: x[1])[0]
        self._prices["bestChannel"] = best

    # ------------------------------------------------------------------
    # Event generators
    # ------------------------------------------------------------------

    def _gen_weather_event(self, now: datetime) -> dict | None:
        """Returns a WeatherForecast event dict, or None."""
        roll = random.random()

        # 5% chance of weather alert
        if roll < 0.05:
            regions = list({a["region"] for a in ASSETS})
            region = random.choice(regions)
            severity = random.choice(["advisory", "warning", "critical"])
            curtailment = severity in ("warning", "critical") and random.random() < 0.6
            return {
                "id": str(uuid.uuid4()),
                "eventType": "WeatherAlertIssued",
                "streamType": "WeatherForecast",
                "streamId": f"WEATHER-{region}",
                "timestamp": now.isoformat(),
                "payload": {
                    "region": region,
                    "severity": severity,
                    "curtailmentRequired": curtailment,
                    "description": f"Severe weather alert for {region} — {severity} level",
                    "validUntil": (now + timedelta(hours=random.randint(2, 12))).isoformat(),
                },
            }

        # Pick wind vs solar event
        wind_assets = [a for a in self._assets.values() if a["type"] == "wind" and a["status"] == "online"]
        solar_assets = [a for a in self._assets.values() if a["type"] == "solar" and a["status"] == "online"]

        if not wind_assets and not solar_assets:
            return None

        use_wind = bool(wind_assets) and (not solar_assets or random.random() < 0.5)

        if use_wind:
            asset = random.choice(wind_assets)
            delta_pct = random.uniform(-0.30, 0.70)  # ±30–70%
            new_forecast = asset["forecastOutputMw"] * (1 + delta_pct)
            new_forecast = max(0.0, min(asset["capacityMw"], new_forecast))
            self._assets[asset["id"]]["forecastOutputMw"] = round(new_forecast, 2)
            self._assets[asset["id"]]["varianceMw"] = round(
                asset["currentOutputMw"] - new_forecast, 2
            )
            return {
                "id": str(uuid.uuid4()),
                "eventType": "WindForecastUpdated",
                "streamType": "WeatherForecast",
                "streamId": f"WEATHER-{asset['region']}",
                "timestamp": now.isoformat(),
                "payload": {
                    "assetId": asset["id"],
                    "region": asset["region"],
                    "forecastDeltaPct": round(delta_pct * 100, 1),
                    "updatedForecastMw": round(new_forecast, 2),
                    "previousForecastMw": round(asset["forecastOutputMw"], 2),
                    "windSpeedMs": round(random.uniform(3.0, 22.0), 1),
                    "source": "ECMWF",
                },
            }
        else:
            asset = random.choice(solar_assets)
            delta_pct = random.uniform(-0.20, 0.15)  # -20 to +15%
            new_forecast = asset["forecastOutputMw"] * (1 + delta_pct)
            new_forecast = max(0.0, min(asset["capacityMw"], new_forecast))
            self._assets[asset["id"]]["forecastOutputMw"] = round(new_forecast, 2)
            self._assets[asset["id"]]["varianceMw"] = round(
                asset["currentOutputMw"] - new_forecast, 2
            )
            return {
                "id": str(uuid.uuid4()),
                "eventType": "SolarIrradianceForecastUpdated",
                "streamType": "WeatherForecast",
                "streamId": f"WEATHER-{asset['region']}",
                "timestamp": now.isoformat(),
                "payload": {
                    "assetId": asset["id"],
                    "region": asset["region"],
                    "forecastDeltaPct": round(delta_pct * 100, 1),
                    "updatedForecastMw": round(new_forecast, 2),
                    "previousForecastMw": round(asset["forecastOutputMw"], 2),
                    "irradianceWm2": round(random.uniform(200, 950), 1),
                    "cloudCoverPct": round(random.uniform(0, 80), 1),
                    "source": "SolarEdge-NWP",
                },
            }

    def _gen_meter_reading(self, asset: dict, now: datetime) -> dict:
        """MeterReadingRecorded event."""
        # kWh = MW * 1000 / 3600 * 5s interval
        reading_kwh = asset["currentOutputMw"] * 1000 / 3600 * 5
        quality = "good" if asset["sensorStatus"] == "ok" else "questionable"
        return {
            "id": str(uuid.uuid4()),
            "eventType": "MeterReadingRecorded",
            "streamType": "AssetTelemetry",
            "streamId": asset["id"],
            "timestamp": now.isoformat(),
            "payload": {
                "assetId": asset["id"],
                "assetType": asset["type"],
                "assetName": asset["name"],
                "region": asset["region"],
                "readingKwh": round(reading_kwh, 4),
                "currentOutputMw": asset["currentOutputMw"],
                "forecastOutputMw": asset["forecastOutputMw"],
                "varianceMw": asset["varianceMw"],
                "capacityMw": asset["capacityMw"],
                "utilizationPct": asset["utilizationPct"],
                "status": asset["status"],
                "quality": quality,
                "sensorStatus": asset["sensorStatus"],
            },
        }

    def _gen_performance_variance(self, asset: dict, now: datetime) -> dict:
        """PerformanceVarianceDetected event."""
        variance_pct = (
            (asset["varianceMw"] / asset["capacityMw"] * 100) if asset["capacityMw"] else 0
        )
        severity = "warning" if abs(variance_pct) > 20 else "info"
        return {
            "id": str(uuid.uuid4()),
            "eventType": "PerformanceVarianceDetected",
            "streamType": "AssetTelemetry",
            "streamId": asset["id"],
            "timestamp": now.isoformat(),
            "payload": {
                "assetId": asset["id"],
                "assetType": asset["type"],
                "assetName": asset["name"],
                "region": asset["region"],
                "actualMw": asset["currentOutputMw"],
                "forecastMw": asset["forecastOutputMw"],
                "varianceMw": asset["varianceMw"],
                "variancePct": round(variance_pct, 1),
                "capacityMw": asset["capacityMw"],
                "severity": severity,
            },
        }

    def _gen_gap_event(self, gap_info: dict, now: datetime) -> dict:
        """PositionGapDetected event with unique id for dismissal."""
        gap_abs = abs(gap_info["gapMwh"])
        if gap_abs > 200:
            severity = "critical"
        elif gap_abs > 80:
            severity = "warning"
        else:
            severity = "info"

        gap_type = gap_info["gapType"]
        if gap_type == "surplus":
            recommended = "Execute sell order on day-ahead market to reduce surplus exposure."
        elif gap_type == "shortfall":
            recommended = "Procure additional capacity via intraday or flexibility market."
        else:
            recommended = "Monitor position; no immediate action required."

        best_price = self._prices.get(
            {"dayAhead": "dayAhead", "intraday": "intraday", "flexibility": "flexibility"}.get(
                self._prices["bestChannel"], "dayAhead"
            ),
            self._prices["dayAhead"],
        )
        impact = abs(gap_info["gapMwh"]) * best_price

        alert_id = str(uuid.uuid4())
        return {
            "id": alert_id,
            "eventType": "PositionGapDetected",
            "streamType": "TradingPosition",
            "streamId": "PORTFOLIO-001",
            "timestamp": now.isoformat(),
            "payload": {
                "committedMwh": gap_info["committedMwh"],
                "forecastMwh": gap_info["forecastMwh"],
                "gapMwh": gap_info["gapMwh"],
                "gapType": gap_type,
                "severity": severity,
                "recommendedAction": recommended,
                "bestAvailablePriceEurMwh": best_price,
                "estimatedImpactEur": round(impact, 2),
                "bestChannel": self._prices["bestChannel"],
            },
        }

    def _gen_trade_event(self, gap_info: dict, now: datetime) -> dict:
        """TradeExecuted event (algorithmic fill)."""
        trade_id = f"TRD-{now.strftime('%Y%m%d')}-{random.randint(1000, 9999)}"
        quantity = min(abs(gap_info["gapMwh"]) * 0.6, 200.0)
        quantity = round(quantity, 2)

        channel_map = {
            "dayAhead": self._prices["dayAhead"],
            "intraday": self._prices["intraday"],
            "flexibility": self._prices["flexibility"],
        }
        best_channel = self._prices["bestChannel"]
        price = channel_map.get(best_channel, self._prices["dayAhead"])
        revenue = round(quantity * price, 2)

        side = "sell" if gap_info["gapType"] == "surplus" else "buy"

        return {
            "id": str(uuid.uuid4()),
            "eventType": "TradeExecuted",
            "streamType": "TradingPosition",
            "streamId": "PORTFOLIO-001",
            "timestamp": now.isoformat(),
            "payload": {
                "tradeId": trade_id,
                "side": side,
                "quantityMwh": quantity,
                "priceEurMwh": round(price, 2),
                "revenueEur": revenue,
                "marketChannel": best_channel,
                "executionType": "algorithmic",
                "gapType": gap_info["gapType"],
                "counterparty": f"EPEX-{best_channel.upper()[:2]}",
            },
        }

    def _gen_pnl_snapshot(self, now: datetime) -> dict:
        """PnlSnapshotRecorded event with per-type breakdown."""
        by_type: dict[str, dict] = {}
        for a in self._assets.values():
            a_type = a["type"]
            if a_type not in by_type:
                by_type[a_type] = {"outputMw": 0.0, "forecastMw": 0.0, "assets": 0}
            by_type[a_type]["outputMw"] += a["currentOutputMw"]
            by_type[a_type]["forecastMw"] += a["forecastOutputMw"]
            by_type[a_type]["assets"] += 1

        # Fleet generation value: current output × best available price × 1 hour
        # Represents the hourly revenue opportunity if all output were sold now
        best_price = max(self._prices["dayAhead"], self._prices["intraday"], self._prices["flexibility"])
        breakdown = {}
        for a_type, data in by_type.items():
            hourly_value = data["outputMw"] * best_price  # €/hour at best price
            breakdown[a_type] = {
                "outputMw": round(data["outputMw"], 2),
                "forecastMw": round(data["forecastMw"], 2),
                "hourlyValueEur": round(hourly_value, 2),
                "assets": data["assets"],
            }

        fleet_gen_value = round(sum(v["hourlyValueEur"] for v in breakdown.values()), 2)
        self._portfolio["fleetGenerationValueEur"] = fleet_gen_value

        return {
            "id": str(uuid.uuid4()),
            "eventType": "PnlSnapshotRecorded",
            "streamType": "TradingPosition",
            "streamId": "PORTFOLIO-001",
            "timestamp": now.isoformat(),
            "payload": {
                "realisedPnlEur": self._portfolio["realisedPnlEur"],
                "fleetGenerationValueEur": fleet_gen_value,
                "dailyTargetEur": self._portfolio["dailyTargetEur"],
                "progressPct": round(
                    (self._portfolio["realisedPnlEur"] / self._portfolio["dailyTargetEur"]) * 100, 1
                ) if self._portfolio["dailyTargetEur"] else 0,
                "byAssetType": breakdown,
                "bestPriceEurMwh": best_price,
            },
        }

    # ------------------------------------------------------------------
    # Public state accessor
    # ------------------------------------------------------------------

    def get_state(self) -> dict:
        trade_log = list(self._portfolio.get("tradeLog", []))[-15:]
        portfolio_out = {**self._portfolio, "tradeLog": trade_log}
        active_alerts = [
            a for a in self._alerts if a.get("id") not in self._dismissed_alerts
        ][-10:]
        return {
            "assets": list(self._assets.values()),
            "portfolio": portfolio_out,
            "prices": dict(self._prices),
            "alerts": active_alerts,
            "recentEvents": list(self._recent_events)[:20],
            "running": self._running,
            "persistence": "mongodb" if self._db is not None else "in-memory",
            "persistenceErrors": self._persist_errors,
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
        }

    # ------------------------------------------------------------------
    # Allocation update
    # ------------------------------------------------------------------

    def apply_allocation(self, req: AllocationRequest) -> dict:
        now = datetime.now(timezone.utc)
        a_type = req.assetType
        if a_type not in self._portfolio["allocationsByType"]:
            raise ValueError(f"Unknown assetType: {a_type}")

        self._portfolio["allocationsByType"][a_type].update({
            "targetMwh": req.targetMwh,
            "marketChannel": req.marketChannel,
            "priceFloorEur": req.priceFloorEur,
        })

        # Recompute committed and gap
        gap_info = self._compute_gap()
        self._portfolio["committedMwh"] = round(gap_info["committedMwh"], 2)
        self._portfolio["forecastMwh"] = round(gap_info["forecastMwh"], 2)
        self._portfolio["netGapMwh"] = round(gap_info["gapMwh"], 2)
        self._portfolio["gapType"] = gap_info["gapType"]

        # Execute immediate sell trade for this allocation
        channel_price_map = {
            "dayAhead": self._prices.get("dayAhead", 72.0),
            "intraday": self._prices.get("intraday", 74.5),
            "flexibility": self._prices.get("flexibility", 68.0),
        }
        exec_price = channel_price_map.get(req.marketChannel, self._prices["dayAhead"])
        # Always execute — floor is informational for the trade log
        if req.targetMwh > 0:
            revenue = round(req.targetMwh * exec_price, 2)
            trade_id = f"TRD-{now.strftime('%Y%m%d')}-{random.randint(1000, 9999)}"
            trade_record = {
                "tradeId": trade_id,
                "assetType": a_type,
                "marketChannel": req.marketChannel,
                "direction": "sell",
                "quantityMwh": req.targetMwh,
                "priceEurMwh": round(exec_price, 2),
                "revenueEur": revenue,
                "exchange": f"EPEX-{req.marketChannel[:2].upper()}",
                "executionType": "manual",
                "timestamp": now.isoformat(),
            }
            self._portfolio["tradeLog"].append(trade_record)
            self._portfolio["realisedPnlEur"] = round(
                self._portfolio["realisedPnlEur"] + revenue, 2
            )
            trade_ev = {
                "id": str(uuid.uuid4()),
                "eventType": "TradeExecuted",
                "streamType": "TradingPosition",
                "streamId": "PORTFOLIO-001",
                "timestamp": now.isoformat(),
                "payload": {
                    "tradeId": trade_id,
                    "assetType": a_type,
                    "side": "sell",
                    "direction": "sell",
                    "quantityMwh": req.targetMwh,
                    "priceEurMwh": round(exec_price, 2),
                    "revenueEur": revenue,
                    "marketChannel": req.marketChannel,
                    "executionType": "manual",
                    "exchange": f"EPEX-{req.marketChannel[:2].upper()}",
                    "counterparty": f"EPEX-{req.marketChannel[:2].upper()}",
                },
            }
            self._recent_events.appendleft(trade_ev)

            # Reset allocation after trade — prevents accidental re-sell
            self._portfolio["allocationsByType"][a_type]["targetMwh"] = 0.0

            # Recompute gap with zeroed allocation
            gap_info = self._compute_gap()
            self._portfolio["committedMwh"] = round(gap_info["committedMwh"], 2)
            self._portfolio["forecastMwh"] = round(gap_info["forecastMwh"], 2)
            self._portfolio["netGapMwh"] = round(gap_info["gapMwh"], 2)
            self._portfolio["gapType"] = gap_info["gapType"]

        # Fire CapacityAllocationSet event
        alloc_ev = {
            "id": str(uuid.uuid4()),
            "eventType": "CapacityAllocationSet",
            "streamType": "TradingPosition",
            "streamId": "PORTFOLIO-001",
            "timestamp": now.isoformat(),
            "payload": {
                "assetType": a_type,
                "targetMwh": req.targetMwh,
                "marketChannel": req.marketChannel,
                "priceFloorEur": req.priceFloorEur,
                "currentPriceEurMwh": exec_price,
                "updatedCommittedMwh": gap_info["committedMwh"],
                "updatedGapMwh": gap_info["gapMwh"],
                "gapType": gap_info["gapType"],
            },
        }
        self._recent_events.appendleft(alloc_ev)

        # Optionally fire gap alert if threshold crossed
        if abs(gap_info["gapMwh"]) > 50:
            elapsed = (now - self._last_gap_event).total_seconds()
            if elapsed > 10:
                gap_ev = self._gen_gap_event(gap_info, now)
                self._alerts.append(gap_ev)
                self._recent_events.appendleft(gap_ev)
                self._last_gap_event = now

        return self.get_state()


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

simulator = TradingSimulator()

# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------


@router.get("/trading/state")
async def get_trading_state() -> dict:
    return simulator.get_state()


@router.post("/trading/start")
async def start_trading(client=Depends(get_db)) -> dict:
    db = client[DB_NAME]
    try:
        simulator.start(db=db)
    except Exception:
        logger.exception("Failed to start trading simulator")
        raise
    logger.info("Trading simulator started (persistence=%s)", "mongodb" if simulator._db is not None else "in-memory")
    return {"status": "started", "persistence": "mongodb" if simulator._db is not None else "in-memory"}


@router.post("/trading/stop")
async def stop_trading() -> dict:
    await simulator.stop()
    return {"status": "stopped"}


@router.get("/trading/stream")
async def trading_stream():
    """SSE: full state snapshots every 2 seconds. Always streams regardless of running state."""

    async def generate():
        try:
            while True:
                state = simulator.get_state()
                yield f"data: {json.dumps(state, default=str)}\n\n"
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass  # client disconnected — exit cleanly

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/trading/allocations")
async def set_allocation(req: AllocationRequest) -> dict:
    """Update allocation for an asset type and recompute portfolio gap."""
    return simulator.apply_allocation(req)


@router.post("/trading/alerts/{alert_id}/dismiss")
async def dismiss_alert(alert_id: str) -> dict:
    simulator._dismissed_alerts.add(alert_id)
    return {"dismissed": alert_id}


@router.post("/trading/weather-alert/iberian-storm")
async def trigger_iberian_storm() -> dict:
    """Trigger a severe storm over southern Iberian peninsula — ES/PT solar drops to <20% capacity."""
    now = datetime.now(timezone.utc)

    # Affect ES solar and PT solar assets
    affected_ids = ["ASSET-SOLAR-ES-001", "ASSET-SOLAR-PT-001"]
    affected_assets = []
    for aid in affected_ids:
        asset = simulator._assets.get(aid)
        if not asset:
            continue
        old_output = asset["currentOutputMw"]
        old_forecast = asset["forecastOutputMw"]
        # Drop to <20% of capacity
        new_output = round(asset["capacityMw"] * random.uniform(0.05, 0.18), 2)
        new_forecast = round(asset["capacityMw"] * random.uniform(0.08, 0.15), 2)
        asset["currentOutputMw"] = new_output
        asset["forecastOutputMw"] = new_forecast
        asset["varianceMw"] = round(new_output - new_forecast, 2)
        asset["utilizationPct"] = round(new_output / asset["capacityMw"] * 100, 1)
        asset["lastUpdated"] = now.isoformat()
        affected_assets.append(asset)

        # Emit SolarIrradianceForecastUpdated event
        forecast_ev = {
            "id": str(uuid.uuid4()),
            "eventType": "SolarIrradianceForecastUpdated",
            "streamType": "WeatherForecast",
            "streamId": f"WEATHER-{asset['region']}",
            "timestamp": now.isoformat(),
            "payload": {
                "assetId": aid,
                "region": asset["region"],
                "forecastDeltaPct": round((new_forecast - old_forecast) / max(old_forecast, 1) * 100, 1),
                "updatedForecastMw": new_forecast,
                "previousForecastMw": old_forecast,
                "irradianceWm2": round(random.uniform(40, 120), 1),
                "cloudCoverPct": round(random.uniform(85, 98), 1),
                "source": "ECMWF-Storm",
            },
        }
        simulator._recent_events.appendleft(forecast_ev)

    # Emit WeatherAlertIssued for Iberian peninsula
    alert_ev = {
        "id": str(uuid.uuid4()),
        "eventType": "WeatherAlertIssued",
        "streamType": "WeatherForecast",
        "streamId": "WEATHER-IBERIA",
        "timestamp": now.isoformat(),
        "payload": {
            "region": "ES/PT",
            "severity": "critical",
            "curtailmentRequired": True,
            "description": "Severe storm and heavy cloud cover across southern Iberian peninsula. Solar generation capacity reduced to <20%.",
            "validUntil": (now + timedelta(hours=6)).isoformat(),
            "affectedAssets": affected_ids,
            "stormCenter": {"lat": 37.5, "lng": -4.0},
            "stormRadiusKm": 400,
        },
    }
    simulator._recent_events.appendleft(alert_ev)
    simulator._alerts.append(alert_ev)

    # Recompute gap
    gap_info = simulator._compute_gap()
    simulator._portfolio["forecastMwh"] = round(gap_info["forecastMwh"], 2)
    simulator._portfolio["committedMwh"] = round(gap_info["committedMwh"], 2)
    simulator._portfolio["netGapMwh"] = round(gap_info["gapMwh"], 2)
    simulator._portfolio["gapType"] = gap_info["gapType"]

    return {
        "status": "storm_triggered",
        "affected": affected_ids,
        "message": "Iberian storm active — ES/PT solar output dropped to <20%",
        "state": simulator.get_state(),
    }


@router.get("/trading/alerts")
async def get_alerts() -> list:
    return [
        a for a in simulator._alerts
        if a.get("id") not in simulator._dismissed_alerts
    ]


@router.get("/trading/events")
async def get_events() -> list:
    return list(simulator._recent_events)[:30]


# ---------------------------------------------------------------------------
# Event Schemas — static reference for the 9 event types
# ---------------------------------------------------------------------------

EVENT_SCHEMAS = {
    "MeterReadingRecorded": {
        "streamType": "AssetTelemetry",
        "description": "Per-asset output reading with forecast comparison",
        "payloadFields": [
            {"name": "assetId", "type": "string", "description": "Asset identifier (e.g. ASSET-WIND-NL-001)"},
            {"name": "assetType", "type": "string", "description": "wind | solar | hydro | gas | battery | biomass"},
            {"name": "assetName", "type": "string", "description": "Human-readable asset name"},
            {"name": "region", "type": "string", "description": "ISO country code (NL, UK, ES, PT, NO, DE, FR)"},
            {"name": "readingKwh", "type": "float", "description": "Energy reading in kWh for the interval"},
            {"name": "currentOutputMw", "type": "float", "description": "Current output in MW"},
            {"name": "forecastOutputMw", "type": "float", "description": "Forecast output in MW"},
            {"name": "varianceMw", "type": "float", "description": "Actual minus forecast (MW)"},
            {"name": "capacityMw", "type": "float", "description": "Nameplate capacity in MW"},
            {"name": "utilizationPct", "type": "float", "description": "Current utilization percentage"},
            {"name": "status", "type": "string", "description": "online | curtailed | offline"},
            {"name": "quality", "type": "string", "description": "good | questionable"},
            {"name": "sensorStatus", "type": "string", "description": "ok | degraded | failed"},
        ],
    },
    "PerformanceVarianceDetected": {
        "streamType": "AssetTelemetry",
        "description": "Flags when actual vs forecast exceeds 10% of capacity",
        "payloadFields": [
            {"name": "assetId", "type": "string", "description": "Asset identifier"},
            {"name": "assetType", "type": "string", "description": "Asset type"},
            {"name": "assetName", "type": "string", "description": "Human-readable asset name"},
            {"name": "region", "type": "string", "description": "ISO country code"},
            {"name": "actualMw", "type": "float", "description": "Actual output MW"},
            {"name": "forecastMw", "type": "float", "description": "Forecast output MW"},
            {"name": "varianceMw", "type": "float", "description": "Variance in MW"},
            {"name": "variancePct", "type": "float", "description": "Variance as % of capacity"},
            {"name": "capacityMw", "type": "float", "description": "Nameplate capacity"},
            {"name": "severity", "type": "string", "description": "info | warning"},
        ],
    },
    "WindForecastUpdated": {
        "streamType": "WeatherForecast",
        "description": "Updated wind forecast from ECMWF for a wind asset",
        "payloadFields": [
            {"name": "assetId", "type": "string", "description": "Affected wind asset ID"},
            {"name": "region", "type": "string", "description": "ISO country code"},
            {"name": "forecastDeltaPct", "type": "float", "description": "Change in forecast (%)"},
            {"name": "updatedForecastMw", "type": "float", "description": "New forecast MW"},
            {"name": "previousForecastMw", "type": "float", "description": "Previous forecast MW"},
            {"name": "windSpeedMs", "type": "float", "description": "Wind speed in m/s"},
            {"name": "source", "type": "string", "description": "Forecast source (ECMWF)"},
        ],
    },
    "SolarIrradianceForecastUpdated": {
        "streamType": "WeatherForecast",
        "description": "Updated solar irradiance forecast for a solar asset",
        "payloadFields": [
            {"name": "assetId", "type": "string", "description": "Affected solar asset ID"},
            {"name": "region", "type": "string", "description": "ISO country code"},
            {"name": "forecastDeltaPct", "type": "float", "description": "Change in forecast (%)"},
            {"name": "updatedForecastMw", "type": "float", "description": "New forecast MW"},
            {"name": "previousForecastMw", "type": "float", "description": "Previous forecast MW"},
            {"name": "irradianceWm2", "type": "float", "description": "Solar irradiance W/m²"},
            {"name": "cloudCoverPct", "type": "float", "description": "Cloud cover percentage"},
            {"name": "source", "type": "string", "description": "Forecast source (SolarEdge-NWP)"},
        ],
    },
    "WeatherAlertIssued": {
        "streamType": "WeatherForecast",
        "description": "Severe weather alert for a region",
        "payloadFields": [
            {"name": "region", "type": "string", "description": "Affected region code"},
            {"name": "severity", "type": "string", "description": "advisory | warning | critical"},
            {"name": "curtailmentRequired", "type": "boolean", "description": "Whether generation curtailment is needed"},
            {"name": "description", "type": "string", "description": "Human-readable alert description"},
            {"name": "validUntil", "type": "string", "description": "ISO datetime when alert expires"},
        ],
    },
    "PositionGapDetected": {
        "streamType": "TradingPosition",
        "description": "Portfolio position gap exceeds threshold",
        "payloadFields": [
            {"name": "committedMwh", "type": "float", "description": "Total committed MWh"},
            {"name": "forecastMwh", "type": "float", "description": "Total forecast MWh"},
            {"name": "gapMwh", "type": "float", "description": "Gap in MWh (forecast - committed)"},
            {"name": "gapType", "type": "string", "description": "surplus | shortfall | balanced"},
            {"name": "severity", "type": "string", "description": "info | warning | critical"},
            {"name": "recommendedAction", "type": "string", "description": "Suggested trader action"},
            {"name": "bestAvailablePriceEurMwh", "type": "float", "description": "Best channel price"},
            {"name": "estimatedImpactEur", "type": "float", "description": "Estimated financial impact"},
        ],
    },
    "TradeExecuted": {
        "streamType": "TradingPosition",
        "description": "A trade was executed on a market channel",
        "payloadFields": [
            {"name": "tradeId", "type": "string", "description": "Unique trade identifier"},
            {"name": "side", "type": "string", "description": "buy | sell"},
            {"name": "quantityMwh", "type": "float", "description": "Trade quantity in MWh"},
            {"name": "priceEurMwh", "type": "float", "description": "Execution price EUR/MWh"},
            {"name": "revenueEur", "type": "float", "description": "Trade revenue in EUR"},
            {"name": "marketChannel", "type": "string", "description": "dayAhead | intraday | flexibility"},
            {"name": "executionType", "type": "string", "description": "manual | algorithmic"},
            {"name": "counterparty", "type": "string", "description": "Counterparty exchange ID"},
        ],
    },
    "PnlSnapshotRecorded": {
        "streamType": "TradingPosition",
        "description": "Periodic revenue snapshot with per-asset-type breakdown",
        "payloadFields": [
            {"name": "realisedPnlEur", "type": "float", "description": "Total captured revenue EUR"},
            {"name": "fleetGenerationValueEur", "type": "float", "description": "Hourly fleet value EUR"},
            {"name": "dailyTargetEur", "type": "float", "description": "Daily revenue target EUR"},
            {"name": "progressPct", "type": "float", "description": "Progress toward daily target (%)"},
            {"name": "byAssetType", "type": "object", "description": "Per-type breakdown (outputMw, forecastMw, hourlyValueEur)"},
            {"name": "bestPriceEurMwh", "type": "float", "description": "Best available channel price"},
        ],
    },
    "CapacityAllocationSet": {
        "streamType": "TradingPosition",
        "description": "Trader set capacity allocation for an asset type",
        "payloadFields": [
            {"name": "assetType", "type": "string", "description": "Asset type allocated"},
            {"name": "targetMwh", "type": "float", "description": "Target allocation in MWh"},
            {"name": "marketChannel", "type": "string", "description": "Selected market channel"},
            {"name": "priceFloorEur", "type": "float", "description": "Minimum acceptable price"},
            {"name": "currentPriceEurMwh", "type": "float", "description": "Channel price at allocation time"},
            {"name": "updatedCommittedMwh", "type": "float", "description": "New total committed MWh"},
            {"name": "updatedGapMwh", "type": "float", "description": "New position gap MWh"},
            {"name": "gapType", "type": "string", "description": "surplus | shortfall | balanced"},
        ],
    },
}


@router.get("/trading/event-schemas")
async def get_event_schemas() -> dict:
    """Return schema definitions for all 9 trading event types."""
    return EVENT_SCHEMAS


# ---------------------------------------------------------------------------
# Change Stream SSE — live events from MongoDB trading_events collection
# ---------------------------------------------------------------------------

import queue
import threading
import time as _time


def _watch_loop(
    pipeline: list,
    q: "queue.Queue[dict]",
    stop_event: threading.Event,
) -> None:
    """Background thread: opens a Change Stream on trading_event_log and pushes documents to the queue.

    We watch trading_event_log (regular collection) rather than trading_events (time series)
    because MongoDB does not support change streams on time series collections.
    trading_event_log is a projection of trading_events — every insert is dual-written there
    with a 1-hour TTL to keep the collection bounded.
    """
    from app.infrastructure.db import get_client, DB_NAME as _DB_NAME
    try:
        client = get_client()
        coll = client[_DB_NAME]["trading_event_log"]
    except Exception as exc:
        q.put({"_error": f"Cannot connect to MongoDB: {exc}"})
        return

    while not stop_event.is_set():
        try:
            with coll.watch(pipeline, full_document="updateLookup", max_await_time_ms=1000) as cursor:
                for change in cursor:
                    if stop_event.is_set():
                        break
                    doc = change.get("fullDocument")
                    if doc:
                        doc.pop("_id", None)
                        q.put(doc)
        except Exception as exc:
            if not stop_event.is_set():
                q.put({"_error": str(exc)})
                stop_event.wait(5.0)



@router.get("/trading/events/stream")
async def trading_events_sse(
    stream_type: str | None = None,
    event_type: str | None = None,
):
    """SSE: streams live trading events from MongoDB Change Stream.

    Delivers events only while the simulator is running (started via POST /trading/start).
    Sends keepalive pings when idle so the connection stays open waiting for the user
    to start the simulation.
    """
    match_filter: dict = {"operationType": "insert"}
    if stream_type:
        match_filter["fullDocument.streamType"] = stream_type
    if event_type:
        match_filter["fullDocument.eventType"] = event_type
    pipeline = [{"$match": match_filter}]

    q: queue.Queue[dict] = queue.Queue(maxsize=256)
    stop_event = threading.Event()

    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _watch_loop, pipeline, q, stop_event)

    async def generate():
        try:
            while True:
                try:
                    doc = await asyncio.to_thread(q.get, True, 1.0)
                    if "_error" in doc:
                        yield f"data: {json.dumps({'type': 'error', 'message': doc['_error']})}\n\n"
                    else:
                        yield f"data: {json.dumps(doc, default=str)}\n\n"
                except queue.Empty:
                    yield "data: {\"type\":\"ping\"}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            stop_event.set()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
