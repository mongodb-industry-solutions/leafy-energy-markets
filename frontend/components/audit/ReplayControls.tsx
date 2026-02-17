'use client';

import { useRef, useCallback, useState } from 'react';
import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Button from '@leafygreen-ui/button';
import Icon from '@leafygreen-ui/icon';
import { Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';

interface ReplayControlsProps {
  maxVersion: number;
  currentVersion: number;
  onChange: (version: number) => void;
}

export default function ReplayControls({ maxVersion, currentVersion, onChange }: ReplayControlsProps) {
  const { darkMode } = useDarkMode();
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPlayback = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback(() => {
    stopPlayback();
    setIsPlaying(true);
    let v = 1;
    onChange(v);
    intervalRef.current = setInterval(() => {
      v += 1;
      if (v > maxVersion) {
        stopPlayback();
        return;
      }
      onChange(v);
    }, 2500);
  }, [maxVersion, onChange, stopPlayback]);

  return (
    <Card
      darkMode={darkMode}
      className={css`
        padding: 16px 20px;
        display: flex;
        align-items: center;
        gap: 16px;
      `}
    >
      <Body className={css`color: ${textColor} !important; font-size: 13px !important; font-weight: 600 !important; white-space: nowrap;`}>
        Replay Controls
      </Body>

      <Button
        size="xsmall"
        darkMode={darkMode}
        onClick={() => onChange(1)}
        disabled={currentVersion <= 1}
        leftGlyph={<Icon glyph="ChevronLeft" />}
      >
        First
      </Button>

      <Button
        size="xsmall"
        darkMode={darkMode}
        onClick={() => onChange(Math.max(1, currentVersion - 1))}
        disabled={currentVersion <= 1}
      >
        Prev
      </Button>

      <div className={css`flex: 1; display: flex; align-items: center; gap: 10px;`}>
        <input
          type="range"
          min={1}
          max={maxVersion}
          value={currentVersion}
          onChange={(e) => onChange(Number(e.target.value))}
          className={css`
            flex: 1;
            accent-color: ${palette.green.base};
          `}
        />
        <Body className={css`color: ${palette.green.base} !important; font-size: 13px !important; font-weight: 600 !important; min-width: 60px; text-align: center;`}>
          {currentVersion} / {maxVersion}
        </Body>
      </div>

      <Button
        size="xsmall"
        darkMode={darkMode}
        onClick={() => onChange(Math.min(maxVersion, currentVersion + 1))}
        disabled={currentVersion >= maxVersion}
      >
        Next
      </Button>

      <Button
        size="xsmall"
        darkMode={darkMode}
        onClick={() => onChange(maxVersion)}
        disabled={currentVersion >= maxVersion}
        rightGlyph={<Icon glyph="ChevronRight" />}
      >
        Last
      </Button>

      <Button
        size="xsmall"
        variant={isPlaying ? 'danger' : 'primary'}
        darkMode={darkMode}
        onClick={isPlaying ? stopPlayback : startPlayback}
      >
        {isPlaying ? 'Stop' : 'Step-by-Step Replay'}
      </Button>
    </Card>
  );
}
