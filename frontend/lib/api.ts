import {
  CreateScenarioRequest,
  CreateScenarioResponse,
  TariffScenario,
  TelemetryConfig,
  Position,
} from './types';

const BASE = '/api';

// SSE streams go through the same catch-all Route Handler (/api/[...path]/route.ts)
// which pipes upstreamRes.body directly — no buffering, real-time streaming works fine.
const SSE_BASE = '/api';

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
