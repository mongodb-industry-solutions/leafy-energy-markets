'use client';

import { css } from '@emotion/css';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import { useLiveFeed } from '@/lib/live-feed-context';
import PageHeader from '@/components/shared/PageHeader';
import PortfolioSummaryCards from '@/components/dashboard/PortfolioSummaryCards';
import PositionsTable from '@/components/dashboard/PositionsTable';
import ExposureChart from '@/components/dashboard/ExposureChart';
import { portfolioSummary, positions, hourlyExposure } from '@/lib/mock-data';

export default function DashboardPage() {
  const { darkMode } = useDarkMode();
  const liveFeed = useLiveFeed();

  const activePositions = liveFeed.active && liveFeed.positions ? liveFeed.positions : positions;
  const activeSummary = liveFeed.active && liveFeed.summary ? liveFeed.summary : portfolioSummary;
  const activeExposure = liveFeed.active && liveFeed.exposure ? liveFeed.exposure : hourlyExposure;

  return (
    <div>
      <PageHeader
        title="Portfolio Dashboard"
        subtitle="Real-time overview of energy portfolio positions and exposure"
        action={
          liveFeed.active ? (
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
          ) : undefined
        }
      />
      <PortfolioSummaryCards summary={activeSummary} />
      <PositionsTable positions={activePositions} />
      <ExposureChart data={activeExposure} />
    </div>
  );
}
