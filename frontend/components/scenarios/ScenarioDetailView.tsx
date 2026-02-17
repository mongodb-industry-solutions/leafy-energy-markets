'use client';

import { css } from '@emotion/css';
import Link from 'next/link';
import Card from '@leafygreen-ui/card';
import Badge from '@leafygreen-ui/badge';
import Banner from '@leafygreen-ui/banner';
import Button from '@leafygreen-ui/button';
import Icon from '@leafygreen-ui/icon';
import { Body, Subtitle } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import PageHeader from '@/components/shared/PageHeader';
import ScenarioComparison from './ScenarioComparison';
import PnLBreakdown from './PnLBreakdown';
import type { TariffScenario, ScenarioComparison as ComparisonType } from '@/lib/types';

interface ScenarioDetailViewProps {
  scenario: TariffScenario;
  comparison: ComparisonType;
}

export default function ScenarioDetailView({ scenario, comparison }: ScenarioDetailViewProps) {
  const { darkMode } = useDarkMode();

  return (
    <div className={css`display: flex; flex-direction: column; gap: 24px;`}>
      <PageHeader
        title="Scenario Detail"
        subtitle={`Scenario ${scenario._id.slice(0, 16)}...`}
        action={
          <Link href="/scenarios">
            <Button variant="default" darkMode={darkMode} leftGlyph={<Icon glyph="ArrowLeft" />}>
              Back to Scenarios
            </Button>
          </Link>
        }
      />

      {/* Metadata card */}
      <Card darkMode={darkMode} className={css`padding: 20px;`}>
        <div
          className={css`
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 20px;
          `}
        >
          <div>
            <Body className={css`color: ${darkMode ? palette.gray.light1 : palette.gray.dark1} !important; font-size: 12px !important; margin-bottom: 4px !important;`}>
              Portfolio ID
            </Body>
            <Subtitle className={css`color: ${darkMode ? palette.white : palette.black} !important;`}>
              {scenario.portfolio_id}
            </Subtitle>
          </div>
          <div>
            <Body className={css`color: ${darkMode ? palette.gray.light1 : palette.gray.dark1} !important; font-size: 12px !important; margin-bottom: 4px !important;`}>
              Region
            </Body>
            <Badge variant="blue">{scenario.region}</Badge>
          </div>
          <div>
            <Body className={css`color: ${darkMode ? palette.gray.light1 : palette.gray.dark1} !important; font-size: 12px !important; margin-bottom: 4px !important;`}>
              Period
            </Body>
            <Subtitle className={css`color: ${darkMode ? palette.white : palette.black} !important;`}>
              {new Date(scenario.from_date).toLocaleDateString()} — {new Date(scenario.to_date).toLocaleDateString()}
            </Subtitle>
          </div>
          <div>
            <Body className={css`color: ${darkMode ? palette.gray.light1 : palette.gray.dark1} !important; font-size: 12px !important; margin-bottom: 4px !important;`}>
              Status
            </Body>
            <Badge variant="green">{scenario.status}</Badge>
          </div>
        </div>
      </Card>

      {/* Comparison */}
      <ScenarioComparison comparison={comparison} />

      {/* P&L breakdown */}
      <PnLBreakdown hourlyPnl={comparison.baseline.hourlyPnl} />

      {/* Ask Leafy link */}
      <Banner
        variant="info"
        darkMode={darkMode}
      >
        <div className={css`display: flex; align-items: center; justify-content: space-between; width: 100%;`}>
          <span>Want to understand why the dynamic tariff saves {comparison.savingsPercent}%?</span>
          <Link href="/leafy?demo=true">
            <Button
              variant="primary"
              size="small"
              darkMode={darkMode}
              rightGlyph={<Icon glyph="Sparkle" />}
            >
              Ask Leafy Why
            </Button>
          </Link>
        </div>
      </Banner>
    </div>
  );
}
