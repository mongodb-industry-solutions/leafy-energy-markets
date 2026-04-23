'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { css, keyframes } from '@emotion/css';
import { palette } from '@leafygreen-ui/palette';
import Badge from '@leafygreen-ui/badge';
import { Body, H3 } from '@leafygreen-ui/typography';
import Button from '@leafygreen-ui/button';
import { Select, Option } from '@leafygreen-ui/select';
import { useDarkMode } from '@/components/Providers';
import PageHeader from '@/components/shared/PageHeader';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface AssetState {
  id: string;
  type: string;
  region: string;
  name: string;
  capacityMw: number;
  currentOutputMw: number;
  forecastOutputMw: number;
  varianceMw: number;
  utilizationPct: number;
  status: string;
  sensorStatus: string;
  lastUpdated: string;
}

interface MarketPrices {
  dayAhead: number;
  intraday: number;
  flexibility: number;
  bestChannel: string;
}

interface AllocationEntry {
  targetMwh: number;
  marketChannel: string;
  priceFloorEur: number;
}

interface TradeRecord {
  tradeId: string;
  assetType: string;
  marketChannel: string;
  direction: string;
  quantityMwh: number;
  priceEurMwh: number;
  revenueEur: number;
  exchange: string;
  executionType: string;
  timestamp: string;
}

interface PortfolioState {
  allocationsByType: Record<string, AllocationEntry>;
  committedMwh: number;
  forecastMwh: number;
  netGapMwh: number;
  gapType: string;
  realisedPnlEur: number;
  fleetGenerationValueEur: number;
  dailyTargetEur: number;
  tradeLog: TradeRecord[];
}

interface AlertPayload {
  gapMwh: number;
  gapType: string;
  severity: string;
  recommendedAction: string;
  bestAvailablePriceEurMwh: number;
  estimatedImpactEur: number;
  committedMwh: number;
  forecastMwh: number;
}

interface Alert {
  id: string;
  eventType: string;
  payload: AlertPayload;
  timestamp: string;
}

interface RecentEvent {
  id: string;
  eventType: string;
  streamType: string;
  streamId: string;
  timestamp: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
}

interface TradingState {
  assets: AssetState[];
  portfolio: PortfolioState;
  prices: MarketPrices;
  alerts: Alert[];
  recentEvents: RecentEvent[];
  running: boolean;
  lastUpdated: string;
}

// ─────────────────────────────────────────────
// Keyframes
// ─────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
`;

const pulseBorder = keyframes`
  0%, 100% { border-color: ${palette.red.base}; box-shadow: 0 0 0 0 ${palette.red.base}33; }
  50%       { border-color: ${palette.red.light1}; box-shadow: 0 0 0 4px ${palette.red.base}11; }
`;

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  wind:    '#4da6ff',
  solar:   '#ffcc44',
  hydro:   '#66cccc',
  gas:     '#ff9966',
  battery: '#cc99ff',
  biomass: '#88ddaa',
};

const TYPE_ICONS: Record<string, string> = {
  wind:    '🌬️',
  solar:   '☀️',
  hydro:   '💧',
  gas:     '🔥',
  battery: '⚡',
  biomass: '🌿',
  portfolio: '🗂️',
};

const EVENT_ICONS: Record<string, string> = {
  MeterReadingRecorded:          '📊',
  PerformanceVarianceDetected:   '⚠️',
  WindForecastUpdated:           '🌬️',
  SolarIrradianceForecastUpdated:'☀️',
  WeatherAlertIssued:            '🌩️',
  PositionGapDetected:           '📉',
  TradeExecuted:                 '💹',
  PnlSnapshotRecorded:           '💰',
  CapacityAllocationSet:         '⚙️',
};

const CHANNEL_LABELS: Record<string, string> = {
  dayAhead:    'Day-Ahead',
  intraday:    'Intraday',
  flexibility: 'Flexibility',
  day_ahead:   'Day-Ahead',
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function statusBadgeVariant(status: string): 'green' | 'yellow' | 'red' | 'lightgray' {
  if (status === 'online') return 'green';
  if (status === 'curtailed') return 'yellow';
  if (status === 'offline') return 'red';
  return 'lightgray';
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '--:--';
  }
}

function fmt(n: number | undefined | null, decimals = 0): string {
  if (n === undefined || n === null || isNaN(n as number)) return '—';
  return (n as number).toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

// Asset Card
function AssetCard({ asset, darkMode }: { asset: AssetState; darkMode: boolean }) {
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const cardBg      = darkMode ? '#0d1a2d'          : palette.gray.light3;
  const textColor   = darkMode ? palette.white       : palette.black;
  const mutedColor  = darkMode ? palette.gray.dark1  : palette.gray.light1;
  const typeColor   = TYPE_COLORS[asset.type] ?? '#aaa';

  const varMagnitude = Math.abs(asset.varianceMw);
  const threshold    = asset.capacityMw * 0.05;
  const varColor     = varMagnitude < threshold
    ? mutedColor
    : asset.varianceMw > 0
      ? palette.green.base
      : palette.red.base;

  return (
    <div
      className={css`
        background: ${cardBg};
        border: 1px solid ${borderColor};
        border-left: 3px solid ${typeColor};
        border-radius: 8px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        animation: ${fadeIn} 0.3s ease;
      `}
    >
      <div className={css`display: flex; align-items: center; justify-content: space-between; gap: 6px;`}>
        <span className={css`font-weight: 700; font-size: 12px; color: ${textColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`}>
          {asset.name}
        </span>
        <Badge variant={statusBadgeVariant(asset.status)} darkMode={darkMode}>
          {asset.status}
        </Badge>
      </div>
      <div className={css`display: flex; align-items: center; gap: 6px;`}>
        <span className={css`font-size: 16px;`}>{TYPE_ICONS[asset.type] ?? '⚙️'}</span>
        <span className={css`font-size: 11px; color: ${mutedColor};`}>Region: {asset.region}</span>
      </div>
      <div className={css`font-size: 22px; font-weight: 700; color: ${palette.green.base};`}>
        {fmt(asset.currentOutputMw)} <span className={css`font-size: 12px; font-weight: 400; color: ${mutedColor};`}>MW</span>
      </div>
      <div className={css`font-size: 12px; color: ${mutedColor};`}>
        Forecast: {fmt(asset.forecastOutputMw)} MW
      </div>
      <div className={css`font-size: 11px; color: ${varColor}; font-weight: 600;`}>
        {asset.varianceMw > 0 ? '+' : ''}{fmt(asset.varianceMw)} MW vs forecast
      </div>
      <div className={css`width: 100%; height: 4px; background: ${darkMode ? palette.gray.dark3 : palette.gray.light2}; border-radius: 2px; overflow: hidden;`}>
        <div
          className={css`
            height: 100%;
            width: ${Math.min(100, Math.max(0, asset.utilizationPct))}%;
            background: ${palette.green.base};
            border-radius: 2px;
            transition: width 0.5s ease;
          `}
        />
      </div>
      <div className={css`font-size: 10px; color: ${mutedColor};`}>{fmt(asset.utilizationPct, 1)}% utilisation</div>
    </div>
  );
}

// Price tile — up = green (good for sellers), down = red
function PriceTile({
  label, price, delta, isBest, darkMode,
}: {
  label: string; price: number; delta: number | null; isBest: boolean; darkMode: boolean;
}) {
  const cardBg    = darkMode ? '#0d1a2d' : palette.gray.light3;
  const textColor = darkMode ? palette.white : palette.black;
  const mutedColor = darkMode ? palette.gray.dark1 : palette.gray.light1;
  const bestBorder = isBest ? `2px solid ${palette.green.base}` : `1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2}`;
  // Up = green (higher sell price = better), down = red
  const deltaColor = delta === null ? mutedColor : delta > 0 ? palette.green.base : palette.red.base;
  const deltaArrow = delta === null ? '' : delta > 0 ? '▲' : '▼';

  return (
    <div
      className={css`
        flex: 1;
        background: ${cardBg};
        border: ${bestBorder};
        border-radius: 8px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 120px;
        ${isBest ? `box-shadow: 0 0 0 1px ${palette.green.base}33;` : ''}
      `}
    >
      <div className={css`font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${mutedColor};`}>
        {label}
        {isBest && <span className={css`margin-left: 6px; color: ${palette.green.base};`}>★ Best</span>}
      </div>
      <div className={css`font-size: 24px; font-weight: 700; color: ${textColor};`}>
        €{fmt(price, 1)}<span className={css`font-size: 12px; color: ${mutedColor}; font-weight: 400;`}>/MWh</span>
      </div>
      {delta !== null && (
        <div className={css`font-size: 11px; color: ${deltaColor};`}>
          {deltaArrow} {Math.abs(delta).toFixed(1)} EUR/MWh
        </div>
      )}
    </div>
  );
}

// Alert card
function AlertCard({ alert, onDismiss, darkMode }: { alert: Alert; onDismiss: (id: string) => void; darkMode: boolean }) {
  const { severity, gapMwh, gapType, recommendedAction, bestAvailablePriceEurMwh, estimatedImpactEur } = alert.payload;
  const borderColor =
    severity === 'critical' ? palette.red.base :
    severity === 'warning'  ? palette.yellow.base :
    palette.blue.base;
  const bgColor =
    severity === 'critical'
      ? (darkMode ? '#1a0a0a' : '#fff5f5')
      : severity === 'warning'
        ? (darkMode ? '#1a1500' : '#fffde7')
        : (darkMode ? '#0a1020' : '#f0f7ff');

  return (
    <div
      className={css`
        flex-shrink: 0;
        min-width: 320px;
        max-width: 400px;
        background: ${bgColor};
        border: 2px solid ${borderColor};
        border-radius: 8px;
        padding: 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        animation: ${fadeIn} 0.3s ease;
        ${severity === 'critical' ? `animation: ${pulseBorder} 2s ease-in-out infinite;` : ''}
      `}
    >
      <div className={css`display: flex; align-items: center; justify-content: space-between; gap: 8px;`}>
        <div className={css`display: flex; align-items: center; gap: 6px;`}>
          <span className={css`font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; color: ${palette.white}; background: ${borderColor};`}>
            {severity}
          </span>
          <span className={css`font-size: 11px; color: ${darkMode ? palette.gray.dark1 : palette.gray.light1};`}>
            {formatTime(alert.timestamp)}
          </span>
        </div>
        <button
          onClick={() => onDismiss(alert.id)}
          className={css`background: none; border: none; cursor: pointer; color: ${darkMode ? palette.gray.dark1 : palette.gray.light1}; font-size: 14px; padding: 2px 4px; border-radius: 4px; &:hover { color: ${darkMode ? palette.white : palette.black}; background: ${darkMode ? palette.gray.dark3 : palette.gray.light2}; }`}
        >✕</button>
      </div>
      <div className={css`font-size: 13px; font-weight: 600; color: ${darkMode ? palette.white : palette.black};`}>
        Net {gapType}: {gapMwh > 0 ? '+' : ''}{fmt(gapMwh, 0)} MWh
      </div>
      <div className={css`font-size: 12px; color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};`}>
        Best action: {recommendedAction} @ €{bestAvailablePriceEurMwh?.toFixed(1)}/MWh → impact €{fmt(estimatedImpactEur, 0)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Position Gap — net gauge + per-type bars
// ─────────────────────────────────────────────

function PositionGapPanel({
  portfolio, assets, darkMode,
}: {
  portfolio: PortfolioState;
  assets: AssetState[];
  darkMode: boolean;
}) {
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const textColor   = darkMode ? palette.white : palette.black;
  const mutedColor  = darkMode ? palette.gray.light1 : palette.gray.dark2;
  const panelBg     = darkMode ? '#060e1c' : palette.white;

  const gapColor =
    portfolio.gapType === 'surplus'   ? palette.green.base :
    portfolio.gapType === 'shortfall' ? palette.red.base :
    mutedColor;

  // Net meter: show committed vs forecast as a split bar
  const total     = Math.max(portfolio.committedMwh + Math.abs(portfolio.netGapMwh), 1);
  const commitPct = Math.min(100, (portfolio.committedMwh / total) * 100);
  const gapPct    = Math.min(100 - commitPct, (Math.abs(portfolio.netGapMwh) / total) * 100);

  // Per-type data
  const allTypes = Array.from(
    new Set([...Object.keys(portfolio.allocationsByType ?? {}), ...assets.map(a => a.type)])
  );
  const assetTotals = allTypes.reduce<Record<string, { output: number; capacity: number }>>((acc, t) => {
    const group = assets.filter(a => a.type === t);
    acc[t] = {
      output:   group.reduce((s, a) => s + a.currentOutputMw, 0),
      capacity: group.reduce((s, a) => s + a.capacityMw,      0),
    };
    return acc;
  }, {});

  const notStarted = portfolio.forecastMwh === 0 && portfolio.committedMwh === 0;

  return (
    <section className={css`flex: 2; min-width: 0; background: ${panelBg}; border: 1px solid ${borderColor}; border-radius: 12px; padding: 20px; display: flex; flex-direction: column;`}>
      {/* Header */}
      <div className={css`margin-bottom: 14px;`}>
        <H3 darkMode={darkMode}>Position Gap</H3>
      </div>

      {notStarted ? (
        <div className={css`flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: ${mutedColor}; text-align: center; padding: 24px;`}>
          <span className={css`font-size: 28px;`}>📊</span>
          <span className={css`font-size: 13px; font-weight: 600;`}>No live data yet</span>
          <span className={css`font-size: 12px;`}>Start the simulation to see forecast vs committed position across asset types.</span>
        </div>
      ) : (
        <>
      {/* Net position gauge */}
      <div
        className={css`
          padding: 14px 16px;
          border-radius: 10px;
          background: ${darkMode ? '#0d1a2d' : palette.gray.light3};
          border: 1px solid ${gapColor}44;
          margin-bottom: 16px;
        `}
      >
        <div className={css`display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px;`}>
          <span className={css`font-size: 12px; color: ${mutedColor}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;`}>
            Net Position
          </span>
          <span className={css`font-size: 22px; font-weight: 800; color: ${gapColor};`}>
            {portfolio.netGapMwh > 0 ? '+' : ''}{fmt(portfolio.netGapMwh, 0)} MWh
            <span className={css`font-size: 13px; font-weight: 600; margin-left: 8px; text-transform: uppercase;`}>
              {portfolio.gapType}
            </span>
          </span>
        </div>
        {/* Committed + gap bar */}
        <div className={css`display: flex; align-items: center; gap: 8px;`}>
          <div className={css`flex: 1; height: 20px; background: ${darkMode ? palette.gray.dark3 : palette.gray.light2}; border-radius: 6px; overflow: hidden; display: flex; position: relative;`}>
            {/* Committed portion — solid blue */}
            <div className={css`height: 100%; width: ${commitPct}%; background: linear-gradient(90deg, ${palette.blue.dark1}, ${palette.blue.base}); transition: width 0.5s ease; display: flex; align-items: center; justify-content: flex-end; padding-right: 4px;`}>
              {commitPct > 12 && <span className={css`font-size: 9px; font-weight: 800; color: white; letter-spacing: 0.3px; text-shadow: 0 1px 2px rgba(0,0,0,0.5);`}>SOLD</span>}
            </div>
            {/* Gap portion — surplus/shortfall color */}
            {gapPct > 0 && (
              <div className={css`height: 100%; width: ${gapPct}%; background: ${gapColor}; opacity: 0.85; transition: width 0.5s ease; display: flex; align-items: center; justify-content: center;`}>
                {gapPct > 8 && <span className={css`font-size: 9px; font-weight: 800; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.5);`}>{portfolio.gapType === 'surplus' ? '+GAP' : '-GAP'}</span>}
              </div>
            )}
          </div>
        </div>
        {/* Legend pills with percentages */}
        {(() => {
          const forecast = portfolio.forecastMwh || 1;
          const soldPct  = Math.min(100, (portfolio.committedMwh / forecast) * 100);
          const gapAbsPct = Math.abs((portfolio.netGapMwh / forecast) * 100);
          return (
            <div className={css`display: flex; justify-content: space-between; margin-top: 8px; font-size: 12px; gap: 8px;`}>
              <span className={css`display: flex; align-items: center; gap: 5px; background: ${palette.blue.base}22; border: 1px solid ${palette.blue.base}66; border-radius: 4px; padding: 3px 10px; flex: 1;`}>
                <span className={css`width: 10px; height: 10px; border-radius: 2px; background: ${palette.blue.base}; flex-shrink: 0;`} />
                <span className={css`color: ${palette.blue.light1}; font-weight: 600;`}>Committed</span>
                <span className={css`color: ${darkMode ? palette.white : palette.black}; font-weight: 800; margin-left: auto;`}>{fmt(portfolio.committedMwh, 0)} MWh</span>
                <span className={css`color: ${palette.blue.base}; font-weight: 700; font-size: 11px;`}>{soldPct.toFixed(0)}%</span>
              </span>
              <span className={css`display: flex; align-items: center; gap: 5px; background: ${gapColor}22; border: 1px solid ${gapColor}66; border-radius: 4px; padding: 3px 10px; flex: 1;`}>
                <span className={css`width: 10px; height: 10px; border-radius: 2px; background: ${gapColor}; flex-shrink: 0;`} />
                <span className={css`color: ${gapColor}; font-weight: 600;`}>Forecast</span>
                <span className={css`color: ${darkMode ? palette.white : palette.black}; font-weight: 800; margin-left: auto;`}>{fmt(portfolio.forecastMwh, 0)} MWh</span>
                <span className={css`color: ${gapColor}; font-weight: 700; font-size: 11px;`}>{portfolio.netGapMwh >= 0 ? '+' : ''}{gapAbsPct.toFixed(0)}%</span>
              </span>
            </div>
          );
        })()}
      </div>

      {/* Per-type breakdown */}
      {allTypes.length > 0 && (
        <div className={css`display: flex; flex-direction: column; flex: 1; justify-content: space-evenly;`}>
          {allTypes.map((type) => {
            const alloc     = portfolio.allocationsByType?.[type];
            const committed = alloc?.targetMwh ?? 0;
            const forecast  = assetTotals[type]?.output ?? 0;
            if (committed === 0 && forecast === 0) return null;
            const maxVal     = Math.max(committed, forecast, 1);
            const typeColor  = TYPE_COLORS[type] ?? '#aaa';
            const gap        = forecast - committed;
            const gapC       = gap > 5 ? palette.green.base : gap < -5 ? palette.red.base : mutedColor;

            return (
              <div key={type} className={css`display: flex; align-items: center; gap: 8px;`}>
                <div className={css`width: 76px; flex-shrink: 0; font-size: 13px; font-weight: 600; color: ${textColor}; display: flex; align-items: center; gap: 4px;`}>
                  <span>{TYPE_ICONS[type] ?? '⚙️'}</span>
                  <span className={css`text-transform: capitalize;`}>{type}</span>
                </div>
                {/* Committed bar */}
                <div className={css`flex: 1; min-width: 0; height: 22px; position: relative; border-radius: 4px; background: ${darkMode ? palette.gray.dark3 : palette.gray.light2}; overflow: hidden;`}>
                  <div className={css`position: absolute; left: 0; top: 0; height: 100%; width: ${(committed / maxVal) * 100}%; background: ${typeColor}88; transition: width 0.4s ease;`} />
                  <div className={css`position: absolute; left: 0; top: 0; height: 100%; width: ${(forecast / maxVal) * 100}%; border-right: 2px dashed ${typeColor}; transition: width 0.4s ease;`} />
                </div>
                <div className={css`flex-shrink: 0; text-align: right; min-width: 110px;`}>
                  <div className={css`font-size: 12px; color: ${textColor};`}>
                    <span className={css`color: ${palette.blue.base}; font-weight: 700;`}>{fmt(committed, 0)}</span>
                    <span className={css`color: ${mutedColor};`}> / {fmt(forecast, 0)} MWh</span>
                  </div>
                  <div className={css`font-size: 12px; font-weight: 700; color: ${gapC};`}>
                    {gap > 0 ? '+' : ''}{fmt(gap, 0)} MWh
                    <span className={css`font-size: 11px; margin-left: 3px;`}>
                      ({forecast > 0 ? Math.round(Math.abs(gap / forecast) * 100) : 0}%)
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────
// Market Signals — weather & forecast events
// ─────────────────────────────────────────────

function MarketSignalsPanel({ events, darkMode }: { events: RecentEvent[]; darkMode: boolean }) {
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const mutedColor  = darkMode ? palette.gray.dark1 : palette.gray.light1;
  const panelBg     = darkMode ? '#060e1c' : palette.white;
  const textColor   = darkMode ? palette.white : palette.black;

  const signals = events
    .filter(e =>
      e.streamType === 'WeatherForecast' ||
      e.eventType  === 'PerformanceVarianceDetected'
    )
    .slice(0, 8);

  return (
    <section className={css`flex: 1; min-width: 0; background: ${panelBg}; border: 1px solid ${borderColor}; border-radius: 12px; padding: 20px;`}>
      <div className={css`margin-bottom: 12px;`}>
        <H3 darkMode={darkMode}>Market Signals</H3>
        <Body className={css`color: ${mutedColor};`} darkMode={darkMode}>Weather &amp; forecast updates</Body>
      </div>

      {signals.length === 0 ? (
        <div className={css`padding: 24px; text-align: center; color: ${mutedColor}; font-size: 12px;`}>
          No signals yet. Start the simulation to receive weather and forecast events.
        </div>
      ) : (
        <div className={css`display: flex; flex-direction: column; gap: 6px;`}>
          {signals.map((ev) => {
            const p = ev.payload;
            let summary = '';
            let badge = '';
            let badgeColor: string = palette.blue.base;

            if (ev.eventType === 'WindForecastUpdated') {
              const d = p.forecastDeltaPct as number;
              summary = `Wind ${p.region}: forecast ${d > 0 ? '+' : ''}${d?.toFixed(1)}% · ${p.windSpeedMs} m/s`;
              badge = d > 0 ? '▲ UP' : '▼ DOWN';
              badgeColor = d > 0 ? palette.green.base : palette.red.base;
            } else if (ev.eventType === 'SolarIrradianceForecastUpdated') {
              const d = p.forecastDeltaPct as number;
              summary = `Solar ${p.region}: forecast ${d > 0 ? '+' : ''}${d?.toFixed(1)}% · ${p.irradianceWm2} W/m²`;
              badge = d > 0 ? '▲ UP' : '▼ DOWN';
              badgeColor = d > 0 ? palette.green.base : palette.red.base;
            } else if (ev.eventType === 'WeatherAlertIssued') {
              summary = `${p.region}: ${p.description ?? p.severity + ' alert'}`;
              badge = p.severity?.toUpperCase() ?? 'ALERT';
              badgeColor = p.severity === 'critical' ? palette.red.base : p.severity === 'warning' ? palette.yellow.base : palette.blue.base;
            } else if (ev.eventType === 'PerformanceVarianceDetected') {
              summary = `${p.assetName}: ${p.variancePct > 0 ? '+' : ''}${p.variancePct?.toFixed(1)}% vs forecast`;
              badge = p.severity?.toUpperCase() ?? 'VAR';
              badgeColor = p.severity === 'warning' ? palette.yellow.base : palette.blue.base;
            }

            return (
              <div
                key={ev.id}
                className={css`
                  display: flex;
                  align-items: flex-start;
                  gap: 8px;
                  padding: 8px 10px;
                  border-radius: 6px;
                  background: ${darkMode ? '#0d1a2d' : palette.gray.light3};
                  animation: ${fadeIn} 0.25s ease;
                `}
              >
                <span className={css`font-size: 16px; flex-shrink: 0; margin-top: 1px;`}>
                  {EVENT_ICONS[ev.eventType] ?? '📌'}
                </span>
                <div className={css`flex: 1; min-width: 0;`}>
                  <div className={css`font-size: 11px; color: ${textColor}; font-weight: 500;`}>{summary}</div>
                  <div className={css`font-size: 10px; color: ${mutedColor}; margin-top: 2px;`}>{formatTime(ev.timestamp)}</div>
                </div>
                <span
                  className={css`
                    flex-shrink: 0;
                    font-size: 9px;
                    font-weight: 700;
                    padding: 2px 5px;
                    border-radius: 3px;
                    background: ${badgeColor}22;
                    color: ${badgeColor};
                    border: 1px solid ${badgeColor}44;
                  `}
                >{badge}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────
// Capacity Allocation — fast trader UX
// ─────────────────────────────────────────────

interface AllocFormRow {
  targetMwh: string;
  marketChannel: string;
  priceFloorEur: string;
}

function CapacityAllocationPanel({
  onlineTypes,
  allocForm,
  setAllocForm,
  assetTotals,
  prices,
  onApply,
  darkMode,
}: {
  onlineTypes: string[];
  allocForm: Record<string, AllocFormRow>;
  setAllocForm: React.Dispatch<React.SetStateAction<Record<string, AllocFormRow>>>;
  assetTotals: Record<string, { output: number; capacity: number }>;
  prices: MarketPrices;
  onApply: () => void;
  darkMode: boolean;
}) {
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const textColor   = darkMode ? palette.white : palette.black;
  const mutedColor  = darkMode ? palette.gray.dark1 : palette.gray.light1;
  const panelBg     = darkMode ? '#060e1c' : palette.white;
  const inputBg     = darkMode ? '#0d1a2d' : palette.gray.light3;

  const channelPrice = (ch: string): number =>
    ch === 'dayAhead' ? prices.dayAhead :
    ch === 'intraday' ? prices.intraday :
    ch === 'flexibility' ? prices.flexibility :
    prices.dayAhead;

  const updateRow = (type: string, patch: Partial<AllocFormRow>) => {
    setAllocForm(prev => {
      const current = prev[type] ?? { targetMwh: '0', marketChannel: 'dayAhead', priceFloorEur: '' };
      const merged = { ...current, ...patch };
      // Auto-set price floor when channel changes
      if (patch.marketChannel !== undefined) {
        merged.priceFloorEur = String(channelPrice(patch.marketChannel).toFixed(2));
      }
      return { ...prev, [type]: merged };
    });
  };

  const quickFill = (type: string, pct: number) => {
    const forecast = Math.round((assetTotals[type]?.output ?? 0) * pct);
    updateRow(type, { targetMwh: String(forecast) });
  };

  return (
    <section className={css`flex: 1; min-width: 0; background: ${panelBg}; border: 1px solid ${borderColor}; border-radius: 12px; padding: 20px;`}>
      <div className={css`margin-bottom: 16px;`}>
        <H3 darkMode={darkMode}>Capacity Allocation</H3>
        <Body className={css`color: ${mutedColor};`} darkMode={darkMode}>Set sell targets per asset type</Body>
      </div>

      {onlineTypes.length === 0 ? (
        <div className={css`padding: 24px; text-align: center; color: ${mutedColor}; font-size: 13px;`}>
          No online assets. Start the simulation to populate fleet data.
        </div>
      ) : (
        <div className={css`display: flex; flex-direction: column; gap: 10px;`}>
          {/* Header row */}
          <div className={css`display: grid; grid-template-columns: 76px 1fr 128px 90px; gap: 8px; align-items: center; padding: 0 0 4px; border-bottom: 1px solid ${borderColor};`}>
            <span className={css`font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${mutedColor};`}>Asset</span>
            <span className={css`font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${mutedColor};`}>Target MWh</span>
            <span className={css`font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${mutedColor};`}>Channel</span>
            <span className={css`font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${mutedColor};`}>Floor €/MWh</span>
          </div>

          {onlineTypes.map((type) => {
            const row      = allocForm[type] ?? { targetMwh: '0', marketChannel: 'dayAhead', priceFloorEur: '' };
            const forecast = Math.round(assetTotals[type]?.output ?? 0);
            const typeColor = TYPE_COLORS[type] ?? '#aaa';
            const val       = Number(row.targetMwh) || 0;
            const fillPct   = forecast > 0 ? Math.min(100, (val / forecast) * 100) : 0;

            return (
              <div key={type}>
                <div className={css`display: grid; grid-template-columns: 76px 1fr 128px 90px; gap: 8px; align-items: center;`}>
                  {/* Asset label */}
                  <div className={css`display: flex; align-items: center; gap: 3px; font-size: 12px; font-weight: 600; color: ${textColor}; border-left: 3px solid ${typeColor}; padding-left: 6px;`}>
                    <span>{TYPE_ICONS[type] ?? '⚙️'}</span>
                    <span className={css`text-transform: capitalize;`}>{type}</span>
                  </div>

                  {/* Target MWh — custom numeric input with +/- and quick-fill */}
                  <div className={css`display: flex; flex-direction: column; gap: 4px;`}>
                    <div className={css`display: flex; align-items: center; gap: 4px;`}>
                      <button
                        onClick={() => updateRow(type, { targetMwh: String(Math.max(0, val - 10)) })}
                        className={css`width: 24px; height: 28px; border-radius: 4px; border: 1px solid ${borderColor}; background: ${inputBg}; color: ${textColor}; cursor: pointer; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; &:hover { background: ${darkMode ? palette.gray.dark2 : palette.gray.light2}; }`}
                      >−</button>
                      <input
                        type="number"
                        value={row.targetMwh}
                        onChange={e => updateRow(type, { targetMwh: e.target.value })}
                        className={css`
                          flex: 1; height: 28px; padding: 0 8px; border-radius: 4px;
                          border: 1px solid ${borderColor}; background: ${inputBg};
                          color: ${textColor}; font-size: 13px; font-weight: 600;
                          outline: none; min-width: 0;
                          &:focus { border-color: ${palette.blue.base}; }
                        `}
                      />
                      <button
                        onClick={() => updateRow(type, { targetMwh: String(val + 10) })}
                        className={css`width: 24px; height: 28px; border-radius: 4px; border: 1px solid ${borderColor}; background: ${inputBg}; color: ${textColor}; cursor: pointer; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; &:hover { background: ${darkMode ? palette.gray.dark2 : palette.gray.light2}; }`}
                      >+</button>
                    </div>
                    {/* Quick-fill buttons */}
                    <div className={css`display: flex; gap: 3px;`}>
                      {[25, 50, 75, 100].map(pct => (
                        <button
                          key={pct}
                          onClick={() => quickFill(type, pct / 100)}
                          className={css`
                            flex: 1; padding: 2px 0; border-radius: 3px; font-size: 9px; font-weight: 700;
                            border: 1px solid ${borderColor}; background: ${inputBg}; color: ${mutedColor};
                            cursor: pointer; text-align: center;
                            &:hover { background: ${typeColor}22; color: ${typeColor}; border-color: ${typeColor}; }
                          `}
                        >{pct}%</button>
                      ))}
                    </div>
                    {/* Fill indicator bar */}
                    <div className={css`height: 3px; background: ${darkMode ? palette.gray.dark3 : palette.gray.light2}; border-radius: 2px; overflow: hidden;`}>
                      <div className={css`height: 100%; width: ${fillPct}%; background: ${typeColor}; transition: width 0.3s ease;`} />
                    </div>
                    <div className={css`font-size: 9px; color: ${mutedColor};`}>Forecast: ~{fmt(forecast, 0)} MWh</div>
                  </div>

                  {/* Channel select */}
                  <div className={css`min-width: 0;`}>
                    <Select
                      label="Channel"
                      value={row.marketChannel}
                      onChange={val => updateRow(type, { marketChannel: val })}
                      darkMode={darkMode}
                    >
                      <Option value="dayAhead">Day-Ahead €{prices.dayAhead.toFixed(1)}</Option>
                      <Option value="intraday">Intraday €{prices.intraday.toFixed(1)}</Option>
                      <Option value="flexibility">Flexibility €{prices.flexibility.toFixed(1)}</Option>
                    </Select>
                  </div>

                  {/* Price floor */}
                  <input
                    type="number"
                    placeholder="—"
                    value={row.priceFloorEur}
                    onChange={e => updateRow(type, { priceFloorEur: e.target.value })}
                    className={css`
                      height: 36px; padding: 0 8px; border-radius: 4px;
                      border: 1px solid ${borderColor}; background: ${inputBg};
                      color: ${textColor}; font-size: 13px; outline: none; width: 100%;
                      &:focus { border-color: ${palette.blue.base}; }
                    `}
                  />
                </div>
              </div>
            );
          })}

          <Button
            variant="primary"
            darkMode={darkMode}
            onClick={onApply}
            className={css`align-self: flex-start; margin-top: 6px;`}
          >
            Trade
          </Button>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────
// Trade Log — executed trades
// ─────────────────────────────────────────────

function TradeLogPanel({ trades, darkMode }: { trades: TradeRecord[]; darkMode: boolean }) {
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const mutedColor  = darkMode ? palette.gray.dark1 : palette.gray.light1;
  const panelBg     = darkMode ? '#060e1c' : palette.white;
  const textColor   = darkMode ? palette.white : palette.black;

  const totalRevenue = trades.reduce((s, t) => s + (t.revenueEur ?? 0), 0);

  return (
    <section className={css`background: ${panelBg}; border: 1px solid ${borderColor}; border-radius: 12px; padding: 20px;`}>
      <div className={css`margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;`}>
        <H3 darkMode={darkMode}>Trade Log</H3>
        {trades.length > 0 && (
          <span className={css`font-size: 12px; color: ${mutedColor};`}>
            {trades.length} trades · Total <span className={css`font-weight: 700; color: ${totalRevenue >= 0 ? palette.green.base : palette.red.base};`}>€{fmt(totalRevenue, 0)}</span>
          </span>
        )}
      </div>

      {trades.length === 0 ? (
        <div className={css`padding: 24px; text-align: center; color: ${mutedColor}; font-size: 13px;`}>
          No trades yet. Use the Capacity Allocation panel to execute trades.
        </div>
      ) : (
        <div className={css`overflow-x: auto;`}>
          <table className={css`width: 100%; border-collapse: collapse; font-size: 12px; color: ${textColor};`}>
            <thead>
              <tr>
                {['Time', 'Asset', 'Channel', 'Direction', 'Quantity', 'Price', 'Revenue'].map(h => (
                  <th key={h} className={css`text-align: left; padding: 8px 10px; color: ${mutedColor}; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid ${borderColor}; white-space: nowrap;`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map((trade, idx) => {
                const isSell = trade.direction === 'sell';
                const rowBg = idx % 2 === 0
                  ? (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)')
                  : 'transparent';
                const assetType = trade.assetType && trade.assetType !== 'portfolio'
                  ? trade.assetType : null;
                const typeColor = TYPE_COLORS[assetType ?? ''] ?? mutedColor;

                return (
                  <tr key={trade.tradeId ?? idx} className={css`background: ${rowBg}; &:hover { background: ${darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}; }`}>
                    <td className={css`padding: 8px 10px; white-space: nowrap; font-variant-numeric: tabular-nums;`}>{formatTime(trade.timestamp)}</td>
                    <td className={css`padding: 8px 10px; white-space: nowrap;`}>
                      <span className={css`display: inline-flex; align-items: center; gap: 5px;`}>
                        <span className={css`width: 3px; height: 14px; border-radius: 2px; background: ${typeColor}; flex-shrink: 0;`} />
                        <span>{TYPE_ICONS[assetType ?? 'portfolio'] ?? '🗂️'}</span>
                        <span className={css`text-transform: capitalize; font-weight: 600;`}>{assetType ?? 'Portfolio'}</span>
                      </span>
                    </td>
                    <td className={css`padding: 8px 10px; white-space: nowrap;`}>
                      {CHANNEL_LABELS[trade.marketChannel] ?? trade.marketChannel}
                    </td>
                    <td className={css`padding: 8px 10px; font-weight: 700; text-transform: uppercase; font-size: 11px; color: ${isSell ? palette.green.base : palette.red.base};`}>
                      {trade.direction}
                    </td>
                    <td className={css`padding: 8px 10px; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;`}>{fmt(trade.quantityMwh, 1)} MWh</td>
                    <td className={css`padding: 8px 10px; text-align: right; font-variant-numeric: tabular-nums;`}>€{fmt(trade.priceEurMwh, 2)}</td>
                    <td className={css`padding: 8px 10px; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; color: ${(trade.revenueEur ?? 0) >= 0 ? palette.green.base : palette.red.base};`}>
                      €{fmt(trade.revenueEur, 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function DashboardPage() {
  const { darkMode } = useDarkMode();

  const [state, setState]     = useState<TradingState | null>(null);
  const [alerts, setAlerts]   = useState<Alert[]>([]);
  const [toast, setToast]     = useState<string | null>(null);
  const [allocForm, setAllocForm] = useState<Record<string, AllocFormRow>>({});

  const prevPricesRef = useRef<MarketPrices | null>(null);

  const borderColor  = darkMode ? palette.gray.dark2  : palette.gray.light2;
  const textColor    = darkMode ? palette.white        : palette.black;
  const mutedColor   = darkMode ? palette.gray.dark1   : palette.gray.light1;
  const panelBg      = darkMode ? '#060e1c'            : palette.white;

  // ── Load initial state + SSE (auto-reconnect) ──
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/trading/state');
        if (res.ok) {
          const data: TradingState = await res.json();
          setState(data);
          setAlerts(data.alerts ?? []);
        }
      } catch { /* backend not available */ }
    };
    load();

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      try {
        es = new EventSource('/api/trading/stream');
        es.onmessage = (e) => {
          try {
            const data: TradingState = JSON.parse(e.data);
            setState((prev) => {
              prevPricesRef.current = prev?.prices ?? null;
              return data;
            });
            setAlerts(data.alerts ?? []);
          } catch { /* ignore malformed frames */ }
        };
        es.onerror = () => {
          es?.close();
          es = null;
          // Reconnect after 2s
          if (!disposed) {
            reconnectTimer = setTimeout(connect, 2000);
          }
        };
      } catch { /* SSE not available, retry */
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      }
    };
    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, []);

  // ── Initialise alloc form when we first get asset types ──
  useEffect(() => {
    if (!state) return;
    const types = Array.from(new Set(state.assets.filter(a => a.status === 'online').map(a => a.type)));
    const p = state.prices;
    const chPrice = (ch: string) =>
      ch === 'intraday' ? p.intraday :
      ch === 'flexibility' ? p.flexibility :
      p.dayAhead;
    setAllocForm((prev) => {
      const next = { ...prev };
      for (const t of types) {
        if (!next[t]) {
          const existing = state.portfolio.allocationsByType?.[t];
          const ch = existing?.marketChannel ?? 'dayAhead';
          next[t] = {
            targetMwh:     existing ? String(existing.targetMwh) : '0',
            marketChannel: ch,
            priceFloorEur: existing?.priceFloorEur
              ? String(existing.priceFloorEur)
              : String(chPrice(ch).toFixed(2)),
          };
        }
      }
      return next;
    });
  }, [state?.assets]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Generator start/stop ─────────────────────
  const refreshState = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/state');
      if (res.ok) {
        const data: TradingState = await res.json();
        setState(prev => { prevPricesRef.current = prev?.prices ?? null; return data; });
        setAlerts(data.alerts ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  const handleStartStop = useCallback(async () => {
    if (!state) return;
    const url = state.running ? '/api/trading/stop' : '/api/trading/start';
    try {
      await fetch(url, { method: 'POST' });
      // Force immediate state refresh — don't rely on SSE alone
      await refreshState();
      // Poll again after a short delay to catch first tick
      setTimeout(refreshState, 500);
      setTimeout(refreshState, 1500);
    } catch { /* ignore */ }
  }, [state, refreshState]);

  // ── Dismiss alert ────────────────────────────
  const handleDismiss = useCallback(async (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    try { await fetch(`/api/trading/alerts/${id}/dismiss`, { method: 'POST' }); } catch { /* ignore */ }
  }, []);

  // ── Apply allocations (trade immediately) ────
  const handleApplyAllocations = useCallback(async () => {
    const entries = Object.entries(allocForm).filter(([, v]) => Number(v.targetMwh) > 0);
    if (entries.length === 0) return;
    let lastState: TradingState | null = null;
    try {
      for (const [type, row] of entries) {
        const res = await fetch('/api/trading/allocations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetType:     type,
            targetMwh:     Number(row.targetMwh),
            marketChannel: row.marketChannel,
            priceFloorEur: row.priceFloorEur !== '' ? Number(row.priceFloorEur) : 0,
          }),
        });
        if (res.ok) {
          lastState = await res.json();
        }
      }
    } catch { /* ignore */ }
    // Apply the returned state immediately — don't wait for SSE
    if (lastState) {
      setState(prev => { prevPricesRef.current = prev?.prices ?? null; return lastState!; });
      setAlerts(lastState.alerts ?? []);
    }
    // Reset form fields to 0 after trade
    setAllocForm(prev => {
      const next = { ...prev };
      for (const [type] of entries) {
        if (next[type]) next[type] = { ...next[type], targetMwh: '0' };
      }
      return next;
    });
    const tradeCount = entries.length;
    setToast(`${tradeCount} trade${tradeCount > 1 ? 's' : ''} executed ✓`);
    setTimeout(() => setToast(null), 3500);
  }, [allocForm]);

  // ── Price deltas ─────────────────────────────
  const priceDelta = (channel: keyof Pick<MarketPrices, 'dayAhead' | 'intraday' | 'flexibility'>): number | null => {
    if (!state || !prevPricesRef.current) return null;
    return state.prices[channel] - prevPricesRef.current[channel];
  };

  // ── Loading skeleton ─────────────────────────
  if (!state) {
    return (
      <div className={css`display: flex; flex-direction: column; gap: 24px;`}>
        <PageHeader title="Trading Dashboard" subtitle="European IPP — European IPP — fleet output, position gap, and revenue capture" />
        <div className={css`display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 32px; gap: 16px; color: ${mutedColor};`}>
          <div className={css`font-size: 32px; animation: ${blink} 1.2s ease-in-out infinite;`}>⚡</div>
          <Body darkMode={darkMode}>Connecting to trading engine…</Body>
          <Body className={css`font-size: 12px; color: ${mutedColor};`} darkMode={darkMode}>
            Start the backend and POST to <code>/api/trading/start</code> to begin simulation.
          </Body>
        </div>
      </div>
    );
  }

  // ── Derived data ──────────────────────────────
  const onlineTypes = Array.from(new Set(state.assets.filter(a => a.status === 'online').map(a => a.type)));
  const portfolio   = state.portfolio;
  const prices      = state.prices;
  const realisedPct = portfolio.dailyTargetEur > 0
    ? Math.min(100, (portfolio.realisedPnlEur / portfolio.dailyTargetEur) * 100)
    : 0;
  const pnlBarColor = realisedPct >= 80 ? palette.green.base : realisedPct >= 50 ? palette.yellow.base : palette.gray.base;

  const assetTotals = onlineTypes.reduce<Record<string, { output: number; capacity: number }>>((acc, t) => {
    const group = state.assets.filter(a => a.type === t);
    acc[t] = {
      output:   group.reduce((s, a) => s + a.currentOutputMw, 0),
      capacity: group.reduce((s, a) => s + a.capacityMw,      0),
    };
    return acc;
  }, {});

  const tradeLog = (portfolio.tradeLog ?? []).slice().reverse().slice(0, 10);
  const recentEvents: RecentEvent[] = (state.recentEvents ?? []) as RecentEvent[];

  return (
    <div className={css`display: flex; flex-direction: column; gap: 20px;`}>
      {/* ── HEADER ── */}
      <PageHeader
        title="Trading Dashboard"
        subtitle="European IPP — European IPP — fleet output, position gap, and revenue capture"
        action={
          <div className={css`display: flex; align-items: center; gap: 10px;`}>
            {state.running && (
              <span className={css`display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: ${palette.red.base}; color: ${palette.white};`}>
                <span className={css`width: 6px; height: 6px; border-radius: 50%; background: ${palette.white}; animation: ${blink} 1s ease-in-out infinite;`} />
                Live
              </span>
            )}
            <Button variant={state.running ? 'danger' : 'primary'} size="small" darkMode={darkMode} onClick={handleStartStop}>
              {state.running ? '■ Stop Simulation' : '▶ Start Simulation'}
            </Button>
          </div>
        }
      />

      {/* ── IDLE BANNER ── */}
      {!state.running && (
        <div className={css`padding: 14px 20px; border-radius: 8px; border: 1px solid ${palette.blue.base}; background: ${darkMode ? '#070f1c' : '#f0f7ff'}; color: ${darkMode ? palette.blue.light1 : palette.blue.dark1}; font-size: 13px; display: flex; align-items: center; gap: 10px;`}>
          <span>ℹ️</span>
          <span>Simulation is idle. Press <strong>▶ Start Simulation</strong> to begin streaming live data from the trading engine.</span>
        </div>
      )}

      {/* ── ALERT RAIL ── */}
      {alerts.length > 0 && (
        <div className={css`display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin;`}>
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onDismiss={handleDismiss} darkMode={darkMode} />
          ))}
        </div>
      )}

      {/* ── FLEET HEALTH ── */}
      <section className={css`background: ${panelBg}; border: 1px solid ${borderColor}; border-radius: 12px; padding: 20px;`}>
        <div className={css`margin-bottom: 14px;`}>
          <H3 darkMode={darkMode}>Fleet Health</H3>
          <Body className={css`color: ${mutedColor};`} darkMode={darkMode}>
            {state.assets.length} assets · {state.assets.filter(a => a.status === 'online').length} online
          </Body>
        </div>
        {state.assets.length === 0 ? (
          <div className={css`padding: 32px; text-align: center; color: ${mutedColor};`}>
            No assets reported yet. Start the simulation to load fleet data.
          </div>
        ) : (
          <div className={css`display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px;`}>
            {state.assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} darkMode={darkMode} />
            ))}
          </div>
        )}
      </section>

      {/* ── ROW: Position Gap + Prices + Market Signals ── */}
      <div className={css`display: flex; gap: 20px; align-items: stretch; @media (max-width: 1100px) { flex-direction: column; }`}>
        <PositionGapPanel portfolio={portfolio} assets={state.assets} darkMode={darkMode} />

        {/* Prices + Market Signals stacked */}
        <div className={css`display: flex; flex-direction: column; gap: 20px; flex: 1; min-width: 0;`}>
          {/* Live Market Prices */}
          <section className={css`background: ${panelBg}; border: 1px solid ${borderColor}; border-radius: 12px; padding: 20px;`}>
            <div className={css`margin-bottom: 14px;`}>
              <H3 darkMode={darkMode}>Live Market Prices</H3>
            </div>
            <div className={css`display: flex; flex-direction: column; gap: 10px;`}>
              <PriceTile label="Day-Ahead"  price={prices.dayAhead}   delta={priceDelta('dayAhead')}   isBest={prices.bestChannel === 'dayAhead'}   darkMode={darkMode} />
              <PriceTile label="Intraday"   price={prices.intraday}   delta={priceDelta('intraday')}   isBest={prices.bestChannel === 'intraday'}   darkMode={darkMode} />
              <PriceTile label="Flexibility" price={prices.flexibility} delta={priceDelta('flexibility')} isBest={prices.bestChannel === 'flexibility'} darkMode={darkMode} />
            </div>
          </section>

          {/* Market Signals */}
          <MarketSignalsPanel events={recentEvents} darkMode={darkMode} />
        </div>
      </div>

      {/* ── ROW: Capacity Allocation + Revenue ── */}
      <div className={css`display: flex; gap: 20px; align-items: flex-start; @media (max-width: 900px) { flex-direction: column; }`}>
        <CapacityAllocationPanel
          onlineTypes={onlineTypes}
          allocForm={allocForm}
          setAllocForm={setAllocForm}
          assetTotals={assetTotals}
          prices={prices}
          onApply={handleApplyAllocations}
          darkMode={darkMode}
        />

        {/* Revenue Tracker */}
        <section className={css`flex: 1; min-width: 0; background: ${panelBg}; border: 1px solid ${borderColor}; border-radius: 12px; padding: 20px; display: flex; flex-direction: column;`}>
          <div className={css`margin-bottom: 16px;`}>
            <H3 darkMode={darkMode}>Revenue Tracker</H3>
          </div>

          {/* Realised Revenue — from executed trades */}
          <div className={css`margin-bottom: 14px; text-align: center; padding: 16px; border-radius: 10px; background: ${darkMode ? '#0d1a2d' : palette.gray.light3};`}>
            <div className={css`font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: ${mutedColor}; margin-bottom: 4px;`}>Captured Revenue</div>
            <div className={css`font-size: 11px; color: ${mutedColor}; margin-bottom: 6px;`}>Revenue from executed trades</div>
            <div className={css`font-size: 32px; font-weight: 800; color: ${portfolio.realisedPnlEur > 0 ? palette.green.base : portfolio.realisedPnlEur < 0 ? palette.red.base : textColor}; font-variant-numeric: tabular-nums;`}>
              €{fmt(portfolio.realisedPnlEur, 0)}
            </div>
            <div className={css`display: flex; align-items: center; gap: 8px; justify-content: center; margin-top: 8px;`}>
              <div className={css`flex: 1; max-width: 200px; height: 6px; background: ${darkMode ? palette.gray.dark3 : palette.gray.light2}; border-radius: 3px; overflow: hidden;`}>
                <div className={css`height: 100%; width: ${realisedPct}%; background: ${pnlBarColor}; border-radius: 3px; transition: width 0.5s ease;`} />
              </div>
              <span className={css`font-size: 11px; font-weight: 700; color: ${pnlBarColor};`}>{realisedPct.toFixed(0)}%</span>
              <span className={css`font-size: 10px; color: ${mutedColor};`}>of €{fmt(portfolio.dailyTargetEur, 0)} target</span>
            </div>
            <div className={css`font-size: 9px; color: ${mutedColor}; margin-top: 6px;`}>
              Target = fleet capacity x avg utilisation (70%) x avg price x 8h window
            </div>
          </div>

          {/* Fleet Generation Value — hourly opportunity */}
          <div className={css`padding: 12px 14px; border-radius: 8px; background: ${darkMode ? '#060e1c' : palette.gray.light2}; margin-bottom: 14px;`}>
            <div className={css`display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;`}>
              <span className={css`font-size: 12px; font-weight: 600; color: ${textColor};`}>Fleet Generation Value</span>
              <span className={css`font-size: 17px; font-weight: 800; color: ${palette.green.base}; font-variant-numeric: tabular-nums;`}>
                €{fmt(portfolio.fleetGenerationValueEur, 0)}<span className={css`font-size: 11px; font-weight: 500; color: ${mutedColor};`}>/hr</span>
              </span>
            </div>
            <div className={css`font-size: 10px; color: ${mutedColor}; line-height: 1.5;`}>
              Current fleet output x best market price — the revenue opportunity if all generation were sold now
            </div>
          </div>

          {/* Revenue breakdown grouped by asset type */}
          {tradeLog.length > 0 ? (() => {
            const byType: Record<string, { revenue: number; trades: number; mwh: number }> = {};
            for (const t of tradeLog) {
              const key = t.assetType || 'other';
              if (!byType[key]) byType[key] = { revenue: 0, trades: 0, mwh: 0 };
              byType[key].revenue += t.revenueEur ?? 0;
              byType[key].trades += 1;
              byType[key].mwh += t.quantityMwh ?? 0;
            }
            const sorted = Object.entries(byType).sort((a, b) => b[1].revenue - a[1].revenue);
            const maxRev = Math.max(...sorted.map(([, v]) => Math.abs(v.revenue)), 1);
            return (
              <div className={css`flex: 1; display: flex; flex-direction: column; gap: 8px;`}>
                <div className={css`display: flex; justify-content: space-between; align-items: center;`}>
                  <span className={css`font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: ${mutedColor};`}>Revenue by Asset Type</span>
                  <span className={css`font-size: 10px; color: ${mutedColor};`}>{tradeLog.length} trades</span>
                </div>
                {sorted.map(([type, data]) => {
                  const typeColor = TYPE_COLORS[type] ?? '#aaa';
                  const barPct = Math.min(100, (Math.abs(data.revenue) / maxRev) * 100);
                  return (
                    <div key={type} className={css`display: flex; align-items: center; gap: 8px;`}>
                      <span className={css`font-size: 12px; width: 72px; flex-shrink: 0; display: flex; align-items: center; gap: 4px; color: ${textColor};`}>
                        <span>{TYPE_ICONS[type] ?? '🗂️'}</span>
                        <span className={css`text-transform: capitalize; font-weight: 600;`}>{type}</span>
                      </span>
                      <div className={css`flex: 1; height: 22px; background: ${darkMode ? palette.gray.dark3 : palette.gray.light2}; border-radius: 4px; overflow: hidden; position: relative;`}>
                        <div className={css`height: 100%; width: ${barPct}%; background: ${typeColor}; opacity: 0.75; border-radius: 4px; transition: width 0.4s ease;`} />
                        {barPct > 20 && (
                          <span className={css`position: absolute; left: 8px; top: 50%; transform: translateY(-50%); font-size: 10px; font-weight: 700; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.4);`}>
                            {data.trades}x · {fmt(data.mwh, 0)} MWh
                          </span>
                        )}
                      </div>
                      <span className={css`font-size: 13px; font-weight: 700; min-width: 72px; text-align: right; font-variant-numeric: tabular-nums; color: ${data.revenue >= 0 ? palette.green.base : palette.red.base};`}>
                        €{fmt(data.revenue, 0)}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })() : (
            <div className={css`flex: 1; display: flex; align-items: center; justify-content: center; color: ${mutedColor}; font-size: 13px;`}>
              Allocate capacity and trade to capture revenue
            </div>
          )}
        </section>
      </div>

      {/* ── TRADE LOG ── */}
      <TradeLogPanel trades={tradeLog} darkMode={darkMode} />

      {/* ── TOAST ── */}
      {toast && (
        <div className={css`position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 8px; background: ${palette.green.dark2}; color: ${palette.white}; font-size: 13px; font-weight: 600; z-index: 9999; animation: ${fadeIn} 0.3s ease; box-shadow: 0 4px 16px rgba(0,0,0,0.3);`}>
          {toast}
        </div>
      )}
    </div>
  );
}
