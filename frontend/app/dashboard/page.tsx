'use client';

import PageHeader from '@/components/shared/PageHeader';
import PortfolioSummaryCards from '@/components/dashboard/PortfolioSummaryCards';
import PositionsTable from '@/components/dashboard/PositionsTable';
import ExposureChart from '@/components/dashboard/ExposureChart';
import { portfolioSummary, positions, hourlyExposure } from '@/lib/mock-data';

export default function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Portfolio Dashboard"
        subtitle="Real-time overview of energy portfolio positions and exposure"
      />
      <PortfolioSummaryCards summary={portfolioSummary} />
      <PositionsTable positions={positions} />
      <ExposureChart data={hourlyExposure} />
    </div>
  );
}
