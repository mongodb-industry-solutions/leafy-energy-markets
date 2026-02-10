# Leafy Energy Markets

An energy trading intelligence platform built on MongoDB, demonstrating Event Sourcing, CQRS, dynamic tariff scenario analysis, and an AI Copilot — all wrapped in MongoDB's LeafyGreen UI design system.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│           Next.js 14 Frontend (LeafyGreen UI)                    │
│     /dashboard    /scenarios    /search    /copilot              │
└───────────────┬──────────────────────────────┬───────────────────┘
                │                              │
          POST /api/*                    GET /api/*
          (Commands)                     (Queries)
                │                              │
┌───────────────▼───────────┐  ┌───────────────▼───────────────────┐
│     Command Handlers      │  │         Query Handlers            │
│  ┌─────────────────────┐  │  │  ┌─────────────────────────────┐  │
│  │ Validate + Execute  │  │  │  │ Read from Projections       │  │
│  │ Record Domain Event │  │  │  │ (tariff_scenarios, etc.)    │  │
│  └─────────┬───────────┘  │  │  └──────────────▲──────────────┘  │
└────────────┼──────────────┘  └─────────────────┼─────────────────┘
             │                                   │
             │  insert_one()              Change Streams
             │  (append-only)             (real-time projections)
             │                                   │
┌────────────▼───────────────────────────────────┼─────────────────┐
│                        MongoDB                                   │
│                                                                  │
│  ┌─────────────────────────────┐  ┌────────────┴──────────────┐  │
│  │   events (append-only)      │  │   Read Model Collections  │  │
│  │                             │  │                           │  │
│  │  { streamId, streamType,    │  │   tariff_scenarios        │  │
│  │    version, eventType,      │  │   instruments             │  │
│  │    timestamp, payload,      │  │   portfolio_positions     │  │
│  │    metadata }               │  │                           │  │
│  │                             │  │  Built via Change Streams │  │
│  │  Unique: {streamId,version} │  │  from events collection   │  │
│  └──────────────┬──────────────┘  └───────────────────────────┘  │
└─────────────────┼────────────────────────────────────────────────┘
                  │
                  │  fold() replay
                  │
┌─────────────────▼────────────────────────────────────────────────┐
│              Audit & Compliance Layer                             │
│                                                                  │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐  │
│  │  Event Replay    │ │  Regulatory      │ │  Dispute         │  │
│  │  Engine          │ │  Reporting       │ │  Resolution      │  │
│  │                  │ │                  │ │                  │  │
│  │  fold() rebuilds │ │  REMIT / ACER    │ │  Side-by-side    │  │
│  │  state at any    │ │  ENTSO-E / CACM  │ │  replay with     │  │
│  │  point in time   │ │  transparency    │ │  alternative     │  │
│  │                  │ │  obligations     │ │  parameters      │  │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Features

- **Portfolio Dashboard** — Real-time P&L, positions table, 24-hour MWh exposure chart
- **Scenario Builder** — Create tariff scenarios via real API, one-click demo comparing flat vs dynamic tariffs with P&L charts
- **Market Intelligence** — Search research reports, ESG assessments, and asset data with type filtering
- **Copilot Chat** — AI assistant with suggested prompts, source citations, and pre-scripted demo flow
- **Dark Mode** — Full dark/light theme toggle across all views

## Compliance Scenarios

The platform's Event Sourcing architecture is purpose-built for European energy market compliance, where replaying event history is a regulatory requirement. Each scenario demonstrates how `fold()` replay resolves a real-world dispute or investigation.

| Scenario                                                                                  | Regulation                           | Key Events                                                                               | Description                                                                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Imbalance Settlement Audit](docs/scenarios/01-imbalance-settlement-audit.md)             | Electricity Balancing (EU) 2017/2195 | `TradeExecuted`, `MeterReadingRecorded`, `PriceTickRecorded`                             | TSO/BRP dispute over a 15-min ISP shortfall, resolved by replaying corrected meter data        |
| [REMIT Trade Surveillance](docs/scenarios/02-remit-trade-surveillance.md)                 | REMIT (EU) 1227/2011                 | `TradeExecuted`, `PriceTickRecorded`, `InstrumentListed`                                 | ACER spoofing investigation — immutable trail of rapid orders, cancellations, and price impact |
| [Flexibility Market Clearing](docs/scenarios/03-flexibility-market-clearing.md)           | Electricity Directive 2019/944       | `FlexibilityBidSubmitted`, `FlexibilityActivated`, `FlexibilityDeliveryVerified`         | DSO/aggregator delivery dispute resolved by comparing two baseline methodologies               |
| [Cross-Border Capacity Allocation](docs/scenarios/04-cross-border-capacity-allocation.md) | CACM (EU) 2015/1222                  | `CapacityAllocationRequested`, `CrossBorderFlowRecorded`, `CongestionRevenueDistributed` | Curtailment audit of flow-based parameters, Euphemia results, and congestion revenue           |

## Tech Stack

| Layer    | Technology                                                 |
| -------- | ---------------------------------------------------------- |
| Frontend | Next.js 14, React 18, LeafyGreen UI, Emotion CSS, Recharts |
| Backend  | Python, FastAPI, Pydantic                                  |
| Database | MongoDB (Event Store, Change Streams, Projections)         |
| Patterns | Domain-Driven Design, Event Sourcing, CQRS                 |

## Prerequisites

- **Node.js** 18+
- **Python** 3.10+
- **MongoDB** instance (local or Atlas)

## Quick Start

### Option 1: One-Command Demo (Recommended) 🚀

The easiest way to run the demo locally:

```bash
./start-demo.sh
```

This will:
- ✅ Automatically activate the Python 3.12 virtual environment
- ✅ Install dependencies if needed
- ✅ Start both backend and frontend servers
- ✅ Show you the URLs to access the demo

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

The frontend works fully with mock data even if the backend is not running. When the backend is available, the Scenario Builder makes real API calls.

### Demo walkthrough

1. **Dashboard** — Opens by default. Browse the portfolio summary cards, scroll through the 14 mock positions, and see the 24-hour exposure bar chart.

2. **Scenarios** — Click "Scenarios" in the sidebar.
   - Click **"Run Demo Scenario"** in the top-right. This will:
     - Create a baseline (flat tariff) scenario via the API (or fall back to mock)
     - Create a dynamic (ToU + load shifting) scenario
     - Display a side-by-side P&L comparison with line charts and savings breakdown
   - Alternatively, fill out the form manually and click **"Create Scenario"** to call the real API.
   - Click any scenario row to view its detail page with metadata, hourly P&L breakdown, and comparison charts.

3. **Ask Copilot Why** — From a scenario detail page, click the **"Ask Copilot Why"** button in the info banner at the bottom. This navigates to the Copilot with a pre-seeded conversation explaining why the dynamic tariff saves ~12%.

4. **Market Intelligence** — Click "Market Intelligence" in the sidebar. Type a query (e.g., "carbon", "wind", "gas") or filter by document type (Research / ESG / Asset).

5. **Copilot** — Click "Copilot" in the sidebar. Pick any of the four suggested prompt cards or type your own question. The assistant responds with formatted markdown, tables, and source citations.

6. **Dark Mode** — Toggle the switch at the bottom of the sidebar to switch between dark and light themes.

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
│   └── copilot/page.tsx        # AI copilot chat
├── components/
│   ├── AppShell.tsx            # SideNav + content layout
│   ├── Providers.tsx           # LeafyGreen + dark mode context
│   ├── EmotionRegistry.tsx     # SSR style injection for Emotion
│   ├── shared/                 # PageHeader, MetricCard, LoadingState, ErrorBanner
│   ├── dashboard/              # PortfolioSummaryCards, PositionsTable, ExposureChart
│   ├── scenarios/              # ScenarioForm, ScenarioList, ScenarioComparison, PnLBreakdown, ScenarioDetailView
│   ├── search/                 # SearchBar, SearchFilters, SearchResults, SearchEmptyState
│   └── copilot/                # ChatContainer, ChatMessage, ChatInput, SuggestedPrompts, SourceCitation
└── lib/
    ├── types.ts                # Shared TypeScript interfaces
    ├── api.ts                  # Typed fetch client for backend endpoints
    ├── mock-data.ts            # Realistic mock data for all views
    └── demo-flow.ts            # One-click demo orchestration

backend/
├── app/
│   ├── main.py                 # FastAPI entrypoint
│   ├── api/
│   │   ├── commands.py         # POST endpoints (create scenario)
│   │   └── queries.py          # GET endpoints (get scenario)
│   ├── domain/
│   │   ├── commands.py         # Command models
│   │   ├── events.py           # Domain events
│   │   └── aggregates.py       # Aggregate roots
│   ├── infrastructure/
│   │   └── event_store.py      # MongoDB event store
│   └── projections/
│       └── tariff_scenarios.py # Change stream projections
└── requirements.txt
```

## Testing

```bash
# Backend unit tests
cd backend && pytest

# Frontend production build check
cd frontend && npm run build
```

## Limitations

- Search and Copilot use mock data — in production these would be backed by MongoDB Atlas Vector Search and an LLM
- Portfolio positions and exposure data are static mocks
- The demo flow creates real scenarios via the API but enriches them with mock P&L data
- No authentication or user management
