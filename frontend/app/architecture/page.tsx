'use client';

import { useState } from 'react';
import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Badge from '@leafygreen-ui/badge';
import { H2, Subtitle, Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import PageHeader from '@/components/shared/PageHeader';
import { AutonomyScale } from '@/components/shared/AutonomyBadge';

type ViewLevel = 'context' | 'container' | 'component' | 'togaf' | 'bvp';

const C4_VIEWS: { id: ViewLevel; label: string; badge: string }[] = [
  { id: 'context', label: 'System Context (C1)', badge: 'ISO 42010' },
  { id: 'container', label: 'Container Diagram (C2)', badge: 'C4 Model' },
  { id: 'component', label: 'Component Diagram (C3)', badge: 'SOLID' },
  { id: 'togaf', label: 'TOGAF ADM Mapping', badge: 'TOGAF' },
  { id: 'bvp', label: 'AI Agent Autonomy', badge: 'BVP' },
];

export default function ArchitecturePage() {
  const { darkMode } = useDarkMode();
  const [activeView, setActiveView] = useState<ViewLevel>('context');
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const headingColor = darkMode ? palette.white : palette.black;
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const codeBg = darkMode ? '#0d1b24' : '#f5f6f7';
  const boxBg = darkMode ? '#112733' : palette.white;
  const accentGreen = palette.green.base;

  return (
    <div className={css`display: flex; flex-direction: column; gap: 24px;`}>
      <PageHeader
        title="EnerLeafy AI Architecture"
        subtitle="AI system architecture conforming to ISO/IEC/IEEE 42010:2011, C4 Model, and TOGAF ADM with SOLID principles"
      />

      {/* View Selector */}
      <div className={css`display: flex; gap: 8px; flex-wrap: wrap;`}>
        {C4_VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setActiveView(v.id)}
            className={css`
              padding: 10px 16px;
              border-radius: 8px;
              border: 2px solid ${activeView === v.id ? accentGreen : borderColor};
              background: ${activeView === v.id ? (darkMode ? palette.green.dark3 : palette.green.light3) : 'transparent'};
              color: ${activeView === v.id ? accentGreen : textColor};
              cursor: pointer;
              font-size: 13px;
              font-weight: 600;
              display: flex;
              align-items: center;
              gap: 8px;
              transition: all 0.15s ease;
              &:hover { border-color: ${accentGreen}; }
            `}
          >
            {v.label}
            <Badge variant={activeView === v.id ? 'green' : 'lightgray'}>{v.badge}</Badge>
          </button>
        ))}
      </div>

      {/* Architectural Decision Record */}
      <Card darkMode={darkMode} className={css`padding: 20px;`}>
        <Subtitle className={css`color: ${headingColor} !important; margin-bottom: 8px !important;`}>
          Architectural Decision Record (ADR)
        </Subtitle>
        <Body className={css`color: ${textColor} !important; font-size: 13px !important; line-height: 1.6 !important;`}>
          Per ISO/IEC/IEEE 42010:2011 Section 5.2, this architecture description documents the system of interest (EnerLeafy AI Platform),
          its stakeholders (energy traders, compliance officers, portfolio managers), and the concerns addressed (real-time market intelligence,
          regulatory compliance, portfolio optimization). Each viewpoint below corresponds to a C4 model level and maps to a TOGAF ADM phase.
        </Body>
      </Card>

      {/* C1: System Context */}
      {activeView === 'context' && (
        <div className={css`display: flex; flex-direction: column; gap: 16px;`}>
          <Card darkMode={darkMode} className={css`padding: 20px;`}>
            <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 12px;`}>
              <H2 className={css`color: ${headingColor} !important; font-size: 18px !important;`}>
                C1: System Context — Stakeholders &amp; External Systems
              </H2>
              <Badge variant="blue">TOGAF Phase A: Architecture Vision</Badge>
            </div>
            <pre className={css`
              background: ${codeBg};
              border: 1px solid ${borderColor};
              border-radius: 8px;
              padding: 20px;
              font-size: 12px;
              line-height: 1.6;
              color: ${accentGreen};
              overflow-x: auto;
              white-space: pre;
            `}>{`
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL ACTORS                                     │
│                                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐      │
│  │  Energy   │  │  Compliance  │  │  Portfolio   │  │  Risk Manager  │      │
│  │  Trader   │  │  Officer     │  │  Manager     │  │                │      │
│  └─────┬────┘  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘      │
│        │               │                 │                   │              │
└────────┼───────────────┼─────────────────┼───────────────────┼──────────────┘
         │               │                 │                   │
         ▼               ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                    ┌─────────────────────────────┐                          │
│                    │    EnerLeafy AI Platform     │                          │
│                    │                             │                          │
│                    │  • VPP Dashboard            │                          │
│                    │  • EnerLeafy AI Agent       │                          │
│                    │  • Compliance Auditing      │                          │
│                    │  • CQRS Event Store         │                          │
│                    └──────────────┬──────────────┘                          │
│                                  │                                          │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│  MongoDB Atlas │  │  VoyageAI            │  │  External Data       │
│                │  │  voyage-finance-2    │  │                      │
│  • Event Store │  │  • Doc Embeddings    │  │  • DuckDuckGo Search │
│  • Documents   │  │  • Query Embeddings  │  │  • IEA/IRENA PAMS   │
│  • Telemetry   │  │  • 1024 dimensions   │  │  • Vessel AIS Data   │
│  • Vector Index│  │                      │  │  • Market Feeds      │
│  • Checkpoints │  │                      │  │                      │
│    (agent mem) │  │                      │  │                      │
└────────────────┘  └──────────────────────┘  └──────────────────────┘
`}</pre>
          </Card>

          <Card darkMode={darkMode} className={css`padding: 20px;`}>
            <Subtitle className={css`color: ${headingColor} !important; margin-bottom: 8px !important;`}>
              ISO 42010 Concern Resolution
            </Subtitle>
            <div className={css`display: grid; grid-template-columns: 1fr 1fr; gap: 12px;`}>
              {[
                { concern: 'Real-time Market Intelligence', resolution: 'Hybrid RAG (VoyageAI voyage-finance-2 embeddings + DuckDuckGo web search) provides both historical document context and live market data' },
                { concern: 'Regulatory Compliance (REMIT, CACM)', resolution: 'CQRS/Event Sourcing with immutable audit trail — fold() reconstructs state at any point for compliance verification' },
                { concern: 'Portfolio Risk Management', resolution: 'Live telemetry simulation with position tracking, disruption scenario modeling (North Sea storm events), and automated P&L computation' },
                { concern: 'Data Provenance & Integrity', resolution: 'MongoDB Atlas Vector Search ensures traceable document retrieval; event sourcing ensures no data is ever mutated or lost' },
              ].map((item, i) => (
                <div key={i} className={css`padding: 12px; background: ${boxBg}; border: 1px solid ${borderColor}; border-radius: 8px;`}>
                  <Body className={css`color: ${accentGreen} !important; font-size: 12px !important; font-weight: 700 !important; margin-bottom: 4px !important;`}>
                    {item.concern}
                  </Body>
                  <Body className={css`color: ${textColor} !important; font-size: 12px !important; line-height: 1.5 !important;`}>
                    {item.resolution}
                  </Body>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* C2: Container */}
      {activeView === 'container' && (
        <div className={css`display: flex; flex-direction: column; gap: 16px;`}>
          <Card darkMode={darkMode} className={css`padding: 20px;`}>
            <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 12px;`}>
              <H2 className={css`color: ${headingColor} !important; font-size: 18px !important;`}>
                C2: Container Diagram — Runtime Topology
              </H2>
              <Badge variant="blue">TOGAF Phase B-D: Architecture Definition</Badge>
            </div>
            <pre className={css`
              background: ${codeBg};
              border: 1px solid ${borderColor};
              border-radius: 8px;
              padding: 20px;
              font-size: 12px;
              line-height: 1.6;
              color: ${accentGreen};
              overflow-x: auto;
              white-space: pre;
            `}>{`
┌─────────────────────────────────────────────────────────┐
│                   FRONTEND (Next.js 14)                  │
│                                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │  VPP         │ │  EnerLeafy   │ │  Auditing        │ │
│  │  Dashboard   │ │  AI Chat     │ │  Inspector       │ │
│  │              │ │              │ │                  │ │
│  │ • Portfolio  │ │ • RAG Chat   │ │ • Event Timeline │ │
│  │ • Telemetry  │ │ • Vessel Map │ │ • fold() Replay  │ │
│  │ • Positions  │ │ • Disruption │ │ • Deep Analysis  │ │
│  └──────┬───────┘ └──────┬───────┘ └────────┬─────────┘ │
│         │                │                   │           │
│  ┌──────┴────────────────┴───────────────────┴────────┐  │
│  │         Shared Context Providers                    │  │
│  │  GeneratorCtx │ LiveFeedCtx │ DisruptionCtx        │  │
│  └──────────────────────┬──────────────────────────────┘  │
└─────────────────────────┼────────────────────────────────┘
                          │ REST / SSE
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   BACKEND (FastAPI)                       │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │              LangChain ReAct Agents               │    │
│  │                                                   │    │
│  │  ┌─────────────┐  ┌──────────────┐               │    │
│  │  │  Advisor     │  │  Audit       │               │    │
│  │  │  Agent       │  │  Agent       │               │    │
│  │  │             │  │             │               │    │
│  │  │  Domain:     │  │  Domain:     │               │    │
│  │  │  • search_   │  │  • search_   │               │    │
│  │  │    policies  │  │    policies  │               │    │
│  │  │  • search_   │  │  • reconstruct│              │    │
│  │  │    market    │  │    _state    │               │    │
│  │  │  • analyze_  │  │  • get_event │               │    │
│  │  │    portfolio │  │    _timeline │               │    │
│  │  │  • generator │  │  • web_search│               │    │
│  │  │    _status   │  │             │               │    │
│  │  │  • web_search│  │  MCP Tools:  │               │    │
│  │  │             │  │  • find      │               │    │
│  │  │  MCP Tools:  │  │  • aggregate │               │    │
│  │  │  • find      │  └──────────────┘               │    │
│  │  │  • aggregate │                                  │    │
│  │  └──────┬──────┘                                  │    │
│  │         │                                          │    │
│  │  ┌──────┴──────────────────────────────────────┐  │    │
│  │  │  MongoDB MCP Server (stdio, readOnly)       │  │    │
│  │  │  npx mongodb-mcp-server                     │  │    │
│  │  └─────────────────────┬───────────────────────┘  │    │
│  └────────────────────────┼──────────────────────────┘    │
│                           │                               │
│  ┌──────────┐  ┌──────────┴──────┐  ┌──────────────────┐  │
│  │ Commands │  │  Event Store   │  │  Telemetry       │  │
│  │ API      │  │  (CQRS)       │  │  Generator       │  │
│  └──────────┘  └────────────────┘  └──────────────────┘  │
└──────────────────────────┬───────────────────────────────┘
                           │
         ┌─────────────────┼──────────────────┐
         ▼                 ▼                  ▼
┌────────────────┐ ┌──────────────┐  ┌──────────────────┐
│ MongoDB Atlas  │ │ VoyageAI API │  │  DuckDuckGo      │
│                │ │              │  │  Web Search       │
│ Collections:   │ │ Model:       │  │                  │
│ • events       │ │ voyage-      │  │  Real-time data  │
│ • documents    │ │ finance-2    │  │  & market news   │
│ • telemetry_   │ │              │  │                  │
│   events (TS)  │ │ Dims: 1024   │  └──────────────────┘
│ • vector_index │ └──────────────┘
└────────────────┘
`}</pre>
          </Card>
        </div>
      )}

      {/* C3: Component */}
      {activeView === 'component' && (
        <div className={css`display: flex; flex-direction: column; gap: 16px;`}>
          <Card darkMode={darkMode} className={css`padding: 20px;`}>
            <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 12px;`}>
              <H2 className={css`color: ${headingColor} !important; font-size: 18px !important;`}>
                C3: Component Diagram — SOLID Principles Applied
              </H2>
              <Badge variant="blue">TOGAF Phase E: Opportunities &amp; Solutions</Badge>
            </div>

            <div className={css`display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;`}>
              {[
                {
                  principle: 'S — Single Responsibility',
                  application: 'Each LangChain tool handles one concern: search_policies for regulatory lookup, analyze_portfolio for portfolio analysis, web_search for real-time data. Each React context manages one domain: GeneratorContext (telemetry), LiveFeedContext (portfolio), DisruptionContext (scenarios).',
                },
                {
                  principle: 'O — Open/Closed',
                  application: 'New tools can be added to the ReAct agent without modifying existing ones. New event types extend the Event Store without altering the fold() mechanism. CQRS separates reads (queries) from writes (commands).',
                },
                {
                  principle: 'L — Liskov Substitution',
                  application: 'Embedding client uses a strategy pattern: VoyageAI API or hash fallback — both implement embed_texts()/embed_query() with identical signatures. The agent works with any ChatModel implementing the LangChain interface.',
                },
                {
                  principle: 'I — Interface Segregation',
                  application: 'FastAPI routers are segregated: commands.py (writes), queries.py (reads), advisor.py (AI), audit.py (compliance), telemetry.py (metrics). Clients only depend on the endpoints they use.',
                },
                {
                  principle: 'D — Dependency Inversion',
                  application: 'Agents depend on tool abstractions (@tool decorator + MCP protocol), not concrete implementations. MongoDB access via MCP Server or Depends(get_db) injection. LLM provider auto-detected from env (Anthropic API or Azure AI Foundry). Embedding model configured via environment variable.',
                },
              ].map((item, i) => (
                <div key={i} className={css`padding: 16px; background: ${boxBg}; border: 1px solid ${borderColor}; border-radius: 8px;`}>
                  <Body className={css`color: ${accentGreen} !important; font-size: 13px !important; font-weight: 700 !important; margin-bottom: 6px !important;`}>
                    {item.principle}
                  </Body>
                  <Body className={css`color: ${textColor} !important; font-size: 12px !important; line-height: 1.6 !important;`}>
                    {item.application}
                  </Body>
                </div>
              ))}
            </div>

            <Subtitle className={css`color: ${headingColor} !important; margin-bottom: 8px !important;`}>
              AI Product Components
            </Subtitle>
            <pre className={css`
              background: ${codeBg};
              border: 1px solid ${borderColor};
              border-radius: 8px;
              padding: 20px;
              font-size: 12px;
              line-height: 1.6;
              color: ${accentGreen};
              overflow-x: auto;
              white-space: pre;
            `}>{`
┌──────────────────────────────────────────────────────────────────┐
│                   AI PRODUCT #1: EnerLeafy Advisor               │
│                                                                  │
│  Input: User message + Portfolio + Generator state               │
│  Agent: LangChain ReAct (Claude — Anthropic API / Azure, auto)  │
│  Domain: search_policies, search_market_intel, analyze_portfolio │
│          get_generator_status, web_search                        │
│  MCP:   MongoDB MCP Server (find, aggregate) — direct DB access  │
│  RAG:   MongoDB Atlas Vector Search (voyage-finance-2, cosine)   │
│  Output: Structured investment advice with sources               │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                   AI PRODUCT #2: Compliance Auditor               │
│                                                                  │
│  Input: Compliance scenario + Event stream + Regulation          │
│  Agent: LangChain ReAct (Claude — Anthropic API / Azure, auto)  │
│  Domain: search_policies, reconstruct_state (fold), get_event_   │
│          timeline, web_search                                    │
│  MCP:   MongoDB MCP Server (find, aggregate) — direct DB access  │
│  RAG:   MongoDB Atlas Vector Search (voyage-finance-2, cosine)   │
│  Output: Regulatory compliance analysis with evidence chain      │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                   AI PRODUCT #3: Hybrid Search Engine             │
│                                                                  │
│  Input: Search query or natural language question                 │
│  Pipeline: Query → voyage-finance-2 embedding → $vectorSearch    │
│            + regex fallback → RRF ranked results                 │
│  Data:   208 documents (8 market intel + 200 IEA policies)       │
│  Output: Ranked documents with relevance scores                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                   AI PRODUCT #4: Disruption Simulator             │
│                                                                  │
│  Input: Disruption trigger (Hurricane scenario)                  │
│  Effect: Vessel freeze + price spike + auto-agent analysis       │
│  Integration: DisruptionContext → VesselTrackingMap +             │
│               EnerLeafy AI auto-response + Dashboard updates     │
│  Output: Real-time impact assessment on portfolio positions      │
└──────────────────────────────────────────────────────────────────┘
`}</pre>
          </Card>
        </div>
      )}

      {/* TOGAF */}
      {activeView === 'togaf' && (
        <div className={css`display: flex; flex-direction: column; gap: 16px;`}>
          <Card darkMode={darkMode} className={css`padding: 20px;`}>
            <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 12px;`}>
              <H2 className={css`color: ${headingColor} !important; font-size: 18px !important;`}>
                TOGAF ADM Phase Mapping
              </H2>
              <Badge variant="blue">Architecture Development Method</Badge>
            </div>

            <div className={css`display: flex; flex-direction: column; gap: 12px;`}>
              {[
                {
                  phase: 'Phase A: Architecture Vision',
                  deliverable: 'System Context (C1)',
                  detail: 'Identified stakeholders (energy traders, compliance officers), key concerns (real-time intelligence, regulatory compliance), and external system dependencies (MongoDB Atlas, VoyageAI, Azure AI Foundry).',
                },
                {
                  phase: 'Phase B: Business Architecture',
                  deliverable: 'Domain Model & Event Types',
                  detail: 'Defined domain events (TradeExecuted, MeterReadingRecorded, PriceTickRecorded), compliance scenarios (Imbalance Settlement, REMIT Surveillance, Flexibility Market, Cross-Border Capacity), and portfolio management workflows.',
                },
                {
                  phase: 'Phase C: Information Systems Architecture',
                  deliverable: 'Container Diagram (C2)',
                  detail: 'Designed CQRS separation (Commands → Event Store → Projections → Queries), hybrid search pipeline (VoyageAI embeddings + Atlas Vector Search + web search), and LangChain ReAct agent topology.',
                },
                {
                  phase: 'Phase D: Technology Architecture',
                  deliverable: 'Technology Stack',
                  detail: 'Selected: Next.js 14 (frontend), FastAPI (backend), MongoDB Atlas (persistence + vector search), VoyageAI voyage-finance-2 (embeddings), Claude on Anthropic API / Azure AI Foundry (LLM, auto-detected), LangChain/LangGraph (orchestration), LeafyGreen UI (design system).',
                },
                {
                  phase: 'Phase E: Opportunities & Solutions',
                  deliverable: 'Component Diagram (C3)',
                  detail: 'Applied SOLID principles to component design. Tool-based agent architecture enables extensibility. Event sourcing provides natural audit trail. Disruption simulation demonstrates scenario analysis capability.',
                },
                {
                  phase: 'Phase F: Migration Planning',
                  deliverable: 'Deployment Strategy',
                  detail: 'Single deploy/.env configuration. Hash-based embedding fallback when VoyageAI unavailable. Frontend simulation mode when backend offline. Graceful degradation at every layer.',
                },
              ].map((item, i) => (
                <div key={i} className={css`
                  padding: 16px;
                  background: ${boxBg};
                  border: 1px solid ${borderColor};
                  border-left: 4px solid ${accentGreen};
                  border-radius: 0 8px 8px 0;
                `}>
                  <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 6px;`}>
                    <Body className={css`color: ${accentGreen} !important; font-size: 13px !important; font-weight: 700 !important;`}>
                      {item.phase}
                    </Body>
                    <Badge variant="lightgray">{item.deliverable}</Badge>
                  </div>
                  <Body className={css`color: ${textColor} !important; font-size: 12px !important; line-height: 1.6 !important;`}>
                    {item.detail}
                  </Body>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeView === 'bvp' && (
        <div className={css`display: flex; flex-direction: column; gap: 16px;`}>
          <Card darkMode={darkMode} className={css`padding: 20px;`}>
            <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 8px;`}>
              <H2 className={css`color: ${headingColor} !important; font-size: 18px !important;`}>
                AI Agent Autonomy Scale
              </H2>
              <Badge variant="yellow">BVP Framework</Badge>
            </div>
            <Body className={css`color: ${textColor} !important; font-size: 13px !important; line-height: 1.6 !important; margin-bottom: 16px !important;`}>
              Bessemer Venture Partners defines a 7-level autonomy scale for AI agents, inspired by the self-driving car industry.
              This framework helps classify the maturity of AI capabilities within a product.
              Below is how EnerLeafy&apos;s features map to the BVP scale.
            </Body>
            <AutonomyScale highlights={{
              0: 'MongoDB Atlas Vector Search — document retrieval with voyage-finance-2 embeddings',
              1: 'Hybrid RAG Search (/api/search) — chain-of-thought over retrieved documents with RRF ranking',
              2: 'Audit Deep Analysis — LangChain ReAct agent for compliance analysis with human-initiated trigger',
              3: 'EnerLeafy AI Advisor — autonomous portfolio analysis, policy search, web search, MongoDB MCP access, persistent conversation memory (MongoDBSaver), and trade recommendations',
            }} />
          </Card>

          <Card darkMode={darkMode} className={css`padding: 20px;`}>
            <H2 className={css`color: ${headingColor} !important; font-size: 18px !important; margin-bottom: 12px !important;`}>
              AI Systems of Action Roadmap
            </H2>
            <Body className={css`color: ${textColor} !important; font-size: 13px !important; line-height: 1.6 !important; margin-bottom: 12px !important;`}>
              Per BVP&apos;s <a href="https://www.bvp.com/atlas/roadmap-ai-systems-of-action" target="_blank" rel="noopener noreferrer" className={css`color: ${palette.blue.base};`}>AI Systems of Action</a> thesis,
              AI-native systems of record offer a 10X value proposition by automating time-intensive workflows.
              EnerLeafy demonstrates this progression:
            </Body>
            <div className={css`display: flex; flex-direction: column; gap: 12px;`}>
              {[
                {
                  stage: 'System of Record',
                  description: 'MongoDB Atlas stores event streams (CQRS), portfolio state, IEA policies, and telemetry events. The immutable event log provides the audit backbone.',
                  status: 'Implemented',
                },
                {
                  stage: 'System of Intelligence',
                  description: 'Hybrid RAG pipeline: VoyageAI voyage-finance-2 embeddings + Atlas Vector Search + reciprocal rank fusion. Semantic retrieval over 200+ IEA policy documents.',
                  status: 'Implemented',
                },
                {
                  stage: 'System of Action (Co-pilot)',
                  description: 'LangChain ReAct agent with domain tools + MongoDB MCP Server for direct database access. Agent autonomously decides which tools to call — including running custom MongoDB queries via MCP protocol.',
                  status: 'Implemented — L3',
                },
                {
                  stage: 'System of Action (Autopilot)',
                  description: 'Future: autonomous trade execution, real-time compliance monitoring with auto-remediation, proactive portfolio rebalancing triggers.',
                  status: 'Planned — L4+',
                },
              ].map((item, i) => (
                <div key={i} className={css`
                  padding: 16px;
                  background: ${boxBg};
                  border: 1px solid ${borderColor};
                  border-left: 4px solid ${i < 3 ? accentGreen : borderColor};
                  border-radius: 0 8px 8px 0;
                  opacity: ${i < 3 ? 1 : 0.7};
                `}>
                  <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 6px;`}>
                    <Body className={css`color: ${accentGreen} !important; font-size: 13px !important; font-weight: 700 !important;`}>
                      {item.stage}
                    </Body>
                    <Badge variant={i < 3 ? 'green' : 'lightgray'}>{item.status}</Badge>
                  </div>
                  <Body className={css`color: ${textColor} !important; font-size: 12px !important; line-height: 1.6 !important;`}>
                    {item.description}
                  </Body>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
