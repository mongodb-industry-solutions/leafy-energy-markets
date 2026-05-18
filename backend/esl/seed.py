"""ESL demo data seeder — populates MongoDB with synthetic energy assets + timeseries."""
from __future__ import annotations
import math
import random
from datetime import datetime, timedelta, timezone
from typing import Any
from pymongo import MongoClient, ASCENDING


def seed_all(client: MongoClient, db_name: str = "leafy-energy-markets", force: bool = False):
    db = client[db_name]

    if not force and db["assets"].count_documents({}) > 0:
        existing = db["assets"].count_documents({"_id": {"$regex": "^esl-"}})
        if existing > 0:
            return {"status": "already_seeded", "assets": existing}

    _seed_portfolios(db)
    _seed_sites(db)
    asset_ids = _seed_assets(db)
    _seed_market_zones(db)
    _seed_timeseries(db, asset_ids)
    _seed_market_prices(db)
    _create_indexes(db)

    return {
        "status": "seeded",
        "assets": len(asset_ids),
        "portfolios": 2,
        "sites": 4,
    }


def _seed_portfolios(db):
    portfolios = [
        {
            "_id": "esl-portfolio-solar",
            "name": "Leafy Solar Portfolio",
            "owner_id": "leafy-energy",
            "sites": ["esl-site-iberia", "esl-site-nordics"],
            "market_zones": ["10YES-REE------0", "10YNO-0--------C"],
        },
        {
            "_id": "esl-portfolio-storage",
            "name": "Leafy Flex & Storage Portfolio",
            "owner_id": "leafy-energy",
            "sites": ["esl-site-uk", "esl-site-germany"],
            "market_zones": ["10YGB----------A", "10Y1001A1001A82H"],
        },
    ]
    db["portfolios"].delete_many({"_id": {"$regex": "^esl-"}})
    db["portfolios"].insert_many(portfolios)


def _seed_sites(db):
    sites = [
        {
            "_id": "esl-site-iberia",
            "name": "Leafy Iberia Solar Park",
            "portfolio_id": "esl-portfolio-solar",
            "location": {"type": "Point", "coordinates": [-3.7038, 40.4168]},
            "timezone": "Europe/Madrid",
            "country": "ES",
            "assets": ["esl-pv-madrid-1", "esl-pv-madrid-2"],
        },
        {
            "_id": "esl-site-nordics",
            "name": "Leafy Nordics Wind Farm",
            "portfolio_id": "esl-portfolio-solar",
            "location": {"type": "Point", "coordinates": [10.7522, 59.9139]},
            "timezone": "Europe/Oslo",
            "country": "NO",
            "assets": ["esl-wind-oslo-1"],
        },
        {
            "_id": "esl-site-uk",
            "name": "Leafy UK BESS Site",
            "portfolio_id": "esl-portfolio-storage",
            "location": {"type": "Point", "coordinates": [-0.1276, 51.5074]},
            "timezone": "Europe/London",
            "country": "GB",
            "assets": ["esl-bess-london-1"],
        },
        {
            "_id": "esl-site-germany",
            "name": "Leafy Germany Hybrid Site",
            "portfolio_id": "esl-portfolio-storage",
            "location": {"type": "Point", "coordinates": [13.4050, 52.5200]},
            "timezone": "Europe/Berlin",
            "country": "DE",
            "assets": ["esl-bess-berlin-1", "esl-wind-berlin-1"],
        },
    ]
    db["sites"].delete_many({"_id": {"$regex": "^esl-"}})
    db["sites"].insert_many(sites)


def _seed_assets(db) -> list[str]:
    assets = [
        # --- PV Systems ---
        {
            "_id": "esl-pv-madrid-1",
            "name": "Madrid Solar Park A",
            "asset_type": "PV",
            "site_id": "esl-site-iberia",
            "portfolio_id": "esl-portfolio-solar",
            "location": {"type": "Point", "coordinates": [-3.7038, 40.4168]},
            "specs": {
                "capacity_kwp": 5000,
                "tilt_deg": 30,
                "azimuth_deg": 180,
                "dc_ac_ratio": 1.25,
                "technology": "mono-Si",
                "inverter_kw": 4000,
            },
            "metadata": {"commissioned": "2023-06-01", "operator": "SolarTech Iberia"},
        },
        {
            "_id": "esl-pv-madrid-2",
            "name": "Madrid Solar Park B",
            "asset_type": "PV",
            "site_id": "esl-site-iberia",
            "portfolio_id": "esl-portfolio-solar",
            "location": {"type": "Point", "coordinates": [-3.7100, 40.4200]},
            "specs": {
                "capacity_kwp": 3500,
                "tilt_deg": 25,
                "azimuth_deg": 175,
                "dc_ac_ratio": 1.20,
                "technology": "bifacial",
                "inverter_kw": 2916,
            },
            "metadata": {"commissioned": "2024-03-15", "operator": "SolarTech Iberia"},
        },
        # --- Wind Farms ---
        {
            "_id": "esl-wind-oslo-1",
            "name": "Oslo Offshore Wind Farm",
            "asset_type": "WIND",
            "site_id": "esl-site-nordics",
            "portfolio_id": "esl-portfolio-solar",
            "location": {"type": "Point", "coordinates": [10.7522, 59.9139]},
            "specs": {
                "capacity_kw": 50000,
                "num_turbines": 20,
                "hub_height_m": 120,
                "rotor_diameter_m": 167,
                "wind_class": "I",
                "offshore": True,
            },
            "metadata": {"commissioned": "2022-09-01", "operator": "NordWind AS"},
        },
        {
            "_id": "esl-wind-berlin-1",
            "name": "Brandenburg Wind Park",
            "asset_type": "WIND",
            "site_id": "esl-site-germany",
            "portfolio_id": "esl-portfolio-storage",
            "location": {"type": "Point", "coordinates": [13.4050, 52.5200]},
            "specs": {
                "capacity_kw": 24000,
                "num_turbines": 8,
                "hub_height_m": 100,
                "rotor_diameter_m": 140,
                "wind_class": "II",
                "offshore": False,
            },
            "metadata": {"commissioned": "2021-04-20", "operator": "WindPower GmbH"},
        },
        # --- BESS ---
        {
            "_id": "esl-bess-london-1",
            "name": "London Grid BESS Alpha",
            "asset_type": "BESS",
            "site_id": "esl-site-uk",
            "portfolio_id": "esl-portfolio-storage",
            "location": {"type": "Point", "coordinates": [-0.1276, 51.5074]},
            "specs": {
                "capacity_kwh": 20000,
                "max_charge_kw": 10000,
                "max_discharge_kw": 10000,
                "rte_pct": 87,
                "chemistry": "LFP",
                "initial_soc": 65,
            },
            "metadata": {"commissioned": "2023-11-01", "operator": "Leafy Grid Services"},
        },
        {
            "_id": "esl-bess-berlin-1",
            "name": "Berlin Balancing BESS Beta",
            "asset_type": "BESS",
            "site_id": "esl-site-germany",
            "portfolio_id": "esl-portfolio-storage",
            "location": {"type": "Point", "coordinates": [13.4100, 52.5250]},
            "specs": {
                "capacity_kwh": 12000,
                "max_charge_kw": 6000,
                "max_discharge_kw": 6000,
                "rte_pct": 90,
                "chemistry": "NMC",
                "initial_soc": 40,
            },
            "metadata": {"commissioned": "2024-01-10", "operator": "Leafy Grid Services"},
        },
    ]

    db["assets"].delete_many({"_id": {"$regex": "^esl-"}})
    db["assets"].insert_many(assets)
    return [a["_id"] for a in assets]


def _seed_market_zones(db):
    zones = [
        {
            "_id": "esl-zone-es",
            "name": "Spain",
            "eic_code": "10YES-REE------0",
            "tso": "REE",
            "country": "ES",
            "control_area": "ES",
            "coupled_zones": ["10YES-REE------0", "10YFR-RTE------C"],
        },
        {
            "_id": "esl-zone-no",
            "name": "Norway NO1",
            "eic_code": "10YNO-0--------C",
            "tso": "Statnett",
            "country": "NO",
            "control_area": "NO1",
            "coupled_zones": ["10YNO-0--------C", "10YSE-1--------K"],
        },
        {
            "_id": "esl-zone-gb",
            "name": "Great Britain",
            "eic_code": "10YGB----------A",
            "tso": "National Grid ESO",
            "country": "GB",
            "control_area": "GB",
            "coupled_zones": [],
        },
        {
            "_id": "esl-zone-de",
            "name": "Germany",
            "eic_code": "10Y1001A1001A82H",
            "tso": "50Hertz/Amprion/TenneT/TransnetBW",
            "country": "DE",
            "control_area": "DE-LU",
            "coupled_zones": ["10Y1001A1001A82H", "10YFR-RTE------C"],
        },
    ]
    db["market_zones"].delete_many({"_id": {"$regex": "^esl-"}})
    db["market_zones"].insert_many(zones)


def _seed_timeseries(db, asset_ids: list[str]):
    db["timeseries.readings"].delete_many({"asset_id": {"$in": asset_ids}})

    readings = []
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)

    asset_configs = {
        "esl-pv-madrid-1": {"type": "PV", "capacity_mw": 5.0},
        "esl-pv-madrid-2": {"type": "PV", "capacity_mw": 3.5},
        "esl-wind-oslo-1": {"type": "WIND", "capacity_mw": 50.0},
        "esl-wind-berlin-1": {"type": "WIND", "capacity_mw": 24.0},
        "esl-bess-london-1": {"type": "BESS", "capacity_kwh": 20000, "max_kw": 10000},
        "esl-bess-berlin-1": {"type": "BESS", "capacity_kwh": 12000, "max_kw": 6000},
    }

    for hours_back in range(48, -1, -1):
        ts = now - timedelta(hours=hours_back)
        hour = ts.hour

        for asset_id, cfg in asset_configs.items():
            if cfg["type"] == "PV":
                value = _solar_profile(hour, cfg["capacity_mw"])
                readings.append({
                    "asset_id": asset_id,
                    "metric_type": "supply",
                    "timestamp": ts,
                    "value_mw": value,
                    "unit": "MW",
                    "resolution_min": 60,
                    "quality_flag": "measured",
                })
            elif cfg["type"] == "WIND":
                value = _wind_profile(hour, cfg["capacity_mw"])
                readings.append({
                    "asset_id": asset_id,
                    "metric_type": "supply",
                    "timestamp": ts,
                    "value_mw": value,
                    "unit": "MW",
                    "resolution_min": 60,
                    "quality_flag": "measured",
                })
            elif cfg["type"] == "BESS":
                soc = _bess_soc_profile(hour, hours_back)
                readings.append({
                    "asset_id": asset_id,
                    "metric_type": "soc",
                    "timestamp": ts,
                    "value_mw": soc,
                    "unit": "%",
                    "resolution_min": 60,
                    "quality_flag": "measured",
                })
                charge = _bess_charge_profile(hour, cfg["max_kw"])
                readings.append({
                    "asset_id": asset_id,
                    "metric_type": "supply" if charge >= 0 else "demand",
                    "timestamp": ts,
                    "value_mw": abs(charge) / 1000,
                    "unit": "MW",
                    "resolution_min": 60,
                    "quality_flag": "measured",
                })

    if readings:
        db["timeseries.readings"].insert_many(readings)


def _seed_market_prices(db):
    db["market.prices"].delete_many({"source": "esl-demo"})

    zone_configs = [
        ("10YES-REE------0", "ES"),
        ("10YNO-0--------C", "NO"),
        ("10YGB----------A", "GB"),
        ("10Y1001A1001A82H", "DE"),
    ]

    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    prices = []
    base_prices = {"ES": 85.0, "NO": 45.0, "GB": 110.0, "DE": 90.0}

    for hours_back in range(48, -1, -1):
        ts = now - timedelta(hours=hours_back)
        hour = ts.hour
        peak_factor = 1.4 if 8 <= hour <= 20 else 0.7

        for eic, country in zone_configs:
            base = base_prices[country]
            noise = random.uniform(-10, 10)
            price = round(base * peak_factor + noise, 2)
            prices.append({
                "zone_eic": eic,
                "price_type": "DAM",
                "timestamp": ts,
                "price_eur_mwh": price,
                "source": "esl-demo",
            })

    if prices:
        db["market.prices"].insert_many(prices)


def _create_indexes(db):
    db["assets"].create_index([("asset_type", ASCENDING), ("site_id", ASCENDING)])
    db["assets"].create_index([("portfolio_id", ASCENDING)])
    db["timeseries.readings"].create_index(
        [("asset_id", ASCENDING), ("metric_type", ASCENDING), ("timestamp", ASCENDING)]
    )
    db["market.prices"].create_index(
        [("zone_eic", ASCENDING), ("price_type", ASCENDING), ("timestamp", ASCENDING)]
    )


def _solar_profile(hour: int, capacity_mw: float) -> float:
    if hour < 6 or hour > 20:
        return 0.0
    peak_hour = 13
    sigma = 4
    irradiance = math.exp(-((hour - peak_hour) ** 2) / (2 * sigma ** 2))
    noise = random.uniform(0.9, 1.1)
    return round(capacity_mw * irradiance * noise * 0.85, 3)


def _wind_profile(hour: int, capacity_mw: float) -> float:
    base_cf = 0.35
    variation = 0.2 * math.sin(hour * math.pi / 12)
    noise = random.uniform(-0.05, 0.05)
    cf = max(0, min(1, base_cf + variation + noise))
    return round(capacity_mw * cf, 3)


def _bess_soc_profile(hour: int, hours_back: int) -> float:
    base = 50.0
    diurnal = 20 * math.sin((hour - 6) * math.pi / 12)
    noise = random.uniform(-3, 3)
    soc = max(10, min(95, base + diurnal + noise))
    return round(soc, 1)


def _bess_charge_profile(hour: int, max_kw: float) -> float:
    if 0 <= hour < 6:
        cf = 0.6
    elif 6 <= hour < 9:
        cf = -0.8
    elif 9 <= hour < 16:
        cf = 0.3
    elif 16 <= hour < 21:
        cf = -0.9
    else:
        cf = 0.4
    noise = random.uniform(-0.1, 0.1)
    return max_kw * (cf + noise)
