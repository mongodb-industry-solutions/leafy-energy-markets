'use client';

import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import { Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TelemetryTimeSeriesPoint } from '@/lib/types';

interface LatencyChartProps {
  data: TelemetryTimeSeriesPoint[];
}

export default function LatencyChart({ data }: LatencyChartProps) {
  const { darkMode } = useDarkMode();
  const gridColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;

  return (
    <Card
      darkMode={darkMode}
      className={css`
        padding: 20px;
      `}
    >
      <Body
        className={css`
          color: ${textColor} !important;
          font-size: 13px !important;
          margin-bottom: 12px !important;
          font-weight: 600 !important;
        `}
      >
        Write Latency (ms)
      </Body>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="time"
            tick={{ fill: textColor, fontSize: 11 }}
            stroke={gridColor}
          />
          <YAxis
            tick={{ fill: textColor, fontSize: 11 }}
            stroke={gridColor}
          />
          <Tooltip
            contentStyle={{
              background: darkMode ? palette.gray.dark3 : palette.white,
              border: `1px solid ${gridColor}`,
              borderRadius: 4,
              color: darkMode ? palette.white : palette.black,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: textColor }}
          />
          <Line
            type="monotone"
            dataKey="latency_p50"
            name="p50"
            stroke={palette.green.base}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="latency_p95"
            name="p95"
            stroke={palette.yellow.base}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="latency_p99"
            name="p99"
            stroke={palette.red.base}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
