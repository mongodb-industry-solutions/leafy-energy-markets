'use client';

import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Badge from '@leafygreen-ui/badge';
import { Body, H3 } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaType?: 'positive' | 'negative' | 'neutral';
}

export default function MetricCard({ label, value, delta, deltaType = 'neutral' }: MetricCardProps) {
  const { darkMode } = useDarkMode();

  const badgeVariant = deltaType === 'positive' ? 'green' : deltaType === 'negative' ? 'red' : 'lightgray';

  return (
    <Card
      darkMode={darkMode}
      className={css`
        padding: 20px;
        flex: 1;
        min-width: 200px;
      `}
    >
      <Body
        className={css`
          color: ${darkMode ? palette.gray.light1 : palette.gray.dark1} !important;
          font-size: 13px !important;
          margin-bottom: 8px !important;
        `}
      >
        {label}
      </Body>
      <div
        className={css`
          display: flex;
          align-items: baseline;
          gap: 10px;
        `}
      >
        <H3
          className={css`
            color: ${darkMode ? palette.white : palette.black} !important;
            margin: 0 !important;
          `}
        >
          {value}
        </H3>
        {delta && (
          <Badge variant={badgeVariant}>{delta}</Badge>
        )}
      </div>
    </Card>
  );
}
