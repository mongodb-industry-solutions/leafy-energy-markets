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
  // Stop any stale backend generator before starting fresh
  await fetch(`${BASE}/telemetry/stop`, { method: 'POST', signal: AbortSignal.timeout(3000) }).catch(() => {});

  // Fast timeout — if backend is unreachable, fall back to simulation quickly
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${BASE}/telemetry/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Failed to start telemetry: ${res.statusText}`);
  } finally {
    clearTimeout(timeout);
  }
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
