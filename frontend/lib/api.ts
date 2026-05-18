import {
  CreateScenarioRequest,
  CreateScenarioResponse,
  TariffScenario,
  TelemetryConfig,
  Position,
} from './types';

const BASE = '/api';

/**
 * Direct backend URL for SSE streams — bypasses Next.js rewrite proxy which
 * buffers responses and prevents real-time streaming of tool-call events.
 * Telemetry already uses this pattern successfully.
 */
const SSE_BASE =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000/api')
    : '/api';

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
  // Stop any stale backend generator before starting fresh
  try {
    await fetch(`${BASE}/telemetry/stop`, { method: 'POST' });
  } catch {
    // Backend may be unreachable — continue to start attempt
  }

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
  session_id: string;
  sources: { title: string; type: string; snippet: string }[];
  tool_calls: string[];
}

// ── Streaming advisor ─────────────────────────────────────

export type AdvisorStreamEvent =
  | { type: 'tool_start'; name: string }
  | { type: 'tool_end'; name: string }
  | { type: 'token'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'done'; session_id: string; tool_calls: string[] }
  | { type: 'error'; message: string };

export async function* streamAdvisor(
  message: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  portfolio: any[] = [],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generators: any[] = [],
  history: { role: string; content: string }[] = [],
  sessionId?: string,
): AsyncGenerator<AdvisorStreamEvent> {
  const body: Record<string, unknown> = { message, portfolio, generators, history };
  if (sessionId) body.session_id = sessionId;

  const res = await fetch(`${SSE_BASE}/advisor/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Advisor ${res.status}: ${text}`);
  }
  if (!res.body) throw new Error('No response body from advisor stream');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data) {
            try {
              yield JSON.parse(data) as AdvisorStreamEvent;
            } catch {
              // skip malformed SSE line
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function chatWithAdvisor(
  message: string,
  portfolio: Position[] = [],
  generators: AdvisorGeneratorInput[] = [],
  history: { role: string; content: string }[] = [],
  sessionId?: string,
): Promise<AdvisorResponseItem> {
  const body: Record<string, unknown> = { message, portfolio, generators, history };
  if (sessionId) body.session_id = sessionId;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${BASE}/advisor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Advisor ${res.status}: ${text}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ── Audit Analysis (LLM-powered compliance) ──────────────

export interface AuditEventInput {
  streamId: string;
  streamType: string;
  version: number;
  eventType: string;
  timestamp: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface AuditAnalysisResponse {
  analysis: string;
  sources: { title: string; type: string; snippet: string }[];
  tool_calls: string[];
}

export async function* streamAuditAnalysis(
  scenarioId: string,
  scenarioTitle: string,
  regulation: string,
  description: string,
  events: AuditEventInput[],
  currentVersion: number,
): AsyncGenerator<AdvisorStreamEvent> {
  const res = await fetch(`${SSE_BASE}/audit/analyze/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scenario_id: scenarioId,
      scenario_title: scenarioTitle,
      regulation,
      description,
      events,
      current_version: currentVersion,
    }),
  });
  if (!res.ok) throw new Error(`Audit stream ${res.status}: ${res.statusText}`);
  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data) {
            try { yield JSON.parse(data) as AdvisorStreamEvent; } catch { /* skip */ }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── EnergySemanticLayer (ESL) ─────────────────────────────────

export interface ESLEntityType {
  name: string;
  description: string;
  iec_cim_class: string;
  collection: string;
  tags: string[];
  field_count: number;
}

export interface ESLEntity {
  id: string;
  name: string;
  asset_type: string;
  location?: { type: string; coordinates: [number, number] };
  _esl_entity: string;
  _iec_cim_class: string;
  site?: { id: string; name: string; country: string };
  [key: string]: unknown;
}

export interface ESLMetricsSummary {
  portfolio_id: string | null;
  portfolio_summary: {
    total_assets: number;
    by_type: Record<string, number>;
    total_solar_kwp: number;
    total_wind_kw: number;
    total_bess_kwh: number;
    total_renewable_capacity_mw: number;
  };
  renewable_penetration: {
    renewable_penetration_pct: number;
    renewable_mw: number;
    total_mw: number;
  };
  capacity_factors: {
    asset_id: string;
    asset_name: string;
    asset_type: string;
    capacity_factor_pct: number;
    avg_mw: number;
    capacity_mw: number;
  }[];
  bess_soc: {
    asset_id: string;
    asset_name: string;
    soc_pct: number;
    available_kwh: number;
    capacity_kwh: number;
  }[];
}

export interface ESLCatalog {
  esl_version: string;
  entities: Record<string, { name: string; description: string; iec_cim_class: string; fields: Record<string, unknown> }>;
  metrics: Record<string, { name: string; description: string; unit: string }>;
  layers: Record<string, string[]>;
}

export interface ESLTimeseries {
  asset_id: string;
  metric_type: string;
  hours: number;
  data: { timestamp: string; value_mw: number }[];
}

export async function eslGetCatalog(): Promise<ESLCatalog> {
  const res = await fetch(`${BASE}/esl/catalog`);
  if (!res.ok) throw new Error(`ESL catalog failed: ${res.statusText}`);
  return res.json();
}

export async function eslListEntityTypes(): Promise<ESLEntityType[]> {
  const res = await fetch(`${BASE}/esl/entities`);
  if (!res.ok) throw new Error(`ESL entities failed: ${res.statusText}`);
  return res.json();
}

export async function eslGetEntities(entityType: string): Promise<{ entity_type: string; description: string; count: number; items: ESLEntity[] }> {
  const res = await fetch(`${BASE}/esl/entities/${entityType}`);
  if (!res.ok) throw new Error(`ESL ${entityType} failed: ${res.statusText}`);
  return res.json();
}

export async function eslGetRawDocuments(entityType: string): Promise<{ collection: string; filter: Record<string, unknown>; raw_documents: Record<string, unknown>[] }> {
  const res = await fetch(`${BASE}/esl/entities/${entityType}/raw`);
  if (!res.ok) throw new Error(`ESL raw ${entityType} failed: ${res.statusText}`);
  return res.json();
}

export async function eslGetMetricsSummary(portfolioId?: string): Promise<ESLMetricsSummary> {
  const url = portfolioId
    ? `${BASE}/esl/metrics/summary?portfolio_id=${portfolioId}`
    : `${BASE}/esl/metrics/summary`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESL metrics summary failed: ${res.statusText}`);
  return res.json();
}

export async function eslGetTimeseries(assetId: string, metricType: string = 'supply', hours: number = 24): Promise<ESLTimeseries> {
  const res = await fetch(`${BASE}/esl/timeseries/${assetId}?metric_type=${metricType}&hours=${hours}`);
  if (!res.ok) throw new Error(`ESL timeseries failed: ${res.statusText}`);
  return res.json();
}

export async function eslGetPrices(zoneEic?: string): Promise<{ hours: number; zones: Record<string, { timestamp: string; price_eur_mwh: number }[]> }> {
  const url = zoneEic
    ? `${BASE}/esl/prices?zone_eic=${encodeURIComponent(zoneEic)}&hours=24`
    : `${BASE}/esl/prices?hours=24`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESL prices failed: ${res.statusText}`);
  return res.json();
}

export async function eslDeployViews(dryRun: boolean = false): Promise<{ dry_run: boolean; total: number; deployed: number; results: unknown[] }> {
  const res = await fetch(`${BASE}/esl/deploy?dry_run=${dryRun}`, { method: 'POST' });
  if (!res.ok) throw new Error(`ESL deploy failed: ${res.statusText}`);
  return res.json();
}

export async function eslGetStatus(): Promise<{ healthy: boolean; views: { view: string; deployed: boolean }[]; esl_version: string }> {
  const res = await fetch(`${BASE}/esl/status`);
  if (!res.ok) throw new Error(`ESL status failed: ${res.statusText}`);
  return res.json();
}

export async function eslSeedData(force: boolean = false): Promise<{ status: string; assets?: number }> {
  const res = await fetch(`${BASE}/esl/seed?force=${force}`, { method: 'POST' });
  if (!res.ok) throw new Error(`ESL seed failed: ${res.statusText}`);
  return res.json();
}

export async function analyzeAuditScenario(
  scenarioId: string,
  scenarioTitle: string,
  regulation: string,
  description: string,
  events: AuditEventInput[],
  currentVersion: number,
): Promise<AuditAnalysisResponse> {
  const res = await fetch(`${BASE}/audit/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scenario_id: scenarioId,
      scenario_title: scenarioTitle,
      regulation,
      description,
      events,
      current_version: currentVersion,
    }),
  });
  if (!res.ok) throw new Error(`Audit analysis failed: ${res.statusText}`);
  return res.json();
}
