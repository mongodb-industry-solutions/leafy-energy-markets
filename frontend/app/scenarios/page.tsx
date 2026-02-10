'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { css } from '@emotion/css';
import Button from '@leafygreen-ui/button';
import Icon from '@leafygreen-ui/icon';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import PageHeader from '@/components/shared/PageHeader';
import ScenarioForm from '@/components/scenarios/ScenarioForm';
import ScenarioList from '@/components/scenarios/ScenarioList';
import ScenarioComparison from '@/components/scenarios/ScenarioComparison';
import { runDemoFlow, type DemoState, initialDemoState } from '@/lib/demo-flow';
import { scenarioComparison, mockScenarios } from '@/lib/mock-data';
import type { TariffScenario } from '@/lib/types';

export default function ScenariosPage() {
  const { darkMode } = useDarkMode();
  const router = useRouter();
  const [scenarios, setScenarios] = useState<TariffScenario[]>(mockScenarios);
  const [demoState, setDemoState] = useState<DemoState>(initialDemoState);
  const [showComparison, setShowComparison] = useState(false);

  const handleCreated = useCallback((scenarioId: string) => {
    const newScenario: TariffScenario = {
      _id: scenarioId,
      portfolio_id: 'PORTFOLIO-123',
      region: 'NORTH',
      from_date: '2026-02-10T10:00:00Z',
      to_date: '2026-02-17T10:00:00Z',
      status: 'created',
      createdAt: new Date().toISOString(),
    };
    setScenarios((prev) => [newScenario, ...prev]);
  }, []);

  const handleRunDemo = useCallback(async () => {
    setShowComparison(false);
    await runDemoFlow((partial) => {
      setDemoState((prev) => ({ ...prev, ...partial }));
    });
    setShowComparison(true);
  }, []);

  return (
    <div>
      <PageHeader
        title="Scenario Builder"
        subtitle="Create and compare tariff scenarios to optimize energy procurement costs"
        action={
          <Button
            variant="primary"
            darkMode={darkMode}
            disabled={demoState.isRunning}
            onClick={handleRunDemo}
            leftGlyph={<Icon glyph="Sparkle" />}
          >
            {demoState.isRunning ? 'Running Demo...' : 'Run Demo Scenario'}
          </Button>
        }
      />

      <ScenarioForm onCreated={handleCreated} />

      {showComparison && demoState.comparison && (
        <div className={css`margin-bottom: 24px;`}>
          <ScenarioComparison comparison={demoState.comparison} />
        </div>
      )}

      <ScenarioList scenarios={scenarios} />
    </div>
  );
}
