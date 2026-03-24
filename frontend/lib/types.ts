// Portfolio & Positions
export interface Position {
  id: string;
  instrument: string;
  type: 'POWER' | 'GAS' | 'CARBON' | 'RENEWABLE';
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
}

export interface HourlyExposure {
  hour: number;
  mwh: number;
}

export interface ExposurePoint {
  time: string;           // "HH:MM:SS"
  mwh: number;            // instantaneous net MWh exposure at this second
  cumulativePnl: number;  // running cumulative P&L (EUR)
}

export interface PortfolioSummary {
  totalPnl: number;
  netExposureMwh: number;
  activePositions: number;
  portfolioValue: number;
  pnlDelta: string;
}

// Tariff Scenarios
export interface CreateScenarioRequest {
  region: string;
  from_date: string;
  to_date: string;
}

export interface CreateScenarioResponse {
  scenario_id: string;
}

export interface TariffScenario {
  _id: string;
  portfolio_id: string;
  region: string;
  from_date: string;
  to_date: string;
  status: string;
  createdAt: string;
}

export interface HourlyPnl {
  hour: number;
  baseline: number;
  dynamic: number;
  difference: number;
}

export interface ScenarioResult {
  scenarioId: string;
  name: string;
  totalCost: number;
  avgPrice: number;
  peakCost: number;
  offPeakCost: number;
  hourlyPnl: HourlyPnl[];
}

export interface ScenarioComparison {
  baseline: ScenarioResult;
  dynamic: ScenarioResult;
  savingsPercent: number;
  savingsAbsolute: number;
}

// Search
export type DocumentType = 'Research' | 'ESG' | 'Asset' | 'Maritime' | 'Policy';

// Vessel Tracking
export type VesselStatus = 'underway' | 'at-anchor' | 'loading' | 'discharging';
export type CargoGrade =
  | 'Johan Sverdrup' | 'Ekofisk' | 'Troll'
  | 'Bonny Light' | 'Forcados' | 'Qua Iboe'
  | 'Qatar LNG' | 'US LNG'
  | 'Urals' | 'ESPO Blend'
  | 'Saharan Blend' | 'CPC Blend'
  | string;

export interface VesselCargo {
  grade: CargoGrade;
  volumeBarrels: number;
  apiGravity: number;
  volumeCubicMeters?: number;
}

export interface Vessel {
  id: string;
  name: string;
  imo: string;
  status: VesselStatus;
  cargo: VesselCargo[];
  totalBarrels: number;
  totalCubicMeters?: number;
  speedKnots: number;
  heading: number;
  position: { lat: number; lng: number };
  origin: string;
  destination: string;
  departureDate: string;
  eta: string;
  progressPercent: number;
  routeId?: string;
}

export interface RouteWaypoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface AgenticStep {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'running' | 'completed';
  durationMs: number;
}

export interface SearchDocument {
  id: string;
  title: string;
  snippet: string;
  type: DocumentType;
  relevanceScore: number;
  date: string;
  source: string;
}

// Leafy Chat
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: SourceRef[];
}

export interface SourceRef {
  title: string;
  type: DocumentType;
  snippet: string;
}

export interface SuggestedPrompt {
  title: string;
  description: string;
  prompt: string;
}

// Telemetry
export type TelemetryEventType = 'price_ticks' | 'meter_readings' | 'trades';

export interface TelemetryConfig {
  concurrent_writers: number;
  events_per_second: number;
  batch_size: number;
  event_types: TelemetryEventType[];
}

export interface TelemetryMetrics {
  actual_throughput: number;
  write_latency_p50_ms: number;
  write_latency_p95_ms: number;
  write_latency_p99_ms: number;
  total_events_inserted: number;
  active_writers: number;
  batch_size: number;
  errors: number;
}

export interface TelemetryTimeSeriesPoint {
  time: string;
  throughput: number;
  latency_p50: number;
  latency_p95: number;
  latency_p99: number;
}

export interface OriginatorEvent {
  id: string;
  timestamp: string;
  originator: string;
  region: string;
  eventType: TelemetryEventType;
  payload: Record<string, string | number>;
}

export type GeneratorFuel = 'solar' | 'wind' | 'gas' | 'hydro' | 'nuclear' | 'biogas';

export interface SubstationReading {
  time: string;
  output_mw: number;
  voltage_kv: number;
  frequency_hz: number;
}

export interface SubstationData {
  id: string;
  name: string;
  region: string;
  fuel: GeneratorFuel;
  capacity_mw: number;
  status: 'online' | 'ramping' | 'offline';
  latest: SubstationReading;
  history: SubstationReading[];
}

export interface GeneratorOutputPoint {
  time: string;
  [generatorId: string]: number | string;
}

// Event Inspector / Audit
export interface EventStreamSummary {
  streamId: string;
  streamType: string;
  eventCount: number;
  firstEvent: string;
  lastEvent: string;
}

export interface StoredEvent {
  streamId: string;
  streamType: string;
  version: number;
  eventType: string;
  timestamp: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface ReplayStep {
  version: number;
  event: StoredEvent;
  stateAfter: Record<string, unknown>;
}

export interface ComplianceScenario {
  id: string;
  title: string;
  regulation: string;
  description: string;
  events: StoredEvent[];
}
