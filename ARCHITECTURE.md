# Architecture — Leafy Energy Markets

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                 │
│   FIELD — 8 European Renewable Energy Assets                                                    │
│                                                                                                 │
│   🌬️ Hollandse Kust Wind (NL)          ☀️ Algarrobico Solar (ES)        💧 Nordland Hydro (NO)  │
│   ┌──────────────────────┐            ┌──────────────────────┐        ┌──────────────────────┐  │
│   │ SCADA / RTU          │            │ SCADA / PLC          │        │ SCADA / RTU          │  │
│   │ • Wind speed (m/s)   │            │ • Irradiance (W/m²)  │        │ • Flow rate (m³/s)   │  │
│   │ • Turbine RPM        │            │ • Panel temp (°C)    │        │ • Head pressure      │  │
│   │ • Output (MW)        │            │ • Output (MW)        │        │ • Output (MW)        │  │
│   │ • Grid frequency     │            │ • Inverter status    │        │ • Turbine status     │  │
│   └──────────┬───────────┘            └──────────┬───────────┘        └──────────┬───────────┘  │
│              │                                   │                               │              │
│   🌬️ Hornsea Wind (UK)     ☀️ Sines Solar (PT)    🔥 Rhine CCGT (DE)              │              │
│   ┌──────────┴───────────┐ ┌──────────┴──────────┐ ┌──────────────────────┐       │              │
│   │ SCADA / RTU          │ │ SCADA / PLC         │ │ DCS / PLC            │       │              │
│   │ • Output (MW)        │ │ • Output (MW)       │ │ • Gas flow (MW_th)   │       │              │
│   │ • Pitch angle        │ │ • Cloud cover (%)   │ │ • Steam temp/press   │       │              │
│   └──────────┬───────────┘ └──────────┬──────────┘ │ • Output (MW)        │       │              │
│              │                        │            └──────────┬───────────┘       │              │
│   ⚡ Rotterdam BESS (NL)   🌿 Gironde Biomass (FR)            │                    │              │
│   ┌──────────────────────┐ ┌──────────────────────┐          │                    │              │
│   │ BMS / PLC            │ │ SCADA / PLC          │          │                    │              │
│   │ • State of charge    │ │ • Feedstock rate     │          │                    │              │
│   │ • Charge/discharge   │ │ • Boiler temp        │          │                    │              │
│   │ • Output (MW)        │ │ • Output (MW)        │          │                    │              │
│   └──────────┬───────────┘ └──────────┬───────────┘          │                    │              │
│              │                        │                      │                    │              │
└──────────────┼────────────────────────┼──────────────────────┼────────────────────┼──────────────┘
               │                        │                      │                    │
               │  MQTT / OPC-UA         │  MQTT / Modbus       │  MQTT / OPC-UA     │
               │                        │                      │                    │
               ▼                        ▼                      ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                 │
│   MESSAGE BROKER / STREAMING LAYER                                                              │
│                                                                                                 │
│   ┌─────────────────────────────────┐    ┌─────────────────────────────────┐                    │
│   │  MQTT Broker (e.g. HiveMQ)     │    │  Apache Kafka                   │                    │
│   │                                 │    │                                 │                    │
│   │  Topics:                        │    │  Topics:                        │                    │
│   │  • asset/{id}/telemetry         │    │  • energy.meter-readings        │                    │
│   │  • asset/{id}/weather           │    │  • energy.weather-forecasts     │                    │
│   │  • asset/{id}/alerts            │    │  • energy.trading-events        │                    │
│   │                                 │    │                                 │                    │
│   │  QoS 1 (at least once)         │    │  Partitioned by asset region    │                    │
│   └────────────────┬────────────────┘    └────────────────┬────────────────┘                    │
│                    │                                      │                                     │
│                    └──────────────┬───────────────────────┘                                     │
│                                   │                                                             │
└───────────────────────────────────┼─────────────────────────────────────────────────────────────┘
                                    │
                                    │ Kafka Connect / MQTT Sink
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                 │
│   ATLAS STREAM PROCESSING                                                                       │
│                                                                                                 │
│   ┌───────────────────────────────────────────────────────────────────────────────────────┐     │
│   │                                                                                       │     │
│   │  Stream Processor Pipeline:                                                           │     │
│   │                                                                                       │     │
│   │  $source (Kafka/MQTT)                                                                 │     │
│   │      │                                                                                │     │
│   │      ▼                                                                                │     │
│   │  $match  ── filter by event type, validate schema                                     │     │
│   │      │                                                                                │     │
│   │      ▼                                                                                │     │
│   │  $addFields  ── enrich with streamType, normalize timestamps to UTC                   │     │
│   │      │                                                                                │     │
│   │      ▼                                                                                │     │
│   │  $emit  ── write to MongoDB Atlas collections                                         │     │
│   │                                                                                       │     │
│   └───────────────────────────────┬───────────────────────────────────────────────────────┘     │
│                                   │                                                             │
└───────────────────────────────────┼─────────────────────────────────────────────────────────────┘
                                    │
                                    │ Writes to 2 collections
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                 │
│   MONGODB ATLAS                                                                                 │
│                                                                                                 │
│   ┌──────────────────────────┐        ┌──────────────────────────┐                              │
│   │  trading_events          │        │  events                  │                              │
│   │  ⏱ TIME SERIES           │        │  APPEND-ONLY EVENT STORE │                              │
│   │                          │        │                          │                              │
│   │  timeField: timestamp    │        │  Unique: {streamId,      │                              │
│   │  metaField: streamType   │        │           version}       │                              │
│   │  granularity: seconds    │        │                          │                              │
│   │  TTL: 7 days             │        │  9 event types:          │                              │
│   │                          │        │  MeterReadingRecorded    │                              │
│   │  9 event types           │        │  PerformanceVariance     │                              │
│   │  ~3-6 events/sec         │        │  WindForecastUpdated     │                              │
│   │  10-20x compression      │        │  SolarIrradiance         │                              │
│   │                          │        │  WeatherAlertIssued      │                              │
│   │                          │        │  PositionGapDetected     │                              │
│   │                          │        │  TradeExecuted           │                              │
│   │                          │        │  PnlSnapshotRecorded     │                              │
│   │                          │        │  CapacityAllocationSet   │                              │
│   └────────────┬─────────────┘        └─────────────┬────────────┘                              │
│                │                                    │                                           │
│                │ Change Stream                      │ Change Stream                             │
│                │ (watch inserts)                     │ (watch inserts)                           │
│                │                                    │                                           │
│                ▼                                    ▼                                           │
│   ┌──────────────────────────┐        ┌──────────────────────────┐                              │
│   │                          │        │                          │                              │
│   │  TELEMETRY TAB           │        │  AUDITING TAB            │                              │
│   │  Live Event Feed         │        │  fold() Replay           │                              │
│   │                          │        │                          │                              │
│   │  Change Stream → SSE     │        │  Replay events 1..N      │                              │
│   │  → EventSource           │        │  onto empty aggregate    │                              │
│   │  → Live scrolling table  │        │  → state at any version  │                              │
│   │                          │        │                          │                              │
│   │  Schema explorer         │        │  Imbalance Settlement    │                              │
│   │  Per-asset stats         │        │  EU 2017/2195            │                              │
│   │  Filter by type          │        │  LLM deep analysis       │                              │
│   │                          │        │                          │                              │
│   └──────────────────────────┘        └──────────────────────────┘                              │
│                                                                                                 │
│                │                                                                                │
│                │ Same data also powers:                                                         │
│                ▼                                                                                │
│   ┌──────────────────────────┐        ┌──────────────────────────┐                              │
│   │                          │        │                          │                              │
│   │  DASHBOARD               │        │  tariff_scenarios        │                              │
│   │  (via /trading/stream    │        │  (read model)            │                              │
│   │   SSE from simulator)    │        │                          │                              │
│   │                          │        │  Built by Change Stream  │                              │
│   │  Fleet health            │        │  projection from events  │                              │
│   │  Position gap            │        │  collection              │                              │
│   │  Revenue tracker         │        │                          │                              │
│   │  Trade execution         │        │  Resume tokens stored    │                              │
│   │  Market prices           │        │  in _change_stream_      │                              │
│   │                          │        │  cursors                 │                              │
│   └──────────────────────────┘        └──────────────────────────┘                              │
│                                                                                                 │
│   ┌──────────────────────────┐        ┌──────────────────────────┐                              │
│   │  market_documents        │        │  advisor_interactions    │                              │
│   │                          │        │                          │                              │
│   │  200+ IEA/EU policies    │        │  MongoDBSaver            │                              │
│   │  voyage-finance-2        │        │  checkpoints             │                              │
│   │  1024-dim vectors        │        │  (LangGraph memory)      │                              │
│   │  Atlas Vector Search     │        │                          │                              │
│   └────────────┬─────────────┘        └──────────┬───────────────┘                              │
│                │                                 │                                              │
└────────────────┼─────────────────────────────────┼──────────────────────────────────────────────┘
                 │                                 │
                 │  $vectorSearch + BM25           │  Conversation memory
                 │                                 │
                 ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                 │
│   ENERLEAFY AI — LangChain ReAct Agent (Claude claude-sonnet-4-6)                              │
│                                                                                                 │
│   ┌───────────────────────────────────────────────────────────────────────────────────────┐     │
│   │                                                                                       │     │
│   │   User question                                                                       │     │
│   │       │                                                                               │     │
│   │       ▼                                                                               │     │
│   │   ┌──────────────────┐                                                                │     │
│   │   │  LLM decides     │◄────────────────────────────────────────────┐                  │     │
│   │   │  which tools     │                                             │                  │     │
│   │   └──┬───────────────┘                                             │                  │     │
│   │      │                                                             │                  │     │
│   │      ▼  Parallel tool execution                                    │                  │     │
│   │   ┌──────────────────────────────────────────────────────────┐     │                  │     │
│   │   │                                                          │     │                  │     │
│   │   │  ┌─────────────────┐  analyze_portfolio                  │     │                  │     │
│   │   │  │ Live fleet data │  Fleet output, prices, gaps,        │     │                  │     │
│   │   │  │ (from frontend) │  weather events, revenue            │     │  tool results    │     │
│   │   │  └─────────────────┘                                     │     │                  │     │
│   │   │                                                          │     │                  │     │
│   │   │  ┌─────────────────┐  search_policies (optional)         │     │                  │     │
│   │   │  │ MongoDB Atlas   │  $vectorSearch on market_documents  │─────┘                  │     │
│   │   │  │ Vector Search   │  voyage-finance-2 embeddings        │                        │     │
│   │   │  └─────────────────┘                                     │                        │     │
│   │   │                                                          │                        │     │
│   │   │  ┌─────────────────┐  web_search / get_energy_news       │                        │     │
│   │   │  │ DuckDuckGo      │  (optional — only for current       │                        │     │
│   │   │  │ Web Search      │   events / breaking news)           │                        │     │
│   │   │  └─────────────────┘                                     │                        │     │
│   │   │                                                          │                        │     │
│   │   │  ┌─────────────────┐  MongoDB MCP Server (optional)      │                        │     │
│   │   │  │ find()          │  Direct database queries            │                        │     │
│   │   │  │ aggregate()     │  when agent needs raw data          │                        │     │
│   │   │  └─────────────────┘                                     │                        │     │
│   │   │                                                          │                        │     │
│   │   └──────────────────────────────────────────────────────────┘                        │     │
│   │                                                                                       │     │
│   │       │                                                                               │     │
│   │       ▼                                                                               │     │
│   │   Stream response tokens via SSE → typewriter effect in browser                       │     │
│   │                                                                                       │     │
│   └───────────────────────────────────────────────────────────────────────────────────────┘     │
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
