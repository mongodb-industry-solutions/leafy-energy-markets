# Leafy Energy Markets

A European renewable energy trading platform built on MongoDB Atlas, demonstrating Event Sourcing, CQRS, real-time fleet telemetry, EU compliance auditing, and an AI-powered trading advisor — all wrapped in MongoDB's LeafyGreen UI design system.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│              Next.js 14 Frontend (LeafyGreen UI)                         │
│  /dashboard  /leafy  /audit  /cqrs  /architecture                       │
└──────┬──────────────────────────────┬────────────────────┬───────────────┘
       │                              │                    │
 POST /api/*                    GET /api/*           SSE /api/trading
 (Commands)                     (Queries)            /stream (1s)
       │                              │                    │
┌──────▼──────────────┐  ┌────────────▼──────────────┐  ┌──▼──────────────┐
│  Command Handlers   │  │     Query Handlers         │  │  Trading        │
│ ┌─────────────────┐ │  │ ┌────────────────────────┐ │  │  Simulator      │
│ │ Validate + Exec │ │  │ │ Read from Projections  │ │  │  8 EU assets    │
│ │ Record Event    │ │  │ │ Event Stream Replay    │ │  │  1s tick loop   │
│ └────────┬────────┘ │  │ │ fold() reconstruction  │ │  │  weather/trade  │
└──────────┼──────────┘  │ └───────────▲────────────┘ │  └────────┬───────┘
           │             └─────────────┼──────────────┘           │
           │  insert_one()             │                          │
           │  (append-only)      Change Streams              SSE broadcast
           │                           │                    (full state/1s)
┌──────────▼───────────────────────────┼──────────────────────────────────┐
│                          MongoDB Atlas                                    │
│                                                                          │
│  ┌──────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐  │
│  │ events (append-only) │  │ Read Model Colls    │  │ advisor_        │  │
│  │                      │  │                     │  │ interactions    │  │
│  │ { streamId, version, │  │ tariff_scenarios    │  │ (agent memory)  │  │
│  │   eventType, payload │  │                     │  │                 │  │
│  │   timestamp,         │  │ Built via Change    │  │                 │  │
│  │   metadata }         │  │ Streams from events │  │                 │  │
│  └──────────┬───────────┘  └─────────────────────┘  └─────────────────┘  │
│             │                                                             │
│  ┌──────────▼────────────────────────────────────────────────────────┐   │
│  │ market_documents — VoyageAI embeddings (voyage-finance-2, 1024d)  │   │
│  │ Hybrid vector + BM25 text search via Atlas Search                 │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

## Features

- **Trading Dashboard** — Real-time fleet monitoring with 8 European energy assets (wind, solar, hydro, gas, battery, biomass). Position gap tracking (committed vs forecast with percentages), live market prices across Day-Ahead, Intraday, and Flexibility channels, capacity allocation with one-click trade execution, and a Revenue Tracker showing captured revenue vs daily target with per-asset-type breakdown.
- **EnerLeafy AI** — LangChain ReAct advisor with 6 tools: fleet analysis, policy search, market intelligence, generator status, energy news, and web search. Powered by Claude (`claude-sonnet-4-6`) via Azure AI Foundry or Anthropic direct. Fleet asset map with live European positions and Iberian storm weather alert simulation.
- **Auditing** — Imbalance Settlement scenario with `fold()` replay using actual fleet assets (Hollandse Kust Wind, Rhine CCGT, Rotterdam BESS). Step-by-step event replay against EU 2017/2195. LLM-powered compliance analysis.
- **CQRS** — Visual explainer of the Command/Query Responsibility Segregation pattern: why CQRS for energy compliance, key properties, sequence diagrams, and code walkthroughs.
- **Architecture** — Interactive container diagram with clickable tiles and explanation panels, embedding model benchmark comparison (voyage-finance-2 vs OpenAI, Cohere, BAAI), and planned RAG data sources (ENTSO-E, ACER REMIT, EU ETS, ECMWF, PPA reports, TSO balancing).
- **Dark Mode** — Full dark/light theme toggle across all views.
- **Landing Page** — Premium branding with editorial serif typography, animated energy source icons, and live market ticker.

## Fleet Assets

The trading simulator manages 8 European energy assets streaming real-time telemetry at 1-second cadence:

| Asset | Type | Region | Capacity |
|-------|------|--------|----------|
| Hollandse Kust Wind | Wind | NL | 200 MW |
| Hornsea Wind Farm | Wind | UK | 150 MW |
| Algarrobico Solar | Solar | ES | 180 MW |
| Sines Solar Park | Solar | PT | 120 MW |
| Nordland Hydro | Hydro | NO | 300 MW |
| Rhine CCGT | Gas | DE | 400 MW |
| Rotterdam BESS | Battery | NL | 50 MW |
| Gironde Biomass | Biomass | FR | 80 MW |

## Event Streams & Schemas

All events are stored in per-asset **time series collections** with `timeField: timestamp`, `metaField: streamType`, `granularity: seconds`, and a 7-day TTL. Each event follows this base structure:

```json
{
  "streamId": "ASSET-WIND-NL-001",
  "streamType": "AssetTelemetry | WeatherForecast | TradingPosition",
  "eventType": "MeterReadingRecorded",
  "timestamp": "2026-05-06T10:15:00.000Z",
  "payload": { ... },
  "metadata": { "source": "trading-simulator", "schemaVersion": 1 }
}
```

### Stream: AssetTelemetry

Events from SCADA/RTU sensor readings per asset. `streamId` = asset ID.

**MeterReadingRecorded** — per-asset output reading (1-2 per tick)

| Field | Type | Description |
|-------|------|-------------|
| `assetId` | string | Asset identifier (e.g. `ASSET-WIND-NL-001`) |
| `assetType` | string | `wind` / `solar` / `hydro` / `gas` / `battery` / `biomass` |
| `assetName` | string | Human-readable name |
| `region` | string | ISO country code (`NL`, `UK`, `ES`, `PT`, `NO`, `DE`, `FR`) |
| `readingKwh` | float | Energy reading for the interval |
| `currentOutputMw` | float | Current output in MW |
| `forecastOutputMw` | float | Forecast output in MW |
| `varianceMw` | float | Actual minus forecast |
| `capacityMw` | float | Nameplate capacity |
| `utilizationPct` | float | Current utilization % |
| `status` | string | `online` / `curtailed` / `offline` |
| `quality` | string | `good` / `questionable` |

**PerformanceVarianceDetected** — when actual vs forecast exceeds 10% of capacity

| Field | Type | Description |
|-------|------|-------------|
| `assetId` | string | Asset identifier |
| `actualMw` | float | Actual output |
| `forecastMw` | float | Forecast output |
| `variancePct` | float | Variance as % of capacity |
| `severity` | string | `info` / `warning` |

### Stream: WeatherForecast

Weather and forecast updates. `streamId` = `WEATHER-{region}`.

**WindForecastUpdated** — wind forecast change from ECMWF

| Field | Type | Description |
|-------|------|-------------|
| `assetId` | string | Affected wind asset |
| `region` | string | ISO country code |
| `forecastDeltaPct` | float | Change in forecast (%) |
| `updatedForecastMw` | float | New forecast MW |
| `previousForecastMw` | float | Previous forecast MW |
| `windSpeedMs` | float | Wind speed in m/s |
| `source` | string | Forecast source (`ECMWF`) |

**SolarIrradianceForecastUpdated** — solar irradiance forecast change

| Field | Type | Description |
|-------|------|-------------|
| `assetId` | string | Affected solar asset |
| `region` | string | ISO country code |
| `forecastDeltaPct` | float | Change in forecast (%) |
| `updatedForecastMw` | float | New forecast MW |
| `irradianceWm2` | float | Solar irradiance W/m² |
| `cloudCoverPct` | float | Cloud cover % |
| `source` | string | Forecast source (`SolarEdge-NWP`) |

**WeatherAlertIssued** — severe weather alert for a region

| Field | Type | Description |
|-------|------|-------------|
| `region` | string | Affected region |
| `severity` | string | `advisory` / `warning` / `critical` |
| `curtailmentRequired` | boolean | Whether generation must be curtailed |
| `description` | string | Alert description |
| `validUntil` | string | ISO datetime when alert expires |

### Stream: TradingPosition

Portfolio and trading events. `streamId` = `PORTFOLIO-001`.

**PositionGapDetected** — gap exceeds threshold (>50 MWh)

| Field | Type | Description |
|-------|------|-------------|
| `committedMwh` | float | Total committed |
| `forecastMwh` | float | Total forecast |
| `gapMwh` | float | Gap (forecast - committed) |
| `gapType` | string | `surplus` / `shortfall` / `balanced` |
| `severity` | string | `info` / `warning` / `critical` |
| `recommendedAction` | string | Suggested trader action |
| `bestAvailablePriceEurMwh` | float | Best channel price |
| `estimatedImpactEur` | float | Financial impact estimate |

**TradeExecuted** — trade executed on a market channel

| Field | Type | Description |
|-------|------|-------------|
| `tradeId` | string | Unique trade ID |
| `side` | string | `buy` / `sell` |
| `quantityMwh` | float | Trade quantity |
| `priceEurMwh` | float | Execution price EUR/MWh |
| `revenueEur` | float | Trade revenue |
| `marketChannel` | string | `dayAhead` / `intraday` / `flexibility` |
| `executionType` | string | `manual` / `algorithmic` |
| `counterparty` | string | Exchange ID (e.g. `EPEX-DA`) |

**PnlSnapshotRecorded** — periodic revenue snapshot (every 5s)

| Field | Type | Description |
|-------|------|-------------|
| `realisedPnlEur` | float | Total captured revenue |
| `fleetGenerationValueEur` | float | Hourly fleet value at best price |
| `dailyTargetEur` | float | Daily revenue target |
| `progressPct` | float | Progress toward target (%) |
| `byAssetType` | object | Per-type breakdown (outputMw, forecastMw, hourlyValueEur) |
| `bestPriceEurMwh` | float | Best available channel price |

**CapacityAllocationSet** — trader allocates capacity for an asset type

| Field | Type | Description |
|-------|------|-------------|
| `assetType` | string | Asset type allocated |
| `targetMwh` | float | Target allocation MWh |
| `marketChannel` | string | Selected channel |
| `priceFloorEur` | float | Minimum acceptable price |
| `currentPriceEurMwh` | float | Channel price at allocation time |
| `updatedCommittedMwh` | float | New total committed |
| `updatedGapMwh` | float | New position gap |
| `gapType` | string | `surplus` / `shortfall` / `balanced` |

## Revenue Model

The dashboard tracks three key revenue metrics:

- **Fleet Generation Value (€/hr)** — Current fleet output multiplied by the best available market price. Represents the hourly revenue opportunity if all generation were sold at the best channel right now. Updates every 5 seconds.
- **Captured Revenue** — Actual revenue from executed trades. When the trader allocates capacity and clicks "Trade", a sell order is executed at the selected channel's price and the revenue is recorded immediately.
- **Daily Target** — Derived from fleet capacity at startup: `total capacity × 70% avg utilisation × avg market price × 8h trading window`. The progress bar shows how much of today's revenue potential has been captured through trades.

The gap between Fleet Generation Value and Captured Revenue tells the trader how much revenue is being left on the table.

## Compliance Scenario

### Imbalance Settlement Audit

**Regulation**: Electricity Balancing (EU) 2017/2195

European electricity markets operate on 15-minute Imbalance Settlement Periods (ISPs). The scenario demonstrates how `fold()` replay resolves a real-world dispute using actual fleet assets.

**The story**: Wind forecast updated for Hollandse Kust Wind (NL), BRP committed based on old forecast, actual output exceeded commitment creating a surplus, TSO incorrectly charged imbalance, dispute filed and corrected via event replay.

**Key events**: `WindForecastUpdated`, `CapacityAllocationSet`, `MeterReadingRecorded`, `PositionGapDetected`, `TradeExecuted`

## AI Advisor (EnerLeafy AI)

The `/leafy` tab runs a LangChain ReAct agent backed by Claude (`claude-sonnet-4-6`). The agent receives live context from the trading simulator:

**Context provided**:
- Fleet assets: output, forecast, variance, utilisation per asset
- Live market prices: Day-Ahead, Intraday, Flexibility channels
- Portfolio state: committed vs forecast, gap type, captured revenue, fleet generation value
- Weather & performance events: wind/solar forecast changes, alerts, variance

**Tools**:

| Tool | Description |
|------|-------------|
| `analyze_portfolio` | Fleet output by type, live prices, position gap, revenue, weather events |
| `get_generator_status` | Per-asset breakdown of output, forecast, variance |
| `search_policies` | Hybrid vector + BM25 search over EU/IEA policy documents |
| `search_market_intel` | Hybrid search over market intelligence and ESG reports |
| `get_energy_news` | Latest energy market headlines via DuckDuckGo |
| `web_search` | Real-time web search for current market data |

**Weather Alert Simulation**: Trigger an Iberian storm (ES/PT solar drops to <20%) to test agent recommendations under stress.

**LLM auto-detection** (`advisor.py::_get_llm()`):
1. Uses Azure AI Foundry if `AZURE_FOUNDRY_API_KEY` + `AZURE_FOUNDRY_ENDPOINT` are set
2. Falls back to Anthropic direct if `ANTHROPIC_API_KEY` is set

## Embedding Model: Voyage Finance-2

The platform uses VoyageAI's `voyage-finance-2` (1024 dimensions) for all document embeddings, chosen for:

- **Domain specialization**: Fine-tuned on financial/energy corpus — understands REMIT, EU ETS, PPA structures
- **Superior retrieval**: +4.3 nDCG@10 vs OpenAI text-embedding-3-large on financial benchmarks
- **Cost efficient**: 1024d vs 3072d (OpenAI large) = 3x less vector storage in Atlas

See the Architecture tab → Embedding Model for full benchmark comparison.

## Tech Stack

| Layer    | Technology |
| -------- | ---------- |
| Frontend | Next.js 14, React 18, LeafyGreen UI, Emotion CSS, react-leaflet |
| Backend  | Python 3.12, FastAPI, Pydantic, LangChain ReAct |
| LLM      | Claude `claude-sonnet-4-6` via Azure AI Foundry or Anthropic direct |
| Embeddings | VoyageAI `voyage-finance-2` (1024d) |
| Database | MongoDB Atlas — Event Store, Vector Search, Change Streams |
| Patterns | Domain-Driven Design, Event Sourcing, CQRS |

## Quick Start

### Docker (Recommended)

```bash
cp .env.example .env
# Edit .env with MONGO_URI and ANTHROPIC_API_KEY
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). See [HOWTO.md](HOWTO.md) for full Docker instructions.

### Local Development

```bash
./start-demo.sh
```

Or manually:

```bash
cp deploy/env.example deploy/.env
# Edit deploy/.env with your credentials

# Backend
python3.12 -m venv venv && source venv/bin/activate
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/trading/state` | Current trading simulator state |
| POST | `/api/trading/start` | Start trading simulation |
| POST | `/api/trading/stop` | Stop trading simulation |
| GET | `/api/trading/stream` | SSE stream (full state every 1s) |
| POST | `/api/trading/allocations` | Set allocation + execute trade |
| POST | `/api/trading/weather-alert/iberian-storm` | Trigger Iberian storm scenario |
| POST | `/api/advisor/stream` | AI advisor (SSE streaming) |
| POST | `/api/audit/analyze` | LLM compliance analysis |
| POST | `/api/search/hybrid` | Hybrid vector + BM25 search |
| GET | `/api/events/stream/{id}` | Get events for a stream |
| GET | `/api/events/stream/{id}/replay` | Step-by-step fold() replay |

## Common Pitfalls

- **LLM timeout**: Azure Foundry responses can take 15–30s; `next.config.js` sets 180s proxy timeout
- **npm install fails**: `legacy-peer-deps=true` in `.npmrc` is required for React 18 compatibility
- **Backend won't start**: check `deploy/.env` exists with `MONGO_URI` set; venv must be Python 3.12
- **Azure Foundry 404**: endpoint must not end with `/anthropic` — the SDK appends it automatically
