'use client';

import { css } from '@emotion/css';
import Badge from '@leafygreen-ui/badge';
import { Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import type { StoredEvent } from '@/lib/types';

interface EventCardProps {
  event: StoredEvent;
  isSelected: boolean;
  onClick: () => void;
}

const EVENT_COLORS: Record<string, string> = {
  TradeExecuted: 'yellow',
  PriceTickRecorded: 'green',
  MeterReadingRecorded: 'blue',
  InstrumentListed: 'lightgray',
  TariffScenarioCreated: 'lightgray',
  FlexibilityBidSubmitted: 'blue',
  FlexibilityActivated: 'yellow',
  FlexibilityDeliveryVerified: 'green',
  CrossBorderFlowRecorded: 'blue',
  CapacityAllocationRequested: 'yellow',
  CongestionRevenueDistributed: 'green',
};

export default function EventCard({ event, isSelected, onClick }: EventCardProps) {
  const { darkMode } = useDarkMode();
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const bg = isSelected
    ? darkMode
      ? palette.green.dark3
      : palette.green.light3
    : darkMode
    ? 'rgba(255,255,255,0.03)'
    : 'rgba(0,0,0,0.02)';

  const ts = event.timestamp.includes('T')
    ? event.timestamp.split('T')[1].replace('Z', '').slice(0, 8)
    : event.timestamp;

  return (
    <div
      onClick={onClick}
      className={css`
        padding: 10px 12px;
        border-radius: 6px;
        cursor: pointer;
        background: ${bg};
        border-left: 3px solid ${isSelected ? palette.green.base : 'transparent'};
        margin-bottom: 4px;
        transition: background 0.15s ease;
        &:hover {
          background: ${darkMode ? 'rgba(255,255,255,0.06)' : palette.gray.light3};
        }
      `}
    >
      <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 4px;`}>
        <Body className={css`color: ${palette.green.base} !important; font-size: 12px !important; font-weight: 600 !important;`}>
          v{event.version}
        </Body>
        <Badge variant={(EVENT_COLORS[event.eventType] || 'lightgray') as any}>
          {event.eventType}
        </Badge>
      </div>
      <Body className={css`color: ${textColor} !important; font-size: 11px !important;`}>
        {ts}
      </Body>
    </div>
  );
}
