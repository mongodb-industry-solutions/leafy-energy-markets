'use client';

import { useState } from 'react';
import { css, keyframes } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Badge from '@leafygreen-ui/badge';
import Icon from '@leafygreen-ui/icon';
import { H3, Subtitle, Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import PageHeader from '@/components/shared/PageHeader';

// ── Architecture diagram data ────────────────────────────────

const WRITE_SIDE_STEPS = [
  { label: 'API Command', desc: 'POST /api/portfolios/{id}/tariff-scenarios', color: palette.blue.base },
  { label: 'Domain Aggregate', desc: 'TariffScenario.record(event)', color: palette.blue.base },
  { label: 'Event Store', desc: 'events_collection.insert_one(event_doc)', color: palette.blue.base },
  { label: 'MongoDB Events', desc: '{ streamId, version, eventType, payload, metadata }', color: palette.green.base },
];

const READ_SIDE_STEPS = [
  { label: 'API Query', desc: 'GET /api/events/stream/{id}/replay', color: palette.yellow.dark2 },
  { label: 'Event Store', desc: 'events_collection.find({streamId}).sort("version")', color: palette.yellow.dark2 },
  { label: 'fold()', desc: 'Replay events onto empty aggregate', color: palette.yellow.dark2 },
  { label: 'Current State', desc: 'Aggregate state reconstructed at any version', color: palette.green.base },
];

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

// ── Animated flow arrow ──────────────────────────────────────

const flow = keyframes`
  0% { stroke-dashoffset: 12; }
  100% { stroke-dashoffset: 0; }
`;

function FlowArrow({ darkMode }: { darkMode: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className={css`flex-shrink: 0;`}>
      <line
        x1="4" y1="12" x2="20" y2="12"
        stroke={darkMode ? palette.gray.light1 : palette.gray.dark1}
        strokeWidth="2"
        strokeDasharray="4,4"
        className={css`animation: ${flow} 0.6s linear infinite;`}
      />
      <polyline
        points="16,8 20,12 16,16"
        stroke={darkMode ? palette.gray.light1 : palette.gray.dark1}
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}

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

      {/* ── CQRS Flow Diagram ─────────────────────────────── */}
      <Card darkMode={darkMode} className={css`padding: 24px;`}>
        <Subtitle className={css`color: ${labelColor} !important; margin-bottom: 16px !important;`}>
          CQRS Data Flow
        </Subtitle>

        <div className={css`display: flex; gap: 24px; @media (max-width: 900px) { flex-direction: column; }`}>
          {/* Write Side */}
          <div className={css`flex: 1;`}>
            <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 12px;`}>
              <Badge variant="blue">Write Side (Commands)</Badge>
              <Body className={css`color: ${mutedColor} !important; font-size: 12px !important;`}>commands.py</Body>
            </div>
            <div className={css`display: flex; flex-direction: column; gap: 8px;`}>
              {WRITE_SIDE_STEPS.map((step, i) => (
                <div key={i}>
                  <div
                    className={css`
                      display: flex;
                      align-items: center;
                      gap: 8px;
                      padding: 10px 14px;
                      border-radius: 6px;
                      border: 1px solid ${borderColor};
                      background: ${darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'};
                    `}
                  >
                    <div className={css`width: 8px; height: 8px; border-radius: 50%; background: ${step.color}; flex-shrink: 0;`} />
                    <div>
                      <div className={css`font-size: 13px; font-weight: 600; color: ${labelColor};`}>{step.label}</div>
                      <div className={css`font-size: 11px; color: ${mutedColor}; font-family: 'Source Code Pro', monospace;`}>{step.desc}</div>
                    </div>
                  </div>
                  {i < WRITE_SIDE_STEPS.length - 1 && (
                    <div className={css`display: flex; justify-content: center; padding: 2px 0;`}>
                      <FlowArrow darkMode={darkMode} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className={css`
            width: 1px;
            background: ${borderColor};
            @media (max-width: 900px) { width: 100%; height: 1px; }
          `} />

          {/* Read Side */}
          <div className={css`flex: 1;`}>
            <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 12px;`}>
              <Badge variant="yellow">Read Side (Queries)</Badge>
              <Body className={css`color: ${mutedColor} !important; font-size: 12px !important;`}>queries.py</Body>
            </div>
            <div className={css`display: flex; flex-direction: column; gap: 8px;`}>
              {READ_SIDE_STEPS.map((step, i) => (
                <div key={i}>
                  <div
                    className={css`
                      display: flex;
                      align-items: center;
                      gap: 8px;
                      padding: 10px 14px;
                      border-radius: 6px;
                      border: 1px solid ${borderColor};
                      background: ${darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'};
                    `}
                  >
                    <div className={css`width: 8px; height: 8px; border-radius: 50%; background: ${step.color}; flex-shrink: 0;`} />
                    <div>
                      <div className={css`font-size: 13px; font-weight: 600; color: ${labelColor};`}>{step.label}</div>
                      <div className={css`font-size: 11px; color: ${mutedColor}; font-family: 'Source Code Pro', monospace;`}>{step.desc}</div>
                    </div>
                  </div>
                  {i < READ_SIDE_STEPS.length - 1 && (
                    <div className={css`display: flex; justify-content: center; padding: 2px 0;`}>
                      <FlowArrow darkMode={darkMode} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
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

      {/* ── Why CQRS for Compliance ───────────────────────── */}
      <Card darkMode={darkMode} className={css`padding: 24px;`}>
        <Subtitle className={css`color: ${labelColor} !important; margin-bottom: 12px !important;`}>
          Why CQRS + Event Sourcing for Energy Compliance
        </Subtitle>
        <Body className={css`color: ${textColor} !important; font-size: 14px !important; line-height: 1.7 !important; margin-bottom: 16px !important;`}>
          Each compliance scenario in the Event Inspector tab demonstrates a specific regulatory requirement that is naturally satisfied by this architecture. Click a regulation to see why CQRS is the right fit:
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
    </div>
  );
}

// ── Reusable code block component ────────────────────────────

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
  const codeColor = darkMode ? palette.gray.light2 : palette.gray.dark2;

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
          color: ${codeColor};
          font-size: 12px;
          line-height: 1.6;
          font-family: 'Source Code Pro', monospace;
          overflow-x: auto;
          white-space: pre;
        `}
      >
        {code}
      </pre>
    </div>
  );
}
