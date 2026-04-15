'use client';

import { useState, useEffect, useMemo } from 'react';
import { css, keyframes } from '@emotion/css';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Badge from '@leafygreen-ui/badge';
import { palette } from '@leafygreen-ui/palette';
// LeafyGreen typography available if needed
import { useDarkMode } from '@/components/Providers';
import {
  routes,
  mockVessels,
  fleetSummary,
  interpolateRoute,
  computeHeading,
  vesselVolume,
  cargoType,
} from '@/lib/vessel-data';
import { useDisruption } from '@/lib/disruption-context';
import type { Vessel } from '@/lib/types';

const pulse = keyframes`
  0%, 100% { opacity: 0.6; }
  50% { opacity: 0.2; }
`;

const statusColor: Record<string, string> = {
  underway: '#00ed64',
  'at-anchor': palette.yellow.base,
  loading: palette.blue.base,
  discharging: palette.red.base,
};

const routeColor: Record<string, string> = {
  norway: '#4da6ff',
  mongstad: '#5db8ff',
  nigeria: '#ff9966',
  qatar: '#66cccc',
  baltic: '#cc99ff',
  gdansk: '#b888ee',
  mediterranean: '#ffcc44',
  skikda: '#ffd866',
  sines: '#ff88aa',
  usgulf: '#88ddaa',
  milfordhaven: '#aaddff',
};

const ANIM_INTERVAL_MS = 600;
const BASE_SPEED = 14.0;
const PROGRESS_PER_TICK = 0.10;

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>';

function createVesselIcon(heading: number, color: string): L.DivIcon {
  const svg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(${heading}, 12, 12)">
      <polygon points="12,2 6,20 12,16 18,20" fill="${color}" stroke="#000" stroke-width="1" opacity="0.9"/>
    </g>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

/** Auto-fit map bounds to all vessel positions + origin ports */
function FitBounds({ vessels }: { vessels: Vessel[] }) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [];
    // Add all vessel positions
    vessels.forEach((v) => points.push([v.position.lat, v.position.lng]));
    // Add all origin port positions
    Object.values(routes).forEach((wps) => {
      points.push([wps[0].lat, wps[0].lng]);
    });
    // Add Rotterdam
    points.push([51.95, 4.12]);

    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 5 });
    }
  }, []); // fit once on mount

  return null;
}

export default function VesselTrackingMap() {
  const { darkMode } = useDarkMode();
  const { active: disruptionActive, disruption } = useDisruption();
  const [vessels, setVessels] = useState<Vessel[]>(mockVessels);

  useEffect(() => {
    if (disruptionActive && disruption?.vesselsAffected) {
      setVessels((prev) =>
        prev.map((v) => ({ ...v, status: 'at-anchor' as const, speedKnots: 0 }))
      );
      return;
    }
    setVessels((prev) =>
      prev.map((v, i) => ({
        ...v,
        status: mockVessels[i]?.status ?? v.status,
        speedKnots: mockVessels[i]?.speedKnots ?? v.speedKnots,
      }))
    );
    const interval = setInterval(() => {
      setVessels((prev) =>
        prev.map((v) => {
          const wp = routes[v.routeId || 'norway'];
          const rate = (v.speedKnots / BASE_SPEED) * PROGRESS_PER_TICK;
          let newProgress = v.progressPercent + rate;
          if (newProgress >= 99.5) newProgress = 3 + Math.random() * 5;
          const position = interpolateRoute(newProgress, wp);
          const heading = computeHeading(newProgress, wp);
          return { ...v, progressPercent: newProgress, position, heading };
        })
      );
    }, ANIM_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [disruptionActive, disruption]);

  const routePolylines = useMemo(
    () =>
      Object.entries(routes).map(([id, wps]) => ({
        id,
        positions: wps.map((wp): [number, number] => [wp.lat, wp.lng]),
        color: routeColor[id] || '#4da6ff',
      })),
    []
  );

  const rotterdam = { lat: 51.95, lng: 4.12 };

  // Collect unique origin ports (deduplicate by label)
  const originPorts = useMemo(() => {
    const seen = new Set<string>();
    const ports: { lat: number; lng: number; label: string; routeId: string }[] = [];
    Object.entries(routes).forEach(([id, wps]) => {
      const origin = wps[0];
      if (origin.label && !seen.has(origin.label)) {
        seen.add(origin.label);
        ports.push({ lat: origin.lat, lng: origin.lng, label: origin.label, routeId: id });
      }
    });
    return ports;
  }, []);

  const tileUrl = darkMode ? DARK_TILES : LIGHT_TILES;
  const labelColor = darkMode ? palette.white : palette.black;
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;

  const totalLNG = fleetSummary.totalCubicMeters;
  const totalBbl = fleetSummary.totalBarrels;

  return (
    <div className={css`margin-bottom: 8px; padding: 0 8px;`}>
      {/* Map title */}
      <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;`}>
        <span className={css`color: ${labelColor}; font-weight: 600; font-size: 14px;`}>
          European Energy Supply — Vessels Bound for Rotterdam
        </span>
        <Badge variant="red">{fleetSummary.totalVessels} vessels</Badge>
        {totalBbl > 0 && <Badge variant="blue">{(totalBbl / 1_000_000).toFixed(2)}M bbl</Badge>}
        {totalLNG > 0 && <Badge variant="green">{(totalLNG / 1_000).toFixed(0)}k m³ LNG</Badge>}
        <div className={css`
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; color: ${textColor}; opacity: 0.7;
        `}>
          <div className={css`width: 6px; height: 6px; border-radius: 50%; background: #00ed64; animation: ${pulse} 2s ease-in-out infinite;`} />
          LIVE
        </div>
      </div>

      {/* Disruption Banner */}
      {disruptionActive && disruption && (
        <div
          className={css`
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            margin-bottom: 8px;
            border-radius: 8px;
            background: rgba(207, 74, 34, 0.15);
            border: 1px solid ${palette.red.base};
            color: ${palette.red.base};
            font-size: 13px;
            font-weight: 600;
          `}
        >
          DISRUPTION ACTIVE — {disruption.name}: All vessel traffic to Rotterdam suspended
        </div>
      )}

      {/* Leaflet Map */}
      <div
        className={css`
          height: 45vh;
          max-height: 400px;
          min-height: 280px;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
          .leaflet-container { height: 100%; width: 100%; }
        `}
      >
        <MapContainer
          center={[42, 8]}
          zoom={3}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
          scrollWheelZoom={true}
        >
          <FitBounds vessels={vessels} />
          <TileLayer
            key={tileUrl}
            attribution={TILE_ATTR}
            url={tileUrl}
          />

          {/* Route polylines */}
          {routePolylines.map((r) => (
            <Polyline
              key={r.id}
              positions={r.positions}
              pathOptions={{
                color: r.color,
                weight: 1.5,
                dashArray: '6, 4',
                opacity: 0.35,
              }}
            />
          ))}

          {/* Origin port markers */}
          {originPorts.map((port) => (
            <CircleMarker
              key={`origin-${port.label}`}
              center={[port.lat, port.lng]}
              radius={4}
              pathOptions={{ color: '#fff', fillColor: routeColor[port.routeId] || palette.green.base, fillOpacity: 1, weight: 1.5 }}
            >
              <Tooltip permanent direction="right" offset={[6, 0]}>
                <span style={{ fontSize: 10, fontWeight: 600 }}>{port.label}</span>
              </Tooltip>
            </CircleMarker>
          ))}

          {/* Rotterdam destination marker */}
          <CircleMarker
            center={[rotterdam.lat, rotterdam.lng]}
            radius={7}
            pathOptions={{ color: '#fff', fillColor: palette.red.base, fillOpacity: 1, weight: 2 }}
          >
            <Tooltip permanent direction="right" offset={[10, 0]}>
              <span style={{ fontSize: 11, fontWeight: 700 }}>Rotterdam Europoort</span>
            </Tooltip>
          </CircleMarker>

          {/* Vessel markers — colored by route */}
          {vessels.map((v) => (
            <Marker
              key={v.id}
              position={[v.position.lat, v.position.lng]}
              icon={createVesselIcon(
                v.heading,
                v.status === 'at-anchor' ? statusColor['at-anchor'] : (routeColor[v.routeId || 'norway'] || '#4da6ff')
              )}
            >
              <Tooltip direction="top" offset={[0, -14]}>
                <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                  <strong>{v.name}</strong><br />
                  IMO: {v.imo}<br />
                  <span style={{ color: '#0066cc', fontWeight: 600 }}>{cargoType(v)}</span><br />
                  {v.cargo.map((c, i) => (
                    <span key={i}>
                      {c.grade} — {c.volumeCubicMeters
                        ? `${(c.volumeCubicMeters / 1000).toFixed(0)}k m³`
                        : `${(c.volumeBarrels / 1000).toFixed(0)}k bbl`}
                      <br />
                    </span>
                  ))}
                  {v.origin} → Rotterdam<br />
                  Speed: {v.speedKnots} kn | Hdg: {v.heading.toFixed(0)}°<br />
                  ETA: {v.eta}
                </div>
              </Tooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Info panel below map */}
      <div
        className={css`
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 4px;
          margin-top: 6px;
        `}
      >
        {vessels.map((v) => (
          <div
            key={v.id}
            className={css`
              display: flex;
              flex-direction: column;
              gap: 1px;
              padding: 5px 8px;
              border-radius: 5px;
              font-size: 10px;
              background: ${darkMode ? '#112733' : palette.gray.light3};
              border-left: 3px solid ${routeColor[v.routeId || 'norway'] || '#4da6ff'};
              border-top: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
              border-right: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
              border-bottom: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
              color: ${textColor};
            `}
          >
            <span className={css`font-weight: 600; color: ${labelColor}; font-size: 11px;`}>{v.name}</span>
            <span className={css`color: ${darkMode ? '#66aaff' : '#0055aa'}; font-weight: 500;`}>
              {cargoType(v)}
            </span>
            <span className={css`opacity: 0.8;`}>
              {v.cargo.map((c) => c.grade).join(' + ')} — {vesselVolume(v)}
            </span>
            <span className={css`opacity: 0.7;`}>{v.origin} → Rotterdam</span>
            <span className={css`opacity: 0.6;`}>ETA {v.eta}</span>
            <div className={css`
              height: 2px; border-radius: 2px; margin-top: 2px;
              background: ${darkMode ? palette.gray.dark2 : palette.gray.light2};
            `}>
              <div className={css`
                height: 100%; width: ${Math.min(v.progressPercent, 100)}%;
                border-radius: 2px; background: ${statusColor[v.status]};
                transition: width 0.5s linear;
              `} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
