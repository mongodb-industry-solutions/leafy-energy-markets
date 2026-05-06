'use client';

import { useState } from 'react';
import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Badge from '@leafygreen-ui/badge';
import Icon from '@leafygreen-ui/icon';
import { H3, Subtitle, Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import PageHeader from '@/components/shared/PageHeader';
import hljs from 'highlight.js/lib/core';
import hljsPython from 'highlight.js/lib/languages/python';
import hljsTypeScript from 'highlight.js/lib/languages/typescript';

hljs.registerLanguage('python', hljsPython);
hljs.registerLanguage('typescript', hljsTypeScript);

// ── Architecture diagram data ────────────────────────────────

const REGULATIONS = [
  {
    id: 'eu-2017-2195',
    title: 'Electricity Balancing (EU) 2017/2195',
    scenario: 'Imbalance Settlement Audit',
    why: 'TSOs and BRPs dispute 15-min imbalance settlement periods. With event sourcing, every meter reading, trade, and price tick is an immutable event. When a TSO claims a BRP was short, we replay fold() to the disputed ISP and prove — with a cryptographically ordered sequence — whether the corrected meter data shows a long or short position. No data is ever deleted; corrections are new events that reference the version they correct.',
  },
  {
    id: 'eu-1227-2011',
    title: 'REMIT (EU) 1227/2011',
    scenario: 'REMIT Trade Surveillance',
    why: 'ACER requires wholesale energy market participants to maintain complete, unalterable records of orders and trades. Event sourcing stores every order placement, cancellation, and price movement as a separate event. When investigating spoofing, regulators can replay the exact sequence: aggressive buy orders → price spike → large market sell → price collapse. The immutable log proves intent because the temporal ordering is preserved in the event stream version numbers.',
  },
  {
    id: 'eu-2019-944',
    title: 'Electricity Directive 2019/944',
    scenario: 'Flexibility Market Clearing',
    why: 'DSOs and aggregators often disagree on flexibility delivery verification methodology (Method A vs Method B). CQRS lets both parties run different fold() projections over the same immutable meter data. The DSO applies a 10-day average baseline (Method A, 3.2 MW → under-delivery), while the aggregator applies regression-adjusted baselining (Method B, 4.8 MW → within tolerance). Same events, different read models — the dispute resolution happens at the query layer, not the data layer.',
  },
  {
    id: 'cacm-2015-1222',
    title: 'CACM (EU) 2015/1222',
    scenario: 'Cross-Border Capacity Allocation',
    why: 'When Euphemia clears day-ahead cross-border flows, the curtailment from 500 MW requested to 350 MW allocated must be auditable. Event sourcing records every step: TSO flow-based parameters from RTE and Amprion, the capacity allocation request, the Euphemia clearing result, congestion revenue distribution, and the final curtailed trade. Any NRA can replay fold() to verify the 150 MW curtailment was caused by the Vigy-Uchtelfangen CNEC constraint, not by discriminatory allocation.',
  },
];

// ── Sequence diagram data ─────────────────────────────────────

const SWIM_LANES = ['Client', 'API Layer', 'Domain', 'Event Store', 'MongoDB'] as const;

const WRITE_SEQUENCE = [
  { from: 0, to: 1, label: 'POST /portfolios/{id}/tariff-scenarios', style: 'request' as const },
  { from: 1, to: 2, label: 'CreateTariffScenario(command)', style: 'request' as const },
  { from: 2, to: 2, label: 'scenario.record(event)', style: 'self' as const },
  { from: 2, to: 3, label: 'event_store.save(scenario, events)', style: 'request' as const },
  { from: 3, to: 4, label: 'insert_one(event_doc, session)', style: 'request' as const },
  { from: 4, to: 3, label: 'ack (with version uniqueness check)', style: 'response' as const },
  { from: 3, to: 1, label: '{ scenario_id }', style: 'response' as const },
  { from: 1, to: 0, label: '201 Created', style: 'response' as const },
];

const READ_SEQUENCE = [
  { from: 0, to: 1, label: 'GET /events/stream/{id}/replay', style: 'request' as const },
  { from: 1, to: 3, label: 'store.replay_stream(stream_id)', style: 'request' as const },
  { from: 3, to: 4, label: 'find({streamId}).sort("version")', style: 'request' as const },
  { from: 4, to: 3, label: '[event_doc, event_doc, ...]', style: 'response' as const },
  { from: 3, to: 3, label: 'fold(aggregate, events)', style: 'self' as const },
  { from: 3, to: 1, label: '{ steps: [state@v1, state@v2, ...] }', style: 'response' as const },
  { from: 1, to: 0, label: '200 OK — full replay history', style: 'response' as const },
];

// ── Code blocks ──────────────────────────────────────────────

const FOLD_PYTHON = `def fold(aggregate: A, events: list[DomainEvent]) -> A:
    """
    Folds a list of events onto an aggregate to reconstruct its state.
    """
    for event in events:
        aggregate.apply(event)
    return aggregate`;

const APPLY_PYTHON = `class Aggregate(BaseModel):
    id: str
    version: int = 0

    def apply(self, event: DomainEvent):
        """
        Applies an event to the aggregate, changing its state.
        Uses dynamic dispatch: apply_<EventClassName>
        """
        method_name = f"apply_{event.__class__.__name__}"
        method = getattr(self, method_name, None)
        if method:
            method(event)
        self.version += 1`;

const INSTRUMENT_AGGREGATE = `class Instrument(Aggregate):
    name: str | None = None
    last_price: float | None = None

    def apply_InstrumentListed(self, event: InstrumentListed):
        self.name = event.name

    def apply_PriceTickRecorded(self, event: PriceTickRecorded):
        self.last_price = event.price`;

const EVENT_STORE_GET = `class EventStore(Generic[A]):
    def get(self, aggregate_id: str) -> A:
        """Loads an aggregate by replaying its events."""
        event_docs = self.events_collection.find(
            {"streamId": aggregate_id}
        ).sort("version")

        events = []
        for doc in event_docs:
            event_type = EVENT_TYPE_MAP.get(doc["eventType"])
            if not event_type:
                continue
            events.append(event_type(**doc["payload"]))

        aggregate = self.aggregate_type(id=aggregate_id)
        return fold(aggregate, events)`;

const EVENT_STORE_SAVE = `def save(self, aggregate: A, events: list[DomainEvent]) -> None:
    """Saves new events, ensuring optimistic concurrency."""
    if not events:
        return

    with self.db.client.start_session() as session:
        with session.start_transaction():
            for event in events:
                event_doc = self._to_event_document(aggregate, event)
                try:
                    self.events_collection.insert_one(
                        event_doc, session=session
                    )
                except DuplicateKeyError:
                    raise  # Optimistic concurrency violation`;

const FOLD_TS = `function foldEvents(
  events: StoredEvent[],
  upTo: number
): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  const applied = events.filter((e) => e.version <= upTo);

  for (const evt of applied) {
    state._version = evt.version;
    state._lastEventType = evt.eventType;
    state._streamId = evt.streamId;

    switch (evt.eventType) {
      case 'TradeExecuted': {
        const p = evt.payload;
        const prev = (state.net_position as number) || 0;
        state.portfolio_id = p.portfolio_id;
        state.instrument_id = p.instrument_id;
        state.last_trade_price = p.price;
        state.net_position = prev + (p.quantity as number);
        state.trade_count =
          ((state.trade_count as number) || 0) + 1;
        break;
      }
      case 'MeterReadingRecorded': {
        const p = evt.payload;
        state.meter_id = p.meter_id;
        state.last_reading = p.reading;
        if (evt.metadata.corrects_version) {
          state.correction_applied = true;
          state.corrects_version = evt.metadata.corrects_version;
        }
        break;
      }
      // ... other event handlers
    }
  }
  return state;
}`;

const COMMAND_HANDLER = `@router.post("/portfolios/{portfolio_id}/tariff-scenarios")
async def create_tariff_scenario(
    portfolio_id: str,
    command: CreateTariffScenario,
    client: MongoClient = Depends(get_db)
):
    event_store = EventStore(client, TariffScenario)
    scenario_id = str(uuid.uuid4())
    scenario = TariffScenario(id=scenario_id)

    event = TariffScenarioCreated(
        scenario_id=scenario_id,
        portfolio_id=command.portfolio_id,
        region=command.region,
        from_date=command.from_date,
        to_date=command.to_date
    )

    scenario.record(event)
    event_store.save(scenario, scenario._pending_events)
    return {"scenario_id": scenario_id}`;

const REPLAY_ENDPOINT = `@router.get("/events/stream/{stream_id}/replay")
async def replay_stream(
    stream_id: str,
    up_to_version: int | None = Query(None),
    client: MongoClient = Depends(get_db),
):
    """Demonstrates fold() — returns state at each step."""
    store = EventStore(client, TariffScenario)
    steps = store.replay_stream(stream_id, up_to_version)
    return {"streamId": stream_id, "steps": steps}`;

// ── Page component ───────────────────────────────────────────

export default function CQRSPage() {
  const { darkMode } = useDarkMode();
  const [expandedReg, setExpandedReg] = useState<string | null>(REGULATIONS[0].id);

  const textColor = darkMode ? palette.gray.light2 : palette.gray.dark2;
  const mutedColor = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const labelColor = darkMode ? palette.white : palette.black;
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const codeBg = darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
  const codeColor = darkMode ? palette.gray.light2 : palette.gray.dark2;
  const accentBg = darkMode ? 'rgba(0,130,0,0.08)' : palette.green.light3;

  return (
    <div className={css`display: flex; flex-direction: column; gap: 24px; padding-bottom: 60px;`}>
      <PageHeader
        title="CQRS + Event Sourcing"
        subtitle="Why this architecture is purpose-built for energy market compliance audits"
      />

      {/* ── Overview ───────────────────────────────────────── */}
      <Card darkMode={darkMode} className={css`padding: 24px;`}>
        <Subtitle className={css`color: ${labelColor} !important; margin-bottom: 12px !important;`}>
          Architecture Overview
        </Subtitle>
        <Body className={css`color: ${textColor} !important; font-size: 14px !important; line-height: 1.7 !important;`}>
          This platform uses <strong className={css`color: ${labelColor};`}>CQRS (Command Query Responsibility Segregation)</strong> combined with <strong className={css`color: ${labelColor};`}>Event Sourcing</strong> to separate write operations (commands that produce events) from read operations (queries that replay events to reconstruct state). Instead of storing the current state of an entity, we store the complete sequence of domain events that led to that state. The current state is always derived by <strong className={css`color: ${labelColor};`}>folding</strong> events — replaying them one by one onto an empty aggregate.
        </Body>
        <div
          className={css`
            margin-top: 16px;
            padding: 16px;
            border-radius: 8px;
            background: ${accentBg};
            border-left: 3px solid ${palette.green.base};
          `}
        >
          <Body className={css`color: ${labelColor} !important; font-size: 13px !important; font-weight: 600 !important; margin-bottom: 4px !important;`}>
            Why not just use a regular database?
          </Body>
          <Body className={css`color: ${textColor} !important; font-size: 13px !important; line-height: 1.6 !important;`}>
            In a traditional CRUD system, <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 12px;`}>UPDATE</code> overwrites the previous value. When ACER asks "what was the exact order sequence that caused this price spike at 16:49?", a CRUD database can only show the final state. Event sourcing preserves the full causal chain: every trade, every price tick, every meter reading — immutable, ordered, and auditable. This is not a nice-to-have; EU regulations like REMIT and the Electricity Balancing Guideline explicitly require reconstructable audit trails.
          </Body>
        </div>
      </Card>

      {/* ── Why CQRS for Compliance ───────────────────────── */}
      <Card darkMode={darkMode} className={css`padding: 24px;`}>
        <Subtitle className={css`color: ${labelColor} !important; margin-bottom: 12px !important;`}>
          Why CQRS + Event Sourcing for Energy Compliance
        </Subtitle>
        <Body className={css`color: ${textColor} !important; font-size: 14px !important; line-height: 1.7 !important; margin-bottom: 16px !important;`}>
          Each compliance scenario demonstrates a specific regulatory requirement that is naturally satisfied by this architecture. Click a regulation to see why CQRS is the right fit:
        </Body>

        <div className={css`display: flex; flex-direction: column; gap: 8px;`}>
          {REGULATIONS.map((reg) => {
            const isExpanded = expandedReg === reg.id;
            return (
              <div key={reg.id}>
                <button
                  onClick={() => setExpandedReg(isExpanded ? null : reg.id)}
                  className={css`
                    width: 100%;
                    text-align: left;
                    background: ${isExpanded ? accentBg : darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'};
                    border: 1px solid ${isExpanded ? palette.green.base : borderColor};
                    border-radius: 8px;
                    padding: 14px 18px;
                    cursor: pointer;
                    font-family: inherit;
                    transition: all 0.15s ease;
                    &:hover { border-color: ${palette.green.base}; }
                  `}
                >
                  <div className={css`display: flex; align-items: center; justify-content: space-between;`}>
                    <div className={css`display: flex; align-items: center; gap: 10px;`}>
                      <Icon
                        glyph={isExpanded ? 'ChevronDown' : 'ChevronRight'}
                        size={16}
                        fill={palette.green.base}
                      />
                      <span className={css`font-size: 14px; font-weight: 600; color: ${labelColor};`}>
                        {reg.scenario}
                      </span>
                      <Badge variant="blue">{reg.title}</Badge>
                    </div>
                  </div>
                </button>
                {isExpanded && (
                  <div
                    className={css`
                      padding: 16px 18px 16px 44px;
                      border: 1px solid ${borderColor};
                      border-top: none;
                      border-radius: 0 0 8px 8px;
                      background: ${darkMode ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.01)'};
                    `}
                  >
                    <Body className={css`color: ${textColor} !important; font-size: 13px !important; line-height: 1.7 !important;`}>
                      {reg.why}
                    </Body>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Key Properties ────────────────────────────────── */}
      <Card darkMode={darkMode} className={css`padding: 24px;`}>
        <Subtitle className={css`color: ${labelColor} !important; margin-bottom: 16px !important;`}>
          Key Properties
        </Subtitle>
        <div className={css`
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 12px;
        `}>
          {[
            {
              title: 'Immutability',
              desc: 'Events are append-only. No UPDATE, no DELETE. Once a trade is recorded, it exists forever in the stream. Corrections are new events that reference the version they correct.',
              badge: 'Audit',
              variant: 'green' as const,
            },
            {
              title: 'Temporal Query',
              desc: 'fold() can replay to any version. "What was the portfolio state at 14:15?" is a query, not a guess. Time-travel debugging is built into the architecture.',
              badge: 'Replay',
              variant: 'blue' as const,
            },
            {
              title: 'Optimistic Concurrency',
              desc: 'MongoDB transactions + version-based unique index prevent conflicting writes. Two commands targeting the same stream version fail fast — no silent data loss.',
              badge: 'Consistency',
              variant: 'yellow' as const,
            },
            {
              title: 'Separate Read Models',
              desc: 'Different stakeholders can project different views from the same events. A DSO and an aggregator can each fold() with different methodologies and compare results.',
              badge: 'CQRS',
              variant: 'red' as const,
            },
          ].map((item) => (
            <div
              key={item.title}
              className={css`
                padding: 16px;
                border-radius: 8px;
                border: 1px solid ${borderColor};
                background: ${darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'};
              `}
            >
              <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 8px;`}>
                <Badge variant={item.variant}>{item.badge}</Badge>
                <span className={css`font-size: 14px; font-weight: 600; color: ${labelColor};`}>
                  {item.title}
                </span>
              </div>
              <Body className={css`color: ${textColor} !important; font-size: 12px !important; line-height: 1.6 !important;`}>
                {item.desc}
              </Body>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Time Series + CQRS ─────────────────────────────── */}
      <Card darkMode={darkMode} className={css`padding: 24px;`}>
        <Subtitle className={css`color: ${labelColor} !important; margin-bottom: 12px !important;`}>
          Event Sourcing on a Time Series Collection
        </Subtitle>
        <Body className={css`color: ${textColor} !important; font-size: 14px !important; line-height: 1.7 !important; margin-bottom: 16px !important;`}>
          This platform stores all events in a single <strong className={css`color: ${labelColor};`}>MongoDB Time Series collection</strong> (<code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 13px;`}>trading_events</code>) with <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 13px;`}>timeField: timestamp</code>, <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 13px;`}>metaField: streamType</code>, and a 7-day auto-expiry TTL. This gives us 10-20x storage compression via columnar bucketing and automatic cleanup — ideal for high-frequency telemetry from SCADA/RTU systems generating 3-6 events per second.
        </Body>

        <div
          className={css`
            margin-bottom: 16px;
            padding: 16px;
            border-radius: 8px;
            background: ${accentBg};
            border-left: 3px solid ${palette.green.base};
          `}
        >
          <Body className={css`color: ${labelColor} !important; font-size: 13px !important; font-weight: 600 !important; margin-bottom: 4px !important;`}>
            Can you build CQRS on a Time Series collection?
          </Body>
          <Body className={css`color: ${textColor} !important; font-size: 13px !important; line-height: 1.6 !important;`}>
            <strong className={css`color: ${labelColor};`}>Yes</strong>, with one trade-off. Time Series collections don&apos;t support unique indexes or multi-document transactions — so you lose <strong className={css`color: ${labelColor};`}>optimistic concurrency</strong> at the database level. The <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 12px;`}>{'{streamId, version}'}</code> unique index that prevents two writers from appending conflicting events to the same stream simultaneously cannot be enforced. For a single-writer system like this trading simulator, that&apos;s perfectly fine. The CQRS pattern, <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 12px;`}>fold()</code> replay, Change Stream projections, and append-only guarantees all work identically.
          </Body>
        </div>

        <div className={css`display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; @media (max-width: 900px) { grid-template-columns: 1fr; }`}>
          <div className={css`padding: 16px; background: ${darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'}; border: 1px solid ${borderColor}; border-radius: 8px;`}>
            <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 8px;`}>
              <Badge variant="green">This Demo</Badge>
              <span className={css`font-size: 13px; font-weight: 600; color: ${labelColor};`}>Single Collection</span>
            </div>
            <Body className={css`color: ${textColor} !important; font-size: 12px !important; line-height: 1.6 !important;`}>
              All 9 event types in one <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 11px;`}>trading_events</code> time series collection. Single writer (simulator). fold() replays by timestamp. 10-20x compression. Change Streams power the live feed.
            </Body>
          </div>

          <div className={css`padding: 16px; background: ${darkMode ? 'rgba(0,237,100,0.04)' : 'rgba(0,180,60,0.04)'}; border: 1px solid ${palette.green.base}44; border-radius: 8px;`}>
            <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 8px;`}>
              <Badge variant="green">Recommended</Badge>
              <span className={css`font-size: 13px; font-weight: 600; color: ${labelColor};`}>Collection per Asset</span>
            </div>
            <Body className={css`color: ${textColor} !important; font-size: 12px !important; line-height: 1.6 !important;`}>
              One time series collection per generator asset: <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 11px;`}>events_wind_nl_001</code>, <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 11px;`}>events_solar_es_001</code>, etc. Each asset&apos;s SCADA/RTU is the <strong className={css`color: ${labelColor};`}>sole writer</strong> to its own collection — <strong className={css`color: ${labelColor};`}>eliminating the need for optimistic concurrency entirely</strong>. Portfolio-level events (trades, P&amp;L) go to a separate <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 11px;`}>events_portfolio</code> collection, also single-writer. Watch all collections at once with <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 11px;`}>db.watch()</code>.
            </Body>
          </div>

          <div className={css`padding: 16px; background: ${darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'}; border: 1px solid ${borderColor}; border-radius: 8px;`}>
            <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 8px;`}>
              <Badge variant="blue">Multi-Writer</Badge>
              <span className={css`font-size: 13px; font-weight: 600; color: ${labelColor};`}>Standard + Time Series</span>
            </div>
            <Body className={css`color: ${textColor} !important; font-size: 12px !important; line-height: 1.6 !important;`}>
              When multiple traders write to the <em>same</em> stream (e.g. 50 traders submitting orders to one portfolio), use a standard collection with <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 11px;`}>{'{streamId, version}'}</code> unique index + transactions. Keep time series alongside for telemetry. This is the only scenario that requires optimistic concurrency.
            </Body>
          </div>
        </div>
      </Card>

      {/* ── CQRS Sequence Diagram ─────────────────────────── */}
      <Card darkMode={darkMode} className={css`padding: 24px; overflow-x: auto;`}>
        <Subtitle className={css`color: ${labelColor} !important; margin-bottom: 4px !important;`}>
          CQRS Data Flow — Sequence Diagram
        </Subtitle>
        <Body className={css`color: ${mutedColor} !important; font-size: 13px !important; margin-bottom: 20px !important;`}>
          Follow the numbered steps to see how commands (writes) and queries (reads) travel through the system.
        </Body>

        <SequenceDiagram
          darkMode={darkMode}
          title="Write Side (Command)"
          badgeVariant="blue"
          steps={WRITE_SEQUENCE}
          requestColor={palette.blue.base}
          responseColor={palette.green.base}
          labelColor={labelColor}
          mutedColor={mutedColor}
          borderColor={borderColor}
        />

        <div className={css`height: 24px;`} />

        <SequenceDiagram
          darkMode={darkMode}
          title="Read Side (Query)"
          badgeVariant="yellow"
          steps={READ_SEQUENCE}
          requestColor={palette.yellow.dark2}
          responseColor={palette.green.base}
          labelColor={labelColor}
          mutedColor={mutedColor}
          borderColor={borderColor}
        />
      </Card>

      {/* ── fold() Deep Dive ──────────────────────────────── */}
      <Card darkMode={darkMode} className={css`padding: 24px;`}>
        <div className={css`display: flex; align-items: center; gap: 10px; margin-bottom: 16px;`}>
          <Subtitle className={css`color: ${labelColor} !important;`}>
            The fold() Function — Heart of Event Sourcing
          </Subtitle>
          <Badge variant="green">backend/app/domain/aggregates.py</Badge>
        </div>
        <Body className={css`color: ${textColor} !important; font-size: 14px !important; line-height: 1.7 !important; margin-bottom: 16px !important;`}>
          <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 13px;`}>fold()</code> is the single most important function in the system. It takes an empty aggregate and a list of domain events, and replays each event to reconstruct the aggregate&apos;s current state. This is a pure function — given the same events, it always produces the same state. This property is what makes event sourcing auditable: you can reconstruct the state at <strong className={css`color: ${labelColor};`}>any point in time</strong> by replaying events up to a specific version.
        </Body>

        <CodeBlock darkMode={darkMode} title="fold() — the core replay function" file="backend/app/domain/aggregates.py" lang="python" code={FOLD_PYTHON} />

        <Body className={css`color: ${textColor} !important; font-size: 13px !important; line-height: 1.6 !important; margin: 16px 0 !important;`}>
          The function is deceptively simple — it iterates through events and calls <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 12px;`}>aggregate.apply(event)</code> on each one. The power is in the <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 12px;`}>apply()</code> method, which uses dynamic dispatch to find the right handler:
        </Body>

        <CodeBlock darkMode={darkMode} title="Aggregate base class — dynamic dispatch" file="backend/app/domain/aggregates.py" lang="python" code={APPLY_PYTHON} />

        <Body className={css`color: ${textColor} !important; font-size: 13px !important; line-height: 1.6 !important; margin: 16px 0 !important;`}>
          Each concrete aggregate defines handler methods following the <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 12px;`}>apply_&lt;EventClassName&gt;</code> convention. When <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 12px;`}>fold()</code> replays an <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 12px;`}>InstrumentListed</code> event, it calls <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 12px;`}>apply_InstrumentListed()</code>. When it replays a <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 12px;`}>PriceTickRecorded</code>, it calls <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 12px;`}>apply_PriceTickRecorded()</code>:
        </Body>

        <CodeBlock darkMode={darkMode} title="Instrument aggregate — event handlers" file="backend/app/domain/aggregates.py" lang="python" code={INSTRUMENT_AGGREGATE} />
      </Card>

      {/* ── Event Store ───────────────────────────────────── */}
      <Card darkMode={darkMode} className={css`padding: 24px;`}>
        <div className={css`display: flex; align-items: center; gap: 10px; margin-bottom: 16px;`}>
          <Subtitle className={css`color: ${labelColor} !important;`}>
            Event Store — MongoDB as the Append-Only Log
          </Subtitle>
          <Badge variant="green">backend/app/infrastructure/event_store.py</Badge>
        </div>
        <Body className={css`color: ${textColor} !important; font-size: 14px !important; line-height: 1.7 !important; margin-bottom: 16px !important;`}>
          The EventStore is the infrastructure layer that persists events to MongoDB and reconstructs aggregates by replaying them with <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 13px;`}>fold()</code>. On the write side, it uses MongoDB transactions for optimistic concurrency — if two commands try to write the same version, one fails with a DuplicateKeyError. On the read side, it queries events by streamId, sorted by version, and replays them.
        </Body>

        <div className={css`display: flex; flex-direction: column; gap: 16px;`}>
          <CodeBlock darkMode={darkMode} title="EventStore.get() — Reconstruct aggregate via fold()" file="backend/app/infrastructure/event_store.py" lang="python" code={EVENT_STORE_GET} />
          <CodeBlock darkMode={darkMode} title="EventStore.save() — Append events with optimistic concurrency" file="backend/app/infrastructure/event_store.py" lang="python" code={EVENT_STORE_SAVE} />
        </div>
      </Card>

      {/* ── Command & Query Separation ────────────────────── */}
      <Card darkMode={darkMode} className={css`padding: 24px;`}>
        <div className={css`display: flex; align-items: center; gap: 10px; margin-bottom: 16px;`}>
          <Subtitle className={css`color: ${labelColor} !important;`}>
            Command & Query Separation in Practice
          </Subtitle>
        </div>
        <Body className={css`color: ${textColor} !important; font-size: 14px !important; line-height: 1.7 !important; margin-bottom: 16px !important;`}>
          The CQRS pattern separates the write path (commands that produce events) from the read path (queries that replay events). In FastAPI, this is reflected in two separate routers: <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 13px;`}>commands.py</code> handles POST endpoints that create new events, while <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 13px;`}>queries.py</code> handles GET endpoints that replay event streams.
        </Body>

        <div className={css`display: flex; gap: 16px; @media (max-width: 900px) { flex-direction: column; }`}>
          <div className={css`flex: 1;`}>
            <CodeBlock darkMode={darkMode} title="Write Side — Command Handler" file="backend/app/api/commands.py" lang="python" code={COMMAND_HANDLER} />
          </div>
          <div className={css`flex: 1;`}>
            <CodeBlock darkMode={darkMode} title="Read Side — Replay Query" file="backend/app/api/queries.py" lang="python" code={REPLAY_ENDPOINT} />
          </div>
        </div>
      </Card>

      {/* ── Frontend fold() ───────────────────────────────── */}
      <Card darkMode={darkMode} className={css`padding: 24px;`}>
        <div className={css`display: flex; align-items: center; gap: 10px; margin-bottom: 16px;`}>
          <Subtitle className={css`color: ${labelColor} !important;`}>
            Client-Side fold() — Time-Travel in the Browser
          </Subtitle>
          <Badge variant="green">frontend/components/audit/AggregateStateView.tsx</Badge>
        </div>
        <Body className={css`color: ${textColor} !important; font-size: 14px !important; line-height: 1.7 !important; margin-bottom: 16px !important;`}>
          The Event Inspector tab uses a client-side implementation of <code className={css`background: ${codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 13px;`}>fold()</code> in TypeScript. This allows the UI to scrub back and forth through event history in real-time without making API calls — the same replay logic runs in the browser. When you drag the version slider, this function re-folds events up to that version and the aggregate state updates instantly.
        </Body>

        <CodeBlock darkMode={darkMode} title="foldEvents() — Client-side event replay" file="frontend/components/audit/AggregateStateView.tsx" lang="typescript" code={FOLD_TS} />
      </Card>

    </div>
  );
}

// ── Sequence diagram component ───────────────────────────────

type SeqStep = {
  from: number;
  to: number;
  label: string;
  style: 'request' | 'response' | 'self';
};

function SequenceDiagram({
  darkMode,
  title,
  badgeVariant,
  steps,
  requestColor,
  responseColor,
  labelColor,
  mutedColor,
  borderColor,
}: {
  darkMode: boolean;
  title: string;
  badgeVariant: 'blue' | 'yellow';
  steps: SeqStep[];
  requestColor: string;
  responseColor: string;
  labelColor: string;
  mutedColor: string;
  borderColor: string;
}) {
  const laneCount = SWIM_LANES.length;
  const laneWidth = 220;
  const totalWidth = laneCount * laneWidth;
  const headerHeight = 56;
  const rowHeight = 56;
  const diagramHeight = headerHeight + steps.length * rowHeight + 16;

  const laneX = (i: number) => i * laneWidth + laneWidth / 2;

  return (
    <div>
      <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 12px;`}>
        <Badge variant={badgeVariant}>{title}</Badge>
        <div className={css`display: flex; align-items: center; gap: 12px; margin-left: 8px;`}>
          <div className={css`display: flex; align-items: center; gap: 4px;`}>
            <div className={css`width: 20px; height: 2px; background: ${requestColor};`} />
            <span className={css`font-size: 11px; color: ${mutedColor};`}>request</span>
          </div>
          <div className={css`display: flex; align-items: center; gap: 4px;`}>
            <div className={css`width: 20px; height: 2px; background: ${responseColor}; border-top: 2px dashed ${responseColor}; height: 0;`} />
            <span className={css`font-size: 11px; color: ${mutedColor};`}>response</span>
          </div>
        </div>
      </div>

      <div className={css`overflow-x: auto; border: 1px solid ${borderColor}; border-radius: 8px; background: ${darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'};`}>
        <svg
          width="100%"
          height={diagramHeight}
          viewBox={`0 0 ${totalWidth} ${diagramHeight}`}
          preserveAspectRatio="xMidYMid meet"
          className={css`display: block; min-width: ${totalWidth}px;`}
        >
          {/* Lane headers */}
          {SWIM_LANES.map((lane, i) => (
            <g key={lane}>
              <rect
                x={laneX(i) - 64}
                y={8}
                width={128}
                height={34}
                rx={6}
                fill={darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}
                stroke={borderColor}
                strokeWidth={1}
              />
              <text
                x={laneX(i)}
                y={30}
                textAnchor="middle"
                fill={labelColor}
                fontSize={13}
                fontWeight={600}
                fontFamily="'Euclid Circular A', sans-serif"
              >
                {lane}
              </text>
            </g>
          ))}

          {/* Lifelines */}
          {SWIM_LANES.map((_, i) => (
            <line
              key={i}
              x1={laneX(i)}
              y1={headerHeight}
              x2={laneX(i)}
              y2={diagramHeight}
              stroke={borderColor}
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          ))}

          {/* Message arrows */}
          {steps.map((step, idx) => {
            const y = headerHeight + idx * rowHeight + rowHeight / 2 + 4;
            const color = step.style === 'response' ? responseColor : requestColor;
            const isDashed = step.style === 'response';

            if (step.style === 'self') {
              // Self-call loop
              const x = laneX(step.from);
              return (
                <g key={idx}>
                  {/* Step number */}
                  <circle cx={18} cy={y} r={12} fill={color} opacity={0.15} />
                  <text x={18} y={y + 4} textAnchor="middle" fill={color} fontSize={12} fontWeight={700}>
                    {idx + 1}
                  </text>
                  {/* Self-loop */}
                  <path
                    d={`M ${x} ${y - 8} L ${x + 32} ${y - 8} L ${x + 32} ${y + 8} L ${x + 5} ${y + 8}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  {/* Arrowhead */}
                  <polygon
                    points={`${x + 5},${y + 4} ${x + 5},${y + 12} ${x - 1},${y + 8}`}
                    fill={color}
                  />
                  {/* Label */}
                  <text
                    x={x + 38}
                    y={y + 1}
                    fill={mutedColor}
                    fontSize={12}
                    fontFamily="'Source Code Pro', monospace"
                  >
                    {step.label}
                  </text>
                </g>
              );
            }

            const x1 = laneX(step.from);
            const x2 = laneX(step.to);
            const direction = x2 > x1 ? 1 : -1;
            const arrowTip = x2;
            const arrowBase = x2 - direction * 8;

            return (
              <g key={idx}>
                {/* Step number */}
                <circle cx={18} cy={y} r={12} fill={color} opacity={0.15} />
                <text x={18} y={y + 4} textAnchor="middle" fill={color} fontSize={12} fontWeight={700}>
                  {idx + 1}
                </text>
                {/* Line */}
                <line
                  x1={x1}
                  y1={y}
                  x2={arrowBase}
                  y2={y}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeDasharray={isDashed ? '6,3' : 'none'}
                />
                {/* Arrowhead */}
                <polygon
                  points={`${arrowTip},${y} ${arrowBase},${y - 4} ${arrowBase},${y + 4}`}
                  fill={color}
                />
                {/* Label — centered above the arrow */}
                <text
                  x={(x1 + x2) / 2}
                  y={y - 10}
                  textAnchor="middle"
                  fill={mutedColor}
                  fontSize={12}
                  fontFamily="'Source Code Pro', monospace"
                >
                  {step.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ── Reusable code block component (powered by highlight.js) ──

function CodeBlock({
  darkMode,
  title,
  file,
  lang,
  code,
}: {
  darkMode: boolean;
  title: string;
  file: string;
  lang: string;
  code: string;
}) {
  const labelColor = darkMode ? palette.white : palette.black;
  const mutedColor = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const codeBg = darkMode ? '#0d1117' : '#f6f8fa';

  // highlight.js token colors — dark / light variants
  const kw   = darkMode ? '#c792ea' : '#7c3aed';   // keyword
  const str  = darkMode ? '#c3e88d' : '#16a34a';   // string / literal
  const cmt  = darkMode ? '#546e7a' : '#9ca3af';   // comment
  const fn   = darkMode ? '#82aaff' : '#2563eb';   // function / title
  const dec  = darkMode ? '#ffcb6b' : '#d97706';   // decorator / meta
  const tp   = darkMode ? '#f78c6c' : '#ea580c';   // type / built-in
  const num  = darkMode ? '#f78c6c' : '#c2410c';   // number
  const dflt = darkMode ? '#d4d4d4' : '#374151';   // default text

  const hljsTheme = css`
    .hljs-keyword, .hljs-operator, .hljs-punctuation { color: ${kw}; }
    .hljs-string, .hljs-template-variable { color: ${str}; }
    .hljs-comment, .hljs-quote { color: ${cmt}; font-style: italic; }
    .hljs-title, .hljs-title.function_, .hljs-title.class_ { color: ${fn}; }
    .hljs-meta, .hljs-meta .hljs-keyword { color: ${dec}; }
    .hljs-type, .hljs-built_in, .hljs-selector-tag { color: ${tp}; }
    .hljs-number, .hljs-literal { color: ${num}; }
    .hljs-variable, .hljs-name, .hljs-attr { color: ${dflt}; }
    .hljs-params { color: ${tp}; }
  `;

  let highlightedHtml: string;
  try {
    highlightedHtml = hljs.highlight(code, { language: lang }).value;
  } catch {
    highlightedHtml = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return (
    <div
      className={css`
        border: 1px solid ${borderColor};
        border-radius: 8px;
        overflow: hidden;
      `}
    >
      <div
        className={css`
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 14px;
          background: ${darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'};
          border-bottom: 1px solid ${borderColor};
        `}
      >
        <span className={css`font-size: 12px; font-weight: 600; color: ${labelColor};`}>{title}</span>
        <div className={css`display: flex; align-items: center; gap: 8px;`}>
          <Badge variant="lightgray">{lang}</Badge>
          <span className={css`font-size: 11px; color: ${mutedColor}; font-family: 'Source Code Pro', monospace;`}>{file}</span>
        </div>
      </div>
      <pre
        className={css`
          margin: 0;
          padding: 16px;
          background: ${codeBg};
          color: ${dflt};
          font-size: 12px;
          line-height: 1.6;
          font-family: 'Source Code Pro', monospace;
          overflow-x: auto;
          white-space: pre;
          ${hljsTheme}
        `}
      >
        <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      </pre>
    </div>
  );
}
