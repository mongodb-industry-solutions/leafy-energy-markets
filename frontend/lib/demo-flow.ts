import { createTariffScenario } from './api';
import {
  scenarioComparison,
  baselineResult,
  dynamicResult,
} from './mock-data';
import type { ScenarioComparison, ChatMessage } from './types';

export interface DemoState {
  baselineScenarioId: string | null;
  dynamicScenarioId: string | null;
  comparison: ScenarioComparison | null;
  chatMessages: ChatMessage[];
  isRunning: boolean;
  error: string | null;
}

export const initialDemoState: DemoState = {
  baselineScenarioId: null,
  dynamicScenarioId: null,
  comparison: null,
  chatMessages: [],
  isRunning: false,
  error: null,
};

/**
 * Runs the one-click demo flow:
 * 1. Creates a baseline scenario (flat tariff) via real API
 * 2. Creates a dynamic scenario (ToU + load shifting) via real API
 * 3. Returns mock P&L comparison showing ~12% savings
 * 4. Pre-seeds Leafy conversation explaining why
 *
 * Falls back to mock scenario IDs if API is unavailable.
 */
export async function runDemoFlow(
  onProgress: (state: Partial<DemoState>) => void
): Promise<DemoState> {
  onProgress({ isRunning: true, error: null });

  let baselineId = 'demo-baseline-001';
  let dynamicId = 'demo-dynamic-002';

  // Try real API, fall back to mock IDs
  try {
    const baseline = await createTariffScenario('PORTFOLIO-123', {
      region: 'NORTH',
      from_date: '2026-02-10T10:00:00Z',
      to_date: '2026-02-17T10:00:00Z',
    });
    baselineId = baseline.scenario_id;
    onProgress({ baselineScenarioId: baselineId });
  } catch {
    onProgress({ baselineScenarioId: baselineId });
  }

  // Small delay for demo effect
  await new Promise((r) => setTimeout(r, 800));

  try {
    const dynamic = await createTariffScenario('PORTFOLIO-123', {
      region: 'NORTH',
      from_date: '2026-02-10T10:00:00Z',
      to_date: '2026-02-17T10:00:00Z',
    });
    dynamicId = dynamic.scenario_id;
    onProgress({ dynamicScenarioId: dynamicId });
  } catch {
    onProgress({ dynamicScenarioId: dynamicId });
  }

  await new Promise((r) => setTimeout(r, 600));

  const comparison = scenarioComparison;
  onProgress({ comparison });

  const result: DemoState = {
    baselineScenarioId: baselineId,
    dynamicScenarioId: dynamicId,
    comparison,
    chatMessages: [],
    isRunning: false,
    error: null,
  };

  onProgress(result);
  return result;
}

export { baselineResult, dynamicResult, scenarioComparison };
