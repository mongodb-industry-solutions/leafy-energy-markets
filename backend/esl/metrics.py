"""ESL Metric computation helpers — aggregation pipeline runners."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from pymongo import MongoClient, DESCENDING


DB_NAME_DEFAULT = "leafy-energy-markets"


def _db(client: MongoClient, db_name: str):
    return client[db_name]


def compute_capacity_factor(
    client: MongoClient,
    asset_id: str,
    period_hours: int = 24,
    db_name: str = DB_NAME_DEFAULT,
) -> dict[str, Any]:
    """Capacity factor = avg(actual_mw) / capacity_mw * 100."""
    db = _db(client, db_name)
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=period_hours)

    asset = db["assets"].find_one({"_id": asset_id})
    if not asset:
        return {"error": "asset not found", "asset_id": asset_id}

    capacity_mw = _get_capacity_mw(asset)
    if capacity_mw is None or capacity_mw == 0:
        return {"error": "capacity not defined", "asset_id": asset_id}

    pipeline = [
        {"$match": {
            "asset_id": asset_id,
            "metric_type": "supply",
            "timestamp": {"$gte": since},
        }},
        {"$group": {
            "_id": None,
            "avg_mw": {"$avg": "$value_mw"},
            "max_mw": {"$max": "$value_mw"},
            "min_mw": {"$min": "$value_mw"},
            "count": {"$sum": 1},
        }},
    ]

    result = list(db["timeseries.readings"].aggregate(pipeline))
    if not result:
        return {
            "asset_id": asset_id,
            "capacity_factor_pct": 0,
            "avg_mw": 0,
            "capacity_mw": capacity_mw,
            "period_hours": period_hours,
            "data_points": 0,
        }

    r = result[0]
    cf = round((r["avg_mw"] / capacity_mw) * 100, 2)

    return {
        "asset_id": asset_id,
        "asset_name": asset.get("name"),
        "asset_type": asset.get("asset_type"),
        "capacity_factor_pct": min(cf, 100),
        "avg_mw": round(r["avg_mw"], 3),
        "max_mw": round(r["max_mw"], 3),
        "min_mw": round(r["min_mw"], 3),
        "capacity_mw": capacity_mw,
        "period_hours": period_hours,
        "data_points": r["count"],
        "metric": "CapacityFactor",
        "unit": "%",
        "iec_cim_property": "GeneratingUnit.normalPF",
    }


def compute_state_of_charge(
    client: MongoClient,
    asset_id: str,
    db_name: str = DB_NAME_DEFAULT,
) -> dict[str, Any]:
    """Latest state-of-charge reading for a BESS asset."""
    db = _db(client, db_name)

    asset = db["assets"].find_one({"_id": asset_id})
    if not asset:
        return {"error": "asset not found", "asset_id": asset_id}
    if asset.get("asset_type") != "BESS":
        return {"error": "not a BESS asset", "asset_id": asset_id}

    reading = db["timeseries.readings"].find_one(
        {"asset_id": asset_id, "metric_type": "soc"},
        sort=[("timestamp", DESCENDING)],
    )

    capacity_kwh = asset.get("specs", {}).get("capacity_kwh", 0)

    if not reading:
        return {
            "asset_id": asset_id,
            "asset_name": asset.get("name"),
            "soc_pct": None,
            "available_kwh": None,
            "capacity_kwh": capacity_kwh,
            "metric": "StateOfCharge",
        }

    soc_pct = reading["value_mw"]
    available_kwh = round(soc_pct / 100 * capacity_kwh, 2)

    return {
        "asset_id": asset_id,
        "asset_name": asset.get("name"),
        "soc_pct": soc_pct,
        "available_kwh": available_kwh,
        "capacity_kwh": capacity_kwh,
        "timestamp": reading["timestamp"].isoformat(),
        "metric": "StateOfCharge",
        "unit": "%",
        "iec_cim_property": "EnergyStorageUnit.storedE",
    }


def compute_renewable_penetration(
    client: MongoClient,
    portfolio_id: Optional[str] = None,
    period_hours: int = 1,
    db_name: str = DB_NAME_DEFAULT,
) -> dict[str, Any]:
    """Share of renewable (PV + WIND) in total generation."""
    db = _db(client, db_name)
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=period_hours)

    asset_filter: dict[str, Any] = {}
    if portfolio_id:
        asset_filter["portfolio_id"] = portfolio_id

    all_assets = list(db["assets"].find(asset_filter, {"_id": 1, "asset_type": 1, "name": 1}))
    if not all_assets:
        return {"error": "no assets found", "portfolio_id": portfolio_id}

    asset_ids = [a["_id"] for a in all_assets]
    renewable_ids = [a["_id"] for a in all_assets if a.get("asset_type") in ("PV", "WIND")]

    pipeline = [
        {"$match": {
            "asset_id": {"$in": asset_ids},
            "metric_type": "supply",
            "timestamp": {"$gte": since},
        }},
        {"$group": {
            "_id": "$asset_id",
            "avg_mw": {"$avg": "$value_mw"},
        }},
    ]

    readings = {r["_id"]: r["avg_mw"] for r in db["timeseries.readings"].aggregate(pipeline)}

    total_mw = sum(readings.get(aid, 0) for aid in asset_ids)
    renewable_mw = sum(readings.get(aid, 0) for aid in renewable_ids)

    pct = round((renewable_mw / total_mw * 100) if total_mw > 0 else 0, 2)

    return {
        "portfolio_id": portfolio_id,
        "renewable_penetration_pct": pct,
        "renewable_mw": round(renewable_mw, 3),
        "total_mw": round(total_mw, 3),
        "num_assets": len(all_assets),
        "period_hours": period_hours,
        "metric": "RenewablePenetration",
        "unit": "%",
    }


def compute_portfolio_metrics(
    client: MongoClient,
    portfolio_id: Optional[str] = None,
    db_name: str = DB_NAME_DEFAULT,
) -> dict[str, Any]:
    """Summary metrics for all assets in a portfolio."""
    db = _db(client, db_name)

    asset_filter: dict[str, Any] = {}
    if portfolio_id:
        asset_filter["portfolio_id"] = portfolio_id

    assets = list(db["assets"].find(asset_filter))
    by_type: dict[str, list] = {}
    for a in assets:
        t = a.get("asset_type", "OTHER")
        by_type.setdefault(t, []).append(a)

    total_solar_kwp = sum(
        a.get("specs", {}).get("capacity_kwp", 0) for a in by_type.get("PV", [])
    )
    total_wind_kw = sum(
        a.get("specs", {}).get("capacity_kw", 0) for a in by_type.get("WIND", [])
    )
    total_bess_kwh = sum(
        a.get("specs", {}).get("capacity_kwh", 0) for a in by_type.get("BESS", [])
    )

    return {
        "portfolio_id": portfolio_id,
        "total_assets": len(assets),
        "by_type": {k: len(v) for k, v in by_type.items()},
        "total_solar_kwp": total_solar_kwp,
        "total_wind_kw": total_wind_kw,
        "total_bess_kwh": total_bess_kwh,
        "total_renewable_capacity_mw": round((total_solar_kwp + total_wind_kw) / 1000, 2),
    }


def get_timeseries(
    client: MongoClient,
    asset_id: str,
    metric_type: str = "supply",
    hours: int = 24,
    db_name: str = DB_NAME_DEFAULT,
) -> list[dict]:
    """Return time-series readings for an asset as a list of {timestamp, value_mw}."""
    db = _db(client, db_name)
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    docs = list(db["timeseries.readings"].find(
        {"asset_id": asset_id, "metric_type": metric_type, "timestamp": {"$gte": since}},
        {"_id": 0, "timestamp": 1, "value_mw": 1},
    ).sort("timestamp", 1).limit(200))
    for d in docs:
        if isinstance(d.get("timestamp"), datetime):
            d["timestamp"] = d["timestamp"].isoformat()
    return docs


def _get_capacity_mw(asset: dict) -> Optional[float]:
    t = asset.get("asset_type")
    specs = asset.get("specs", {})
    if t == "PV":
        kwp = specs.get("capacity_kwp", 0)
        return kwp / 1000
    if t == "WIND":
        kw = specs.get("capacity_kw", 0)
        return kw / 1000
    if t == "BESS":
        kw = specs.get("max_discharge_kw", 0)
        return kw / 1000
    return None
