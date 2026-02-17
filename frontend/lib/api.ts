import {
  CreateScenarioRequest,
  CreateScenarioResponse,
  TariffScenario,
  TelemetryConfig,
} from './types';

const BASE = '/api';
const BACKEND = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

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
  const res = await fetch(`${BACKEND}/telemetry/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`Failed to start telemetry: ${res.statusText}`);
}

export async function stopTelemetry(): Promise<void> {
  const res = await fetch(`${BACKEND}/telemetry/stop`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to stop telemetry: ${res.statusText}`);
}

export async function getTelemetryStatus(): Promise<{ running: boolean }> {
  const res = await fetch(`${BACKEND}/telemetry/status`);
  if (!res.ok) throw new Error(`Failed to get telemetry status: ${res.statusText}`);
  return res.json();
}
