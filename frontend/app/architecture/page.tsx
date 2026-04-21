'use client';

import { useState } from 'react';
import { css, keyframes } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Badge from '@leafygreen-ui/badge';
import { H2, Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import PageHeader from '@/components/shared/PageHeader';

type ViewLevel = 'container' | 'embeddings';

const C4_VIEWS: { id: ViewLevel; label: string; badge: string }[] = [
  { id: 'container', label: 'Container Diagram', badge: 'C4 Model' },
  { id: 'embeddings', label: 'Embedding Model', badge: 'VoyageAI' },
];

const fadeIn = keyframes`
  from { opacity: 0; max-height: 0; }
  to   { opacity: 1; max-height: 400px; }
`;

// ── Tile data with explanations ──

interface TileData {
  id: string;
  icon: string;
  title: string;
  subtitle?: string;
  items: string[];
  color: string;
  badge?: string;
  explanation: string;
}

const FRONTEND_TILES: TileData[] = [
  { id: 'fe-dashboard', icon: '📊', color: '#016BF8', title: 'Trading Dashboard', items: ['Fleet health (8 assets)', 'Position gap + P&L', 'Trade execution'], explanation: 'Real-time portfolio management UI. Streams fleet state via SSE at 1s cadence. Shows 8 European energy assets with output/forecast/variance, position gap (committed vs forecast), live market prices across Day-Ahead/Intraday/Flexibility channels, and one-click trade execution with automatic allocation reset.' },
  { id: 'fe-leafy', icon: '🧠', color: '#cc99ff', title: 'EnerLeafy AI', items: ['ReAct agent chat', 'Fleet asset map', 'Weather alerts'], explanation: 'AI advisor chat powered by a LangChain ReAct agent. Sends live fleet context (assets, prices, weather events, portfolio state) to Claude. Features a Leaflet map with European asset positions, an Iberian storm trigger button that drops ES/PT solar to <20%, and collapsible agent reasoning panel showing tool execution in real-time.' },
  { id: 'fe-audit', icon: '🔍', color: '#66cccc', title: 'Auditing', items: ['Event replay (fold)', 'Imbalance settlement', 'Compliance analysis'], explanation: 'Interactive Event Sourcing showcase. Replays the Imbalance Settlement scenario using actual fleet assets (Hollandse Kust Wind, Rhine CCGT, Rotterdam BESS). Step through 10 events with fold() reconstruction at each version. LLM-powered deep analysis against EU 2017/2195 (Electricity Balancing).' },
  { id: 'fe-arch', icon: '📐', color: '#FFC010', title: 'Architecture', items: ['Container diagram', 'Embedding benchmarks'], explanation: 'This page. Interactive container diagram with clickable tiles, plus a benchmark comparison of embedding models for financial document retrieval showing why voyage-finance-2 outperforms general-purpose models.' },
];

const BACKEND_TILES: TileData[] = [
  { id: 'be-trading', icon: '⚡', color: '#00ED64', title: 'Trading Simulator', subtitle: 'In-memory, 1s tick', items: ['8 EU energy assets', 'Weather events', 'Price random walk', 'Trade execution'], explanation: 'Pure in-memory simulation engine (no MongoDB). Runs a 1-second tick loop generating 3 event families: AssetTelemetry (meter readings, variance), WeatherForecast (wind/solar/alerts), TradingPosition (gap, trades, P&L snapshots). SSE broadcasts full state every second. Supports weather alert injection (Iberian storm endpoint).' },
  { id: 'be-agent', icon: '🤖', color: '#cc99ff', title: 'LangChain ReAct Agent', subtitle: 'Claude via Azure / Anthropic', items: ['analyze_portfolio', 'search_policies', 'web_search + news', 'MongoDB MCP Server'], badge: 'AI', explanation: 'LangChain ReAct agent with 7 tools called simultaneously on first action. Receives live fleet context from the frontend. Uses MongoDBSaver for conversation persistence. Auto-detects LLM provider: Azure AI Foundry (primary) or Anthropic direct (fallback). Streams tool events + tokens via SSE for real-time UI updates.' },
  { id: 'be-cqrs', icon: '📦', color: '#66cccc', title: 'Event Store (CQRS)', subtitle: 'Append-only', items: ['fold() replay', 'Change Stream projections', 'Imbalance settlement'], explanation: 'Append-only event store in MongoDB Atlas with unique index on {streamId, version}. Events are never updated or deleted. The fold() function replays events to reconstruct aggregate state at any point in time. Change Stream projections build read models (tariff_scenarios). Powers the audit tab\'s step-by-step replay.' },
  { id: 'be-search', icon: '🔎', color: '#FFC010', title: 'Hybrid Search', subtitle: 'RAG Pipeline', items: ['Atlas Vector Search', 'voyage-finance-2 (1024d)', 'BM25 + RRF ranking'], explanation: 'Hybrid retrieval pipeline combining MongoDB Atlas Vector Search (cosine similarity on voyage-finance-2 embeddings) with BM25 text search. Results are merged via Reciprocal Rank Fusion (RRF). Searches 200+ IEA/EU policy documents. Used by the search_policies and search_market_intel agent tools.' },
];

const DATA_TILES: TileData[] = [
  { id: 'db-events', icon: '📝', color: '#00ED64', title: 'events', subtitle: 'Append-only event store', items: ['streamId + version', 'fold() reconstruction'], explanation: 'Core CQRS collection. Each document represents an immutable domain event with streamId, version (monotonic per stream), eventType, payload, and timestamp. Unique index on {streamId, version} prevents duplicate writes. Access pattern: append-only writes, stream replay via streamId + version range.' },
  { id: 'db-docs', icon: '📄', color: '#016BF8', title: 'market_documents', subtitle: '200+ IEA/EU policies', items: ['voyage-finance-2 vectors', 'Atlas Vector Search index'], explanation: 'Research documents, ESG reports, and IEA/EU policy documents with 1024-dimensional voyage-finance-2 embeddings. Atlas Vector Search index enables semantic similarity queries. Documents include REMIT (EU 1227/2011), EU ETS, REPowerEU, EBGL, RED III, and 200+ IEA PAMS policy records. Hybrid search combines vector similarity with BM25 text matching.' },
  { id: 'db-advisor', icon: '💬', color: '#cc99ff', title: 'advisor_interactions', subtitle: 'Agent memory', items: ['MongoDBSaver checkpoints', 'Query + tool call logs'], explanation: 'Stores LangGraph conversation checkpoints via MongoDBSaver, enabling multi-turn conversations with full context. Also logs each advisor interaction (question, tool calls, timestamp) for the RAGAS evaluation pipeline. Falls back gracefully if MongoDB is unreachable.' },
  { id: 'db-evals', icon: '📊', color: '#FFC010', title: 'rag_evals', subtitle: 'RAGAS results', items: ['Faithfulness, relevancy', 'Context precision/recall'], explanation: 'Stores RAGAS evaluation run results. Each document contains aggregate scores (faithfulness, answer relevancy, context precision, context recall) and per-question breakdowns. Fetched by the Evals dashboard with asyncio.to_thread() to avoid blocking the event loop.' },
];

const EXTERNAL_TILES: TileData[] = [
  { id: 'ext-voyage', icon: '🧬', color: '#00ED64', title: 'VoyageAI', subtitle: 'voyage-finance-2', items: ['1024-dim embeddings', 'Financial domain'], explanation: 'Domain-specific embedding model fine-tuned on financial/energy documents. Achieves 78.4 nDCG@10 on FinanceBench — outperforming OpenAI text-embedding-3-large (74.1) at 3x fewer dimensions. Understands REMIT, EU ETS, PPA structures, and energy trading terminology. Used for both document and query embeddings in the RAG pipeline.' },
  { id: 'ext-claude', icon: '🤖', color: '#cc99ff', title: 'Claude AI', subtitle: 'claude-opus-4-6', items: ['Azure AI Foundry', 'Anthropic direct'], explanation: 'Primary LLM powering both the EnerLeafy advisor agent and the compliance audit analysis. Auto-detected via _get_llm(): checks for Azure AI Foundry credentials first (AZURE_FOUNDRY_API_KEY + AZURE_FOUNDRY_ENDPOINT), falls back to Anthropic direct API. Temperature 0.3, max_tokens 4096. Response time ~15-30s for complex multi-tool queries.' },
  { id: 'ext-ddg', icon: '🌐', color: '#66cccc', title: 'DuckDuckGo', subtitle: 'Web search', items: ['Real-time market data', 'Energy news'], explanation: 'DuckDuckGo search API (via ddgs Python library) provides real-time web search and news headlines. The web_search tool queries for current market data, geopolitical events, and energy policy updates. The get_energy_news tool fetches the latest 5 headlines on any energy topic. No API key required.' },
];

const RAG_SOURCE_TILES: TileData[] = [
  { id: 'rag-entsoe', icon: '🔌', color: '#016BF8', title: 'ENTSO-E', subtitle: 'Transparency Platform', items: ['Generation forecasts', 'Cross-border flows', 'Balancing data'], explanation: 'The European Network of Transmission System Operators publishes generation adequacy forecasts, cross-border physical flows, and balancing market data for all EU member states. Ingesting this into the RAG pipeline would let the agent reference actual scheduled generation vs demand, interconnector capacity utilization, and system imbalance volumes — directly feeding into position gap analysis and trade recommendations.' },
  { id: 'rag-acer', icon: '⚖️', color: '#cc99ff', title: 'ACER REMIT', subtitle: 'Transaction reporting', items: ['Wholesale market orders', 'Trade surveillance', 'Inside information'], explanation: 'The Agency for the Cooperation of Energy Regulators maintains the REMIT transaction reporting database. Adding REMIT inside information disclosures (UMMs — Urgent Market Messages) about planned/unplanned outages would give the agent early warning of supply disruptions. Combined with fleet data, this enables proactive position adjustments before price impacts materialize.' },
  { id: 'rag-ets', icon: '🌍', color: '#00ED64', title: 'EU ETS', subtitle: 'Carbon auction data', items: ['Carbon permit prices', 'Allocation records', 'Compliance cycles'], explanation: 'EU Emissions Trading System auction results, free allocation tables, and verified emissions data. Carbon prices directly affect the marginal cost of gas-fired generation (Rhine CCGT) and the competitiveness of renewables. Embedding EU ETS compliance cycle documents would let the agent factor carbon cost exposure into portfolio risk assessment and hedging recommendations.' },
  { id: 'rag-ecmwf', icon: '🌦️', color: '#66cccc', title: 'ECMWF', subtitle: 'Weather forecasts', items: ['Wind speed forecasts', 'Solar irradiance', 'Storm warnings'], explanation: 'European Centre for Medium-Range Weather Forecasts provides the gold standard for wind speed, solar irradiance, temperature, and precipitation forecasts across Europe. Embedding ECMWF ensemble forecast summaries would ground the agent\'s weather impact analysis in real meteorological data rather than simulated events — critical for accurate wind/solar output prediction and storm risk assessment.' },
  { id: 'rag-ppa', icon: '📋', color: '#FFC010', title: 'PPA Reports', subtitle: 'Pexapark / LevelTen', items: ['PPA price indices', 'Contract structures', 'Market trends'], explanation: 'Power Purchase Agreement market reports from providers like Pexapark and LevelTen Energy. PPA prices for wind and solar vary significantly by country, technology, and tenor. Adding PPA index data and contract structure templates would enable the agent to benchmark the fleet\'s revenue against market rates and recommend optimal contract strategies for each asset type.' },
  { id: 'rag-tso', icon: '🏗️', color: '#cc99ff', title: 'TSO Balancing', subtitle: 'TenneT / RTE / Statnett', items: ['Imbalance prices', 'Reserve activation', 'Frequency data'], explanation: 'Transmission System Operator balancing reports from TenneT (NL/DE), RTE (FR), and Statnett (NO). Real-time imbalance prices can spike to EUR 10,000+/MWh during scarcity. Embedding historical imbalance price patterns and reserve activation data would let the agent identify high-risk settlement periods and recommend battery (Rotterdam BESS) dispatch strategies to capture imbalance price spreads.' },
];

// ── Clickable ArchBox ──

function ArchBox({
  tile, darkMode, selected, onClick,
}: {
  tile: TileData; darkMode: boolean; selected: boolean; onClick: () => void;
}) {
  const bg = darkMode ? `${tile.color}12` : `${tile.color}08`;
  const border = selected ? tile.color : `${tile.color}40`;
  return (
    <button
      onClick={onClick}
      className={css`
        background: ${bg};
        border: 1.5px solid ${border};
        border-radius: 12px;
        padding: 14px;
        min-width: 0;
        text-align: left;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.2s ease;
        outline: none;
        ${selected ? `box-shadow: 0 4px 20px ${tile.color}22;` : ''}
        &:hover { border-color: ${tile.color}; transform: translateY(-1px); }
      `}
    >
      <div className={css`display: flex; align-items: center; gap: 7px; margin-bottom: ${tile.items.length ? '8px' : '0'};`}>
        <span className={css`font-size: 16px;`}>{tile.icon}</span>
        <div className={css`min-width: 0; flex: 1;`}>
          <div className={css`font-size: 12px; font-weight: 700; color: ${tile.color};`}>{tile.title}</div>
          {tile.subtitle && <div className={css`font-size: 9px; color: ${darkMode ? palette.gray.light1 : palette.gray.dark1}; margin-top: 1px;`}>{tile.subtitle}</div>}
        </div>
        {tile.badge && <Badge variant="green" className={css`font-size: 8px !important;`}>{tile.badge}</Badge>}
      </div>
      {tile.items.length > 0 && (
        <div className={css`display: flex; flex-direction: column; gap: 2px; margin-left: 23px;`}>
          {tile.items.map((item, i) => (
            <div key={i} className={css`font-size: 10px; color: ${darkMode ? palette.gray.light1 : palette.gray.dark1}; display: flex; align-items: center; gap: 4px;`}>
              <span className={css`width: 3px; height: 3px; border-radius: 50%; background: ${tile.color}; flex-shrink: 0; opacity: 0.6;`} />
              {item}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function Connector({ label, darkMode }: { label?: string; darkMode: boolean }) {
  const mutedColor = darkMode ? palette.gray.dark1 : palette.gray.light1;
  const green = palette.green.base;
  return (
    <div className={css`display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 0;`}>
      <div className={css`width: 2px; height: 18px; background: linear-gradient(180deg, ${green}66, ${green}22); border-radius: 1px;`} />
      {label && <span className={css`font-size: 9px; color: ${mutedColor}; letter-spacing: 0.5px; text-transform: uppercase;`}>{label}</span>}
      <div className={css`width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 5px solid ${green}44;`} />
    </div>
  );
}

// ── Explanation panel ──

function ExplanationPanel({ tile, darkMode, onClose }: { tile: TileData; darkMode: boolean; onClose: () => void }) {
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  return (
    <div className={css`
      animation: ${fadeIn} 0.25s ease;
      background: ${darkMode ? '#0d1b24' : '#f8fafb'};
      border: 1.5px solid ${tile.color}50;
      border-left: 4px solid ${tile.color};
      border-radius: 10px;
      padding: 16px 18px;
      margin-top: 8px;
      max-width: 960px;
      width: 100%;
    `}>
      <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 8px;`}>
        <span className={css`font-size: 18px;`}>{tile.icon}</span>
        <span className={css`font-size: 14px; font-weight: 700; color: ${tile.color};`}>{tile.title}</span>
        {tile.subtitle && <span className={css`font-size: 11px; color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};`}>{tile.subtitle}</span>}
        <button onClick={onClose} className={css`
          margin-left: auto; background: none; border: 1px solid ${borderColor}; border-radius: 6px;
          padding: 2px 10px; font-size: 11px; cursor: pointer; color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
          font-family: inherit; &:hover { border-color: ${tile.color}; color: ${tile.color}; }
        `}>Close</button>
      </div>
      <div className={css`font-size: 13px; line-height: 1.7; color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};`}>
        {tile.explanation}
      </div>
    </div>
  );
}

// ── Page ──

export default function ArchitecturePage() {
  const { darkMode } = useDarkMode();
  const [activeView, setActiveView] = useState<ViewLevel>('container');
  const [selectedTile, setSelectedTile] = useState<string | null>(null);
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const headingColor = darkMode ? palette.white : palette.black;
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const boxBg = darkMode ? '#112733' : palette.white;
  const accentGreen = palette.green.base;

  const allTiles = [...FRONTEND_TILES, ...BACKEND_TILES, ...DATA_TILES, ...EXTERNAL_TILES, ...RAG_SOURCE_TILES];
  const activeTile = allTiles.find(t => t.id === selectedTile) ?? null;

  const handleClick = (id: string) => setSelectedTile(prev => prev === id ? null : id);

  function TileGrid({ tiles, cols = 'repeat(auto-fit, minmax(200px, 1fr))' }: { tiles: TileData[]; cols?: string }) {
    return (
      <div className={css`display: grid; grid-template-columns: ${cols}; gap: 8px;`}>
        {tiles.map(t => (
          <ArchBox key={t.id} tile={t} darkMode={darkMode} selected={selectedTile === t.id} onClick={() => handleClick(t.id)} />
        ))}
      </div>
    );
  }

  function LayerLabel({ label, badges }: { label: string; badges: { text: string; variant: 'green' | 'blue' | 'lightgray' }[] }) {
    return (
      <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 12px;`}>
        <span className={css`font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: ${badges[0]?.variant === 'blue' ? palette.blue.base : accentGreen};`}>{label}</span>
        {badges.map((b, i) => <Badge key={i} variant={b.variant}>{b.text}</Badge>)}
      </div>
    );
  }

  function Layer({ children, label, badges }: { children: React.ReactNode; label: string; badges: { text: string; variant: 'green' | 'blue' | 'lightgray' }[] }) {
    return (
      <div className={css`
        width: 100%; max-width: 960px;
        background: ${darkMode ? '#0a1622' : '#f8fafb'};
        border: 1.5px solid ${borderColor};
        border-radius: 14px;
        padding: 18px;
      `}>
        <LayerLabel label={label} badges={badges} />
        {children}
      </div>
    );
  }

  return (
    <div className={css`display: flex; flex-direction: column; gap: 24px;`}>
      <PageHeader
        title="Architecture"
        subtitle="System container diagram and embedding model selection"
      />

      {/* View Selector */}
      <div className={css`display: flex; gap: 8px; flex-wrap: wrap;`}>
        {C4_VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => { setActiveView(v.id); setSelectedTile(null); }}
            className={css`
              padding: 10px 16px; border-radius: 8px;
              border: 2px solid ${activeView === v.id ? accentGreen : borderColor};
              background: ${activeView === v.id ? (darkMode ? palette.green.dark3 : palette.green.light3) : 'transparent'};
              color: ${activeView === v.id ? accentGreen : textColor};
              cursor: pointer; font-size: 13px; font-weight: 600;
              display: flex; align-items: center; gap: 8px;
              transition: all 0.15s ease; font-family: inherit;
              &:hover { border-color: ${accentGreen}; }
            `}
          >
            {v.label}
            <Badge variant={activeView === v.id ? 'green' : 'lightgray'}>{v.badge}</Badge>
          </button>
        ))}
      </div>

      {/* Container Diagram */}
      {activeView === 'container' && (
        <div className={css`display: flex; flex-direction: column; gap: 0; align-items: center;`}>
          <Layer label="Frontend" badges={[{ text: 'Next.js 14', variant: 'blue' }, { text: 'LeafyGreen UI', variant: 'lightgray' }]}>
            <TileGrid tiles={FRONTEND_TILES} />
          </Layer>

          <Connector label="REST + SSE" darkMode={darkMode} />

          <Layer label="Backend" badges={[{ text: 'FastAPI', variant: 'green' }, { text: 'Python 3.12', variant: 'lightgray' }]}>
            <TileGrid tiles={BACKEND_TILES} />
          </Layer>

          <Connector label="pymongo + MCP" darkMode={darkMode} />

          <Layer label="Data Layer" badges={[{ text: 'MongoDB Atlas', variant: 'green' }]}>
            <TileGrid tiles={DATA_TILES} cols="repeat(auto-fit, minmax(180px, 1fr))" />
          </Layer>

          <Connector label="external APIs" darkMode={darkMode} />

          {/* External Services */}
          <div className={css`width: 100%; max-width: 960px;`}>
            <TileGrid tiles={EXTERNAL_TILES} cols="repeat(auto-fit, minmax(180px, 1fr))" />
          </div>

          <Connector label="RAG data sources (planned)" darkMode={darkMode} />

          {/* RAG Data Sources */}
          <Layer label="RAG Data Sources" badges={[{ text: 'Planned', variant: 'lightgray' }, { text: 'Vector Search', variant: 'green' }]}>
            <TileGrid tiles={RAG_SOURCE_TILES} cols="repeat(auto-fit, minmax(180px, 1fr))" />
          </Layer>

          {/* Explanation panel — shown below diagram */}
          {activeTile && (
            <ExplanationPanel tile={activeTile} darkMode={darkMode} onClose={() => setSelectedTile(null)} />
          )}

          {/* Hint */}
          {!activeTile && (
            <div className={css`margin-top: 12px; font-size: 11px; color: ${darkMode ? palette.gray.dark1 : palette.gray.light1}; text-align: center;`}>
              Click any tile to see details
            </div>
          )}
        </div>
      )}

      {/* Embedding Model */}
      {activeView === 'embeddings' && (
        <div className={css`display: flex; flex-direction: column; gap: 16px;`}>
          <Card darkMode={darkMode} className={css`padding: 20px;`}>
            <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 12px;`}>
              <H2 className={css`color: ${headingColor} !important; font-size: 18px !important;`}>
                Why Voyage Finance-2?
              </H2>
              <Badge variant="green">VoyageAI</Badge>
              <Badge variant="blue">1024-dim</Badge>
            </div>
            <Body className={css`color: ${textColor} !important; font-size: 13px !important; line-height: 1.7 !important; margin-bottom: 16px !important;`}>
              EnerLeafy uses <strong>voyage-finance-2</strong> from VoyageAI for all document embeddings in MongoDB Atlas Vector Search.
              This is a domain-specific embedding model fine-tuned on financial and energy market documents — making it significantly
              more effective than general-purpose models for our use case of EU energy policy retrieval, market research, and compliance auditing.
            </Body>
            <div className={css`display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;`}>
              {[
                { title: 'Domain Specialization', detail: 'Fine-tuned on financial/energy corpus — understands REMIT, EU ETS, capacity markets, PPA structures, and energy trading terminology. General models treat "baseload" and "peakload" as generic words; voyage-finance-2 captures their market-specific semantics.', icon: '🎯' },
                { title: 'Superior Retrieval Accuracy', detail: 'On financial document retrieval benchmarks (FinanceBench, FiQA), voyage-finance-2 achieves 3-8% higher nDCG@10 than OpenAI text-embedding-3-large and Cohere embed-v3, while using only 1024 dimensions (vs 3072 for OpenAI large).', icon: '📊' },
                { title: 'Cost-Efficient at 1024 Dimensions', detail: 'Half the vector size of OpenAI\'s large model means 50% less storage in MongoDB Atlas, faster similarity searches, and lower index memory. Critical when scaling to thousands of policy documents across 27 EU member states.', icon: '💰' },
              ].map((item, i) => (
                <div key={i} className={css`padding: 14px 16px; background: ${boxBg}; border: 1px solid ${borderColor}; border-left: 4px solid ${accentGreen}; border-radius: 0 8px 8px 0;`}>
                  <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 4px;`}>
                    <span className={css`font-size: 16px;`}>{item.icon}</span>
                    <Body className={css`color: ${headingColor} !important; font-size: 14px !important; font-weight: 700 !important;`}>{item.title}</Body>
                  </div>
                  <Body className={css`color: ${textColor} !important; font-size: 12px !important; line-height: 1.6 !important;`}>{item.detail}</Body>
                </div>
              ))}
            </div>
          </Card>

          <Card darkMode={darkMode} className={css`padding: 20px;`}>
            <H2 className={css`color: ${headingColor} !important; font-size: 18px !important; margin-bottom: 16px !important;`}>
              Embedding Model Comparison — Financial Document Retrieval
            </H2>
            <Body className={css`color: ${textColor} !important; font-size: 12px !important; margin-bottom: 16px !important;`}>
              nDCG@10 on financial retrieval benchmarks (FinanceBench + FiQA). Higher is better.
            </Body>
            <div className={css`display: flex; flex-direction: column; gap: 10px;`}>
              {[
                { model: 'voyage-finance-2', score: 78.4, dims: 1024, vendor: 'VoyageAI', highlight: true },
                { model: 'text-embedding-3-large', score: 74.1, dims: 3072, vendor: 'OpenAI', highlight: false },
                { model: 'embed-english-v3', score: 72.8, dims: 1024, vendor: 'Cohere', highlight: false },
                { model: 'voyage-large-2', score: 73.6, dims: 1536, vendor: 'VoyageAI', highlight: false },
                { model: 'text-embedding-3-small', score: 69.2, dims: 1536, vendor: 'OpenAI', highlight: false },
                { model: 'bge-large-en-v1.5', score: 65.3, dims: 1024, vendor: 'BAAI', highlight: false },
              ].map((m) => {
                const barPct = (m.score / 78.4) * 100;
                return (
                  <div key={m.model} className={css`display: flex; align-items: center; gap: 10px;`}>
                    <div className={css`width: 180px; flex-shrink: 0; text-align: right;`}>
                      <div className={css`font-size: 12px; font-weight: ${m.highlight ? 700 : 500}; color: ${m.highlight ? accentGreen : headingColor};`}>{m.model}</div>
                      <div className={css`font-size: 10px; color: ${textColor};`}>{m.vendor} · {m.dims}d</div>
                    </div>
                    <div className={css`flex: 1; height: 28px; background: ${darkMode ? palette.gray.dark3 : palette.gray.light2}; border-radius: 6px; overflow: hidden;`}>
                      <div className={css`
                        height: 100%; width: ${barPct}%; border-radius: 6px;
                        background: ${m.highlight ? `linear-gradient(90deg, ${palette.green.dark2}, ${accentGreen})` : darkMode ? palette.gray.dark1 : palette.gray.base};
                        display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; transition: width 0.5s ease;
                      `}>
                        <span className={css`font-size: 11px; font-weight: 700; color: ${m.highlight ? '#fff' : (darkMode ? palette.gray.light1 : palette.white)};`}>{m.score}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={css`margin-top: 16px; padding: 12px 16px; background: ${boxBg}; border: 1px solid ${borderColor}; border-radius: 8px;`}>
              <Body className={css`color: ${textColor} !important; font-size: 12px !important; line-height: 1.6 !important;`}>
                <strong className={css`color: ${headingColor};`}>Key insight:</strong> voyage-finance-2 achieves the highest retrieval accuracy at only 1024 dimensions —
                outperforming OpenAI&apos;s text-embedding-3-large (3072d) by <strong>+4.3 nDCG points</strong> while using <strong>3x fewer dimensions</strong>.
                This translates to 3x less vector storage in MongoDB Atlas and faster $vectorSearch queries.
              </Body>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
