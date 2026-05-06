'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { css, keyframes } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Badge from '@leafygreen-ui/badge';
import Button from '@leafygreen-ui/button';
import { H3, Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import Icon from '@leafygreen-ui/icon';
import { useDarkMode } from '@/components/Providers';
import PageHeader from '@/components/shared/PageHeader';

// ─── Types ────────────────────────────────────

interface PayloadField {
  name: string;
  type: string;
  description: string;
}

interface EventSchema {
  streamType: string;
  description: string;
  payloadFields: PayloadField[];
}

interface TradingEvent {
  streamId: string;
  streamType: string;
  eventType: string;
  timestamp: string;
  payload: Record<string, unknown>;
  metadata?: { source: string; schemaVersion: number };
}

interface AssetStats {
  eventCount: number;
  lastEvent: TradingEvent | null;
  recentTimestamps: number[]; // for events/sec calculation
}

// ─── Constants ────────────────────────────────

const STREAM_TYPE_COLORS: Record<string, string> = {
  AssetTelemetry: palette.blue.base,
  WeatherForecast: '#66cccc',
  TradingPosition: palette.green.base,
};

const STREAM_TYPE_BADGE: Record<string, 'blue' | 'green' | 'yellow'> = {
  AssetTelemetry: 'blue',
  WeatherForecast: 'green',
  TradingPosition: 'yellow',
};

const EVENT_ICONS: Record<string, string> = {
  MeterReadingRecorded: '📊',
  PerformanceVarianceDetected: '⚠️',
  WindForecastUpdated: '🌬️',
  SolarIrradianceForecastUpdated: '☀️',
  WeatherAlertIssued: '🌩️',
  PositionGapDetected: '📉',
  TradeExecuted: '💹',
  PnlSnapshotRecorded: '💰',
  CapacityAllocationSet: '⚙️',
};

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(0, 237, 100, 0.3); }
  50%      { box-shadow: 0 0 0 4px rgba(0, 237, 100, 0.1); }
`;

// ─── Helpers ──────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 1000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return new Date(iso).toLocaleTimeString('en-GB');
}

function summarizePayload(event: TradingEvent): string {
  const p = event.payload;
  switch (event.eventType) {
    case 'MeterReadingRecorded':
      return `${p.assetName} · ${Number(p.currentOutputMw).toFixed(0)} MW (forecast ${Number(p.forecastOutputMw).toFixed(0)})`;
    case 'PerformanceVarianceDetected':
      return `${p.assetName} · ${Number(p.variancePct) > 0 ? '+' : ''}${Number(p.variancePct).toFixed(1)}%`;
    case 'WindForecastUpdated':
      return `${p.region} · ${Number(p.forecastDeltaPct) > 0 ? '+' : ''}${Number(p.forecastDeltaPct).toFixed(1)}% @ ${p.windSpeedMs} m/s`;
    case 'SolarIrradianceForecastUpdated':
      return `${p.region} · ${Number(p.forecastDeltaPct) > 0 ? '+' : ''}${Number(p.forecastDeltaPct).toFixed(1)}% · ${p.irradianceWm2} W/m²`;
    case 'WeatherAlertIssued':
      return `${p.region} · ${p.severity}`;
    case 'PositionGapDetected':
      return `${p.gapType} ${Number(p.gapMwh).toFixed(0)} MWh · ${p.severity}`;
    case 'TradeExecuted':
      return `${p.side} ${Number(p.quantityMwh).toFixed(1)} MWh @ €${Number(p.priceEurMwh).toFixed(1)}`;
    case 'PnlSnapshotRecorded':
      return `Captured €${Number(p.realisedPnlEur).toFixed(0)} · ${Number(p.progressPct).toFixed(1)}%`;
    case 'CapacityAllocationSet':
      return `${p.assetType} · ${Number(p.targetMwh).toFixed(0)} MWh on ${p.marketChannel}`;
    default:
      return JSON.stringify(p).slice(0, 80);
  }
}

// ─── Schema Explorer ──────────────────────────

function SchemaExplorer({
  schemas, darkMode,
}: {
  schemas: Record<string, EventSchema>;
  darkMode: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const headingColor = darkMode ? palette.white : palette.black;
  const codeBg = darkMode ? '#0d1b24' : '#f5f6f7';

  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const grouped: Record<string, [string, EventSchema][]> = {};
  for (const [name, schema] of Object.entries(schemas)) {
    const st = schema.streamType;
    if (!grouped[st]) grouped[st] = [];
    grouped[st].push([name, schema]);
  }

  return (
    <div className={css`display: flex; flex-direction: column; gap: 10px;`}>
      {Object.entries(grouped).map(([streamType, entries]) => (
        <div key={streamType}>
          <div className={css`display: flex; align-items: center; gap: 6px; margin-bottom: 6px;`}>
            <div className={css`width: 8px; height: 8px; border-radius: 50%; background: ${STREAM_TYPE_COLORS[streamType] ?? '#aaa'};`} />
            <span className={css`font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: ${STREAM_TYPE_COLORS[streamType] ?? textColor};`}>
              {streamType}
            </span>
          </div>
          {entries.map(([name, schema]) => {
            const isOpen = expanded.has(name);
            return (
              <div key={name} className={css`margin-bottom: 4px;`}>
                <button
                  onClick={() => toggle(name)}
                  className={css`
                    width: 100%; text-align: left; padding: 8px 12px; border-radius: 6px;
                    border: 1px solid ${isOpen ? STREAM_TYPE_COLORS[streamType] ?? borderColor : borderColor};
                    background: ${isOpen ? `${STREAM_TYPE_COLORS[streamType]}11` : 'transparent'};
                    cursor: pointer; font-family: inherit; display: flex; align-items: center; gap: 8px;
                    transition: all 0.15s; &:hover { border-color: ${STREAM_TYPE_COLORS[streamType]}; }
                  `}
                >
                  <span className={css`font-size: 14px;`}>{EVENT_ICONS[name] ?? '📋'}</span>
                  <div className={css`flex: 1; min-width: 0;`}>
                    <div className={css`font-size: 12px; font-weight: 600; color: ${headingColor};`}>{name}</div>
                    <div className={css`font-size: 10px; color: ${textColor}; margin-top: 1px;`}>{schema.description}</div>
                  </div>
                  <span className={css`font-size: 10px; color: ${textColor}; transition: transform 0.2s; transform: rotate(${isOpen ? '180deg' : '0deg'});`}>▼</span>
                </button>
                {isOpen && (
                  <div className={css`
                    padding: 8px; margin-top: 2px; border-radius: 6px;
                    background: ${codeBg}; border: 1px solid ${borderColor};
                    animation: ${fadeIn} 0.15s ease;
                  `}>
                    <table className={css`width: 100%; border-collapse: collapse; font-size: 11px;`}>
                      <thead>
                        <tr>
                          {['Field', 'Type', 'Description'].map(h => (
                            <th key={h} className={css`text-align: left; padding: 4px 6px; color: ${textColor}; font-weight: 600; border-bottom: 1px solid ${borderColor};`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {schema.payloadFields.map(f => (
                          <tr key={f.name}>
                            <td className={css`padding: 3px 6px; font-family: 'SF Mono', monospace; color: ${headingColor}; font-weight: 600;`}>{f.name}</td>
                            <td className={css`padding: 3px 6px; color: ${STREAM_TYPE_COLORS[streamType]};`}>{f.type}</td>
                            <td className={css`padding: 3px 6px; color: ${textColor};`}>{f.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────

export default function TelemetryPage() {
  const { darkMode } = useDarkMode();
  const [schemas, setSchemas] = useState<Record<string, EventSchema>>({});
  const [events, setEvents] = useState<TradingEvent[]>([]);
  const [assetStats, setAssetStats] = useState<Record<string, AssetStats>>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStreamType, setFilterStreamType] = useState('');
  const [filterEventType, setFilterEventType] = useState('');
  const [expandedEvent, setExpandedEvent] = useState<number | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const recentTimestampsRef = useRef<Record<string, number[]>>({});

  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const headingColor = darkMode ? palette.white : palette.black;
  const mutedColor = darkMode ? palette.gray.dark1 : palette.gray.light1;
  const panelBg = darkMode ? '#060e1c' : palette.white;

  // Fetch schemas + poll running state every 3s
  useEffect(() => {
    fetch('/api/trading/event-schemas').then(r => r.ok ? r.json() : {}).then(setSchemas).catch(() => {});
    const poll = () => fetch('/api/trading/state').then(r => r.ok ? r.json() : null).then(d => { if (d) setSimRunning(d.running); }).catch(() => {});
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  const handleStartStop = useCallback(async () => {
    const url = simRunning ? '/api/trading/stop' : '/api/trading/start';
    try {
      await fetch(url, { method: 'POST' });
      const res = await fetch('/api/trading/state');
      if (res.ok) { const d = await res.json(); setSimRunning(d.running); }
    } catch { /* ignore */ }
  }, [simRunning]);

  // SSE: connect directly to MongoDB Change Stream endpoint
  const source = 'change-stream';

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    // Reset
    setEvents([]);
    setAssetStats({});
    recentTimestampsRef.current = {};
    setConnected(false);

    const addEvent = (event: TradingEvent) => {
      const now = Date.now();
      const key = event.streamId;
      if (!recentTimestampsRef.current[key]) recentTimestampsRef.current[key] = [];
      recentTimestampsRef.current[key].push(now);
      setAssetStats(prev => {
        const existing = prev[key] || { eventCount: 0, lastEvent: null, recentTimestamps: [] };
        return { ...prev, [key]: { eventCount: existing.eventCount + 1, lastEvent: event, recentTimestamps: [] } };
      });
      setEvents(prev => [event, ...prev].slice(0, 200));
    };

    const connect = () => {
      if (disposed) return;

      // Build URL with filters as query params (server-side filtering)
      const params = new URLSearchParams();
      if (filterStreamType) params.set('stream_type', filterStreamType);
      if (filterEventType) params.set('event_type', filterEventType);
      const qs = params.toString();
      const url = `/api/trading/change-stream${qs ? `?${qs}` : ''}`;

      es = new EventSource(url);
      es.onopen = () => { setConnected(true); setError(null); };
      es.onmessage = (e) => {
        try {
          const doc = JSON.parse(e.data);
          if (doc.type === 'error') { setError(doc.message); return; }
          addEvent({
            streamId: doc.streamId ?? 'UNKNOWN',
            streamType: doc.streamType ?? 'Unknown',
            eventType: doc.eventType,
            timestamp: doc.timestamp,
            payload: doc.payload ?? {},
          });
        } catch { /* malformed */ }
      };
      es.onerror = () => {
        // Don't close — let EventSource auto-retry
        setConnected(false);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [filterStreamType, filterEventType]);

  // Compute events/sec every second
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const window = 5000;
      setAssetStats(prev => {
        const next = { ...prev };
        for (const key of Object.keys(recentTimestampsRef.current)) {
          const ts = recentTimestampsRef.current[key].filter(t => now - t < window);
          recentTimestampsRef.current[key] = ts;
          if (next[key]) {
            next[key] = { ...next[key], recentTimestamps: ts };
          }
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const totalEventsPerSec = Object.values(recentTimestampsRef.current)
    .reduce((s, ts) => s + ts.filter(t => Date.now() - t < 5000).length / 5, 0);

  // Sort asset stats by event count descending
  const sortedStats = Object.entries(assetStats).sort((a, b) => b[1].eventCount - a[1].eventCount);

  return (
    <div className={css`display: flex; flex-direction: column; gap: 20px;`}>
      <PageHeader
        title="Telemetry"
        subtitle="Live event stream from MongoDB Change Streams on the trading_events time series collection"
        action={
          <div className={css`display: flex; align-items: center; gap: 10px;`}>
            {simRunning && (
              <span className={css`display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: ${palette.red.base}; color: ${palette.white};`}>
                <span className={css`width: 6px; height: 6px; border-radius: 50%; background: ${palette.white}; animation: ${pulse} 1s ease-in-out infinite;`} />
                Live
              </span>
            )}
            <Button variant={simRunning ? 'danger' : 'primary'} size="small" darkMode={darkMode} onClick={handleStartStop}>
              {simRunning ? '■ Stop Simulation' : '▶ Start Simulation'}
            </Button>
          </div>
        }
      />

      {/* Status bar */}
      <div className={css`display: flex; align-items: center; gap: 12px; flex-wrap: wrap;`}>
        <Badge variant={connected ? 'green' : 'yellow'}>
          {connected ? 'MongoDB Change Stream' : 'Connecting...'}
        </Badge>
        <span className={css`font-size: 12px; color: ${textColor};`}>
          {events.length} events received · {totalEventsPerSec.toFixed(1)} events/sec
        </span>
        {error && (
          <Badge variant="red">{error}</Badge>
        )}
        <div className={css`margin-left: auto; display: flex; gap: 8px;`}>
          <select
            value={filterStreamType}
            onChange={e => setFilterStreamType(e.target.value)}
            className={css`
              padding: 6px 10px; border-radius: 6px; border: 1px solid ${borderColor};
              background: ${panelBg}; color: ${headingColor}; font-size: 12px; font-family: inherit;
            `}
          >
            <option value="">All Stream Types</option>
            <option value="AssetTelemetry">AssetTelemetry</option>
            <option value="WeatherForecast">WeatherForecast</option>
            <option value="TradingPosition">TradingPosition</option>
          </select>
          <select
            value={filterEventType}
            onChange={e => setFilterEventType(e.target.value)}
            className={css`
              padding: 6px 10px; border-radius: 6px; border: 1px solid ${borderColor};
              background: ${panelBg}; color: ${headingColor}; font-size: 12px; font-family: inherit;
            `}
          >
            <option value="">All Event Types</option>
            {Object.keys(EVENT_ICONS).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Main layout: Schema + Feed + Stats */}
      <div className={css`display: grid; grid-template-columns: 280px 1fr 260px; gap: 16px; @media (max-width: 1100px) { grid-template-columns: 1fr; }`}>

        {/* Left: Schema Explorer */}
        <Card darkMode={darkMode} className={css`padding: 16px; overflow-y: auto; max-height: 80vh;`}>
          <H3 darkMode={darkMode} className={css`margin-bottom: 12px !important;`}>Event Schemas</H3>
          <Body darkMode={darkMode} className={css`font-size: 11px !important; color: ${textColor} !important; margin-bottom: 12px !important;`}>
            9 event types across 3 stream families. Click to expand payload schema.
          </Body>
          {Object.keys(schemas).length > 0 ? (
            <SchemaExplorer schemas={schemas} darkMode={darkMode} />
          ) : (
            <div className={css`text-align: center; color: ${mutedColor}; font-size: 12px; padding: 20px;`}>Loading schemas...</div>
          )}
        </Card>

        {/* Center: Live Event Feed */}
        <Card darkMode={darkMode} className={css`padding: 16px; overflow: hidden; display: flex; flex-direction: column;`}>
          <div className={css`display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;`}>
            <H3 darkMode={darkMode}>Live Event Feed</H3>
            <span className={css`font-size: 11px; color: ${mutedColor};`}>
              MongoDB Change Stream → SSE → Browser
            </span>
          </div>

          {events.length === 0 ? (
            <div className={css`flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: ${mutedColor}; padding: 40px;`}>
              <span className={css`font-size: 28px;`}>📡</span>
              <span className={css`font-size: 13px; font-weight: 600;`}>Waiting for events</span>
              <span className={css`font-size: 12px; text-align: center;`}>
                Start the trading simulation to see live events from the MongoDB time series collection.
              </span>
            </div>
          ) : (
            <div className={css`flex: 1; overflow-y: auto; max-height: 70vh;`}>
              {/* Header */}
              <div className={css`display: grid; grid-template-columns: 70px 160px 1fr 80px; gap: 6px; padding: 4px 8px; border-bottom: 1px solid ${borderColor}; position: sticky; top: 0; background: ${panelBg}; z-index: 1;`}>
                {['Time', 'Event Type', 'Summary', 'Stream'].map(h => (
                  <span key={h} className={css`font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; color: ${mutedColor};`}>{h}</span>
                ))}
              </div>
              {events.map((ev, idx) => {
                const isExpanded = expandedEvent === idx;
                const streamColor = STREAM_TYPE_COLORS[ev.streamType] ?? '#aaa';
                const rowBg = idx % 2 === 0
                  ? (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)')
                  : 'transparent';

                return (
                  <div key={`${ev.timestamp}-${idx}`}>
                    <div
                      onClick={() => setExpandedEvent(isExpanded ? null : idx)}
                      className={css`
                        display: grid; grid-template-columns: 70px 160px 1fr 80px; gap: 6px;
                        padding: 5px 8px; cursor: pointer; border-radius: 4px; background: ${rowBg};
                        ${idx === 0 ? `animation: ${fadeIn} 0.2s ease;` : ''}
                        &:hover { background: ${darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}; }
                      `}
                    >
                      <span className={css`font-size: 10px; color: ${mutedColor}; font-variant-numeric: tabular-nums;`}>
                        {relativeTime(ev.timestamp)}
                      </span>
                      <span className={css`font-size: 11px; color: ${headingColor}; display: flex; align-items: center; gap: 4px;`}>
                        <span>{EVENT_ICONS[ev.eventType] ?? '📋'}</span>
                        <span className={css`white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`}>{ev.eventType}</span>
                      </span>
                      <span className={css`font-size: 11px; color: ${textColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`}>
                        {summarizePayload(ev)}
                      </span>
                      <span className={css`font-size: 9px; font-weight: 600; padding: 2px 5px; border-radius: 3px; background: ${streamColor}18; color: ${streamColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center;`}>
                        {ev.streamType.replace('TradingPosition', 'Trading').replace('AssetTelemetry', 'Telemetry').replace('WeatherForecast', 'Weather')}
                      </span>
                    </div>
                    {isExpanded && (
                      <div className={css`
                        padding: 8px 12px; margin: 2px 8px 4px; border-radius: 6px;
                        background: ${darkMode ? '#0d1b24' : '#f5f6f7'}; border: 1px solid ${borderColor};
                        animation: ${fadeIn} 0.15s ease;
                      `}>
                        <pre className={css`font-size: 11px; color: ${headingColor}; white-space: pre-wrap; word-break: break-all; margin: 0; font-family: 'SF Mono', monospace;`}>
                          {JSON.stringify(ev.payload, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Right: Per-Asset Stats */}
        <Card darkMode={darkMode} className={css`padding: 16px; overflow-y: auto; max-height: 80vh;`}>
          <H3 darkMode={darkMode} className={css`margin-bottom: 12px !important;`}>Active Streams</H3>
          {sortedStats.length === 0 ? (
            <div className={css`text-align: center; color: ${mutedColor}; font-size: 12px; padding: 20px;`}>No streams yet</div>
          ) : (
            <div className={css`display: flex; flex-direction: column; gap: 6px;`}>
              {sortedStats.map(([streamId, stats]) => {
                const evPerSec = (recentTimestampsRef.current[streamId]?.filter(t => Date.now() - t < 5000).length ?? 0) / 5;
                const lastType = stats.lastEvent?.eventType ?? '—';
                const streamColor = STREAM_TYPE_COLORS[stats.lastEvent?.streamType ?? ''] ?? '#aaa';
                const isActive = evPerSec > 0;

                return (
                  <div
                    key={streamId}
                    className={css`
                      padding: 10px 12px; border-radius: 8px;
                      border: 1px solid ${isActive ? `${streamColor}40` : borderColor};
                      background: ${isActive ? `${streamColor}08` : 'transparent'};
                      ${isActive ? `animation: ${pulse} 2s ease-in-out infinite;` : ''}
                      transition: all 0.2s;
                    `}
                  >
                    <div className={css`display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;`}>
                      <span className={css`font-size: 11px; font-weight: 700; color: ${headingColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px;`}>
                        {streamId}
                      </span>
                      <span className={css`font-size: 10px; font-weight: 700; color: ${isActive ? streamColor : mutedColor};`}>
                        {evPerSec.toFixed(1)}/s
                      </span>
                    </div>
                    <div className={css`font-size: 10px; color: ${textColor}; display: flex; justify-content: space-between;`}>
                      <span>{stats.eventCount} events</span>
                      <span>{EVENT_ICONS[lastType] ?? ''} {lastType.replace(/([A-Z])/g, ' $1').trim().split(' ').slice(0, 2).join(' ')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
