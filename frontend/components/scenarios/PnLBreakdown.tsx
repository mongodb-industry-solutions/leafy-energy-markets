'use client';

import { css } from '@emotion/css';
import ExpandableCard from '@leafygreen-ui/expandable-card';
import { Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import type { HourlyPnl } from '@/lib/types';

interface PnLBreakdownProps {
  hourlyPnl: HourlyPnl[];
}

export default function PnLBreakdown({ hourlyPnl }: PnLBreakdownProps) {
  const { darkMode } = useDarkMode();
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const headerBg = darkMode ? palette.gray.dark3 : palette.gray.light3;

  return (
    <ExpandableCard
      title="Hourly P&L Detail"
      description="Click to expand detailed hourly cost breakdown"
      darkMode={darkMode}
    >
      <div
        className={css`
          overflow-x: auto;
          border: 1px solid ${borderColor};
          border-radius: 8px;
        `}
      >
        {/* Header */}
        <div
          className={css`
            display: grid;
            grid-template-columns: 80px 1fr 1fr 1fr;
            gap: 8px;
            padding: 10px 16px;
            background: ${headerBg};
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
          `}
        >
          <span>Hour</span>
          <span style={{ textAlign: 'right' }}>Baseline (EUR)</span>
          <span style={{ textAlign: 'right' }}>Dynamic (EUR)</span>
          <span style={{ textAlign: 'right' }}>Savings (EUR)</span>
        </div>
        {/* Rows */}
        {hourlyPnl.map((h) => (
          <div
            key={h.hour}
            className={css`
              display: grid;
              grid-template-columns: 80px 1fr 1fr 1fr;
              gap: 8px;
              padding: 8px 16px;
              border-top: 1px solid ${borderColor};
              font-size: 13px;
              color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
            `}
          >
            <span>{String(h.hour).padStart(2, '0')}:00</span>
            <span style={{ textAlign: 'right' }}>{h.baseline.toLocaleString()}</span>
            <span style={{ textAlign: 'right' }}>{h.dynamic.toLocaleString()}</span>
            <span
              style={{
                textAlign: 'right',
                color: h.difference > 0 ? palette.green.base : palette.red.base,
                fontWeight: 600,
              }}
            >
              {h.difference > 0 ? '+' : ''}{h.difference.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </ExpandableCard>
  );
}
