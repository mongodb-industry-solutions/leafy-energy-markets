'use client';

import { useMemo } from 'react';
import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Badge from '@leafygreen-ui/badge';
import { Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import type { StoredEvent } from '@/lib/types';

interface AggregateStateViewProps {
  events: StoredEvent[];
  currentVersion: number;
}

/**
 * Client-side fold() — replays events up to currentVersion
 * and computes aggregate state at each step.
 */
function foldEvents(events: StoredEvent[], upTo: number): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  const applied = events.filter((e) => e.version <= upTo);

  for (const evt of applied) {
    state._version = evt.version;
    state._lastEventType = evt.eventType;
    state._streamId = evt.streamId;

    switch (evt.eventType) {
      case 'TradeExecuted': {
        const p = evt.payload as Record<string, unknown>;
        const prev = (state.net_position as number) || 0;
        state.portfolio_id = p.portfolio_id;
        state.instrument_id = p.instrument_id;
        state.last_trade_price = p.price;
        state.net_position = prev + (p.quantity as number);
        state.trade_count = ((state.trade_count as number) || 0) + 1;
        break;
      }
      case 'PriceTickRecorded': {
        const p = evt.payload as Record<string, unknown>;
        state.instrument_id = p.instrument_id;
        state.last_price = p.price;
        break;
      }
      case 'MeterReadingRecorded': {
        const p = evt.payload as Record<string, unknown>;
        state.meter_id = p.meter_id;
        state.last_reading = p.reading;
        if (evt.metadata.corrects_version) {
          state.correction_applied = true;
          state.corrects_version = evt.metadata.corrects_version;
        }
        break;
      }
      case 'InstrumentListed': {
        const p = evt.payload as Record<string, unknown>;
        state.instrument_id = p.instrument_id;
        state.name = p.name;
        break;
      }
      case 'TariffScenarioCreated': {
        const p = evt.payload as Record<string, unknown>;
        state.scenario_id = p.scenario_id;
        state.portfolio_id = p.portfolio_id;
        state.region = p.region;
        break;
      }
      default: {
        // For unknown event types, merge payload keys
        Object.entries(evt.payload).forEach(([k, v]) => {
          state[k] = v;
        });
        break;
      }
    }
  }

  return state;
}

export default function AggregateStateView({ events, currentVersion }: AggregateStateViewProps) {
  const { darkMode } = useDarkMode();
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;

  const state = useMemo(() => foldEvents(events, currentVersion), [events, currentVersion]);
  const currentEvent = events.find((e) => e.version === currentVersion);

  return (
    <Card
      darkMode={darkMode}
      className={css`
        padding: 20px;
        flex: 1;
      `}
    >
      {/* Header */}
      <div className={css`display: flex; align-items: center; gap: 10px; margin-bottom: 16px;`}>
        <Body className={css`color: ${textColor} !important; font-size: 13px !important; font-weight: 600 !important;`}>
          Aggregate State
        </Body>
        <Badge variant="green">v{currentVersion}</Badge>
        <Body className={css`color: ${textColor} !important; font-size: 12px !important;`}>
          after fold()
        </Body>
      </div>

      {/* Current event highlight */}
      {currentEvent && (
        <div
          className={css`
            background: ${darkMode ? 'rgba(0,130,0,0.1)' : palette.green.light3};
            border-left: 3px solid ${palette.green.base};
            padding: 10px 14px;
            border-radius: 4px;
            margin-bottom: 16px;
          `}
        >
          <Body className={css`color: ${palette.green.base} !important; font-size: 12px !important; font-weight: 600 !important; margin-bottom: 4px !important;`}>
            Applied: {currentEvent.eventType}
          </Body>
          <pre
            className={css`
              font-size: 11px;
              color: ${textColor};
              margin: 0;
              white-space: pre-wrap;
              word-break: break-word;
              font-family: 'Source Code Pro', monospace;
            `}
          >
            {JSON.stringify(currentEvent.payload, null, 2)}
          </pre>
        </div>
      )}

      {/* State JSON */}
      <Body className={css`color: ${textColor} !important; font-size: 12px !important; font-weight: 600 !important; margin-bottom: 8px !important;`}>
        Current State
      </Body>
      <pre
        className={css`
          font-size: 12px;
          color: ${darkMode ? palette.gray.light2 : palette.gray.dark2};
          background: ${darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'};
          padding: 14px;
          border-radius: 6px;
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: 'Source Code Pro', monospace;
          max-height: 300px;
          overflow-y: auto;
        `}
      >
        {JSON.stringify(state, null, 2)}
      </pre>
    </Card>
  );
}
