import {
  CreateScenarioRequest,
  CreateScenarioResponse,
  TariffScenario,
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
