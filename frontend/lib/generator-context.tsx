'use client';

import { createContext, useContext, useRef, useState, useCallback } from 'react';
import { useLiveFeed } from './live-feed-context';
import { positions as mockPositions, portfolioSummary as mockSummary, hourlyExposure as mockExposure } from './mock-data';
import { startTelemetry, stopTelemetry } from './api';
import type {
  TelemetryConfig,
  TelemetryMetrics,
  TelemetryTimeSeriesPoint,
  TelemetryEventType,
  OriginatorEvent,
  SubstationData,
  SubstationReading,
  GeneratorOutputPoint,
  GeneratorFuel,
  ExposurePoint,
} from './types';

export type TelemetryMode = 'simulation' | 'backend';

const BACKEND = '/api';
const MAX_POINTS = 60;
const MAX_FEED_EVENTS = 80;
const MAX_SUBSTATION_HISTORY = 60;
const MAX_EXPOSURE_POINTS = 120;

// ── Substations (energy generators with metadata) ────────

interface SubstationDef {
  id: string;
  name: string;
  region: string;
  fuel: GeneratorFuel;
  capacity_mw: number;
  base_voltage_kv: number;
  types: TelemetryEventType[];
}

const SUBSTATIONS: SubstationDef[] = [
  { id: 'solar-es',   name: 'Solar Farm Andalusia',      region: 'ES', fuel: 'solar',   capacity_mw: 120, base_voltage_kv: 220, types: ['price_ticks', 'meter_readings'] },
  { id: 'wind-nl',    name: 'Wind Park North Sea',       region: 'NL', fuel: 'wind',    capacity_mw: 350, base_voltage_kv: 380, types: ['price_ticks', 'meter_readings'] },
  { id: 'gas-de',     name: 'Gas Turbine Bavaria',       region: 'DE', fuel: 'gas',     capacity_mw: 450, base_voltage_kv: 380, types: ['price_ticks', 'trades'] },
  { id: 'hydro-no',   name: 'Hydro Station Nordland',    region: 'NO', fuel: 'hydro',   capacity_mw: 280, base_voltage_kv: 300, types: ['meter_readings', 'trades'] },
  { id: 'nuclear-fr', name: 'Nuclear Plant Gravelines',  region: 'FR', fuel: 'nuclear', capacity_mw: 910, base_voltage_kv: 400, types: ['price_ticks', 'meter_readings'] },
  { id: 'wind-uk',    name: 'Offshore Wind Dogger Bank', region: 'UK', fuel: 'wind',    capacity_mw: 480, base_voltage_kv: 380, types: ['price_ticks', 'meter_readings'] },
  { id: 'biogas-it',  name: 'Biogas Plant Veneto',       region: 'IT', fuel: 'biogas',  capacity_mw: 25,  base_voltage_kv: 110, types: ['meter_readings', 'trades'] },
  { id: 'solar-pt',   name: 'PV Cluster Algarve',        region: 'PT', fuel: 'solar',   capacity_mw: 85,  base_voltage_kv: 220, types: ['price_ticks', 'meter_readings'] },
];

const GENERATOR_COLORS: Record<string, string> = {
  'solar-es':   '#F5A623',
  'wind-nl':    '#4A90D9',
  'gas-de':     '#D9534F',
  'hydro-no':   '#5BC0DE',
  'nuclear-fr': '#999999',
  'wind-uk':    '#337AB7',
  'biogas-it':  '#00A35C',
  'solar-pt':   '#F0AD4E',
};

export const GENERATOR_CHART_META = SUBSTATIONS.map((s) => ({
  id: s.id,
  name: s.name.split(' ').slice(0, 2).join(' '),
  color: GENERATOR_COLORS[s.id],
}));

// ── Deterministic noise helper ──────────────────────────

function seededJitter(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

// ── Simulation helpers ──────────────────────────────────

function simulateOutput(fuel: GeneratorFuel, capacity_mw: number, elapsedSec: number): number {
  const t = elapsedSec;
  switch (fuel) {
    case 'solar': {
      const dayFactor = Math.max(0, Math.sin(((t % 120) / 120) * Math.PI));
      const cloud = 0.85 + Math.random() * 0.15;
      return +(capacity_mw * dayFactor * cloud).toFixed(1);
    }
    case 'wind': {
      const base = 0.4 + 0.3 * Math.sin(t * 0.03);
      const gust = (Math.random() - 0.3) * 0.25;
      return +(capacity_mw * Math.max(0.08, Math.min(0.95, base + gust))).toFixed(1);
    }
    case 'gas': {
      const ramp = 0.7 + 0.25 * Math.sin(t * 0.015);
      const noise = (Math.random() - 0.5) * 0.05;
      return +(capacity_mw * Math.max(0.3, ramp + noise)).toFixed(1);
    }
    case 'hydro': {
      const base = 0.6 + 0.15 * Math.sin(t * 0.01);
      const noise = (Math.random() - 0.5) * 0.04;
      return +(capacity_mw * (base + noise)).toFixed(1);
    }
    case 'nuclear': {
      const noise = (Math.random() - 0.5) * 0.03;
      return +(capacity_mw * (0.92 + noise)).toFixed(1);
    }
    case 'biogas': {
      const base = 0.65 + 0.1 * Math.sin(t * 0.02);
      const noise = (Math.random() - 0.5) * 0.08;
      return +(capacity_mw * Math.max(0.3, base + noise)).toFixed(1);
    }
  }
}

function simulateVoltage(base_kv: number): number {
  return +(base_kv + (Math.random() - 0.5) * base_kv * 0.02).toFixed(1);
}

function simulateFrequency(): number {
  return +(49.95 + Math.random() * 0.1).toFixed(2);
}

function generateSubstationReadings(elapsed: number, wallTime: Date): Map<string, SubstationReading> {
  const timeLabel = `${wallTime.getMinutes().toString().padStart(2, '0')}:${wallTime.getSeconds().toString().padStart(2, '0')}`;
  const readings = new Map<string, SubstationReading>();
  for (const sub of SUBSTATIONS) {
    readings.set(sub.id, {
      time: timeLabel,
      output_mw: simulateOutput(sub.fuel, sub.capacity_mw, elapsed),
      voltage_kv: simulateVoltage(sub.base_voltage_kv),
      frequency_hz: simulateFrequency(),
    });
  }
  return readings;
}

function buildInitialSubstations(): SubstationData[] {
  return SUBSTATIONS.map((s) => ({
    id: s.id,
    name: s.name,
    region: s.region,
    fuel: s.fuel,
    capacity_mw: s.capacity_mw,
    status: 'offline' as const,
    latest: { time: '--:--', output_mw: 0, voltage_kv: s.base_voltage_kv, frequency_hz: 50.0 },
    history: [],
  }));
}

function randomPayload(eventType: TelemetryEventType): Record<string, string | number> {
  if (eventType === 'price_ticks') {
    return {
      price: +(20 + Math.random() * 130).toFixed(2),
      volume: Math.round(1 + Math.random() * 500),
      exchange: ['EPEX', 'NordPool', 'GME', 'N2EX'][Math.floor(Math.random() * 4)],
    };
  }
  if (eventType === 'meter_readings') {
    return {
      reading_kwh: +(0.5 + Math.random() * 50).toFixed(3),
      quality: ['measured', 'validated', 'estimated'][Math.floor(Math.random() * 3)],
    };
  }
  return {
    price: +(30 + Math.random() * 90).toFixed(2),
    qty: Math.round(1 + Math.random() * 200),
    side: Math.random() > 0.5 ? 'buy' : 'sell',
  };
}

function generateOriginatorEvents(
  enabledTypes: TelemetryEventType[],
  count: number,
  wallTime: Date,
): OriginatorEvent[] {
  const events: OriginatorEvent[] = [];
  const ts = `${wallTime.getHours().toString().padStart(2, '0')}:${wallTime.getMinutes().toString().padStart(2, '0')}:${wallTime.getSeconds().toString().padStart(2, '0')}`;
  for (let i = 0; i < count; i++) {
    const sub = SUBSTATIONS[Math.floor(Math.random() * SUBSTATIONS.length)];
    const possibleTypes = sub.types.filter((t) => enabledTypes.includes(t));
    if (possibleTypes.length === 0) continue;
    const eventType = possibleTypes[Math.floor(Math.random() * possibleTypes.length)];
    events.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: ts,
      originator: sub.name,
      region: sub.region,
      eventType,
      payload: randomPayload(eventType),
    });
  }
  return events;
}

function simulateMetrics(
  config: TelemetryConfig,
  elapsed: number,
  prevTotal: number,
): TelemetryMetrics {
  const jitter = () => 0.85 + Math.random() * 0.3;
  const target = config.events_per_second;
  const rampFactor = Math.min(1, elapsed / 3);
  const throughput = Math.round(target * rampFactor * jitter());
  const baseLatency = 2 + config.batch_size * 0.05 + config.concurrent_writers * 0.3;
  const p50 = +(baseLatency * jitter()).toFixed(2);
  const p95 = +(p50 * (1.8 + Math.random() * 0.4)).toFixed(2);
  const p99 = +(p95 * (1.3 + Math.random() * 0.3)).toFixed(2);
  const total = prevTotal + Math.round(throughput);
  return {
    actual_throughput: throughput,
    write_latency_p50_ms: p50,
    write_latency_p95_ms: p95,
    write_latency_p99_ms: p99,
    total_events_inserted: total,
    active_writers: config.concurrent_writers,
    batch_size: config.batch_size,
    errors: 0,
  };
}

// ── Context types ───────────────────────────────────────

export interface GeneratorState {
  isRunning: boolean;
  isSimulated: boolean;
  mode: TelemetryMode;
  config: TelemetryConfig;
  backendWarning: string | null;
  latestMetrics: TelemetryMetrics | null;
  timeSeries: TelemetryTimeSeriesPoint[];
  feedEvents: OriginatorEvent[];
  substations: SubstationData[];
  generatorTimeSeries: GeneratorOutputPoint[];
}

interface GeneratorContextValue extends GeneratorState {
  setConfig: (config: TelemetryConfig) => void;
  setMode: (mode: TelemetryMode) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  addTrackedPosition: (position: import('./types').Position) => void;
  removeTrackedPosition: (positionId: string) => void;
}

const defaultConfig: TelemetryConfig = {
  concurrent_writers: 5,
  events_per_second: 1000,
  batch_size: 100,
  event_types: ['price_ticks', 'meter_readings', 'trades'],
};

const GeneratorContext = createContext<GeneratorContextValue>({
  isRunning: false,
  isSimulated: false,
  mode: 'simulation',
  config: defaultConfig,
  backendWarning: null,
  latestMetrics: null,
  timeSeries: [],
  feedEvents: [],
  substations: buildInitialSubstations(),
  generatorTimeSeries: [],
  setConfig: () => {},
  setMode: () => {},
  start: async () => {},
  stop: async () => {},
  addTrackedPosition: () => {},
  removeTrackedPosition: () => {},
});

export const useGenerator = () => useContext(GeneratorContext);

// ── Provider ────────────────────────────────────────────

export function GeneratorProvider({ children }: { children: React.ReactNode }) {
  const liveFeed = useLiveFeed();

  const [config, setConfig] = useState<TelemetryConfig>(defaultConfig);
  const [isRunning, setIsRunning] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [mode, setMode] = useState<TelemetryMode>('backend');
  const [backendWarning, setBackendWarning] = useState<string | null>(null);
  const [latestMetrics, setLatestMetrics] = useState<TelemetryMetrics | null>(null);
  const [timeSeries, setTimeSeries] = useState<TelemetryTimeSeriesPoint[]>([]);
  const [feedEvents, setFeedEvents] = useState<OriginatorEvent[]>([]);
  const [substations, setSubstations] = useState<SubstationData[]>(buildInitialSubstations);
  const [generatorTimeSeries, setGeneratorTimeSeries] = useState<GeneratorOutputPoint[]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const simulationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const totalEventsRef = useRef<number>(0);
  const startWallTimeRef = useRef<Date>(new Date());
  const cumulativePnlRef = useRef<number>(0);
  const prevTotalPnlRef = useRef<number>(0);
  const exposureTimeSeriesRef = useRef<ExposurePoint[]>([]);
  const positionsRef = useRef([...mockPositions]);
  const configRef = useRef(config);
  configRef.current = config;
  const liveFeedRef = useRef(liveFeed);
  liveFeedRef.current = liveFeed;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const isSimulatedRef = useRef(isSimulated);
  isSimulatedRef.current = isSimulated;

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (simulationRef.current) {
      clearInterval(simulationRef.current);
      simulationRef.current = null;
    }
  }, []);

  const appendMetrics = useCallback((metrics: TelemetryMetrics, elapsed: number) => {
    setLatestMetrics(metrics);

    // Compute time-coherent wall time from start
    const currentTime = new Date(startWallTimeRef.current.getTime() + elapsed * 1000);
    const timeLabel = `${currentTime.getMinutes().toString().padStart(2, '0')}:${currentTime.getSeconds().toString().padStart(2, '0')}`;
    const fullTimeLabel = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}:${currentTime.getSeconds().toString().padStart(2, '0')}`;

    const point: TelemetryTimeSeriesPoint = {
      time: timeLabel,
      throughput: metrics.actual_throughput,
      latency_p50: metrics.write_latency_p50_ms,
      latency_p95: metrics.write_latency_p95_ms,
      latency_p99: metrics.write_latency_p99_ms,
    };
    setTimeSeries((prev) => {
      const next = [...prev, point];
      return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
    });

    const batchCount = Math.min(8, Math.max(2, Math.round(metrics.actual_throughput / 200)));
    const newEvents = generateOriginatorEvents(configRef.current.event_types, batchCount, currentTime);
    setFeedEvents((prev) => {
      const next = [...newEvents, ...prev];
      return next.length > MAX_FEED_EVENTS ? next.slice(0, MAX_FEED_EVENTS) : next;
    });

    // Fire-and-forget: push events to MongoDB via backend
    const dbEvents = newEvents.map((e) => ({
      timestamp: currentTime.toISOString(),
      event_type: e.eventType,
      originator: e.originator,
      region: e.region,
      ...e.payload,
    }));
    fetch(`${BACKEND}/telemetry/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: dbEvents }),
    }).catch(() => { /* backend unavailable — silent */ });

    const readings = generateSubstationReadings(elapsed, currentTime);
    setSubstations((prev) =>
      prev.map((sub) => {
        const reading = readings.get(sub.id);
        if (!reading) return sub;
        const history = [...sub.history, reading];
        return {
          ...sub,
          status: 'online' as const,
          latest: reading,
          history: history.length > MAX_SUBSTATION_HISTORY ? history.slice(-MAX_SUBSTATION_HISTORY) : history,
        };
      })
    );

    const genPoint: GeneratorOutputPoint = { time: timeLabel };
    readings.forEach((reading, id) => {
      genPoint[id] = reading.output_mw;
    });
    setGeneratorTimeSeries((prev) => {
      const next = [...prev, genPoint];
      return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
    });

    // Always push portfolio data to dashboard when generator is running
    // Use positionsRef which tracks user adds/removes
    const jitter = () => (Math.random() - 0.5) * 2;
    const currentPositions = positionsRef.current;
    const simPositions = currentPositions.map((p) => ({
      ...p,
      currentPrice: +(p.currentPrice + jitter()).toFixed(2),
      unrealizedPnl: Math.round(p.unrealizedPnl + jitter() * p.quantity * 0.1),
    }));
    // Update the ref with new prices so jitter accumulates naturally
    positionsRef.current = simPositions;
    const totalPnl = simPositions.reduce((s, p) => s + p.unrealizedPnl, 0);
    const portfolioValue = simPositions.reduce((s, p) => s + p.currentPrice * p.quantity, 0);

    // Compute exposure time series point
    let totalMwh = 0;
    readings.forEach((reading) => { totalMwh += reading.output_mw; });
    const pnlDelta = totalPnl - prevTotalPnlRef.current;
    cumulativePnlRef.current += pnlDelta;
    prevTotalPnlRef.current = totalPnl;

    const exposurePoint: ExposurePoint = {
      time: fullTimeLabel,
      mwh: Math.round(totalMwh),
      cumulativePnl: Math.round(cumulativePnlRef.current),
    };
    const nextExposureSeries = [...exposureTimeSeriesRef.current, exposurePoint];
    exposureTimeSeriesRef.current = nextExposureSeries.length > MAX_EXPOSURE_POINTS
      ? nextExposureSeries.slice(-MAX_EXPOSURE_POINTS)
      : nextExposureSeries;

    liveFeedRef.current.pushData({
      positions: simPositions,
      summary: {
        ...mockSummary,
        totalPnl,
        portfolioValue: Math.round(portfolioValue),
        pnlDelta: `${totalPnl >= 0 ? '+' : ''}${(totalPnl / portfolioValue * 100).toFixed(1)}%`,
      },
      exposure: mockExposure.map((e) => {
        const currentHour = Math.floor(elapsed % 24);
        if (e.hour < currentHour) {
          return { ...e, mwh: e.mwh + Math.round(seededJitter(e.hour + Math.floor(elapsed / 24)) * 20) };
        } else if (e.hour === currentHour) {
          const progress = (elapsed % 1);
          return { ...e, mwh: Math.round(e.mwh * (0.5 + progress * 0.5) + (Math.random() - 0.5) * 15) };
        } else {
          return { ...e, mwh: Math.round(e.mwh * 0.7) };
        }
      }),
      exposureTimeSeries: [...exposureTimeSeriesRef.current],
    });
  }, []);

  const startRealStream = useCallback(() => {
    const es = new EventSource(`${BACKEND}/telemetry/stream`);
    eventSourceRef.current = es;
    let tick = 0;
    es.onmessage = (event) => {
      tick++;
      const metrics: TelemetryMetrics = JSON.parse(event.data);
      appendMetrics(metrics, tick);
    };
    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setIsRunning(false);
    };
  }, [appendMetrics]);

  const startSimulatedStream = useCallback((cfg: TelemetryConfig) => {
    startTimeRef.current = Date.now();
    totalEventsRef.current = 0;
    simulationRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const metrics = simulateMetrics(cfg, elapsed, totalEventsRef.current);
      totalEventsRef.current = metrics.total_events_inserted;
      appendMetrics(metrics, elapsed);
    }, 1000);
  }, [appendMetrics]);

  const addTrackedPosition = useCallback((position: import('./types').Position) => {
    positionsRef.current = [...positionsRef.current, position];
    liveFeedRef.current.addPosition(position);
  }, []);

  const removeTrackedPosition = useCallback((positionId: string) => {
    positionsRef.current = positionsRef.current.filter((p) => p.id !== positionId);
    liveFeedRef.current.removePosition(positionId);
  }, []);

  const start = useCallback(async () => {
    setIsRunning(true);
    setTimeSeries([]);
    setLatestMetrics(null);
    setFeedEvents([]);
    setSubstations(buildInitialSubstations());
    setGeneratorTimeSeries([]);
    setIsSimulated(false);
    setBackendWarning(null);
    startWallTimeRef.current = new Date();
    cumulativePnlRef.current = 0;
    positionsRef.current = [...mockPositions];
    prevTotalPnlRef.current = mockPositions.reduce((s, p) => s + p.unrealizedPnl, 0);
    exposureTimeSeriesRef.current = [];

    // Mark feed as active
    liveFeedRef.current.startFeed();

    // Always try backend first; fall back to simulation if unreachable
    try {
      await startTelemetry(configRef.current);
      startRealStream();
    } catch {
      setIsSimulated(true);
      setBackendWarning('Backend unreachable — running in simulation mode. Events pushed to DB when available.');
      startSimulatedStream(configRef.current);
    }
  }, [startRealStream, startSimulatedStream]);

  const stop = useCallback(async () => {
    cleanup();
    if (!isSimulatedRef.current && modeRef.current === 'backend') {
      try { await stopTelemetry(); } catch { /* ignore */ }
    }
    setIsRunning(false);
    liveFeedRef.current.stopFeed();
  }, [cleanup]);

  return (
    <GeneratorContext.Provider
      value={{
        isRunning,
        isSimulated,
        mode,
        config,
        backendWarning,
        latestMetrics,
        timeSeries,
        feedEvents,
        substations,
        generatorTimeSeries,
        setConfig,
        setMode,
        start,
        stop,
        addTrackedPosition,
        removeTrackedPosition,
      }}
    >
      {children}
    </GeneratorContext.Provider>
  );
}
