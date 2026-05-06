# Architecture — Leafy Energy Markets

## Pattern 1: Event Ingestion — Field to Atlas

Each generator asset owns its time series collection. The SCADA/RTU system is the sole writer — no concurrent conflicts, no need for optimistic concurrency.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                 │
│   FIELD — 8 European Renewable Energy Assets                                                    │
│                                                                                                 │
│   🌬️ Hollandse Kust Wind (NL, 200 MW)           ☀️ Algarrobico Solar (ES, 180 MW)               │
│   ┌──────────────────────────┐                  ┌──────────────────────────┐                    │
│   │ SCADA / RTU              │                  │ SCADA / PLC              │                    │
│   │ • Wind speed (m/s)       │                  │ • Irradiance (W/m²)      │                    │
│   │ • Turbine RPM, pitch     │                  │ • Panel temp (°C)        │                    │
│   │ • Output (MW)            │                  │ • Inverter status        │                    │
│   │ • Grid frequency (Hz)    │                  │ • Output (MW)            │                    │
│   └────────────┬─────────────┘                  └────────────┬─────────────┘                    │
│                │                                             │                                  │
│   🌬️ Hornsea Wind (UK, 150 MW)       ☀️ Sines Solar (PT, 120 MW)                               │
│   ┌────────────┴─────────────┐        ┌────────────┴─────────────┐                              │
│   │ SCADA / RTU              │        │ SCADA / PLC              │                              │
│   │ • Output (MW)            │        │ • Output (MW)            │                              │
│   │ • Pitch angle, yaw       │        │ • Cloud cover (%)        │                              │
│   └────────────┬─────────────┘        └────────────┬─────────────┘                              │
│                │                                   │                                            │
│   💧 Nordland Hydro (NO, 300 MW)     🔥 Rhine CCGT (DE, 400 MW)                                 │
│   ┌────────────┴─────────────┐       ┌─────────────┴────────────┐                               │
│   │ SCADA / RTU              │       │ DCS / PLC                │                               │
│   │ • Flow rate (m³/s)       │       │ • Gas flow (MW_th)       │                               │
│   │ • Head pressure (bar)    │       │ • Steam temp / pressure  │                               │
│   │ • Output (MW)            │       │ • Output (MW)            │                               │
│   └────────────┬─────────────┘       └─────────────┬────────────┘                               │
│                │                                   │                                            │
│   ⚡ Rotterdam BESS (NL, 50 MW)      🌿 Gironde Biomass (FR, 80 MW)                              │
│   ┌────────────┴─────────────┐       ┌─────────────┴────────────┐                               │
│   │ BMS / PLC                │       │ SCADA / PLC              │                               │
│   │ • State of charge (%)    │       │ • Feedstock rate (t/h)   │                               │
│   │ • Charge/discharge (MW)  │       │ • Boiler temp (°C)       │                               │
│   │ • Output (MW)            │       │ • Output (MW)            │                               │
│   └────────────┬─────────────┘       └─────────────┬────────────┘                               │
│                │                                   │                                            │
└────────────────┼───────────────────────────────────┼────────────────────────────────────────────┘
                 │                                   │
                 │  MQTT / OPC-UA / Modbus           │
                 │                                   │
                 ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                 │
│   MESSAGE BROKER / STREAMING LAYER                                                              │
│                                                                                                 │
│   ┌─────────────────────────────────────┐   ┌──────────────────────────────────────┐            │
│   │  MQTT Broker (e.g. HiveMQ)          │   │  Apache Kafka                        │            │
│   │                                     │   │                                      │            │
│   │  Topics per asset:                  │   │  Topics per asset:                   │            │
│   │  • asset/wind-nl-001/telemetry      │   │  • energy.wind-nl-001.readings       │            │
│   │  • asset/solar-es-001/telemetry     │   │  • energy.solar-es-001.readings      │            │
│   │  • asset/hydro-no-001/telemetry     │   │  • energy.hydro-no-001.readings      │            │
│   │  • asset/{id}/weather               │   │  • energy.{id}.weather               │            │
│   │  • asset/{id}/alerts                │   │  • energy.{id}.alerts                │            │
│   │                                     │   │                                      │            │
│   │  QoS 1 (at least once delivery)     │   │  Partitioned by asset ID             │            │
│   └──────────────────┬──────────────────┘   └───────────────────┬──────────────────┘            │
│                      │                                          │                               │
│                      └─────────────────┬────────────────────────┘                               │
│                                        │                                                        │
└────────────────────────────────────────┼────────────────────────────────────────────────────────┘
                                         │
                                         │  Kafka Connect / MQTT Sink
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                 │
│   ATLAS STREAM PROCESSING                                                                       │
│                                                                                                 │
│   $source (Kafka / MQTT)                                                                        │
│       │                                                                                         │
│       ▼                                                                                         │
│   $match — validate schema, filter by asset                                                     │
│       │                                                                                         │
│       ▼                                                                                         │
│   $addFields — enrich with streamType, normalize timestamps to UTC                              │
│       │                                                                                         │
│       ▼                                                                                         │
│   $emit — route to per-asset time series collection                                             │
│                                                                                                 │
└────────────────────────────────────────┬────────────────────────────────────────────────────────┘
                                         │
                                         │  One collection per asset (sole writer = no concurrency)
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                 │
│   MONGODB ATLAS — Per-Asset Time Series Collections                                             │
│                                                                                                 │
│   Each collection: timeField=timestamp, metaField=eventType, granularity=seconds, TTL=7 days    │
│                                                                                                 │
│   ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐              │
│   │ events_wind_    │ │ events_wind_    │ │ events_solar_   │ │ events_solar_   │              │
│   │ nl_001          │ │ uk_001          │ │ es_001          │ │ pt_001          │              │
│   │ ⏱ Time Series   │ │ ⏱ Time Series   │ │ ⏱ Time Series   │ │ ⏱ Time Series   │              │
│   │                 │ │                 │ │                 │ │                 │              │
│   │ Sole writer:    │ │ Sole writer:    │ │ Sole writer:    │ │ Sole writer:    │              │
│   │ Hollandse Kust  │ │ Hornsea         │ │ Algarrobico     │ │ Sines           │              │
│   │ SCADA/RTU       │ │ SCADA/RTU       │ │ SCADA/PLC       │ │ SCADA/PLC       │              │
│   └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘              │
│                                                                                                 │
│   ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐              │
│   │ events_hydro_   │ │ events_gas_     │ │ events_battery_ │ │ events_biomass_ │              │
│   │ no_001          │ │ de_001          │ │ nl_001          │ │ fr_001          │              │
│   │ ⏱ Time Series   │ │ ⏱ Time Series   │ │ ⏱ Time Series   │ │ ⏱ Time Series   │              │
│   │                 │ │                 │ │                 │ │                 │              │
│   │ Sole writer:    │ │ Sole writer:    │ │ Sole writer:    │ │ Sole writer:    │              │
│   │ Nordland        │ │ Rhine CCGT      │ │ Rotterdam BESS  │ │ Gironde         │              │
│   │ SCADA/RTU       │ │ DCS/PLC         │ │ BMS/PLC         │ │ SCADA/PLC       │              │
│   └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘              │
│                                                                                                 │
│   ┌─────────────────┐                                                                           │
│   │ events_         │  Portfolio-level events (trades, gap alerts, P&L snapshots)               │
│   │ portfolio       │  Sole writer: trading engine                                              │
│   │ ⏱ Time Series   │                                                                           │
│   └─────────────────┘                                                                           │
│                                                                                                 │
│   9 event types across all collections:                                                         │
│   AssetTelemetry:   MeterReadingRecorded, PerformanceVarianceDetected                          │
│   WeatherForecast:  WindForecastUpdated, SolarIrradianceForecastUpdated, WeatherAlertIssued     │
│   TradingPosition:  PositionGapDetected, TradeExecuted, PnlSnapshotRecorded,                   │
│                     CapacityAllocationSet                                                       │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Pattern 2: Real-Time Dashboard — Change Streams

Change Streams watch the per-asset collections and push live updates to the browser. No polling — events flow the moment they're persisted.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                 │
│   MONGODB ATLAS — Change Streams                                                                │
│                                                                                                 │
│   ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐                                  │
│   │ events_wind_*   │ │ events_solar_*  │ │ events_portfolio│                                  │
│   │                 │ │                 │ │                 │                                  │
│   │  ... all 8+1 per-asset time series collections ...     │                                  │
│   └────────┬────────┘ └────────┬────────┘ └────────┬───────┘                                  │
│            │                   │                   │                                           │
│            │  Change Stream    │  Change Stream     │  Change Stream                            │
│            │  (watch inserts)  │  (watch inserts)   │  (watch inserts)                          │
│            │                   │                   │                                           │
│            └───────────────────┴───────────────────┘                                           │
│                                │                                                               │
│                         db.watch()                                                              │
│                    (database-level watcher                                                       │
│                     catches all collections)                                                     │
│                                │                                                               │
└────────────────────────────────┼───────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
┌──────────────────────────────┐  ┌──────────────────────────────┐
│                              │  │                              │
│  TELEMETRY TAB               │  │  DASHBOARD                   │
│  (WebSocket)                 │  │  (SSE from simulator)        │
│                              │  │                              │
│  Backend opens Change        │  │  Fleet health (8 assets)     │
│  Stream on trading_events    │  │  Position gap                │
│  → pushes each insert via    │  │  Revenue tracker             │
│    WebSocket to browser      │  │  Trade execution             │
│                              │  │  Market prices               │
│  • Schema explorer           │  │                              │
│  • Live scrolling feed       │  │  Also powered by Change      │
│  • Per-asset stats           │  │  Streams for read model      │
│  • Filter by type            │  │  projections:                │
│                              │  │                              │
│  ws://backend:8000/api/      │  │  ┌────────────────────────┐  │
│  trading/ws/change-stream    │  │  │ tariff_scenarios       │  │
│                              │  │  │ (materialized view     │  │
│                              │  │  │  via Change Stream     │  │
│                              │  │  │  projection)           │  │
│                              │  │  └────────────────────────┘  │
└──────────────────────────────┘  └──────────────────────────────┘

Change Stream resilience:
  • max_await_time_ms = 5s (no infinite blocking)
  • Resume tokens persisted to _change_stream_cursors
  • Handles ChangeStreamHistoryLost (code 286) by resetting
  • Exponential backoff on disconnect (2^n, max 30s)
  • Circuit breaker: stops after 10 consecutive failures
```

## Pattern 3: Intelligence & Auditing — AI + fold()

The AI advisor reads from multiple sources to build answers. The audit tab uses fold() to replay events from the time series collection and reconstruct state at any point in time.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                 │
│   ENERLEAFY AI — LangChain ReAct Agent (Claude claude-sonnet-4-6)                              │
│                                                                                                 │
│   User question                                                                                 │
│       │                                                                                         │
│       ▼                                                                                         │
│   ┌──────────────────┐                                                                          │
│   │  LLM decides     │◄────────────────────────────────────────────────┐                        │
│   │  which tools     │                                                 │                        │
│   └──┬───────────────┘                                                 │                        │
│      │                                                                 │                        │
│      ▼  Parallel tool execution                                        │                        │
│   ┌────────────────────────────────────────────────────────────┐       │                        │
│   │                                                            │       │                        │
│   │  ┌───────────────────┐                                     │       │                        │
│   │  │ analyze_portfolio │  Live fleet data from frontend:     │       │                        │
│   │  │ (REQUIRED)        │  Output, prices, gaps, weather,     │       │                        │
│   │  │                   │  revenue — from trading simulator   │       │                        │
│   │  └───────────────────┘                                     │       │                        │
│   │                                                            │       │                        │
│   │  ┌───────────────────┐                                     │       │                        │
│   │  │ search_policies   │  MongoDB Atlas Vector Search:       │  tool │                        │
│   │  │ (optional)        │  $vectorSearch on market_documents  │  results                       │
│   │  │                   │  voyage-finance-2 (1024d)           │───────┘                        │
│   │  └───────────────────┘                                     │                                │
│   │                                                            │                                │
│   │  ┌───────────────────┐                                     │                                │
│   │  │ web_search /      │  DuckDuckGo: real-time market       │                                │
│   │  │ get_energy_news   │  data + headlines (optional)        │                                │
│   │  │ (optional)        │                                     │                                │
│   │  └───────────────────┘                                     │                                │
│   │                                                            │                                │
│   │  ┌───────────────────┐                                     │                                │
│   │  │ MongoDB MCP       │  Direct database queries:           │                                │
│   │  │ Server (optional) │  find(), aggregate() on any         │                                │
│   │  │                   │  collection when agent needs        │                                │
│   │  └───────────────────┘  raw data                           │                                │
│   │                                                            │                                │
│   └────────────────────────────────────────────────────────────┘                                │
│                                                                                                 │
│       │                                                                                         │
│       ▼                                                                                         │
│   Stream response tokens via SSE → typewriter effect in browser                                 │
│   Conversation memory persisted to advisor_interactions (MongoDBSaver)                          │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                 │
│   AUDITING — Event Sourcing with fold()                                                         │
│                                                                                                 │
│   The fold() function replays events from the time series collection to reconstruct             │
│   aggregate state at any point in time. This is the core of the CQRS audit capability.          │
│                                                                                                 │
│                                                                                                 │
│   Time Series Collection (per-asset)                                                            │
│   ┌────────────────────────────────────────────────────────────┐                                │
│   │  v1: WindForecastUpdated        (08:15 — KNMI forecast)   │                                │
│   │  v2: CapacityAllocationSet      (08:20 — 128 MW committed)│                                │
│   │  v3: TradeExecuted              (08:22 — sell 128 MWh)    │                                │
│   │  v4: WindForecastUpdated        (12:45 — revised +34%)    │                                │
│   │  v5: MeterReadingRecorded       (13:00 — ISP start)       │                                │
│   │  v6: MeterReadingRecorded       (13:15 — ISP end: 173 MW) │                                │
│   │  v7: PerformanceVarianceDetected(13:15 — +45 MW over)     │                                │
│   │  v8: PositionGapDetected        (13:16 — TSO charges)     │                                │
│   │  v9: PnlSnapshotRecorded        (13:16 — preliminary)     │                                │
│   │ v10: PnlSnapshotRecorded        (13:30 — dispute corrected)│                               │
│   └──────────────────────┬─────────────────────────────────────┘                                │
│                          │                                                                      │
│                          │  EventStore.replay_stream()                                          │
│                          │  sorted by timestamp                                                 │
│                          ▼                                                                      │
│                                                                                                 │
│   fold(empty_aggregate, events[1..N])                                                           │
│                                                                                                 │
│   ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐         ┌──────┐                                │
│   │  v1  │───▶│  v2  │───▶│  v3  │───▶│  v4  │──• • •─▶│ v10  │                                │
│   │      │    │      │    │      │    │      │         │      │                                │
│   │state │    │state │    │state │    │state │         │state │                                │
│   │@v1   │    │@v2   │    │@v3   │    │@v4   │         │@v10  │                                │
│   └──────┘    └──────┘    └──────┘    └──────┘         └──────┘                                │
│                                                                                                 │
│   Each step: aggregate.apply(event) → new state snapshot                                        │
│   UI scrubs through versions — state reconstructs instantly                                     │
│   LLM deep analysis checks events against EU 2017/2195                                         │
│                                                                                                 │
│   Imbalance Settlement scenario: wind forecast changed after commitment,                        │
│   actual output exceeded sold capacity, TSO incorrectly charged imbalance,                      │
│   fold() proves the corrected state via event replay                                            │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
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
