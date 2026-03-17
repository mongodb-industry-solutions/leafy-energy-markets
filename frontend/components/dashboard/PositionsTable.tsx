'use client';

import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Badge from '@leafygreen-ui/badge';
import { Subtitle, Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import Button from '@leafygreen-ui/button';
import type { Position } from '@/lib/types';

interface PositionsTableProps {
  positions: Position[];
  onLiquidate?: (positionId: string) => void;
}

const typeBadgeVariant: Record<string, 'green' | 'blue' | 'yellow' | 'red'> = {
  POWER: 'blue',
  GAS: 'yellow',
  CARBON: 'red',
  RENEWABLE: 'green',
};

export default function PositionsTable({ positions, onLiquidate }: PositionsTableProps) {
  const { darkMode } = useDarkMode();
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const headerBg = darkMode ? palette.gray.dark3 : palette.gray.light3;
  const rowBg = darkMode ? '#112733' : palette.white;

  const columns = ['Instrument', 'Type', 'Qty', 'Avg Price', 'Current', 'Unrealized P&L', ...(onLiquidate ? [''] : [])];

  return (
    <Card darkMode={darkMode} className={css`padding: 0; overflow: hidden; margin-bottom: 24px;`}>
      <div className={css`padding: 16px 20px; border-bottom: 1px solid ${borderColor};`}>
        <Subtitle className={css`color: ${darkMode ? palette.white : palette.black} !important;`}>
          Positions
        </Subtitle>
      </div>
      <div className={css`overflow-x: auto;`}>
        {/* Header */}
        <div
          className={css`
            display: grid;
            grid-template-columns: 2fr 100px 80px 100px 100px 120px ${onLiquidate ? '80px' : ''};
            gap: 12px;
            padding: 10px 20px;
            background: ${headerBg};
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
          `}
        >
          {columns.map((col) => (
            <span key={col}>{col}</span>
          ))}
        </div>
        {/* Rows */}
        {positions.map((pos) => (
          <div
            key={pos.id}
            className={css`
              display: grid;
              grid-template-columns: 2fr 100px 80px 100px 100px 120px ${onLiquidate ? '80px' : ''};
              gap: 12px;
              padding: 12px 20px;
              background: ${rowBg};
              border-top: 1px solid ${borderColor};
              font-size: 13px;
              color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
              align-items: center;
            `}
          >
            <Body className={css`color: ${darkMode ? palette.white : palette.black} !important; font-size: 13px !important;`}>
              {pos.instrument}
            </Body>
            <div>
              <Badge variant={typeBadgeVariant[pos.type] || 'lightgray'}>{pos.type}</Badge>
            </div>
            <span>{pos.quantity}</span>
            <span>EUR {pos.avgPrice.toFixed(1)}</span>
            <span>EUR {pos.currentPrice.toFixed(1)}</span>
            <span
              className={css`
                font-weight: 600;
                color: ${pos.unrealizedPnl >= 0 ? palette.green.base : palette.red.base};
              `}
            >
              {pos.unrealizedPnl >= 0 ? '+' : ''}EUR {pos.unrealizedPnl.toLocaleString()}
            </span>
            {onLiquidate && (
              <Button
                variant="dangerOutline"
                size="xsmall"
                darkMode={darkMode}
                onClick={() => onLiquidate(pos.id)}
              >
                Liquidate
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
