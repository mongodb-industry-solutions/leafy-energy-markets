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

export const hourlyExposure: HourlyExposure[] = Array.from({ length: 24 }, (_, i) => ({
  hour: i,
  mwh: Math.round(
    150 + 250 * Math.sin((i - 6) * Math.PI / 12) + (Math.random() - 0.5) * 60
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
    title: 'Explain P&L Difference',
    description: 'Why does the dynamic tariff scenario save ~12% vs baseline?',
    prompt: 'Explain why the dynamic tariff scenario with time-of-use pricing and load shifting saves approximately 12% compared to the flat tariff baseline for Portfolio PORTFOLIO-123 in the NORTH region.',
  },
  {
    title: 'Portfolio Risk Summary',
    description: 'What are the key risks in my current portfolio?',
    prompt: 'Summarize the key risks in my current energy portfolio, including market risk, ESG transition risk, and concentration risk.',
  },
  {
    title: 'Market Outlook',
    description: 'What is the European power market outlook for Q2 2026?',
    prompt: 'What is the outlook for European wholesale electricity prices in Q2 2026? Include factors like gas prices, renewable generation, and demand trends.',
  },
  {
    title: 'Optimization Ideas',
    description: 'How can I optimize my energy procurement strategy?',
    prompt: 'Based on my current portfolio positions and market conditions, what optimization strategies would you recommend for reducing costs while maintaining ESG compliance?',
  },
  {
    title: 'Tanker Supply Forecast',
    description: 'How will incoming Venezuelan crude shipments affect Gulf Coast prices?',
    prompt: 'How will incoming Venezuelan crude shipments affect Gulf Coast prices? Analyze the current tanker fleet in transit from Amuay to Corpus Christi and provide price forecasts and trade recommendations.',
  },
];

export const demoChatMessages: ChatMessage[] = [
  {
    id: 'msg-001',
    role: 'user',
    content: 'Explain why the dynamic tariff scenario with time-of-use pricing and load shifting saves approximately 12% compared to the flat tariff baseline for Portfolio PORTFOLIO-123 in the NORTH region.',
    timestamp: '2026-02-06T16:00:00Z',
  },
  {
    id: 'msg-002',
    role: 'assistant' as const,
    content: `The dynamic tariff scenario achieves approximately **12% cost savings** over the flat tariff baseline through two complementary mechanisms:

### 1. Time-of-Use Price Arbitrage
The flat tariff applies a uniform rate of **EUR 74.2/MWh** across all hours. The dynamic tariff exploits the natural price curve of the NORTH region wholesale market:
- **Off-peak hours (22:00–06:00):** Prices drop to EUR 45–55/MWh due to low demand and steady wind generation
- **Peak hours (08:00–20:00):** Prices rise to EUR 85–110/MWh driven by industrial demand

By shifting ~30% of flexible load from peak to off-peak windows, the portfolio captures an average spread of **EUR 25/MWh** on shifted volume.

### 2. Load Shifting Optimization
The scenario uses predictive load modeling (based on historical meter readings) to identify **flexible demand** that can be rescheduled without operational impact:
- EV fleet charging: shifted from 17:00–21:00 to 01:00–05:00
- Thermal storage pre-charging: shifted from 07:00–09:00 to 03:00–06:00
- Industrial processes with 4h flexibility window

### Quantified Impact
| Metric | Baseline | Dynamic | Delta |
|--------|----------|---------|-------|
| Total Cost | EUR ${baselineResult.totalCost.toLocaleString()} | EUR ${dynamicResult.totalCost.toLocaleString()} | -${scenarioComparison.savingsPercent}% |
| Avg Price | EUR 74.2/MWh | EUR 65.3/MWh | -EUR 8.9/MWh |

The savings are particularly strong in this period because wind generation in the NORTH region is **forecast above seasonal average**, depressing overnight prices further.`,
    timestamp: '2026-02-06T16:00:05Z',
    sources: [
      {
        title: 'European Power Market Outlook Q2 2026',
        type: 'Research',
        snippet: 'Wholesale electricity prices across Central Europe expected to rise 8-12% in Q2...',
      },
      {
        title: 'Wind Farm Asset Performance — Netherlands Cluster',
        type: 'Asset',
        snippet: 'NL offshore wind cluster achieved 42% capacity factor in January...',
      },
    ],
  },
];

export const agenticResponseMessage: ChatMessage = {
  id: 'msg-agentic-resp',
  role: 'assistant',
  content: `Based on my analysis of **5 Venezuelan crude tankers** currently in transit from Amuay to Corpus Christi, carrying a combined **3.15 million barrels**, here is the supply impact assessment and trade recommendations for the BRP.

### Fleet Summary

| Vessel | Cargo | Volume | ETA | Status |
|--------|-------|--------|-----|--------|
| PDVSA Patriota | Merey 16 | 600k bbl | Feb 18 | Underway (15%) |
| Falcon Tide | Mesa 30 + Santa Barbara | 750k bbl | Feb 16 | Underway (35%) |
| Caribbean Sun | Hamaca Heavy | 500k bbl | Feb 15 | Underway (55%) |
| Gulf Pioneer | Merey 16 + Boscan | 900k bbl | Feb 13 | Underway (78%) |
| Rio Orinoco | Mesa 30 | 400k bbl | Feb 12 | Underway (92%) |

### Price Impact Analysis

The arrival of **3.15M barrels of heavy/medium sour crude** into Corpus Christi over the next 7 days will create several pricing pressures:

- **WTI-Maya spread widening**: The influx of heavy sour barrels competes directly with Maya crude imports from Mexico. Expect the WTI-Maya differential to widen by **$0.80–1.20/bbl** as Gulf Coast refiners have ample heavy feedstock.
- **Mars differential pressure**: Mars crude (GC sour benchmark) will face downward pressure as Venezuelan Merey and Boscan cargoes offer comparable sulfur/API profiles at discounted terms.
- **Crack spread support**: Complex refiners running heavier slates will benefit from wider crude-product margins. GC 3-2-1 crack spread should strengthen as cheaper heavy feedstock improves refinery economics.

### 7-Day Price Forecast

| Benchmark | Current | +3 Days | +7 Days | Direction |
|-----------|---------|---------|---------|-----------|
| WTI (CL1) | $78.40 | $78.10 | $77.60 | Slight bearish |
| Mars (GC Sour) | $76.20 | $75.40 | $74.80 | Bearish |
| Maya (MEX) | $70.50 | $69.80 | $69.20 | Bearish |
| LLS (Light Sweet) | $80.10 | $80.50 | $81.20 | Bullish |
| GC 3-2-1 Crack | $28.40 | $29.10 | $30.20 | Bullish |

### Recommended BRP Trades

1. **Sell Mars-WTI spread** (entry: -$2.20, target: -$3.00) — Mars will underperform WTI as heavy sour supply floods GC market
2. **Buy GC 3-2-1 crack spread** (entry: $28.40, target: $30.50) — Cheap heavy feedstock supports complex refinery margins
3. **Buy LLS-WTI spread** (entry: +$1.70, target: +$2.80) — Light sweet premiums will widen as heavy crude displaces light barrels at refineries
4. **Sell Maya futures (Apr)** (entry: $70.50, target: $68.80) — Direct competition from Venezuelan heavy grades depresses Maya pricing

*Confidence: High — based on AIS vessel tracking, historical supply-price correlation, and refinery utilization data.*`,
  timestamp: '2026-02-12T10:05:00Z',
  sources: [
    {
      title: 'S&P Global Commodities at Sea — Venezuela Tracker',
      type: 'Maritime',
      snippet: 'Real-time AIS tracking of Venezuelan crude exports. 5 VLCCs currently en route to USGC with 3.15M bbl combined cargo.',
    },
    {
      title: 'Corpus Christi Port Authority — Vessel Schedule',
      type: 'Maritime',
      snippet: 'Scheduled arrivals Feb 12–18: 3 tankers with Venezuelan crude manifests, berth allocation confirmed for CCRA Terminal.',
    },
    {
      title: 'Gulf Coast Crude Differential Analysis — Q1 2026',
      type: 'Research',
      snippet: 'Heavy sour crude discounts widened 15% QoQ as Venezuelan supply resumed under OFAC general license framework.',
    },
    {
      title: 'Corpus Christi Refinery Complex — Utilization Report',
      type: 'Asset',
      snippet: 'CCRA complex running at 94% utilization. Coker units processing 180k bpd of heavy sour feedstock. Capacity for additional 40k bpd.',
    },
  ],
};
