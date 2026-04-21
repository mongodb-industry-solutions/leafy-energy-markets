# Leafy Energy Markets

A European renewable energy trading platform built on MongoDB Atlas, demonstrating Event Sourcing, CQRS, real-time fleet telemetry, EU compliance auditing, and an AI-powered trading advisor — all wrapped in MongoDB's LeafyGreen UI design system.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│              Next.js 14 Frontend (LeafyGreen UI)                         │
│  /dashboard  /leafy  /audit  /cqrs  /architecture  /evals               │
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
│  │ events (append-only) │  │ Read Model Colls    │  │ rag_evals       │  │
│  │                      │  │                     │  │ (RAGAS results) │  │
│  │ { streamId, version, │  │ tariff_scenarios    │  │                 │  │
│  │   eventType, payload │  │                     │  │ advisor_        │  │
│  │   timestamp,         │  │ Built via Change    │  │ interactions    │  │
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

- **Trading Dashboard** — Real-time fleet monitoring with 8 European energy assets (wind, solar, hydro, gas, battery, biomass). Position gap tracking, live market prices (Day-Ahead, Intraday, Flexibility), capacity allocation, one-click trade execution, and P&L tracking with per-asset-type breakdown.
- **EnerLeafy AI** — LangChain ReAct advisor with 7 tools: fleet analysis, policy search, market intelligence, generator status, energy prices (EIA), energy news, and web search. Powered by Claude (`claude-sonnet-4-6`) via Azure AI Foundry or Anthropic direct. Fleet asset map with live positions and weather alert simulation.
- **Auditing** — Imbalance Settlement scenario with `fold()` replay using actual fleet assets (Hollandse Kust Wind, Rhine CCGT, Rotterdam BESS). Step-by-step event replay against EU 2017/2195. LLM-powered compliance analysis.
- **CQRS** — Visual explainer of the Command/Query Responsibility Segregation pattern used throughout the platform.
- **Architecture** — Container Diagram (C2) and Embedding Model comparison (voyage-finance-2 benchmarks vs OpenAI, Cohere, BAAI).
- **Evals** — RAGAS evaluation dashboard for assessing RAG pipeline quality (faithfulness, answer relevancy, context precision, context recall).
- **Dark Mode** — Full dark/light theme toggle across all views.
- **Landing Page** — Premium branding with editorial serif typography, animated energy source icons, and market ticker.

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

**Event types**: `MeterReadingRecorded`, `PerformanceVarianceDetected`, `WindForecastUpdated`, `SolarIrradianceForecastUpdated`, `WeatherAlertIssued`, `PositionGapDetected`, `TradeExecuted`, `PnlSnapshotRecorded`, `CapacityAllocationSet`

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
- Portfolio state: committed vs forecast, gap type, realised/unrealised P&L
- Weather & performance events: wind/solar forecast changes, alerts, variance

**Tools**:

| Tool | Description |
|------|-------------|
| `analyze_portfolio` | Fleet output by type, live prices, position gap, P&L, weather events |
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

### One-Command Demo

```bash
./start-demo.sh
```

Starts backend (port 8000) + frontend (port 3000). Logs: `tail -f /tmp/leafy-backend.log`

### Manual Setup

```bash
# Configure
cp deploy/env.example deploy/.env
# Edit deploy/.env with MONGO_URI, ANTHROPIC_API_KEY or AZURE_FOUNDRY_*, VOYAGE_API_KEY

# Backend
python3.12 -m venv venv && source venv/bin/activate
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Docker

```bash
cp deploy/env.example deploy/.env
# Edit deploy/.env with your credentials
cd deploy && docker compose up --build
```

Frontend at `http://localhost:3000`, backend at `http://localhost:8000`.

See [HOWTO.md](HOWTO.md) for full Docker instructions and troubleshooting.

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
| POST | `/api/evals/run` | Trigger RAGAS evaluation |
| GET | `/api/evals/results` | Fetch evaluation results |
| GET | `/api/events/stream/{id}` | Get events for a stream |
| GET | `/api/events/stream/{id}/replay` | Step-by-step fold() replay |

## Common Pitfalls

- **LLM timeout**: Azure Foundry responses can take 15–30s; `next.config.js` sets 180s proxy timeout
- **npm install fails**: `legacy-peer-deps=true` in `.npmrc` is required for React 18 compatibility
- **Backend won't start**: check `deploy/.env` exists with `MONGO_URI` set; venv must be Python 3.12
- **Azure Foundry 404**: endpoint must not end with `/anthropic` — the SDK appends it automatically
