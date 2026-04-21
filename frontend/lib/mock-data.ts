import {
  Position,
  HourlyExposure,
  PortfolioSummary,
  ScenarioResult,
  ScenarioComparison,
  HourlyPnl,
  SearchDocument,
  ChatMessage,
  SuggestedPrompt,
  TariffScenario,
} from './types';

// ── Portfolio ──────────────────────────────────────────────

export const portfolioSummary: PortfolioSummary = {
  totalPnl: 1_247_830,
  netExposureMwh: 4_520,
  activePositions: 14,
  portfolioValue: 28_450_000,
  pnlDelta: '+3.2%',
};

export const positions: Position[] = [
  { id: 'P001', instrument: 'DE Baseload Q2-26', type: 'POWER', quantity: 500, avgPrice: 72.4, currentPrice: 78.9, unrealizedPnl: 3250 },
  { id: 'P002', instrument: 'FR Peakload M03-26', type: 'POWER', quantity: 200, avgPrice: 95.1, currentPrice: 91.3, unrealizedPnl: -760 },
  { id: 'P003', instrument: 'TTF Gas Apr-26', type: 'GAS', quantity: 1000, avgPrice: 31.2, currentPrice: 34.8, unrealizedPnl: 3600 },
  { id: 'P004', instrument: 'EUA Carbon Dec-26', type: 'CARBON', quantity: 300, avgPrice: 68.5, currentPrice: 72.1, unrealizedPnl: 1080 },
  { id: 'P005', instrument: 'NL Wind PPA 2026', type: 'RENEWABLE', quantity: 800, avgPrice: 52.0, currentPrice: 54.3, unrealizedPnl: 1840 },
  { id: 'P006', instrument: 'DE Solar PPA H2-26', type: 'RENEWABLE', quantity: 600, avgPrice: 48.5, currentPrice: 50.1, unrealizedPnl: 960 },
  { id: 'P007', instrument: 'UK Baseload Q3-26', type: 'POWER', quantity: 350, avgPrice: 85.2, currentPrice: 82.7, unrealizedPnl: -875 },
  { id: 'P008', instrument: 'NBP Gas Jun-26', type: 'GAS', quantity: 450, avgPrice: 78.9, currentPrice: 81.4, unrealizedPnl: 1125 },
  { id: 'P009', instrument: 'IT Peakload Q2-26', type: 'POWER', quantity: 150, avgPrice: 102.3, currentPrice: 108.7, unrealizedPnl: 960 },
  { id: 'P010', instrument: 'ES Solar PPA 2026', type: 'RENEWABLE', quantity: 400, avgPrice: 45.0, currentPrice: 46.8, unrealizedPnl: 720 },
  { id: 'P011', instrument: 'NO Hydro PPA Q2-26', type: 'RENEWABLE', quantity: 550, avgPrice: 38.2, currentPrice: 40.5, unrealizedPnl: 1265 },
  { id: 'P012', instrument: 'EUA Carbon Mar-26', type: 'CARBON', quantity: 200, avgPrice: 65.0, currentPrice: 71.3, unrealizedPnl: 1260 },
  { id: 'P013', instrument: 'FR Baseload Cal-27', type: 'POWER', quantity: 250, avgPrice: 69.8, currentPrice: 73.2, unrealizedPnl: 850 },
  { id: 'P014', instrument: 'DE Peakload M04-26', type: 'POWER', quantity: 180, avgPrice: 98.4, currentPrice: 94.1, unrealizedPnl: -774 },
];

// Deterministic seed based on hour index (no Math.random at module load)
function seededNoise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export const hourlyExposure: HourlyExposure[] = Array.from({ length: 24 }, (_, i) => ({
  hour: i,
  mwh: Math.round(
    150 + 250 * Math.sin((i - 6) * Math.PI / 12) + (seededNoise(i) - 0.5) * 60
  ),
}));

// ── Scenarios ──────────────────────────────────────────────

function generateHourlyPnl(): HourlyPnl[] {
  return Array.from({ length: 24 }, (_, i) => {
    const baseline = Math.round(120 + 80 * Math.sin((i - 6) * Math.PI / 12) + (Math.random() - 0.5) * 20);
    const dynamicCost = Math.round(baseline * (0.82 + Math.random() * 0.12));
    return {
      hour: i,
      baseline,
      dynamic: dynamicCost,
      difference: baseline - dynamicCost,
    };
  });
}

const hourlyPnl = generateHourlyPnl();

export const baselineResult: ScenarioResult = {
  scenarioId: 'baseline-demo',
  name: 'Flat Tariff (Baseline)',
  totalCost: hourlyPnl.reduce((s, h) => s + h.baseline, 0),
  avgPrice: 74.2,
  peakCost: Math.max(...hourlyPnl.map((h) => h.baseline)),
  offPeakCost: Math.min(...hourlyPnl.map((h) => h.baseline)),
  hourlyPnl,
};

export const dynamicResult: ScenarioResult = {
  scenarioId: 'dynamic-demo',
  name: 'Dynamic ToU + Load Shifting',
  totalCost: hourlyPnl.reduce((s, h) => s + h.dynamic, 0),
  avgPrice: 65.3,
  peakCost: Math.max(...hourlyPnl.map((h) => h.dynamic)),
  offPeakCost: Math.min(...hourlyPnl.map((h) => h.dynamic)),
  hourlyPnl,
};

export const scenarioComparison: ScenarioComparison = {
  baseline: baselineResult,
  dynamic: dynamicResult,
  savingsPercent: Math.round(((baselineResult.totalCost - dynamicResult.totalCost) / baselineResult.totalCost) * 100),
  savingsAbsolute: baselineResult.totalCost - dynamicResult.totalCost,
};

export const mockScenarios: TariffScenario[] = [
  {
    _id: 'demo-baseline-001',
    portfolio_id: 'PORTFOLIO-123',
    region: 'NORTH',
    from_date: '2026-02-10T10:00:00Z',
    to_date: '2026-02-17T10:00:00Z',
    status: 'created',
    createdAt: '2026-02-06T15:50:00Z',
  },
  {
    _id: 'demo-dynamic-002',
    portfolio_id: 'PORTFOLIO-123',
    region: 'NORTH',
    from_date: '2026-02-10T10:00:00Z',
    to_date: '2026-02-17T10:00:00Z',
    status: 'created',
    createdAt: '2026-02-06T15:52:00Z',
  },
];

// ── Search Documents ───────────────────────────────────────

export const searchDocuments: SearchDocument[] = [
  {
    id: 'DOC-001',
    title: 'European Power Market Outlook Q2 2026',
    snippet: 'Wholesale electricity prices across Central Europe are expected to rise 8-12% in Q2 driven by lower wind generation forecasts and increased industrial demand following the manufacturing recovery.',
    type: 'Research',
    relevanceScore: 0.95,
    date: '2026-01-28',
    source: 'Internal Research',
  },
  {
    id: 'DOC-002',
    title: 'Carbon Credit Market Analysis — EU ETS Phase 4',
    snippet: 'The Market Stability Reserve (MSR) is expected to absorb 250M allowances in 2026, tightening supply. Carbon prices projected to reach EUR 80-85 by year-end.',
    type: 'Research',
    relevanceScore: 0.91,
    date: '2026-02-01',
    source: 'Bloomberg NEF',
  },
  {
    id: 'DOC-003',
    title: 'ESG Compliance Report — Portfolio NORTH Region',
    snippet: 'The NORTH region portfolio maintains 62% renewable energy exposure, exceeding the 50% target. Carbon intensity reduced by 18% YoY. Recommended: increase wind PPA allocation.',
    type: 'ESG',
    relevanceScore: 0.88,
    date: '2026-02-03',
    source: 'Sustainability Team',
  },
  {
    id: 'DOC-004',
    title: 'Wind Farm Asset Performance — Netherlands Cluster',
    snippet: 'The NL offshore wind cluster achieved 42% capacity factor in January, above 38% seasonal average. Curtailment incidents decreased 15% following grid upgrade completion.',
    type: 'Asset',
    relevanceScore: 0.85,
    date: '2026-02-04',
    source: 'Asset Management',
  },
  {
    id: 'DOC-005',
    title: 'Natural Gas Storage Report — TTF Hub',
    snippet: 'EU gas storage levels at 58% capacity, 12 percentage points above 5-year average. LNG imports from US remain strong. TTF front-month trading at EUR 34.8/MWh.',
    type: 'Research',
    relevanceScore: 0.82,
    date: '2026-02-05',
    source: 'GIE/AGSI+',
  },
  {
    id: 'DOC-006',
    title: 'Solar PPA Pricing Trends — Iberian Peninsula',
    snippet: 'Spanish solar PPA prices stabilized at EUR 45-48/MWh for 10-year contracts. Portuguese prices ~3% premium. Grid congestion in Andalusia creating basis risk.',
    type: 'Asset',
    relevanceScore: 0.79,
    date: '2026-01-30',
    source: 'Internal Research',
  },
  {
    id: 'DOC-007',
    title: 'ESG Risk Assessment — Carbon-Intensive Positions',
    snippet: 'Three portfolio positions flagged for elevated transition risk: UK Baseload Q3-26, IT Peakload Q2-26, and DE Peakload M04-26. Combined carbon exposure: 12,400 tCO2.',
    type: 'ESG',
    relevanceScore: 0.76,
    date: '2026-02-02',
    source: 'Risk Management',
  },
  {
    id: 'DOC-008',
    title: 'Nordic Hydro Reservoir Levels — February Update',
    snippet: 'Norwegian reservoir levels at 45.2% capacity, 3 points below median. Swedish levels normal. Price impact: upside risk for NO and SE power prices in spring.',
    type: 'Research',
    relevanceScore: 0.73,
    date: '2026-02-06',
    source: 'NVE/Vattenfall',
  },
];

// ── Leafy Chat ────────────────────────────────────────────

export const suggestedPrompts: SuggestedPrompt[] = [
  {
    title: 'Market Analysis',
    description: 'Analyze live prices, weather forecasts, and fleet output',
    prompt: 'Analyze my fleet\'s current output and the live market prices across Day-Ahead, Intraday, and Flexibility channels. Factor in the latest weather forecasts affecting my wind and solar assets. What market trends should I be watching today?',
  },
  {
    title: 'Risk Assessment',
    description: 'Identify portfolio risks and hedging strategies',
    prompt: 'Assess the key risks in my renewable energy fleet: weather-driven output variance, position gap exposure, price volatility across channels, and EU regulatory risk (REMIT, EU ETS). Suggest specific hedging strategies for my current positions.',
  },
  {
    title: 'Trade Recommendations',
    description: 'Optimal sell strategy for current fleet output',
    prompt: 'Based on my fleet\'s live output by asset type, current market prices, and weather forecasts, recommend the optimal allocation strategy. Which asset types should I sell on which channels (Day-Ahead vs Intraday vs Flexibility), at what volumes, and what price floors should I set? Prioritize revenue maximization while managing gap risk.',
  },
];

