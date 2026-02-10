// Portfolio & Positions
export interface Position {
  id: string;
  instrument: string;
  type: 'POWER' | 'GAS' | 'CARBON' | 'RENEWABLE';
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
}

export interface HourlyExposure {
  hour: number;
  mwh: number;
}

export interface PortfolioSummary {
  totalPnl: number;
  netExposureMwh: number;
  activePositions: number;
  portfolioValue: number;
  pnlDelta: string;
}

// Tariff Scenarios
export interface CreateScenarioRequest {
  region: string;
  from_date: string;
  to_date: string;
}

export interface CreateScenarioResponse {
  scenario_id: string;
}

export interface TariffScenario {
  _id: string;
  portfolio_id: string;
  region: string;
  from_date: string;
  to_date: string;
  status: string;
  createdAt: string;
}

export interface HourlyPnl {
  hour: number;
  baseline: number;
  dynamic: number;
  difference: number;
}

export interface ScenarioResult {
  scenarioId: string;
  name: string;
  totalCost: number;
  avgPrice: number;
  peakCost: number;
  offPeakCost: number;
  hourlyPnl: HourlyPnl[];
}

export interface ScenarioComparison {
  baseline: ScenarioResult;
  dynamic: ScenarioResult;
  savingsPercent: number;
  savingsAbsolute: number;
}

// Search
export type DocumentType = 'Research' | 'ESG' | 'Asset';

export interface SearchDocument {
  id: string;
  title: string;
  snippet: string;
  type: DocumentType;
  relevanceScore: number;
  date: string;
  source: string;
}

// Copilot Chat
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: SourceRef[];
}

export interface SourceRef {
  title: string;
  type: DocumentType;
  snippet: string;
}

export interface SuggestedPrompt {
  title: string;
  description: string;
  prompt: string;
}
