'use client';

import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Badge from '@leafygreen-ui/badge';
import { Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import type { OriginatorEvent } from '@/lib/types';

interface EventFeedProps {
  events: OriginatorEvent[];
}

const TYPE_BADGE: Record<string, 'green' | 'blue' | 'yellow'> = {
  price_ticks: 'green',
  meter_readings: 'blue',
  trades: 'yellow',
};

const TYPE_LABEL: Record<string, string> = {
  price_ticks: 'Price Tick',
  meter_readings: 'Meter',
  trades: 'Trade',
};

export default function EventFeed({ events }: EventFeedProps) {
  const { darkMode } = useDarkMode();
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const rowBg = darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';

  return (
    <Card
      darkMode={darkMode}
      className={css`
        padding: 20px;
        max-height: 400px;
        display: flex;
        flex-direction: column;
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
        Live Event Feed — Energy Originators
      </Body>
      <div
        className={css`
          flex: 1;
          overflow-y: auto;
          font-family: 'Source Code Pro', monospace;
          font-size: 12px;
        `}
      >
        {events.length === 0 && (
          <Body className={css`color: ${textColor} !important; font-size: 12px !important; font-style: italic;`}>
            Waiting for events...
          </Body>
        )}
        {events.map((evt) => (
          <div
            key={evt.id}
            className={css`
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 6px 8px;
              border-radius: 4px;
              margin-bottom: 2px;
              background: ${rowBg};
              animation: fadeIn 0.3s ease;
              @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-4px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}
          >
            <span className={css`color: ${darkMode ? palette.gray.light2 : palette.gray.dark2}; min-width: 52px;`}>
              {evt.timestamp}
            </span>
            <Badge variant={TYPE_BADGE[evt.eventType] || 'lightgray'}>
              {TYPE_LABEL[evt.eventType] || evt.eventType}
            </Badge>
            <span
              className={css`
                color: ${palette.green.base};
                font-weight: 600;
                min-width: 160px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              `}
            >
              {evt.originator}
            </span>
            <span className={css`color: ${darkMode ? palette.gray.light1 : palette.gray.dark1}; min-width: 40px;`}>
              {evt.region}
            </span>
            <span
              className={css`
                color: ${darkMode ? palette.gray.light2 : palette.gray.dark2};
                flex: 1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              `}
            >
              {Object.entries(evt.payload)
                .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v}`)
                .join('  ')}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
