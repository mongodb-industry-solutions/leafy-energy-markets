# Architecture — Leafy Energy Markets

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                         │
│   BROWSER                                                                               │
│   http://localhost:3000                                                                  │
│                                                                                         │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│   │ Landing  │ │Dashboard │ │EnerLeafy │ │ Auditing │ │  CQRS    │ │  Arch    │       │
│   │ Page     │ │          │ │ AI Chat  │ │          │ │ Explainer│ │ Diagram  │       │
│   │          │ │ Fleet    │ │          │ │ fold()   │ │          │ │          │       │
│   │ Branding │ │ Position │ │ ReAct    │ │ Replay   │ │ Sequence │ │ Clickable│       │
│   │ Ticker   │ │ Revenue  │ │ Agent    │ │ Event    │ │ Diagrams │ │ Tiles    │       │
│   │ CTAs     │ │ Trades   │ │ Fleet    │ │ Inspector│ │ Code     │ │ Embedding│       │
│   │          │ │ Prices   │ │ Map      │ │ AI Deep  │ │ Blocks   │ │ Bench    │       │
│   │          │ │ Alerts   │ │ Storm ⛈️  │ │ Analysis │ │          │ │          │       │
│   └──────────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────────┘ └──────────┘       │
│                      │            │            │                                         │
└──────────────────────┼────────────┼────────────┼────────────────────────────────────────┘
                       │            │            │
                       │ SSE 1s     │ SSE        │ REST
                       │ REST       │ REST       │
                       │            │            │
         ┌─────────────┼────────────┼────────────┼──────────────────────────┐
         │             │            │            │                          │
         │   NEXT.JS PROXY (rewrites /api/* → backend:8000)                │
         │                                                                  │
         └──────────────────────────┬───────────────────────────────────────┘
                                    │
                                    │ HTTP
                                    │
┌───────────────────────────────────┼───────────────────────────────────────────────────────┐
│                                   │                                                       │
│   FASTAPI BACKEND (Python 3.12)   │   http://localhost:8000                               │
│                                   │                                                       │
│   ┌───────────────────────────────┼─────────────────────────────────────────────────┐     │
│   │                            ROUTERS                                              │     │
│   │                                                                                 │     │
│   │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │     │
│   │  │  trading    │ │  advisor    │ │  audit      │ │  search     │              │     │
│   │  │             │ │             │ │             │ │             │              │     │
│   │  │ GET  /state │ │ POST       │ │ POST        │ │ POST        │              │     │
│   │  │ POST /start │ │ /advisor/  │ │ /audit/     │ │ /search/    │              │     │
│   │  │ POST /stop  │ │  stream    │ │  analyze    │ │  hybrid     │              │     │
│   │  │ GET  /stream│ │             │ │             │ │             │              │     │
│   │  │ POST /alloc │ │ SSE tokens │ │ LLM analysis│ │ Vector +    │              │     │
│   │  │ POST /storm │ │ + tool evts│ │ via ReAct   │ │ BM25 + RRF │              │     │
│   │  └──────┬──────┘ └──────┬─────┘ └──────┬──────┘ └──────┬──────┘              │     │
│   │         │               │              │               │                     │     │
│   │  ┌──────┴──────┐ ┌──────┴──────┐       │        ┌──────┴──────┐              │     │
│   │  │ commands   │ │ queries    │       │        │ telemetry  │              │     │
│   │  │            │ │            │       │        │            │              │     │
│   │  │ POST create│ │ GET events │       │        │ POST start │              │     │
│   │  │ POST seed  │ │ GET replay │       │        │ GET stream │              │     │
│   │  │            │ │ GET streams│       │        │ POST stop  │              │     │
│   │  └──────┬─────┘ └──────┬─────┘       │        └─────┬──────┘              │     │
│   │         │              │              │              │                     │     │
│   └─────────┼──────────────┼──────────────┼──────────────┼─────────────────────┘     │
│             │              │              │              │                            │
│   ┌─────────┼──────────────┼──────────────┼──────────────┼─────────────────────┐     │
│   │         │         CORE SERVICES       │              │                     │     │
│   │         │              │              │              │                     │     │
│   │  ┌──────▼──────────────▼──────┐  ┌───▼────────┐  ┌──▼───────────────┐     │     │
│   │  │    TradingSimulator        │  │  LangChain  │  │  Embeddings      │     │     │
│   │  │    (in-memory, 1s tick)    │  │  ReAct      │  │  Client          │     │     │
│   │  │                            │  │  Agent      │  │                  │     │     │
│   │  │  8 EU assets               │  │             │  │  voyage-finance-2│     │     │
│   │  │  Weather events            │  │  6 tools    │  │  1024-dim        │     │     │
│   │  │  Price random walk         │  │  Claude LLM │  │  hash fallback   │     │     │
│   │  │  Trade execution           │  │  MCP Server │  │                  │     │     │
│   │  │  Revenue tracking          │  │  Memory     │  │  embed_texts()   │     │     │
│   │  │  → persists to MongoDB     │  │  (MongoSvr) │  │  embed_query()   │     │     │
│   │  └─────────────┬──────────────┘  └──────┬──────┘  └────────┬─────────┘     │     │
│   │                │                        │                  │               │     │
│   │  ┌─────────────▼──────────────┐  ┌──────▼──────┐  ┌───────▼──────────┐    │     │
│   │  │    EventStore (CQRS)       │  │ MongoDB MCP │  │ Hybrid Search    │    │     │
│   │  │                            │  │ Server      │  │                  │    │     │
│   │  │  append-only insert_one()  │  │             │  │ $vectorSearch    │    │     │
│   │  │  fold() replay             │  │ find()      │  │ + regex fallback │    │     │
│   │  │  {streamId, version} idx   │  │ aggregate() │  │ + RRF merge      │    │     │
│   │  │  optimistic concurrency    │  │ schema()    │  │                  │    │     │
│   │  └─────────────┬──────────────┘  └──────┬──────┘  └────────┬─────────┘    │     │
│   │                │                        │                  │              │     │
│   └────────────────┼────────────────────────┼──────────────────┼──────────────┘     │
│                    │                        │                  │                     │
│   ┌────────────────▼────────────────────────▼──────────────────▼──────────────┐     │
│   │                        DOMAIN LAYER                                       │     │
│   │                                                                           │     │
│   │  ┌────────────────┐ ┌────────────────┐ ┌──────────────────────────┐       │     │
│   │  │  events.py     │ │ aggregates.py  │ │ commands.py              │       │     │
│   │  │                │ │                │ │                          │       │     │
│   │  │  DomainEvent   │ │  Aggregate     │ │  CreateTariffScenario   │       │     │
│   │  │  TariffCreated │ │  Instrument    │ │  Command                │       │     │
│   │  │  TradeExecuted │ │  TariffScen.   │ │                          │       │     │
│   │  │  MeterReading  │ │  fold()        │ │                          │       │     │
│   │  │  PriceTick     │ │  apply()       │ │                          │       │     │
│   │  │  Instrument    │ │  record()      │ │                          │       │     │
│   │  └────────────────┘ └────────────────┘ └──────────────────────────┘       │     │
│   │                                                                           │     │
│   └───────────────────────────────────────────────────────────────────────────┘     │
│                                                                                     │
└───────────────────────────────────┬─────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                       │
│   MONGODB ATLAS                                                                       │
│                                                                                       │
│   ┌─────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌─────────────────┐  │
│   │ events          │ │ trading_events   │ │ market_documents │ │ advisor_        │  │
│   │                 │ │                  │ │                  │ │ interactions    │  │
│   │ Append-only     │ │ From simulator   │ │ 200+ IEA/EU      │ │ Agent memory    │  │
│   │ CQRS event store│ │ 9 event types    │ │ policy docs      │ │ MongoDBSaver    │  │
│   │                 │ │ ~3-6 events/s    │ │ voyage-finance-2 │ │ checkpoints     │  │
│   │ Unique index:   │ │                  │ │ 1024-dim vectors │ │                 │  │
│   │ {streamId,      │ │ insert_many()    │ │                  │ │ Query + tool    │  │
│   │  version}       │ │ ordered=false    │ │ Atlas Vector     │ │ call logs       │  │
│   │                 │ │                  │ │ Search index     │ │                 │  │
│   └────────┬────────┘ └──────────────────┘ └──────────────────┘ └─────────────────┘  │
│            │                                                                          │
│   ┌────────▼────────┐ ┌──────────────────┐ ┌──────────────────┐                      │
│   │ tariff_         │ │ _change_stream_  │ │ checkpoints      │                      │
│   │ scenarios       │ │ cursors          │ │ (LangGraph)      │                      │
│   │                 │ │                  │ │                  │                      │
│   │ Read model      │ │ Resume tokens    │ │ Conversation     │                      │
│   │ via Change      │ │ for Change       │ │ state per        │                      │
│   │ Streams         │ │ Stream           │ │ thread_id        │                      │
│   │                 │ │ projections      │ │                  │                      │
│   └─────────────────┘ └──────────────────┘ └──────────────────┘                      │
│                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                       │
│   EXTERNAL SERVICES                                                                   │
│                                                                                       │
│   ┌─────────────────┐ ┌──────────────────┐ ┌──────────────────┐                      │
│   │ VoyageAI        │ │ Claude AI        │ │ DuckDuckGo       │                      │
│   │                 │ │                  │ │                  │                      │
│   │ voyage-finance-2│ │ claude-sonnet-   │ │ web_search tool  │                      │
│   │ 1024-dim        │ │ 4-6              │ │ get_energy_news  │                      │
│   │                 │ │                  │ │ tool             │                      │
│   │ Document +      │ │ Azure AI Foundry │ │                  │                      │
│   │ query embedding │ │ OR Anthropic     │ │ Real-time market │                      │
│   │                 │ │ direct (auto)    │ │ data + headlines │                      │
│   └─────────────────┘ └──────────────────┘ └──────────────────┘                      │
│                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Patterns

```
PATTERN 1: Real-Time Trading (SSE)
──────────────────────────────────

  Browser ◄──── SSE 1s ──── Next.js proxy ◄──── SSE 1s ──── TradingSimulator._tick_loop()
     │                                                              │
     │  Click "Trade"                                               │ _persist_events()
     │                                                              │ (async, non-blocking)
     └── POST /allocations ──► apply_allocation() ──► TradeExecuted │
                                       │                            ▼
                                       │                    trading_events
                                       └── reset alloc ──► (MongoDB collection)


PATTERN 2: AI Advisor (LangChain ReAct)
───────────────────────────────────────

  Browser ──── POST /advisor/stream ──► _build_agent()
     ▲                                       │
     │                              ┌────────▼────────┐
     │  SSE events:                 │   LLM NODE      │
     │  tool_start                  │   (Claude)       │◄─────────────┐
     │  tool_end                    │                  │              │
     │  reasoning                   │   "I need data" │              │
     │  token                       │   OR "I can     │              │
     │  done                        │    answer"      │              │
     │                              └──┬───────────┬──┘              │
     │                                 │           │                 │
     │                          [TOOLS]│     [DONE]│                 │
     │                                 ▼           ▼                 │
     │                     ┌──────────────┐  Stream tokens           │
     │                     │  PARALLEL    │  to browser              │
     │                     │  TOOL EXEC   │                          │
     │                     │              │                          │
     │                     │ analyze_     │                          │
     │                     │  portfolio   │  tool results            │
     │                     │ search_      ├──────────────────────────┘
     │                     │  policies    │
     │                     │ (+ optional) │
     │                     └──────────────┘


PATTERN 3: Event Sourcing + CQRS
────────────────────────────────

  POST /commands/scenarios ──► Command Handler
                                    │
                                    ▼
                              record(event)
                                    │
                                    ▼
                         EventStore.save()
                              insert_one()           Change Stream
                                    │                     │
                                    ▼                     ▼
                            ┌──────────────┐    ┌──────────────────┐
                            │   events     │───►│ tariff_scenarios │
                            │  (immutable) │    │  (read model)    │
                            └──────┬───────┘    └──────────────────┘
                                   │
                                   │ GET /events/stream/{id}/replay
                                   ▼
                              fold(aggregate, events)
                                   │
                                   ▼
                            State at any version


PATTERN 4: Hybrid RAG Search
────────────────────────────

  Query: "REMIT imbalance obligations"
          │
          ├──► voyage-finance-2 ──► $vectorSearch (cosine) ──┐
          │    embed_query()        market_documents          │
          │                                                   ├──► RRF merge ──► ranked docs
          └──► regex fallback ──► $search (BM25 text) ───────┘
```

## Fleet Assets (Trading Simulator)

```
┌──────────────────────────────────────────────────────────────────┐
│                   8 EUROPEAN ENERGY ASSETS                        │
│                                                                  │
│  🌬️ Hollandse Kust Wind   NL  200 MW  ──┐                       │
│  🌬️ Hornsea Wind Farm     UK  150 MW  ──┤                       │
│  ☀️ Algarrobico Solar      ES  180 MW  ──┤  Total: 1,480 MW     │
│  ☀️ Sines Solar Park       PT  120 MW  ──┤                       │
│  💧 Nordland Hydro         NO  300 MW  ──┤  Events: 3-6/sec     │
│  🔥 Rhine CCGT             DE  400 MW  ──┤  Tick: 1s            │
│  ⚡ Rotterdam BESS         NL   50 MW  ──┤                       │
│  🌿 Gironde Biomass        FR   80 MW  ──┘                       │
│                                                                  │
│  Event Types:                                                    │
│  ├── AssetTelemetry:   MeterReadingRecorded                     │
│  │                     PerformanceVarianceDetected               │
│  ├── WeatherForecast:  WindForecastUpdated                      │
│  │                     SolarIrradianceForecastUpdated            │
│  │                     WeatherAlertIssued                        │
│  └── TradingPosition:  PositionGapDetected                      │
│                        TradeExecuted                             │
│                        PnlSnapshotRecorded                      │
│                        CapacityAllocationSet                     │
└──────────────────────────────────────────────────────────────────┘
```

## Revenue Model

```
  Fleet Generation Value (€/hr)          Captured Revenue (€)
  ┌─────────────────────────┐            ┌─────────────────────────┐
  │ Current output × best   │            │ Sum of executed trades  │
  │ channel price per hour   │            │ (from "Trade" button)   │
  │                          │   Trade    │                         │
  │ = what you COULD earn ───┼──────────►│ = what you DID earn     │
  │                          │            │                         │
  └─────────────────────────┘            │ Progress bar → target   │
                                          │ Target = capacity ×     │
        THE GAP = revenue                │ 70% util × avg price    │
        left on the table                │ × 8h window             │
                                          └─────────────────────────┘
```
