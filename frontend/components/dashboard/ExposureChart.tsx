'use client';

import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import { Subtitle } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useDarkMode } from '@/components/Providers';
import type { HourlyExposure } from '@/lib/types';

interface ExposureChartProps {
  data: HourlyExposure[];
}

export default function ExposureChart({ data }: ExposureChartProps) {
  const { darkMode } = useDarkMode();
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;

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
