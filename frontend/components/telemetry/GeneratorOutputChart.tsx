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
import type { GeneratorOutputPoint } from '@/lib/types';

interface GeneratorOutputChartProps {
  data: GeneratorOutputPoint[];
  generatorIds: { id: string; name: string; color: string }[];
}

export default function GeneratorOutputChart({ data, generatorIds }: GeneratorOutputChartProps) {
  const { darkMode } = useDarkMode();
  const gridColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;

  return (
    <Card
      darkMode={darkMode}
      className={css`padding: 20px;`}
    >
      <Body
        className={css`
          color: ${textColor} !important;
          font-size: 13px !important;
          margin-bottom: 12px !important;
          font-weight: 600 !important;
        `}
      >
        Generator Output (MW) — per-substation time-series
      </Body>
      <ResponsiveContainer width="100%" height={280}>
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
            label={{
              value: 'MW',
              angle: -90,
              position: 'insideLeft',
              style: { fill: textColor, fontSize: 11 },
            }}
          />
          <Tooltip
            contentStyle={{
              background: darkMode ? palette.gray.dark3 : palette.white,
              border: `1px solid ${gridColor}`,
              borderRadius: 4,
              color: darkMode ? palette.white : palette.black,
              fontSize: 12,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: textColor }}
          />
          {generatorIds.map((gen) => (
            <Line
              key={gen.id}
              type="monotone"
              dataKey={gen.id}
              name={gen.name}
              stroke={gen.color}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
