# Leafy Energy Markets

An energy trading intelligence platform built on MongoDB, demonstrating Event Sourcing, CQRS, dynamic tariff scenario analysis, real-time telemetry, compliance audit replay, and an AI assistant — all wrapped in MongoDB's LeafyGreen UI design system.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│              Next.js 14 Frontend (LeafyGreen UI)                         │
│  /dashboard  /scenarios  /search  /leafy  /telemetry  /audit            │
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
│                          MongoDB                                         │
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
└─────────────┼────────────────────────────────────────────────────────────┘
              │
              │  fold() replay
              │
┌─────────────▼────────────────────────────────────────────────────────────┐
│              Audit & Compliance Layer                                     │
│                                                                          │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────────┐  │
│  │  Event Replay    │ │  Regulatory      │ │  Dispute Resolution      │  │
│  │  Engine          │ │  Reporting       │ │                          │  │
│  │                  │ │                  │ │  Side-by-side replay     │  │
│  │  fold() rebuilds │ │  REMIT / ACER    │ │  with alternative       │  │
│  │  state at any    │ │  ENTSO-E / CACM  │ │  parameters              │  │
│  │  point in time   │ │  transparency    │ │                          │  │
│  │                  │ │  obligations     │ │  Time-travel debugging   │  │
│  └──────────────────┘ └──────────────────┘ └──────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

## Features

- **Portfolio Dashboard** — Real-time P&L, positions table, 24-hour MWh exposure chart
- **Scenario Builder** — Create tariff scenarios via real API, one-click demo comparing flat vs dynamic tariffs with P&L charts
- **Market Intelligence** — Search research reports, ESG assessments, and asset data with type filtering
- **Leafy Chat** — AI assistant with suggested prompts, source citations, and pre-scripted demo flow
- **Telemetry** — Real-time MongoDB write performance dashboard with configurable load generator, live event feed from 8 energy originators across Europe, throughput/latency charts
- **Event Inspector** — Interactive Event Sourcing showcase with fold() replay, time-travel debugging, and 4 pre-built EU compliance scenarios
- **Dark Mode** — Full dark/light theme toggle across all views

## Compliance Scenarios

The platform's Event Sourcing architecture is purpose-built for European energy market compliance, where replaying event history is a regulatory requirement. Each scenario demonstrates how `fold()` replay resolves a real-world dispute or investigation. These scenarios are fully interactive in the **Event Inspector** (`/audit`) — select any scenario, scrub through versions, and watch the aggregate state reconstruct step-by-step.

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

### 3. Flexibility Market Clearing

**Regulation**: Electricity Directive 2019/944

The EU Electricity Directive establishes aggregators' right to participate in flexibility markets, where DSOs procure load reduction to resolve grid congestion. The core challenge is **delivery verification**: comparing actual consumption against a counterfactual baseline.

**The dispute**: An aggregator ("FlexCo") contracted 5 MW load reduction. The DSO's Method A (10-day average baseline) measures only **3.2 MW** → under-delivery penalty. FlexCo's Method B (regression-adjusted baseline) shows **4.8 MW** → within tolerance.

**How fold() resolves it**: Both verification events coexist in the same stream. The measured consumption (5.2 MW) is identical in both — the disagreement is entirely in the baseline methodology. By replaying the same meter readings through both baselines, the platform provides an auditable side-by-side comparison for regulatory arbitration.

**Key events**: `FlexibilityBidSubmitted`, `FlexibilityActivated`, `MeterReadingRecorded`, `FlexibilityDeliveryVerified`

[Full scenario details →](docs/scenarios/03-flexibility-market-clearing.md)

### 4. Cross-Border Capacity Allocation

**Regulation**: CACM (EU) 2015/1222

Cross-border electricity capacity is allocated through the Euphemia algorithm in the Single Day-Ahead Coupling (SDAC). When transmission is constrained, the algorithm calculates optimal flows, clearing prices, and congestion revenue distribution. Market participants who are curtailed have the right to audit the entire process.

**The dispute**: A French industrial consumer requested 500 MW cross-border (DE→FR) but was curtailed to **350 MW** due to a binding constraint on the Vigy-Uchtelfangen line. The consumer challenges the curtailment.

**How fold() resolves it**: The 8-event stream contains both TSOs' flow-based parameter submissions, the Euphemia clearing results, congestion revenue distribution, and the curtailment notification. By replaying with modified parameters (e.g., "What if Amprion had submitted RAM=2,200 MW instead of 1,850?"), the platform enables transparent what-if analysis for infrastructure investment discussions.

**Key events**: `CrossBorderFlowRecorded`, `CapacityAllocationRequested`, `PriceTickRecorded`, `CongestionRevenueDistributed`, `TradeExecuted`

[Full scenario details →](docs/scenarios/04-cross-border-capacity-allocation.md)

## Telemetry

The Telemetry page (`/telemetry`) demonstrates MongoDB's write performance by simulating energy market event ingestion at configurable throughput. Events flow from 8 realistic European energy originators:

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

**Visualizations**: Throughput chart (events/sec over time), latency chart (p50/p95/p99), live event feed showing individual events from each originator.

When the backend + MongoDB are running, events are written to a `telemetry_events` time-series collection. When the backend is unavailable, the frontend falls back to simulated metrics with realistic jitter.

## Tech Stack

| Layer    | Technology                                                 |
| -------- | ---------------------------------------------------------- |
| Frontend | Next.js 14, React 18, LeafyGreen UI, Emotion CSS, Recharts |
| Backend  | Python, FastAPI, Pydantic                                  |
| Database | MongoDB (Event Store, Time-Series, Change Streams, Projections) |
| Patterns | Domain-Driven Design, Event Sourcing, CQRS                 |

## Data Models & Collections

MongoDB stores data across three primary collections, each using a different collection type suited to its access pattern.

### Collections Overview

| Collection | Type | Purpose |
|---|---|---|
| `events` | Standard | Append-only event store for CQRS/ES |
| `telemetry_events` | Time-Series | High-throughput telemetry ingestion |
| `tariff_scenarios` | Standard | Read model projection for scenarios |

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

**Access pattern**: Created by command handlers, queried by the scenario list and detail views. Status updated via Change Stream projections as events flow through the event store.

## Prerequisites

- **Node.js** 18+
- **Python** 3.10+
- **MongoDB** instance (local or Atlas)

## Quick Start

### Option 1: One-Command Demo (Recommended)

The easiest way to run the demo locally:

```bash
./start-demo.sh
```

This will:
- Automatically activate the Python 3.12 virtual environment
- Install dependencies if needed
- Start both backend and frontend servers
- Show you the URLs to access the demo

**Alternative scripts:**
- `./start-backend.sh` - Start backend only (port 8000)
- `./start-frontend.sh` - Start frontend only (port 3000)

### Option 2: Manual Setup

#### 1. Clone and configure

```bash
git clone <repo-url> && cd leafy-energy-markets
cp deploy/env.example .env
```

Edit `.env` and set your `MONGO_URI` (the other keys are optional for the demo).

#### 2. Start the backend

```bash
# Create virtual environment with Python 3.12
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

The frontend works fully with mock data even if the backend is not running. When the backend is available, the Scenario Builder makes real API calls and Telemetry writes to MongoDB.

### Demo walkthrough

1. **Dashboard** — Opens by default. Browse the portfolio summary cards, scroll through the 14 mock positions, and see the 24-hour exposure bar chart.

2. **Scenarios** — Click "Scenarios" in the sidebar.
   - Click **"Run Demo Scenario"** in the top-right. This will:
     - Create a baseline (flat tariff) scenario via the API (or fall back to mock)
     - Create a dynamic (ToU + load shifting) scenario
     - Display a side-by-side P&L comparison with line charts and savings breakdown
   - Alternatively, fill out the form manually and click **"Create Scenario"** to call the real API.
   - Click any scenario row to view its detail page with metadata, hourly P&L breakdown, and comparison charts.

3. **Ask Leafy Why** — From a scenario detail page, click the **"Ask Leafy Why"** button in the info banner at the bottom. This navigates to Leafy with a pre-seeded conversation explaining why the dynamic tariff saves ~12%.

4. **Market Intelligence** — Click "Market Intelligence" in the sidebar. Type a query (e.g., "carbon", "wind", "gas") or filter by document type (Research / ESG / Asset).

5. **Leafy** — Click "Leafy" in the sidebar. Pick any of the four suggested prompt cards or type your own question. The assistant responds with formatted markdown, tables, and source citations.

6. **Telemetry** — Click "Telemetry" in the sidebar.
   - Adjust the sliders: writers, events/sec, batch size.
   - Toggle event types (Price Ticks, Meter Readings, Trades).
   - Click **"Start Generator"** → metric cards update, charts populate, live event feed scrolls with events from 8 European energy originators.
   - Click **"Stop Generator"** → stream stops, charts freeze.

7. **Event Inspector** — Click "Event Inspector" in the sidebar.
   - Select one of the 4 compliance scenarios (Imbalance Settlement, REMIT Surveillance, Flexibility Market, Cross-Border Capacity).
   - The event timeline loads on the left, aggregate state (result of `fold()`) on the right.
   - Use the **replay slider** to scrub through versions — watch the state reconstruct at each step.
   - Click **"Step-by-Step Replay"** for an animated walkthrough.
   - Click any event in the timeline to jump to that version and see its payload + resulting state.

8. **Dark Mode** — Toggle the switch at the bottom of the sidebar to switch between dark and light themes.

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx              # Root layout with Providers + AppShell
│   ├── page.tsx                # Redirects to /dashboard
│   ├── dashboard/page.tsx      # Portfolio dashboard
│   ├── scenarios/
│   │   ├── page.tsx            # Scenario builder + list
│   │   └── [scenarioId]/page.tsx  # Scenario detail
│   ├── search/page.tsx         # Market intelligence search
│   ├── leafy/page.tsx          # AI assistant chat
│   ├── telemetry/page.tsx      # Real-time telemetry dashboard
│   └── audit/page.tsx          # Event Inspector / compliance replay
├── components/
│   ├── AppShell.tsx            # SideNav + content layout
│   ├── Providers.tsx           # LeafyGreen + dark mode context
│   ├── EmotionRegistry.tsx     # SSR style injection for Emotion
│   ├── shared/                 # PageHeader, MetricCard, LoadingState, ErrorBanner
│   ├── dashboard/              # PortfolioSummaryCards, PositionsTable, ExposureChart
│   ├── scenarios/              # ScenarioForm, ScenarioList, ScenarioComparison, PnLBreakdown, ScenarioDetailView
│   ├── search/                 # SearchBar, SearchFilters, SearchResults, SearchEmptyState
│   ├── leafy/                  # ChatContainer, ChatMessage, ChatInput, SuggestedPrompts, SourceCitation
│   ├── telemetry/              # ControlPanel, TelemetryMetricCards, ThroughputChart, LatencyChart, EventFeed
│   └── audit/                  # EventTimeline, AggregateStateView, ReplayControls, EventCard
└── lib/
    ├── types.ts                # Shared TypeScript interfaces
    ├── api.ts                  # Typed fetch client for backend endpoints
    ├── mock-data.ts            # Realistic mock data for all views
    ├── demo-flow.ts            # One-click demo orchestration
    └── compliance-scenarios.ts # Pre-built EU compliance scenario event streams

backend/
├── app/
│   ├── main.py                 # FastAPI entrypoint + CORS
│   ├── api/
│   │   ├── commands.py         # POST endpoints (create scenario, seed demo)
│   │   ├── queries.py          # GET endpoints (scenario, event streams, replay)
│   │   └── telemetry.py        # Telemetry load generator + SSE streaming
│   ├── domain/
│   │   ├── commands.py         # Command models
│   │   ├── events.py           # Domain events
│   │   └── aggregates.py       # Aggregate roots + fold()
│   ├── infrastructure/
│   │   └── event_store.py      # MongoDB event store + replay APIs
│   └── projections/
│       └── tariff_scenarios.py # Change stream projections
└── requirements.txt
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/portfolios/{id}/tariff-scenarios` | Create a tariff scenario |
| GET | `/api/tariff-scenarios/{id}` | Get a scenario by ID |
| POST | `/api/demo/seed-scenario` | Seed demo imbalance settlement events |
| GET | `/api/events/streams` | List all event streams |
| GET | `/api/events/stream/{id}` | Get events for a stream |
| GET | `/api/events/stream/{id}/replay` | Step-by-step fold() replay |
| POST | `/api/telemetry/start` | Start telemetry load generator |
| POST | `/api/telemetry/stop` | Stop telemetry load generator |
| GET | `/api/telemetry/stream` | SSE stream of telemetry metrics |
| GET | `/api/telemetry/status` | Check generator running state |
| GET | `/api/dashboard/stream` | SSE stream of live portfolio data |
| GET | `/api/dashboard/snapshot` | One-shot portfolio snapshot |
| GET | `/api/scenarios/stream` | SSE stream of live scenario pricing |

## Testing

```bash
# Backend unit tests
cd backend && pytest

# Frontend production build check
cd frontend && npm run build
```

## Limitations

- Search and Leafy use mock data — in production these would be backed by MongoDB Atlas Vector Search and an LLM
- Portfolio positions and exposure data are static mocks
- The demo flow creates real scenarios via the API but enriches them with mock P&L data
- Telemetry falls back to simulated metrics when the backend is unavailable
- Event Inspector uses pre-built compliance scenarios; when the backend is running, the seed endpoint creates real event streams in MongoDB
- No authentication or user management
