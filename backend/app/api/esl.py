"""ESL API router — entity catalog, metric queries, view deployment."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import MongoClient

from app.infrastructure.db import get_db, DB_NAME
from esl.manifests import load_all_manifests, get_entity_manifests, get_metric_manifests
from esl.compiler import ESLCompiler
from esl.metrics import (
    compute_capacity_factor,
    compute_state_of_charge,
    compute_renewable_penetration,
    compute_portfolio_metrics,
    get_timeseries,
)
from esl.seed import seed_all

router = APIRouter(prefix="/esl", tags=["ESL"])


# ── Catalog ─────────────────────────────────────────────────────────────

@router.get("/catalog")
def get_catalog():
    """Full semantic catalog: all entity and metric manifests."""
    manifests = load_all_manifests()
    entities = {k: v["entity"] for k, v in manifests.items() if "entity" in v}
    metrics = {k: v["metric"] for k, v in manifests.items() if "metric" in v}
    return {
        "esl_version": "0.1",
        "entities": entities,
        "metrics": metrics,
        "layers": {
            "L1_Entity": list(entities.keys()),
            "L2_Relationship": ["Portfolio→Site→Asset", "GridBus→Line→Bus", "REMIT linkages"],
            "L3_Metric": list(metrics.keys()),
            "L4_Governance": ["Row-level security", "Audit trail", "Field masking"],
        },
    }


# ── Entities ─────────────────────────────────────────────────────────────

@router.get("/entities")
def list_entity_types():
    """List all registered ESL entity types."""
    entity_manifests = get_entity_manifests()
    return [
        {
            "name": name,
            "description": m["entity"].get("description", ""),
            "iec_cim_class": m["entity"].get("iec_cim_class", ""),
            "collection": m["entity"].get("collection", ""),
            "tags": m["entity"].get("tags", []),
            "field_count": len(m["entity"].get("fields", {})),
        }
        for name, m in entity_manifests.items()
    ]


@router.get("/entities/{entity_type}")
def get_entities(
    entity_type: str,
    limit: int = Query(50, le=200),
    client: MongoClient = Depends(get_db),
):
    """List instances of an entity type from MongoDB."""
    db = client[DB_NAME]
    entity_manifests = get_entity_manifests()

    if entity_type not in entity_manifests:
        raise HTTPException(
            404,
            detail=f"Unknown entity type '{entity_type}'. "
                   f"Available: {list(entity_manifests.keys())}",
        )

    manifest = entity_manifests[entity_type]["entity"]
    collection = manifest["collection"]
    query_filter = manifest.get("filter", {})
    field_defs = manifest.get("fields", {})

    raw_docs = list(db[collection].find(query_filter).limit(limit))

    results = []
    for doc in raw_docs:
        obj: dict = {
            "id": doc["_id"],
            "name": doc.get("name"),
            "asset_type": doc.get("asset_type"),
            "location": doc.get("location"),
            "_esl_entity": entity_type,
            "_iec_cim_class": manifest.get("iec_cim_class", ""),
        }
        specs = doc.get("specs", {})
        for field_name, field_def in field_defs.items():
            source = field_def.get("source", field_name)
            parts = source.split(".")
            val = doc
            for p in parts:
                if isinstance(val, dict):
                    val = val.get(p)
                else:
                    val = None
                    break
            obj[field_name] = val
        if "site_id" in doc:
            site = db["sites"].find_one({"_id": doc["site_id"]}, {"name": 1, "country": 1})
            if site:
                obj["site"] = {"id": site["_id"], "name": site.get("name"), "country": site.get("country")}
        results.append(obj)

    return {
        "entity_type": entity_type,
        "iec_cim_class": manifest.get("iec_cim_class", ""),
        "description": manifest.get("description", ""),
        "count": len(results),
        "items": results,
    }


@router.get("/entities/{entity_type}/raw")
def get_raw_documents(
    entity_type: str,
    limit: int = Query(3, le=10),
    client: MongoClient = Depends(get_db),
):
    """Return raw MongoDB documents for comparison with ESL-governed view."""
    db = client[DB_NAME]
    entity_manifests = get_entity_manifests()

    if entity_type not in entity_manifests:
        raise HTTPException(404, detail=f"Unknown entity '{entity_type}'")

    manifest = entity_manifests[entity_type]["entity"]
    collection = manifest["collection"]
    query_filter = manifest.get("filter", {})

    raw_docs = list(db[collection].find(query_filter).limit(limit))
    for d in raw_docs:
        d["_id"] = str(d["_id"])
    return {"collection": collection, "filter": query_filter, "raw_documents": raw_docs}


# ── Metrics ──────────────────────────────────────────────────────────────

@router.get("/metrics/summary")
def get_metrics_summary(
    portfolio_id: str | None = Query(None),
    client: MongoClient = Depends(get_db),
):
    """Portfolio-level summary: capacity, penetration, all BESS SoCs."""
    db = client[DB_NAME]

    asset_filter: dict = {}
    if portfolio_id:
        asset_filter["portfolio_id"] = portfolio_id
    else:
        asset_filter["_id"] = {"$regex": "^esl-"}

    assets = list(db["assets"].find(asset_filter, {"_id": 1, "asset_type": 1, "name": 1, "specs": 1}))

    portfolio_summary = compute_portfolio_metrics(client, portfolio_id, DB_NAME)
    renewable_pct = compute_renewable_penetration(client, portfolio_id, 24, DB_NAME)

    bess_assets = [a for a in assets if a.get("asset_type") == "BESS"]
    bess_socs = []
    for bess in bess_assets:
        soc = compute_state_of_charge(client, bess["_id"], DB_NAME)
        if "error" not in soc:
            bess_socs.append(soc)

    gen_assets = [a for a in assets if a.get("asset_type") in ("PV", "WIND")]
    cf_results = []
    for gen in gen_assets:
        cf = compute_capacity_factor(client, gen["_id"], 24, DB_NAME)
        if "error" not in cf:
            cf_results.append(cf)

    return {
        "portfolio_id": portfolio_id,
        "portfolio_summary": portfolio_summary,
        "renewable_penetration": renewable_pct,
        "capacity_factors": cf_results,
        "bess_soc": bess_socs,
    }


@router.get("/metrics/capacity-factor/{asset_id}")
def get_capacity_factor(
    asset_id: str,
    period_hours: int = Query(24, ge=1, le=168),
    client: MongoClient = Depends(get_db),
):
    result = compute_capacity_factor(client, asset_id, period_hours, DB_NAME)
    if "error" in result:
        raise HTTPException(404, detail=result["error"])
    return result


@router.get("/metrics/soc/{asset_id}")
def get_soc(asset_id: str, client: MongoClient = Depends(get_db)):
    result = compute_state_of_charge(client, asset_id, DB_NAME)
    if "error" in result:
        raise HTTPException(404, detail=result["error"])
    return result


@router.get("/metrics/renewable-penetration")
def get_renewable_penetration(
    portfolio_id: str | None = Query(None),
    period_hours: int = Query(1, ge=1, le=24),
    client: MongoClient = Depends(get_db),
):
    return compute_renewable_penetration(client, portfolio_id, period_hours, DB_NAME)


@router.get("/timeseries/{asset_id}")
def get_asset_timeseries(
    asset_id: str,
    metric_type: str = Query("supply", pattern="^(supply|demand|soc)$"),
    hours: int = Query(24, ge=1, le=168),
    client: MongoClient = Depends(get_db),
):
    data = get_timeseries(client, asset_id, metric_type, hours, DB_NAME)
    return {"asset_id": asset_id, "metric_type": metric_type, "hours": hours, "data": data}


@router.get("/prices")
def get_market_prices(
    zone_eic: str | None = Query(None),
    hours: int = Query(24, ge=1, le=48),
    client: MongoClient = Depends(get_db),
):
    from datetime import datetime, timedelta, timezone
    db = client[DB_NAME]
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    price_filter: dict = {"timestamp": {"$gte": since}, "source": "esl-demo"}
    if zone_eic:
        price_filter["zone_eic"] = zone_eic

    prices = list(db["market.prices"].find(
        price_filter,
        {"_id": 0, "zone_eic": 1, "price_type": 1, "timestamp": 1, "price_eur_mwh": 1},
    ).sort("timestamp", 1).limit(500))

    for p in prices:
        if hasattr(p.get("timestamp"), "isoformat"):
            p["timestamp"] = p["timestamp"].isoformat()

    by_zone: dict = {}
    for p in prices:
        z = p["zone_eic"]
        by_zone.setdefault(z, []).append({"timestamp": p["timestamp"], "price_eur_mwh": p["price_eur_mwh"]})

    return {"hours": hours, "zones": by_zone}


# ── Deployment ────────────────────────────────────────────────────────────

@router.post("/deploy")
def deploy_views(
    dry_run: bool = Query(False),
    client: MongoClient = Depends(get_db),
):
    """Compile and deploy all ESL Views to MongoDB Atlas."""
    compiler = ESLCompiler(client, DB_NAME)
    results = compiler.deploy_views(dry_run=dry_run)
    deployed = sum(1 for r in results if r.get("status") == "deployed")
    return {
        "dry_run": dry_run,
        "total": len(results),
        "deployed": deployed,
        "results": results,
    }


@router.get("/status")
def get_status(client: MongoClient = Depends(get_db)):
    """Health check — which ESL views are deployed."""
    compiler = ESLCompiler(client, DB_NAME)
    status = compiler.get_deployment_status()
    all_deployed = all(s["deployed"] for s in status)
    return {
        "healthy": all_deployed,
        "views": status,
        "esl_version": "0.1",
    }


# ── Demo / Seed ───────────────────────────────────────────────────────────

@router.post("/seed")
def seed_demo_data(
    force: bool = Query(False),
    client: MongoClient = Depends(get_db),
):
    """Seed MongoDB with demo energy assets, timeseries, and market data."""
    result = seed_all(client, DB_NAME, force=force)
    return result
