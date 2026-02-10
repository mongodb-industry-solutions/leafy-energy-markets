'use client';

import { css } from '@emotion/css';
import MetricCard from '@/components/shared/MetricCard';
import type { PortfolioSummary } from '@/lib/types';

interface PortfolioSummaryCardsProps {
  summary: PortfolioSummary;
}

export default function PortfolioSummaryCards({ summary }: PortfolioSummaryCardsProps) {
  return (
    <div
      className={css`
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        margin-bottom: 24px;
      `}
    >
      <MetricCard
        label="Total P&L"
        value={`EUR ${summary.totalPnl.toLocaleString()}`}
        delta={summary.pnlDelta}
        deltaType="positive"
      />
      <MetricCard
        label="Net Exposure"
        value={`${summary.netExposureMwh.toLocaleString()} MWh`}
      />
      <MetricCard
        label="Active Positions"
        value={String(summary.activePositions)}
      />
      <MetricCard
        label="Portfolio Value"
        value={`EUR ${(summary.portfolioValue / 1_000_000).toFixed(1)}M`}
      />
    </div>
  );
}
