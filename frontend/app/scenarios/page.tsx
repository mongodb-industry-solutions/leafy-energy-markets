'use client';

import { useState, useCallback, useMemo } from 'react';
import { css } from '@emotion/css';
import Button from '@leafygreen-ui/button';
import Icon from '@leafygreen-ui/icon';
import Banner from '@leafygreen-ui/banner';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import { useLiveFeed } from '@/lib/live-feed-context';
import PageHeader from '@/components/shared/PageHeader';
import ScenarioForm from '@/components/scenarios/ScenarioForm';
import ScenarioList from '@/components/scenarios/ScenarioList';
import ScenarioComparison from '@/components/scenarios/ScenarioComparison';
import { runDemoFlow, type DemoState, initialDemoState } from '@/lib/demo-flow';
import { scenarioComparison, mockScenarios } from '@/lib/mock-data';
import type { TariffScenario, ScenarioComparison as ComparisonType } from '@/lib/types';

export default function ScenariosPage() {
  const { darkMode } = useDarkMode();
  const liveFeed = useLiveFeed();
  const [scenarios, setScenarios] = useState<TariffScenario[]>(mockScenarios);
  const [demoState, setDemoState] = useState<DemoState>(initialDemoState);
  const [showComparison, setShowComparison] = useState(false);

  const handleCreated = useCallback((scenarioId: string) => {
    const newScenario: TariffScenario = {
      _id: scenarioId,
      portfolio_id: 'PORTFOLIO-123',
      region: 'Germany',
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

  // Overlay live pricing onto the comparison when live feed is active
  const activeComparison: ComparisonType | null = useMemo(() => {
    if (liveFeed.active && liveFeed.scenarioComparison && showComparison && demoState.comparison) {
      const liveData = liveFeed.scenarioComparison;
      return {
        baseline: {
          ...demoState.comparison.baseline,
          totalCost: liveData.baselineCost,
          hourlyPnl: liveData.hourlyPnl,
        },
        dynamic: {
          ...demoState.comparison.dynamic,
          totalCost: liveData.dynamicCost,
          hourlyPnl: liveData.hourlyPnl,
        },
        savingsPercent: liveData.savingsPercent,
        savingsAbsolute: liveData.savingsAbsolute,
      };
    }
    return demoState.comparison;
  }, [liveFeed.active, liveFeed.scenarioComparison, showComparison, demoState.comparison]);

  const liveBadge = liveFeed.active ? (
    <span
      className={css`
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        background: ${palette.red.base};
        color: ${palette.white};
        margin-right: 12px;
        animation: pulse 1.5s ease-in-out infinite;
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}
    >
      <span
        className={css`
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: ${palette.white};
        `}
      />
      Live
    </span>
  ) : null;

  return (
    <div>
      <PageHeader
        title="Scenario Builder"
        subtitle="Create and compare tariff scenarios to optimize energy procurement costs"
        action={
          <div className={css`display: flex; align-items: center;`}>
            {liveBadge}
            <Button
              variant="primary"
              darkMode={darkMode}
              disabled={demoState.isRunning}
              onClick={handleRunDemo}
              leftGlyph={<Icon glyph="Sparkle" />}
            >
              {demoState.isRunning ? 'Running Demo...' : 'Run Demo Scenario'}
            </Button>
          </div>
        }
      />

      {/* Compact explainer */}
      <Banner
        variant="info"
        darkMode={darkMode}
        className={css`margin-bottom: 24px;`}
      >
        Compare <strong>flat tariffs</strong> vs <strong>dynamic time-of-use pricing</strong> with load shifting. Typical savings: 8–15%. Each scenario is event-sourced in MongoDB for full replay & audit.
      </Banner>

      <ScenarioForm onCreated={handleCreated} />

      {showComparison && activeComparison && (
        <div className={css`margin-bottom: 24px;`}>
          <ScenarioComparison comparison={activeComparison} />
        </div>
      )}

      <ScenarioList scenarios={scenarios} />
    </div>
  );
}
