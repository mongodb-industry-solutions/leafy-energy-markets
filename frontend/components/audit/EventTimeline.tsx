'use client';

import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import { Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import EventCard from './EventCard';
import type { StoredEvent } from '@/lib/types';

interface EventTimelineProps {
  events: StoredEvent[];
  selectedVersion: number;
  onSelectVersion: (version: number) => void;
}

export default function EventTimeline({ events, selectedVersion, onSelectVersion }: EventTimelineProps) {
  const { darkMode } = useDarkMode();
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;

  return (
    <Card
      darkMode={darkMode}
      className={css`
        padding: 20px;
        min-width: 300px;
        width: 300px;
        max-height: calc(100vh - 280px);
        display: flex;
        flex-direction: column;
      `}
    >
      <Body
        className={css`
          color: ${textColor} !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          margin-bottom: 12px !important;
        `}
      >
        Event Timeline ({events.length} events)
      </Body>
      <div
        className={css`
          flex: 1;
          overflow-y: auto;
        `}
      >
        {events.map((evt) => (
          <EventCard
            key={evt.version}
            event={evt}
            isSelected={evt.version === selectedVersion}
            onClick={() => onSelectVersion(evt.version)}
          />
        ))}
      </div>
      {events.length > 0 && (
        <Body
          className={css`
            color: ${textColor} !important;
            font-size: 11px !important;
            margin-top: 8px !important;
            text-align: center;
            font-style: italic;
          `}
        >
          v{selectedVersion} selected
        </Body>
      )}
    </Card>
  );
}
