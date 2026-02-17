'use client';

import { css } from '@emotion/css';
import MetricCard from '@/components/shared/MetricCard';
import type { TelemetryMetrics } from '@/lib/types';

interface TelemetryMetricCardsProps {
  metrics: TelemetryMetrics | null;
}

export default function TelemetryMetricCards({ metrics }: TelemetryMetricCardsProps) {
  return (
    <div
      className={css`
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
      `}
    >
      <MetricCard
        label="Current Throughput"
        value={metrics ? `${metrics.actual_throughput.toLocaleString()} evt/s` : '—'}
      />
      <MetricCard
        label="Avg Latency (p50)"
        value={metrics ? `${metrics.write_latency_p50_ms} ms` : '—'}
      />
      <MetricCard
        label="Total Events"
        value={metrics ? metrics.total_events_inserted.toLocaleString() : '—'}
      />
      <MetricCard
        label="Active Writers"
        value={metrics ? String(metrics.active_writers) : '—'}
      />
    </div>
  );
}
