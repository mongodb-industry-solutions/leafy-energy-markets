import type { Vessel, RouteWaypoint } from './types';

/**
 * Route waypoints from Amuay (Venezuela) to Corpus Christi (Texas).
 * Equirectangular: lat/lng as-is.
 */
export const routeWaypoints: RouteWaypoint[] = [
  { lat: 11.75, lng: -70.21, label: 'Amuay' },
  { lat: 12.5, lng: -70.0 },
  { lat: 13.5, lng: -72.0 },
  { lat: 15.0, lng: -76.0 },
  { lat: 18.0, lng: -82.0 },
  { lat: 21.5, lng: -86.5 },
  { lat: 25.0, lng: -90.0 },
  { lat: 27.8, lng: -97.39, label: 'Corpus Christi' },
];

/**
 * Interpolate a position along the route polyline given a progress 0..100.
 */
export function interpolateRoute(progress: number): { lat: number; lng: number } {
  const t = Math.max(0, Math.min(100, progress)) / 100;
  const pts = routeWaypoints;

  // Compute cumulative segment lengths
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
 * Compute heading (degrees, 0=N, clockwise) between two points on the route.
 */
export function computeHeading(progress: number): number {
  const p1 = interpolateRoute(Math.max(0, progress - 1));
  const p2 = interpolateRoute(Math.min(100, progress + 1));
  const dx = p2.lng - p1.lng;
  const dy = p2.lat - p1.lat;
  const angle = (Math.atan2(dx, dy) * 180) / Math.PI;
  return (angle + 360) % 360;
}

export const mockVessels: Vessel[] = [
  {
    id: 'v1',
    name: 'PDVSA Patriota',
    imo: '9345201',
    status: 'underway',
    cargo: [{ grade: 'Merey 16', volumeBarrels: 600_000, apiGravity: 16.0 }],
    totalBarrels: 600_000,
    speedKnots: 12.4,
    heading: computeHeading(15),
    position: interpolateRoute(15),
    origin: 'Amuay, Venezuela',
    destination: 'Corpus Christi, TX',
    departureDate: '2026-02-08',
    eta: '2026-02-18',
    progressPercent: 15,
  },
  {
    id: 'v2',
    name: 'Falcon Tide',
    imo: '9412887',
    status: 'underway',
    cargo: [
      { grade: 'Mesa 30', volumeBarrels: 450_000, apiGravity: 30.0 },
      { grade: 'Santa Barbara', volumeBarrels: 300_000, apiGravity: 24.5 },
    ],
    totalBarrels: 750_000,
    speedKnots: 13.1,
    heading: computeHeading(35),
    position: interpolateRoute(35),
    origin: 'Amuay, Venezuela',
    destination: 'Corpus Christi, TX',
    departureDate: '2026-02-05',
    eta: '2026-02-16',
    progressPercent: 35,
  },
  {
    id: 'v3',
    name: 'Caribbean Sun',
    imo: '9287654',
    status: 'underway',
    cargo: [{ grade: 'Hamaca', volumeBarrels: 500_000, apiGravity: 10.0 }],
    totalBarrels: 500_000,
    speedKnots: 11.8,
    heading: computeHeading(55),
    position: interpolateRoute(55),
    origin: 'Amuay, Venezuela',
    destination: 'Corpus Christi, TX',
    departureDate: '2026-02-03',
    eta: '2026-02-15',
    progressPercent: 55,
  },
  {
    id: 'v4',
    name: 'Gulf Pioneer',
    imo: '9501432',
    status: 'underway',
    cargo: [
      { grade: 'Merey 16', volumeBarrels: 600_000, apiGravity: 16.0 },
      { grade: 'Boscan', volumeBarrels: 300_000, apiGravity: 10.1 },
    ],
    totalBarrels: 900_000,
    speedKnots: 12.9,
    heading: computeHeading(78),
    position: interpolateRoute(78),
    origin: 'Amuay, Venezuela',
    destination: 'Corpus Christi, TX',
    departureDate: '2026-02-01',
    eta: '2026-02-13',
    progressPercent: 78,
  },
  {
    id: 'v5',
    name: 'Rio Orinoco',
    imo: '9378901',
    status: 'underway',
    cargo: [{ grade: 'Mesa 30', volumeBarrels: 400_000, apiGravity: 30.0 }],
    totalBarrels: 400_000,
    speedKnots: 13.5,
    heading: computeHeading(92),
    position: interpolateRoute(92),
    origin: 'Amuay, Venezuela',
    destination: 'Corpus Christi, TX',
    departureDate: '2026-01-30',
    eta: '2026-02-12',
    progressPercent: 92,
  },
];

export const fleetSummary = {
  totalVessels: mockVessels.length,
  totalBarrels: mockVessels.reduce((s, v) => s + v.totalBarrels, 0),
  nextArrival: mockVessels.reduce((nearest, v) =>
    new Date(v.eta) < new Date(nearest.eta) ? v : nearest
  ),
  avgSpeed: +(mockVessels.reduce((s, v) => s + v.speedKnots, 0) / mockVessels.length).toFixed(1),
};

export const agenticSteps = [
  { id: 'step-1', label: 'Querying vessel database', description: 'Retrieving active tanker positions and cargo manifests from AIS feed', status: 'pending' as const, durationMs: 800 },
  { id: 'step-2', label: 'Running vector search on cargo intelligence', description: 'Searching MongoDB Atlas Vector Store for similar supply patterns', status: 'pending' as const, durationMs: 1200 },
  { id: 'step-3', label: 'Analyzing supply impact', description: 'Computing aggregate volume impact on Gulf Coast refinery demand', status: 'pending' as const, durationMs: 1000 },
  { id: 'step-4', label: 'Generating price forecast', description: 'Forecasting WTI, Mars, Maya, LLS, and crack spread movements', status: 'pending' as const, durationMs: 900 },
  { id: 'step-5', label: 'Formulating trade recommendations', description: 'Building optimal BRP trade recommendations based on supply outlook', status: 'pending' as const, durationMs: 700 },
];
