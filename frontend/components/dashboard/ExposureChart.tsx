'use client';

import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import { Subtitle } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import {
  BarChart,
  Bar,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useDarkMode } from '@/components/Providers';
import type { HourlyExposure, ExposurePoint } from '@/lib/types';

interface ExposureChartProps {
  data: HourlyExposure[];
  timeSeries?: ExposurePoint[] | null;
}

export default function ExposureChart({ data, timeSeries }: ExposureChartProps) {
  const { darkMode } = useDarkMode();
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;

  const isLive = timeSeries && timeSeries.length > 0;

  if (isLive) {
    return (
      <Card darkMode={darkMode} className={css`padding: 0; overflow: hidden;`}>
        <div className={css`padding: 16px 20px; border-bottom: 1px solid ${borderColor};`}>
          <Subtitle className={css`color: ${darkMode ? palette.white : palette.black} !important;`}>
            Live Exposure &amp; Cumulative P&amp;L
          </Subtitle>
        </div>
        <div className={css`padding: 20px; height: 320px;`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#2d3e4f' : '#e8e8e8'} />
              <XAxis
                dataKey="time"
                stroke={textColor}
                fontSize={11}
                interval="preserveStartEnd"
                tickCount={8}
              />
              <YAxis
                yAxisId="left"
                stroke={palette.green.base}
                fontSize={11}
                label={{ value: 'MWh', angle: -90, position: 'insideLeft', fill: palette.green.base, fontSize: 11 }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#F5A623"
                fontSize={11}
                label={{ value: 'P&L (EUR)', angle: 90, position: 'insideRight', fill: '#F5A623', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: darkMode ? '#1c2d38' : '#fff',
                  border: `1px solid ${darkMode ? '#3d5468' : '#ddd'}`,
                  borderRadius: 8,
                  color: darkMode ? '#fff' : '#000',
                }}
                formatter={(value: number, name: string) => {
                  if (name === 'mwh') return [`${value} MWh`, 'Net Exposure'];
                  if (name === 'cumulativePnl') return [`EUR ${value.toLocaleString()}`, 'Cumulative P&L'];
                  return [value, name];
                }}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="mwh"
                fill={palette.green.base}
                fillOpacity={0.2}
                stroke={palette.green.base}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulativePnl"
                stroke="#F5A623"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
    );
  }

  // Static fallback: 24-hour bar chart
  const chartData = data.map((d) => ({
    hour: `${String(d.hour).padStart(2, '0')}:00`,
    MWh: d.mwh,
  }));

  return (
    <Card darkMode={darkMode} className={css`padding: 0; overflow: hidden;`}>
      <div className={css`padding: 16px 20px; border-bottom: 1px solid ${borderColor};`}>
        <Subtitle className={css`color: ${darkMode ? palette.white : palette.black} !important;`}>
          24-Hour Exposure (MWh)
        </Subtitle>
      </div>
      <div className={css`padding: 20px; height: 320px;`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#2d3e4f' : '#e8e8e8'} />
            <XAxis dataKey="hour" stroke={textColor} fontSize={11} />
            <YAxis stroke={textColor} fontSize={11} />
            <Tooltip
              contentStyle={{
                background: darkMode ? '#1c2d38' : '#fff',
                border: `1px solid ${darkMode ? '#3d5468' : '#ddd'}`,
                borderRadius: 8,
                color: darkMode ? '#fff' : '#000',
              }}
            />
            <Bar dataKey="MWh" fill={palette.green.base} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
