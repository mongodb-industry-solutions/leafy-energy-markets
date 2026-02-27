import {
  CreateScenarioRequest,
  CreateScenarioResponse,
  TariffScenario,
  TelemetryConfig,
  Position,
} from './types';

const BASE = '/api';

export async function createTariffScenario(
  portfolioId: string,
  params: CreateScenarioRequest
): Promise<CreateScenarioResponse> {
  const res = await fetch(`${BASE}/portfolios/${portfolioId}/tariff-scenarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to create scenario: ${res.statusText}`);
  return res.json();
}

export async function getTariffScenario(
  scenarioId: string
): Promise<TariffScenario> {
  const res = await fetch(`${BASE}/tariff-scenarios/${scenarioId}`);
  if (!res.ok) throw new Error(`Failed to get scenario: ${res.statusText}`);
  return res.json();
}

// ── Telemetry ────────────────────────────────────────────────

export async function startTelemetry(config: TelemetryConfig): Promise<void> {
  const res = await fetch(`${BASE}/telemetry/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`Failed to start telemetry: ${res.statusText}`);
}

export async function stopTelemetry(): Promise<void> {
  const res = await fetch(`${BASE}/telemetry/stop`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to stop telemetry: ${res.statusText}`);
}

export async function getTelemetryStatus(): Promise<{ running: boolean }> {
  const res = await fetch(`${BASE}/telemetry/status`);
  if (!res.ok) throw new Error(`Failed to get telemetry status: ${res.statusText}`);
  return res.json();
}

// ── Search / RAG ────────────────────────────────────────────

export interface SearchResultItem {
  doc_id: string;
  title: string;
  snippet: string;
  type: string;
  date: string;
  source: string;
  score: number;
}

export interface ChatResponseItem {
  response: string;
  sources: { title: string; type: string; snippet: string }[];
}

export async function searchMarketIntelligence(
  query: string,
  typeFilter?: string,
  limit = 5,
): Promise<SearchResultItem[]> {
  const body: Record<string, unknown> = { query, limit };
  if (typeFilter && typeFilter !== 'All') body.type_filter = typeFilter;

  const res = await fetch(`${BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
  const data = await res.json();
  return data.results;
}

export async function chatWithLeafy(
  message: string,
  history: { role: string; content: string }[] = [],
): Promise<ChatResponseItem> {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) throw new Error(`Chat failed: ${res.statusText}`);
  return res.json();
}

// ── Advisor (Agentic AI) ───────────────────────────────────

export interface AdvisorGeneratorInput {
  id: string;
  name: string;
  region: string;
  fuel: string;
  capacity_mw: number;
  status: string;
}

export interface AdvisorResponseItem {
  response: string;
  sources: { title: string; type: string; snippet: string }[];
  tool_calls: string[];
}

export async function chatWithAdvisor(
  message: string,
  portfolio: Position[] = [],
  generators: AdvisorGeneratorInput[] = [],
  history: { role: string; content: string }[] = [],
): Promise<AdvisorResponseItem> {
  const res = await fetch(`${BASE}/advisor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, portfolio, generators, history }),
  });
  if (!res.ok) throw new Error(`Advisor failed: ${res.statusText}`);
  return res.json();
}
