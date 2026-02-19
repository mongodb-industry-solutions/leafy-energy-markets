'use client';

import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Button from '@leafygreen-ui/button';
import Toggle from '@leafygreen-ui/toggle';
import { Body, H3, Overline } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import type { TelemetryConfig, TelemetryEventType } from '@/lib/types';

export type TelemetryMode = 'simulation' | 'backend';

interface ControlPanelProps {
  config: TelemetryConfig;
  onChange: (config: TelemetryConfig) => void;
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  mode: TelemetryMode;
  onModeChange: (mode: TelemetryMode) => void;
  liveFeed: boolean;
  onLiveFeedChange: (enabled: boolean) => void;
  backendWarning?: string | null;
}

const EVENT_TYPE_OPTIONS: { value: TelemetryEventType; label: string }[] = [
  { value: 'price_ticks', label: 'Price Ticks' },
  { value: 'meter_readings', label: 'Meter Readings' },
  { value: 'trades', label: 'Trades' },
];

// Logarithmic slider: internal 0–100 → display 10–400,000
const LOG_MIN = 1; // 10^1 = 10
const LOG_MAX = 5.602; // 10^5.602 ≈ 400,000
const SNAP_VALUES = [10, 50, 100, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 200_000, 400_000];

function sliderToEventsPerSec(sliderVal: number): number {
  const logVal = LOG_MIN + (sliderVal / 100) * (LOG_MAX - LOG_MIN);
  const raw = Math.pow(10, logVal);
  // Snap to nearest nice value
  let closest = SNAP_VALUES[0];
  let closestDist = Math.abs(raw - closest);
  for (const snap of SNAP_VALUES) {
    const dist = Math.abs(raw - snap);
    if (dist < closestDist) {
      closest = snap;
      closestDist = dist;
    }
  }
  return closest;
}

function eventsPerSecToSlider(eps: number): number {
  const logVal = Math.log10(Math.max(10, eps));
  return Math.round(((logVal - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100);
}

function formatEventsPerSec(eps: number): string {
  if (eps >= 1_000) return `${(eps / 1_000).toLocaleString()}K`;
  return eps.toLocaleString();
}

export default function ControlPanel({
  config,
  onChange,
  isRunning,
  onStart,
  onStop,
  mode,
  onModeChange,
  liveFeed,
  onLiveFeedChange,
  backendWarning,
}: ControlPanelProps) {
  const { darkMode } = useDarkMode();
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;

  const sliderStyle = css`
    width: 100%;
    accent-color: ${palette.green.base};
    cursor: ${isRunning ? 'not-allowed' : 'pointer'};
  `;

  const labelStyle = css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  `;

  const fieldStyle = css`
    margin-bottom: 20px;
  `;

  const sectionDivider = css`
    border-top: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
    margin: 16px 0;
  `;

  return (
    <Card
      darkMode={darkMode}
      className={css`
        padding: 24px;
        width: 320px;
        min-width: 320px;
      `}
    >
      <H3
        className={css`
          color: ${darkMode ? palette.white : palette.black} !important;
          margin: 0 0 20px 0 !important;
          font-size: 16px !important;
        `}
      >
        Load Generator
      </H3>

      {/* Mode Toggle */}
      <div className={fieldStyle}>
        <Body className={css`color: ${textColor} !important; font-size: 13px !important; margin-bottom: 8px !important;`}>
          Mode
        </Body>
        <div
          className={css`
            display: flex;
            border-radius: 6px;
            overflow: hidden;
            border: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
          `}
        >
          {(['simulation', 'backend'] as TelemetryMode[]).map((m) => (
            <button
              key={m}
              disabled={isRunning}
              onClick={() => onModeChange(m)}
              className={css`
                flex: 1;
                padding: 6px 12px;
                border: none;
                font-size: 12px;
                font-weight: 600;
                cursor: ${isRunning ? 'not-allowed' : 'pointer'};
                text-transform: capitalize;
                transition: all 0.15s;
                background: ${mode === m
                  ? palette.green.base
                  : darkMode ? palette.gray.dark3 : palette.gray.light3};
                color: ${mode === m
                  ? palette.white
                  : textColor};
                opacity: ${isRunning ? 0.6 : 1};
              `}
            >
              {m}
            </button>
          ))}
        </div>
        {backendWarning && mode === 'backend' && (
          <Body
            className={css`
              color: ${palette.yellow.base} !important;
              font-size: 11px !important;
              margin-top: 6px !important;
            `}
          >
            {backendWarning}
          </Body>
        )}
      </div>

      {/* Live Feed Toggle */}
      <div className={fieldStyle}>
        <div
          className={css`
            display: flex;
            align-items: center;
            justify-content: space-between;
          `}
        >
          <Body className={css`color: ${textColor} !important; font-size: 13px !important;`}>
            Feed to Dashboard
          </Body>
          <Toggle
            aria-label="Live Feed"
            size="small"
            checked={liveFeed}
            disabled={!isRunning}
            darkMode={darkMode}
            onChange={() => onLiveFeedChange(!liveFeed)}
          />
        </div>
      </div>

      <div className={sectionDivider} />

      {/* Concurrent Writers */}
      <div className={fieldStyle}>
        <div className={labelStyle}>
          <Body className={css`color: ${textColor} !important; font-size: 13px !important;`}>
            Concurrent Writers
          </Body>
          <Overline className={css`color: ${palette.green.base} !important;`}>
            {config.concurrent_writers}
          </Overline>
        </div>
        <input
          type="range"
          min={1}
          max={200}
          value={config.concurrent_writers}
          disabled={isRunning}
          className={sliderStyle}
          onChange={(e) =>
            onChange({ ...config, concurrent_writers: Number(e.target.value) })
          }
        />
      </div>

      {/* Events per Second — Logarithmic */}
      <div className={fieldStyle}>
        <div className={labelStyle}>
          <Body className={css`color: ${textColor} !important; font-size: 13px !important;`}>
            Events / sec
          </Body>
          <Overline className={css`color: ${palette.green.base} !important;`}>
            {formatEventsPerSec(config.events_per_second)}
          </Overline>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={eventsPerSecToSlider(config.events_per_second)}
          disabled={isRunning}
          className={sliderStyle}
          onChange={(e) =>
            onChange({ ...config, events_per_second: sliderToEventsPerSec(Number(e.target.value)) })
          }
        />
      </div>

      {/* Batch Size */}
      <div className={fieldStyle}>
        <div className={labelStyle}>
          <Body className={css`color: ${textColor} !important; font-size: 13px !important;`}>
            Batch Size
          </Body>
          <Overline className={css`color: ${palette.green.base} !important;`}>
            {config.batch_size.toLocaleString()}
          </Overline>
        </div>
        <input
          type="range"
          min={1}
          max={5000}
          step={config.batch_size >= 100 ? 100 : 1}
          value={config.batch_size}
          disabled={isRunning}
          className={sliderStyle}
          onChange={(e) =>
            onChange({ ...config, batch_size: Number(e.target.value) })
          }
        />
      </div>

      {/* Event Types */}
      <div className={fieldStyle}>
        <Body className={css`color: ${textColor} !important; font-size: 13px !important; margin-bottom: 8px !important;`}>
          Event Types
        </Body>
        {EVENT_TYPE_OPTIONS.map((opt) => (
          <div
            key={opt.value}
            className={css`
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 6px 0;
            `}
          >
            <Body
              className={css`
                color: ${darkMode ? palette.gray.light2 : palette.gray.dark2} !important;
                font-size: 13px !important;
              `}
            >
              {opt.label}
            </Body>
            <Toggle
              aria-label={opt.label}
              size="small"
              checked={config.event_types.includes(opt.value)}
              disabled={isRunning}
              darkMode={darkMode}
              onChange={() => {
                const types = config.event_types.includes(opt.value)
                  ? config.event_types.filter((t) => t !== opt.value)
                  : [...config.event_types, opt.value];
                if (types.length > 0) {
                  onChange({ ...config, event_types: types });
                }
              }}
            />
          </div>
        ))}
      </div>

      {/* Start / Stop */}
      <Button
        variant={isRunning ? 'danger' : 'primary'}
        darkMode={darkMode}
        onClick={isRunning ? onStop : onStart}
        className={css`width: 100%;`}
      >
        {isRunning ? 'Stop Generator' : 'Start Generator'}
      </Button>
    </Card>
  );
}
