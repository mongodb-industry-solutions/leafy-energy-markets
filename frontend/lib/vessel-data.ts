import type { Vessel, RouteWaypoint } from './types';

/**
 * Multiple shipping routes converging on Rotterdam (Europoort).
 * Each route has a unique set of waypoints from different origins.
 */

// ── Route definitions ────────────────────────────────────────
export const routes: Record<string, RouteWaypoint[]> = {
  // Norwegian North Sea crude
  norway: [
    { lat: 60.39, lng: 5.32, label: 'Bergen' },
    { lat: 58.5, lng: 4.0 },
    { lat: 56.0, lng: 4.5 },
    { lat: 53.5, lng: 4.8 },
    { lat: 51.95, lng: 4.12, label: 'Rotterdam' },
  ],
  // Mongstad (Equinor refinery)
  mongstad: [
    { lat: 60.81, lng: 5.03, label: 'Mongstad' },
    { lat: 59.0, lng: 4.2 },
    { lat: 56.5, lng: 4.0 },
    { lat: 53.5, lng: 4.8 },
    { lat: 51.95, lng: 4.12, label: 'Rotterdam' },
  ],
  // Nigerian crude via West Africa — stays offshore through Gulf of Guinea
  nigeria: [
    { lat: 4.77, lng: 7.01, label: 'Bonny Island' },
    { lat: 3.5,  lng: 4.0  },   // Gulf of Guinea (ocean)
    { lat: 3.0,  lng: -1.0 },   // Off Ghana — stays in water
    { lat: 5.0,  lng: -8.0 },   // Off Liberia coast (ocean)
    { lat: 10.0, lng: -17.0 },  // Atlantic off Guinea-Bissau
    { lat: 20.0, lng: -20.0 },  // Atlantic off Mauritania
    { lat: 35.0, lng: -10.0 },  // Atlantic off Morocco
    { lat: 43.0, lng: -9.5 },
    { lat: 48.5, lng: -5.5 },
    { lat: 51.0, lng: 1.5 },
    { lat: 51.95, lng: 4.12, label: 'Rotterdam' },
  ],
  // Qatari LNG — exits Persian Gulf via Strait of Hormuz, then Suez Canal
  qatar: [
    { lat: 25.29, lng: 51.53, label: 'Ras Laffan' },
    { lat: 25.5,  lng: 55.5  },  // Across Persian Gulf towards Hormuz
    { lat: 26.5,  lng: 56.8  },  // Strait of Hormuz
    { lat: 22.0,  lng: 59.0  },  // Arabian Sea (Oman coast)
    { lat: 16.0,  lng: 53.0  },  // Arabian Sea (deeper)
    { lat: 13.0,  lng: 48.0  },  // Gulf of Aden entry
    { lat: 12.5,  lng: 43.5  },  // Bab el-Mandeb strait
    { lat: 22.0,  lng: 37.5  },  // Red Sea
    { lat: 28.5,  lng: 34.0  },  // Gulf of Suez entry
    { lat: 30.0,  lng: 32.5  },  // Suez Canal entry
    { lat: 31.25, lng: 32.3  },  // Port Said / Suez Canal exit
    { lat: 33.5,  lng: 27.5  },  // Eastern Mediterranean
    { lat: 35.0,  lng: 24.0  },  // Crete area
    { lat: 36.5,  lng: 15.0  },  // Central Mediterranean
    { lat: 36.0,  lng: -5.5  },  // Strait of Gibraltar
    { lat: 43.0,  lng: -9.5  },
    { lat: 48.5,  lng: -5.5  },
    { lat: 51.0,  lng: 1.5   },
    { lat: 51.95, lng: 4.12, label: 'Rotterdam' },
  ],
  // Baltic / Primorsk crude
  baltic: [
    { lat: 60.35, lng: 28.71, label: 'Primorsk' },
    { lat: 59.5, lng: 25.0 },
    { lat: 57.5, lng: 18.0 },
    { lat: 55.5, lng: 12.5 },
    { lat: 54.5, lng: 8.0 },
    { lat: 53.5, lng: 5.0 },
    { lat: 51.95, lng: 4.12, label: 'Rotterdam' },
  ],
  // Gdansk (Poland) — Baltic crude hub
  gdansk: [
    { lat: 54.35, lng: 18.65, label: 'Gdansk' },
    { lat: 54.8, lng: 14.0 },
    { lat: 54.5, lng: 8.0 },
    { lat: 53.5, lng: 5.0 },
    { lat: 51.95, lng: 4.12, label: 'Rotterdam' },
  ],
  // Mediterranean — Algiers
  mediterranean: [
    { lat: 36.75, lng: 3.06, label: 'Algiers' },
    { lat: 37.5, lng: 0.0 },
    { lat: 36.0, lng: -5.5 },
    { lat: 43.0, lng: -9.5 },
    { lat: 48.5, lng: -5.5 },
    { lat: 51.0, lng: 1.5 },
    { lat: 51.95, lng: 4.12, label: 'Rotterdam' },
  ],
  // Skikda (Algeria LNG)
  skikda: [
    { lat: 36.88, lng: 6.91, label: 'Skikda' },
    { lat: 37.0, lng: 3.0 },
    { lat: 36.0, lng: -5.5 },
    { lat: 43.0, lng: -9.5 },
    { lat: 48.5, lng: -5.5 },
    { lat: 51.0, lng: 1.5 },
    { lat: 51.95, lng: 4.12, label: 'Rotterdam' },
  ],
  // Sines (Portugal) — refined products & crude transshipment
  sines: [
    { lat: 37.95, lng: -8.87, label: 'Sines' },
    { lat: 43.0, lng: -9.5 },
    { lat: 48.5, lng: -5.5 },
    { lat: 51.0, lng: 1.5 },
    { lat: 51.95, lng: 4.12, label: 'Rotterdam' },
  ],
  // US Gulf Coast LNG (Sabine Pass) via Atlantic
  usgulf: [
    { lat: 29.73, lng: -93.86, label: 'Sabine Pass' },
    { lat: 28.0, lng: -85.0 },
    { lat: 30.0, lng: -75.0 },
    { lat: 35.0, lng: -55.0 },
    { lat: 42.0, lng: -30.0 },
    { lat: 48.0, lng: -10.0 },
    { lat: 48.5, lng: -5.5 },
    { lat: 51.0, lng: 1.5 },
    { lat: 51.95, lng: 4.12, label: 'Rotterdam' },
  ],
  // Milford Haven (UK LNG terminal)
  milfordhaven: [
    { lat: 51.7, lng: -5.05, label: 'Milford Haven' },
    { lat: 51.3, lng: -3.0 },
    { lat: 51.5, lng: 1.5 },
    { lat: 51.95, lng: 4.12, label: 'Rotterdam' },
  ],
};

// Default route for the interpolation helpers
export const routeWaypoints: RouteWaypoint[] = routes.norway;

/**
 * Interpolate a position along a given route polyline given a progress 0..100.
 */
export function interpolateRoute(
  progress: number,
  waypoints: RouteWaypoint[] = routeWaypoints,
): { lat: number; lng: number } {
  const t = Math.max(0, Math.min(100, progress)) / 100;
  const pts = waypoints;

  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].lng - pts[i - 1].lng;
    const dy = pts[i].lat - pts[i - 1].lat;
    const len = Math.sqrt(dx * dx + dy * dy);
    segLengths.push(len);
    totalLen += len;
  }

  const targetDist = t * totalLen;
  let cumDist = 0;
  for (let i = 0; i < segLengths.length; i++) {
    if (cumDist + segLengths[i] >= targetDist) {
      const segT = (targetDist - cumDist) / segLengths[i];
      return {
        lat: pts[i].lat + segT * (pts[i + 1].lat - pts[i].lat),
        lng: pts[i].lng + segT * (pts[i + 1].lng - pts[i].lng),
      };
    }
    cumDist += segLengths[i];
  }

  return { lat: pts[pts.length - 1].lat, lng: pts[pts.length - 1].lng };
}

/**
 * Compute heading (degrees, 0=N, clockwise) between two points on a route.
 */
export function computeHeading(
  progress: number,
  waypoints: RouteWaypoint[] = routeWaypoints,
): number {
  const p1 = interpolateRoute(Math.max(0, progress - 1), waypoints);
  const p2 = interpolateRoute(Math.min(100, progress + 1), waypoints);
  const dx = p2.lng - p1.lng;
  const dy = p2.lat - p1.lat;
  const angle = (Math.atan2(dx, dy) * 180) / Math.PI;
  return (angle + 360) % 360;
}

export const mockVessels: Vessel[] = [
  // ── Norwegian Crude ────────────────────────────
  {
    id: 'v1',
    name: 'Nordic Vanguard',
    imo: '9345201',
    status: 'underway',
    cargo: [{ grade: 'Johan Sverdrup', volumeBarrels: 700_000, apiGravity: 28.0 }],
    totalBarrels: 700_000,
    speedKnots: 14.2,
    heading: computeHeading(40, routes.norway),
    position: interpolateRoute(40, routes.norway),
    origin: 'Bergen, Norway',
    destination: 'Rotterdam, NL',
    departureDate: '2026-03-17',
    eta: '2026-03-19',
    progressPercent: 40,
    routeId: 'norway',
  },
  {
    id: 'v7',
    name: 'Equinor Spirit',
    imo: '9556789',
    status: 'underway',
    cargo: [
      { grade: 'Troll', volumeBarrels: 550_000, apiGravity: 35.0 },
      { grade: 'Ekofisk', volumeBarrels: 250_000, apiGravity: 39.2 },
    ],
    totalBarrels: 800_000,
    speedKnots: 13.8,
    heading: computeHeading(65, routes.mongstad),
    position: interpolateRoute(65, routes.mongstad),
    origin: 'Mongstad, Norway',
    destination: 'Rotterdam, NL',
    departureDate: '2026-03-15',
    eta: '2026-03-19',
    progressPercent: 65,
    routeId: 'mongstad',
  },
  // ── Nigerian Crude ─────────────────────────────
  {
    id: 'v2',
    name: 'Bonny Express',
    imo: '9412887',
    status: 'underway',
    cargo: [
      { grade: 'Bonny Light', volumeBarrels: 500_000, apiGravity: 33.4 },
      { grade: 'Forcados', volumeBarrels: 450_000, apiGravity: 29.7 },
    ],
    totalBarrels: 950_000,
    speedKnots: 13.1,
    heading: computeHeading(55, routes.nigeria),
    position: interpolateRoute(55, routes.nigeria),
    origin: 'Bonny Island, Nigeria',
    destination: 'Rotterdam, NL',
    departureDate: '2026-03-05',
    eta: '2026-03-23',
    progressPercent: 55,
    routeId: 'nigeria',
  },
  {
    id: 'v8',
    name: 'Lagos Trader',
    imo: '9487321',
    status: 'underway',
    cargo: [{ grade: 'Qua Iboe', volumeBarrels: 600_000, apiGravity: 35.8 }],
    totalBarrels: 600_000,
    speedKnots: 12.5,
    heading: computeHeading(30, routes.nigeria),
    position: interpolateRoute(30, routes.nigeria),
    origin: 'Bonny Island, Nigeria',
    destination: 'Rotterdam, NL',
    departureDate: '2026-03-09',
    eta: '2026-03-27',
    progressPercent: 30,
    routeId: 'nigeria',
  },
  // ── Qatari LNG ────────────────────────────────
  {
    id: 'v3',
    name: 'Al Dafna',
    imo: '9287654',
    status: 'underway',
    cargo: [{ grade: 'Qatar LNG', volumeBarrels: 0, apiGravity: 0, volumeCubicMeters: 266_000 }],
    totalBarrels: 0,
    totalCubicMeters: 266_000,
    speedKnots: 19.5,
    heading: computeHeading(45, routes.qatar),
    position: interpolateRoute(45, routes.qatar),
    origin: 'Ras Laffan, Qatar',
    destination: 'Rotterdam, NL',
    departureDate: '2026-03-02',
    eta: '2026-03-22',
    progressPercent: 45,
    routeId: 'qatar',
  },
  // ── Baltic Crude ───────────────────────────────
  {
    id: 'v4',
    name: 'Baltic Carrier',
    imo: '9501432',
    status: 'underway',
    cargo: [
      { grade: 'Urals', volumeBarrels: 600_000, apiGravity: 31.0 },
      { grade: 'ESPO Blend', volumeBarrels: 350_000, apiGravity: 34.8 },
    ],
    totalBarrels: 950_000,
    speedKnots: 12.9,
    heading: computeHeading(60, routes.baltic),
    position: interpolateRoute(60, routes.baltic),
    origin: 'Primorsk, Russia',
    destination: 'Rotterdam, NL',
    departureDate: '2026-03-12',
    eta: '2026-03-21',
    progressPercent: 60,
    routeId: 'baltic',
  },
  {
    id: 'v9',
    name: 'Gdansk Pioneer',
    imo: '9534890',
    status: 'underway',
    cargo: [{ grade: 'CPC Blend', volumeBarrels: 450_000, apiGravity: 44.2 }],
    totalBarrels: 450_000,
    speedKnots: 13.2,
    heading: computeHeading(50, routes.gdansk),
    position: interpolateRoute(50, routes.gdansk),
    origin: 'Gdansk, Poland',
    destination: 'Rotterdam, NL',
    departureDate: '2026-03-16',
    eta: '2026-03-20',
    progressPercent: 50,
    routeId: 'gdansk',
  },
  // ── Mediterranean / Algeria ────────────────────
  {
    id: 'v5',
    name: 'Med Voyager',
    imo: '9378901',
    status: 'underway',
    cargo: [{ grade: 'Saharan Blend', volumeBarrels: 400_000, apiGravity: 45.5 }],
    totalBarrels: 400_000,
    speedKnots: 13.5,
    heading: computeHeading(35, routes.mediterranean),
    position: interpolateRoute(35, routes.mediterranean),
    origin: 'Algiers, Algeria',
    destination: 'Rotterdam, NL',
    departureDate: '2026-03-10',
    eta: '2026-03-24',
    progressPercent: 35,
    routeId: 'mediterranean',
  },
  {
    id: 'v10',
    name: 'Sonatrach LNG',
    imo: '9611234',
    status: 'underway',
    cargo: [{ grade: 'Algerian LNG', volumeBarrels: 0, apiGravity: 0, volumeCubicMeters: 145_000 }],
    totalBarrels: 0,
    totalCubicMeters: 145_000,
    speedKnots: 17.2,
    heading: computeHeading(55, routes.skikda),
    position: interpolateRoute(55, routes.skikda),
    origin: 'Skikda, Algeria',
    destination: 'Rotterdam, NL',
    departureDate: '2026-03-11',
    eta: '2026-03-22',
    progressPercent: 55,
    routeId: 'skikda',
  },
  // ── US LNG ─────────────────────────────────────
  {
    id: 'v6',
    name: 'Europa LNG II',
    imo: '9623445',
    status: 'underway',
    cargo: [{ grade: 'US LNG', volumeBarrels: 0, apiGravity: 0, volumeCubicMeters: 174_000 }],
    totalBarrels: 0,
    totalCubicMeters: 174_000,
    speedKnots: 18.8,
    heading: computeHeading(60, routes.usgulf),
    position: interpolateRoute(60, routes.usgulf),
    origin: 'Sabine Pass, USA',
    destination: 'Rotterdam, NL',
    departureDate: '2026-03-06',
    eta: '2026-03-20',
    progressPercent: 60,
    routeId: 'usgulf',
  },
  {
    id: 'v11',
    name: 'Atlantic Freedom',
    imo: '9645678',
    status: 'underway',
    cargo: [{ grade: 'US LNG', volumeBarrels: 0, apiGravity: 0, volumeCubicMeters: 210_000 }],
    totalBarrels: 0,
    totalCubicMeters: 210_000,
    speedKnots: 19.1,
    heading: computeHeading(40, routes.usgulf),
    position: interpolateRoute(40, routes.usgulf),
    origin: 'Sabine Pass, USA',
    destination: 'Rotterdam, NL',
    departureDate: '2026-03-10',
    eta: '2026-03-24',
    progressPercent: 40,
    routeId: 'usgulf',
  },
  // ── Portugal / UK ──────────────────────────────
  {
    id: 'v12',
    name: 'Sines Refiner',
    imo: '9478123',
    status: 'underway',
    cargo: [{ grade: 'Refined Diesel', volumeBarrels: 300_000, apiGravity: 38.0 }],
    totalBarrels: 300_000,
    speedKnots: 14.0,
    heading: computeHeading(45, routes.sines),
    position: interpolateRoute(45, routes.sines),
    origin: 'Sines, Portugal',
    destination: 'Rotterdam, NL',
    departureDate: '2026-03-14',
    eta: '2026-03-21',
    progressPercent: 45,
    routeId: 'sines',
  },
  {
    id: 'v13',
    name: 'Pembroke Shuttle',
    imo: '9389012',
    status: 'underway',
    cargo: [{ grade: 'Refined Gasoline', volumeBarrels: 200_000, apiGravity: 55.0 }],
    totalBarrels: 200_000,
    speedKnots: 12.8,
    heading: computeHeading(50, routes.milfordhaven),
    position: interpolateRoute(50, routes.milfordhaven),
    origin: 'Milford Haven, UK',
    destination: 'Rotterdam, NL',
    departureDate: '2026-03-18',
    eta: '2026-03-19',
    progressPercent: 50,
    routeId: 'milfordhaven',
  },
];

/** Total volume helper — supports both barrels and cubic meters */
function vesselVolume(v: Vessel): string {
  if (v.totalCubicMeters && v.totalCubicMeters > 0) {
    return `${(v.totalCubicMeters / 1_000).toFixed(0)}k m³ LNG`;
  }
  return `${(v.totalBarrels / 1_000).toFixed(0)}k bbl`;
}

export { vesselVolume };

/** Cargo type label */
export function cargoType(v: Vessel): string {
  if (v.totalCubicMeters && v.totalCubicMeters > 0) return 'LNG Carrier';
  const grades = v.cargo.map((c) => c.grade.toLowerCase());
  if (grades.some((g) => g.includes('refined') || g.includes('diesel') || g.includes('gasoline')))
    return 'Product Tanker';
  return 'Crude Oil Tanker';
}

export const fleetSummary = {
  totalVessels: mockVessels.length,
  totalBarrels: mockVessels.reduce((s, v) => s + v.totalBarrels, 0),
  totalCubicMeters: mockVessels.reduce((s, v) => s + (v.totalCubicMeters || 0), 0),
  nextArrival: mockVessels.reduce((nearest, v) =>
    new Date(v.eta) < new Date(nearest.eta) ? v : nearest
  ),
  avgSpeed: +(mockVessels.reduce((s, v) => s + v.speedKnots, 0) / mockVessels.length).toFixed(1),
};

export const agenticSteps = [
  { id: 'step-1', label: 'Querying European vessel database', description: 'Retrieving active tanker/LNG carrier positions and cargo manifests from AIS feed — Rotterdam-bound traffic', status: 'pending' as const, durationMs: 800 },
  { id: 'step-2', label: 'Running vector search on EU energy policy', description: 'Searching MongoDB Atlas Vector Store for REMIT, EU ETS, REPowerEU, and gas storage regulations', status: 'pending' as const, durationMs: 1200 },
  { id: 'step-3', label: 'Analyzing cargo supply impact', description: 'Computing aggregate LNG + crude volume impact on TTF, Brent, and EU carbon spreads', status: 'pending' as const, durationMs: 1000 },
  { id: 'step-4', label: 'Web search for latest market news', description: 'Fetching real-time news on North Sea weather, EU sanctions, OPEC decisions, and pipeline flows', status: 'pending' as const, durationMs: 900 },
  { id: 'step-5', label: 'Formulating portfolio recommendations', description: 'Building optimal BRP trade recommendations combining vessel cargo, regulations, and portfolio exposure', status: 'pending' as const, durationMs: 700 },
];
