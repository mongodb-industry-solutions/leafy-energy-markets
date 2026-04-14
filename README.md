# Leafy Energy Markets

An energy trading intelligence platform built on MongoDB, demonstrating Event Sourcing, CQRS, dynamic tariff scenario analysis, real-time telemetry, compliance audit replay, and an AI assistant powered by a LangChain ReAct agent — all wrapped in MongoDB's LeafyGreen UI design system.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│              Next.js 14 Frontend (LeafyGreen UI)                         │
│  /dashboard  /leafy  /audit  /cqrs  /architecture  /telemetry  /evals   │
└──────┬──────────────────────────────┬────────────────────┬───────────────┘
       │                              │                    │
 POST /api/*                    GET /api/*           SSE /api/telemetry
 (Commands)                     (Queries)            /stream
       │                              │                    │
┌──────▼──────────────┐  ┌────────────▼──────────────┐  ┌──▼──────────────┐
│  Command Handlers   │  │     Query Handlers         │  │  Telemetry      │
│ ┌─────────────────┐ │  │ ┌────────────────────────┐ │  │  Load Generator │
│ │ Validate + Exec │ │  │ │ Read from Projections  │ │  │  N async writers│
│ │ Record Event    │ │  │ │ Event Stream Replay    │ │  │  batch inserts  │
│ └────────┬────────┘ │  │ │ fold() reconstruction  │ │  │  metrics SSE    │
└──────────┼──────────┘  │ └───────────▲────────────┘ │  └────────┬───────┘
           │             └─────────────┼──────────────┘           │
           │  insert_one()             │                          │
           │  (append-only)      Change Streams              insert_many()
           │                           │                    (time-series)
┌──────────▼───────────────────────────┼──────────────────────────▼────────┐
│                          MongoDB Atlas                                    │
│                                                                          │
│  ┌──────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐  │
│  │ events (append-only) │  │ Read Model Colls    │  │ telemetry_events│  │
│  │                      │  │                     │  │ (time-series)   │  │
│  │ { streamId, version, │  │ tariff_scenarios    │  │                 │  │
│  │   eventType, payload │  │ instruments         │  │ price_ticks     │  │
│  │   timestamp,         │  │ portfolio_positions │  │ meter_readings  │  │
│  │   metadata }         │  │                     │  │ trades          │  │
│  │                      │  │ Built via Change    │  │                 │  │
│  │ Unique: {streamId,   │  │ Streams from events │  │ From 8 energy   │  │
│  │          version}    │  │                     │  │ originators     │  │
│  └──────────┬───────────┘  └─────────────────────┘  └─────────────────┘  │
│             │                                                             │
│  ┌──────────▼────────────────────────────────────────────────────────┐   │
│  │ market_documents — VoyageAI embeddings (voyage-finance-2, 1024d)  │   │
│  │ Hybrid vector + BM25 text search via Atlas Search                 │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└─────────────┬────────────────────────────────────────────────────────────┘
              │
              │  fold() replay
              │
┌─────────────▼────────────────────────────────────────────────────────────┐
│              Audit & Compliance Layer                                     │
│                                                                          │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────────┐  │
│  │  Event Replay    │ │  Regulatory      │ │  LLM Compliance Audit    │  │
│  │  Engine          │ │  Reporting       │ │                          │  │
│  │                  │ │                  │ │  LangChain ReAct agent   │  │
│  │  fold() rebuilds │ │  REMIT / ACER    │ │  analyzes event streams  │  │
│  │  state at any    │ │  EU 2017/2195    │ │  against EU regulations  │  │
│  │  point in time   │ │  transparency    │ │  with citations          │  │
│  │                  │ │  obligations     │ │                          │  │
│  └──────────────────┘ └──────────────────┘ └──────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

## Features

- **Portfolio Dashboard** — Real-time P&L, positions table, 24-hour MWh exposure chart
- **EnerLeafy AI** — LangChain ReAct advisor with 5 tools: portfolio analysis, hybrid search, market intelligence, generator status, and web search. Powered by Claude (`claude-opus-4-6`) via Azure AI Foundry or Anthropic direct
- **Auditing** — Interactive Event Sourcing showcase with `fold()` replay, time-travel debugging, and 2 pre-built EU compliance scenarios with LLM-powered compliance analysis
- **CQRS** — Visual explainer of the Command/Query Responsibility Segregation pattern used throughout the platform
- **Architecture** — Interactive system diagram visualization
- **VPP (3D)** — Real-time telemetry dashboard with configurable load generator, live event feed from 8 energy originators, throughput/latency charts, and a Three.js globe visualization
- **Evals** — RAGAS evaluation dashboard for assessing RAG pipeline quality (faithfulness, answer relevancy, context precision, context recall)
- **Dark Mode** — Full dark/light theme toggle across all views

## Compliance Scenarios

The platform's Event Sourcing architecture is purpose-built for European energy market compliance, where replaying event history is a regulatory requirement. Each scenario demonstrates how `fold()` replay resolves a real-world dispute or investigation. These scenarios are fully interactive in the **Auditing** tab (`/audit`) — select a scenario, scrub through versions, and watch the aggregate state reconstruct step-by-step.

### 1. Imbalance Settlement Audit

**Regulation**: Electricity Balancing (EU) 2017/2195

European electricity markets operate on 15-minute **Imbalance Settlement Periods (ISPs)**. For each ISP, every Balance Responsible Party (BRP) must demonstrate that their portfolio was in balance. Deviations are settled at the imbalance price — which during scarcity can exceed €10,000/MWh.

**The dispute**: A German BRP receives a settlement statement showing a **12 MW shortfall** at €850/MWh imbalance price (~€2,550 charge). The BRP believes the shortfall is incorrect because a meter correction received after initial settlement was not applied.

**How fold() resolves it**: The event stream contains 7 events — trades, price ticks, meter readings, and a next-day meter correction. By replaying all 7 events, the platform proves the BRP was actually **+0.9 MWh long** (not -12 MW short) once the corrected meter data is applied. Both the original and corrected readings are preserved in the immutable audit trail.

**Key events**: `TradeExecuted`, `MeterReadingRecorded`, `PriceTickRecorded`

[Full scenario details →](docs/scenarios/01-imbalance-settlement-audit.md)

### 2. REMIT Trade Surveillance

**Regulation**: REMIT (EU) 1227/2011

REMIT requires that all energy market participants preserve complete records of trading activity, including cancelled orders. ACER's surveillance algorithms detect potential market manipulation.

**The dispute**: ACER flags a **spoofing pattern** — a trader placed 15 rapid buy orders in 90 seconds driving the price from €72 to €118/MWh, cancelled 12 orders, then sold 120 MW at the inflated price. The price collapsed back to €78 within minutes.

**How fold() resolves it**: In a CRUD system, cancelled orders would be deleted. Event sourcing preserves every order placement and cancellation as separate immutable events. The 8-event stream shows the classic spoofing signature: rapid accumulation → price impact → profit-taking → price collapse. A compliance freeze marker is automatically appended referencing the ACER investigation ID.

**Key events**: `InstrumentListed`, `TradeExecuted`, `PriceTickRecorded`

[Full scenario details →](docs/scenarios/02-remit-trade-surveillance.md)

## AI Advisor (EnerLeafy AI)

The `/leafy` tab runs a LangChain ReAct agent backed by Claude (`claude-opus-4-6`). The agent has access to five tools:

| Tool | Description |
|------|-------------|
| `analyze_portfolio` | Fetches live portfolio positions and P&L from MongoDB |
| `search_policies` | Hybrid vector + BM25 search over regulatory policy documents |
| `search_market_intel` | Hybrid search over market intelligence and ESG reports |
| `get_generator_status` | Checks the telemetry load generator's current state |
| `web_search` | Real-time web search for current market data |

**LLM auto-detection** (`advisor.py::_get_llm()`):
1. Uses Azure AI Foundry if `AZURE_FOUNDRY_API_KEY` + `AZURE_FOUNDRY_ENDPOINT` are set
2. Falls back to Anthropic direct if `ANTHROPIC_API_KEY` is set
3. Expect ~15–30s response times for complex queries

## Telemetry

The VPP (3D) tab (`/telemetry`) demonstrates MongoDB's write performance by simulating energy market event ingestion at configurable throughput. Events flow from 8 realistic European energy originators:

| Originator | Region | Event Types |
|---|---|---|
| Solar Farm Andalusia | ES | Price Ticks, Meter Readings |
| Wind Park North Sea | NL | Price Ticks, Meter Readings |
| Gas Turbine Bavaria | DE | Price Ticks, Trades |
| Hydro Station Nordland | NO | Meter Readings, Trades |
| Nuclear Plant Gravelines | FR | Price Ticks, Meter Readings |
| Offshore Wind Dogger Bank | UK | Price Ticks, Meter Readings |
| Biogas Plant Veneto | IT | Meter Readings, Trades |
| PV Cluster Algarve | PT | Price Ticks, Meter Readings |

**Controls**: Mode toggle (Simulation/Backend), Live Feed toggle, concurrent writers (1–200), events/sec (10–400,000 logarithmic), batch size (1–5,000), event type toggles.

**Visualizations**: Throughput chart (events/sec over time), latency chart (p50/p95/p99), live event feed, Three.js 3D globe showing originator locations.

When the backend + MongoDB are running, events are written to a `telemetry_events` time-series collection. When the backend is unavailable, the frontend falls back to simulated metrics with realistic jitter.

## Tech Stack

| Layer    | Technology                                                            |
| -------- | --------------------------------------------------------------------- |
| Frontend | Next.js 14, React 18, LeafyGreen UI, Emotion CSS, Recharts, Three.js (R3F v8) |
| Backend  | Python 3.12, FastAPI, Pydantic, LangChain ReAct                       |
| LLM      | Claude `claude-opus-4-6` via Azure AI Foundry (primary) or Anthropic direct (fallback) |
| Embeddings | VoyageAI `voyage-finance-2` (1024d) with deterministic hash fallback |
| Evals    | RAGAS (faithfulness, answer relevancy, context precision/recall)      |
| Database | MongoDB Atlas — Event Store, Time-Series, Change Streams, Vector Search |
| Patterns | Domain-Driven Design, Event Sourcing, CQRS                            |

## Data Models & Collections

MongoDB stores data across four primary collections.

### Collections Overview

| Collection | Type | Purpose |
|---|---|---|
| `events` | Standard | Append-only event store for CQRS/ES |
| `telemetry_events` | Time-Series | High-throughput telemetry ingestion |
| `tariff_scenarios` | Standard | Read model projection for scenarios |
| `market_documents` | Standard | Research docs with VoyageAI embeddings for hybrid search |

### `events` Collection (Event Store)

Append-only, immutable event log. Every state change is recorded as an event and replayed via `fold()` to reconstruct aggregate state at any point in time.

```json
{
  "streamId": "string — aggregate ID (e.g. SCENARIO-001)",
  "streamType": "string — e.g. TariffScenario, ImbalanceSettlement",
  "version": "int — monotonic per stream, starts at 1",
  "eventType": "string — e.g. TradeExecuted, MeterReadingRecorded, PriceTickRecorded",
  "timestamp": "ISODate — when the event occurred",
  "payload": { "...event-specific fields (price, quantity, meter reading, etc.)" },
  "metadata": { "schemaVersion": 1 }
}
```

**Unique index**: `{ streamId, version }` — enforces ordering and prevents duplicate writes.
**Access pattern**: Append-only. Events are never updated or deleted. Reads use `streamId` + version range for replay.

### `telemetry_events` Collection (Time-Series)

MongoDB native time-series collection optimized for high-throughput write ingestion from the telemetry load generator. Stores three event types:

```json
// price_tick
{
  "timestamp": "ISODate",
  "event_type": "price_tick",
  "instrument_id": "INST-042",
  "price": 85.50,
  "volume": 250,
  "exchange": "EPEX"
}

// meter_reading
{
  "timestamp": "ISODate",
  "event_type": "meter_reading",
  "meter_id": "MTR-0123",
  "reading_kwh": 12.450,
  "quality": "measured"
}

// trade
{
  "timestamp": "ISODate",
  "event_type": "trade",
  "trade_id": "TRD-456789",
  "instrument_id": "INST-007",
  "price": 72.30,
  "quantity": 100,
  "side": "buy"
}
```

**Time-series config**: `timeField=timestamp`, `metaField=event_type`, `granularity=seconds`.
**Access pattern**: Bulk `insert_many()` from concurrent writers. Reads are time-range queries for dashboards and aggregation pipelines.

### `tariff_scenarios` Collection (Read Model)

Materialized read model built from event projections via Change Streams. Stores the current state of tariff scenario aggregates.

```json
{
  "_id": "ObjectId",
  "portfolio_id": "string — e.g. PORTFOLIO-123",
  "region": "string — e.g. NORTH, SOUTH, CENTRAL",
  "from_date": "ISODate — scenario start",
  "to_date": "ISODate — scenario end",
  "status": "string — created | running | completed",
  "createdAt": "ISODate"
}
```

### `market_documents` Collection (Vector Search)

Research documents, ESG reports, and market intelligence with VoyageAI embeddings for hybrid search.

```json
{
  "_id": "ObjectId",
  "title": "string",
  "content": "string — full document text",
  "doc_type": "string — research | esg | asset",
  "embedding": "[float × 1024] — voyage-finance-2 vector",
  "metadata": { "source": "...", "date": "ISODate" }
}
```

**Access pattern**: Hybrid Atlas Search (vector similarity + BM25 text) with reciprocal rank fusion.

## Prerequisites

- **Node.js** 18+
- **Python** 3.12
- **MongoDB Atlas** instance (local or Atlas)

## Quick Start

### Option 1: One-Command Demo (Recommended)

```bash
./start-demo.sh
```

This will:
- Automatically activate the Python 3.12 virtual environment
- Install dependencies if needed
- Start both backend and frontend servers
- Show you the URLs to access the demo

**Alternative scripts:**
- `./start-backend.sh` — Start backend only (port 8000)
- `./start-frontend.sh` — Start frontend only (port 3000)

**Logs:**
```bash
tail -f /tmp/leafy-backend.log
tail -f /tmp/leafy-frontend.log
```

### Option 2: Manual Setup

#### 1. Clone and configure

```bash
git clone <repo-url> && cd leafy-energy-markets
cp deploy/env.example deploy/.env
```

Edit `deploy/.env` with your credentials:

```bash
MONGO_URI=mongodb+srv://...
ANTHROPIC_API_KEY=sk-ant-...          # OR use Azure Foundry below
AZURE_FOUNDRY_API_KEY=...             # Primary LLM provider (optional)
AZURE_FOUNDRY_ENDPOINT=https://...    # Azure AI Foundry endpoint (optional)
VOYAGE_API_KEY=...                    # Optional — falls back to hash embeddings
```

#### 2. Start the backend

```bash
python3.12 -m venv venv
source venv/bin/activate
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app redirects to the Dashboard.

### Alternative: Docker Compose

```bash
cd deploy
docker-compose up
```

Frontend at `http://localhost:3000`, backend at `http://localhost:8000`.

## Running the Demo

The frontend works with mock data even when the backend is not running. When the backend is available, the AI advisor, telemetry generator, and compliance analysis use real API calls and MongoDB.

### Demo walkthrough

1. **Dashboard** — Opens by default. Browse portfolio summary cards, positions table, and 24-hour exposure chart.

2. **EnerLeafy AI** — Click "EnerLeafy AI" in the sidebar. Pick a suggested prompt or ask your own question. The LangChain ReAct agent uses its tool suite to analyze your portfolio, search policies, and retrieve market intelligence. Expect ~15–30s for complex queries.

3. **Auditing** — Click "Auditing" in the sidebar.
   - Select one of the 2 compliance scenarios (Imbalance Settlement, REMIT Surveillance).
   - The event timeline loads on the left, aggregate state (result of `fold()`) on the right.
   - Use the **replay slider** to scrub through versions — watch the state reconstruct at each step.
   - Click **"Analyze with AI"** to trigger LLM compliance analysis against the applicable EU regulation.

4. **CQRS** — Visual explainer of how Commands and Queries are separated in this architecture.

5. **Architecture** — Interactive system diagram showing all components and data flows.

6. **VPP (3D)** — Click "VPP" in the sidebar.
   - Adjust sliders: concurrent writers, events/sec, batch size.
   - Toggle event types (Price Ticks, Meter Readings, Trades).
   - Click **"Start Generator"** → metric cards update, charts populate, live event feed scrolls with events from 8 European energy originators.
   - Click **"Stop Generator"** → stream stops, charts freeze.

7. **Evals** — Click "Evals" in the sidebar. Click **"Run Evaluation"** to trigger a RAGAS evaluation run against the RAG pipeline. Results display faithfulness, answer relevancy, context precision, and context recall scores.

8. **Dark Mode** — Toggle at the bottom of the sidebar.

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx              # Root layout with Providers + AppShell
│   ├── page.tsx                # Redirects to /dashboard
│   ├── dashboard/page.tsx      # Portfolio dashboard
│   ├── leafy/page.tsx          # EnerLeafy AI advisor chat
│   ├── audit/page.tsx          # Auditing / Event Inspector / compliance replay
│   ├── cqrs/page.tsx           # CQRS pattern explainer
│   ├── architecture/page.tsx   # System architecture diagram
│   ├── telemetry/page.tsx      # Real-time telemetry + Three.js VPP globe
│   ├── evals/page.tsx          # RAGAS evaluation dashboard
│   ├── scenarios/
│   │   ├── page.tsx            # Scenario builder + list
│   │   └── [scenarioId]/page.tsx  # Scenario detail
│   └── search/page.tsx         # Market intelligence search
├── components/
│   ├── AppShell.tsx            # SideNav + content layout
│   ├── Providers.tsx           # LeafyGreen + dark mode context
│   ├── EmotionRegistry.tsx     # SSR style injection for Emotion
│   ├── shared/                 # PageHeader, MetricCard, LoadingState, ErrorBanner
│   ├── dashboard/              # PortfolioSummaryCards, PositionsTable, ExposureChart
│   ├── scenarios/              # ScenarioForm, ScenarioList, ScenarioComparison, PnLBreakdown
│   ├── search/                 # SearchBar, SearchFilters, SearchResults
│   ├── leafy/                  # ChatContainer, ChatMessage, ChatInput, SuggestedPrompts, SourceCitation
│   ├── telemetry/              # ControlPanel, TelemetryMetricCards, ThroughputChart, LatencyChart, EventFeed
│   └── audit/                  # EventTimeline, AggregateStateView, ReplayControls, EventCard
└── lib/
    ├── types.ts                # Shared TypeScript interfaces
    ├── api.ts                  # Typed fetch client for backend endpoints
    ├── mock-data.ts            # Realistic mock data for all views
    ├── generator-context.tsx   # Telemetry generator state + controls
    └── compliance-scenarios.ts # Pre-built EU compliance scenario event streams

backend/
├── app/
│   ├── main.py                 # FastAPI entrypoint + CORS
│   ├── api/
│   │   ├── advisor.py          # LangChain ReAct advisor + _get_llm() auto-detect
│   │   ├── audit.py            # LLM compliance analysis endpoint
│   │   ├── commands.py         # POST endpoints (create scenario, seed demo)
│   │   ├── queries.py          # GET endpoints (scenario, event streams, replay)
│   │   ├── search.py           # Hybrid vector + text search
│   │   ├── telemetry.py        # Telemetry load generator + SSE streaming
│   │   └── evals.py            # RAGAS evaluation runner
│   ├── domain/
│   │   ├── commands.py         # Command models
│   │   ├── events.py           # Domain events
│   │   └── aggregates.py       # Aggregate roots + fold()
│   ├── infrastructure/
│   │   ├── event_store.py      # MongoDB event store + replay APIs
│   │   └── embeddings.py       # VoyageAI client with hash fallback
│   └── projections/
│       └── tariff_scenarios.py # Change stream projections
└── requirements.txt
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/portfolios/{id}/tariff-scenarios` | Create a tariff scenario |
| POST | `/api/demo/seed-scenario` | Seed demo imbalance settlement events |
| GET | `/api/tariff-scenarios/{id}` | Get a scenario by ID |
| GET | `/api/events/streams` | List all event streams |
| GET | `/api/events/stream/{id}` | Get events for a stream |
| GET | `/api/events/stream/{id}/replay` | Step-by-step fold() replay |
| POST | `/api/advisor` | LangChain ReAct advisor (SSE) |
| POST | `/api/audit/analyze` | LLM compliance audit analysis |
| POST | `/api/search` | Hybrid vector + BM25 text search |
| POST | `/api/telemetry/start` | Start telemetry load generator |
| POST | `/api/telemetry/stop` | Stop telemetry load generator |
| GET | `/api/telemetry/stream` | SSE stream of real-time metrics |
| POST | `/api/telemetry/events` | Ingest batch of telemetry events |
| GET | `/api/telemetry/status` | Get generator status and metrics |
| GET | `/api/dashboard/stream` | SSE stream of portfolio snapshots |
| GET | `/api/dashboard/snapshot` | One-shot portfolio snapshot |
| GET | `/api/scenarios/stream` | SSE stream of scenario P&L projections |
| POST | `/api/evals/run` | Trigger a RAGAS evaluation run |
| GET | `/api/evals/status` | Get current evaluation status |
| GET | `/api/evals/results` | Fetch recent evaluation runs |
| GET | `/api/evals/results/latest` | Fetch latest run with per-question breakdown |

## Common Pitfalls

- **409 on telemetry start**: stale generator running — `POST /api/telemetry/stop` first, or restart backend
- **LLM timeout**: Azure Foundry responses can take 15–30s; `next.config.js` sets 180s proxy timeout — do not lower
- **npm install fails**: always run inside `frontend/` — `legacy-peer-deps=true` in `.npmrc` is required for React 18 + Three.js R3F coexistence; do not remove it
- **Embeddings return wrong dimensions**: `VOYAGE_API_KEY` missing → hash fallback active (expected; 1024-dim shape preserved)
- **Backend won't start**: check `deploy/.env` exists with `MONGO_URI` set; venv must be Python 3.12
- **Azure Foundry 404**: the endpoint in `deploy/.env` must not end with `/anthropic` — the SDK appends this automatically

## Testing

```bash
# Backend unit tests
cd backend && pytest

# Frontend production build check
cd frontend && npm run build

# Lint
cd frontend && npm run lint
```
