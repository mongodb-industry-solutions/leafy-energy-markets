'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { css, keyframes } from '@emotion/css';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Badge from '@leafygreen-ui/badge';
import { palette } from '@leafygreen-ui/palette';
import { Body, Subtitle } from '@leafygreen-ui/typography';
import { useDarkMode } from '@/components/Providers';
import {
  routeWaypoints,
  mockVessels,
  fleetSummary,
  interpolateRoute,
  computeHeading,
} from '@/lib/vessel-data';
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

const ANIM_INTERVAL_MS = 600;
const BASE_SPEED = 12.5;
const PROGRESS_PER_TICK = 0.12;

const MAP_CENTER: [number, number] = [19.5, -82.0];
const MAP_ZOOM = 5;

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

export default function VesselTrackingMap() {
  const { darkMode } = useDarkMode();
  const [vessels, setVessels] = useState<Vessel[]>(mockVessels);

  // Real-time vessel animation
  useEffect(() => {
    const interval = setInterval(() => {
      setVessels((prev) =>
        prev.map((v) => {
          const rate = (v.speedKnots / BASE_SPEED) * PROGRESS_PER_TICK;
          let newProgress = v.progressPercent + rate;
          if (newProgress >= 99.5) newProgress = 3 + Math.random() * 5;
          const position = interpolateRoute(newProgress);
          const heading = computeHeading(newProgress);
          return { ...v, progressPercent: newProgress, position, heading };
        })
      );
    }, ANIM_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const routeLatLngs = useMemo(
    () => routeWaypoints.map((wp): [number, number] => [wp.lat, wp.lng]),
    []
  );

  const origin = routeWaypoints[0];
  const dest = routeWaypoints[routeWaypoints.length - 1];

  const tileUrl = darkMode ? DARK_TILES : LIGHT_TILES;
  const labelColor = darkMode ? palette.white : palette.black;
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;

  return (
    <div className={css`margin-bottom: 8px;`}>
      {/* Map title */}
      <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;`}>
        <Subtitle className={css`color: ${labelColor} !important;`}>
          Commodities at Sea — Venezuelan Crude Oil Tankers
        </Subtitle>
        <Badge variant="red">{fleetSummary.totalVessels} vessels</Badge>
        <Badge variant="blue">{(fleetSummary.totalBarrels / 1_000_000).toFixed(2)}M bbl in transit</Badge>
        <div className={css`
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; color: ${textColor}; opacity: 0.7;
        `}>
          <div className={css`width: 6px; height: 6px; border-radius: 50%; background: #00ed64; animation: ${pulse} 2s ease-in-out infinite;`} />
          LIVE
        </div>
      </div>

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
          center={MAP_CENTER}
          zoom={MAP_ZOOM}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
          scrollWheelZoom={true}
        >
          <TileLayer
            key={tileUrl}
            attribution={TILE_ATTR}
            url={tileUrl}
          />

          {/* Route polyline */}
          <Polyline
            positions={routeLatLngs}
            pathOptions={{
              color: darkMode ? '#4da6ff' : '#1a66cc',
              weight: 2.5,
              dashArray: '8, 5',
              opacity: 0.6,
            }}
          />

          {/* Origin marker */}
          <CircleMarker
            center={[origin.lat, origin.lng]}
            radius={7}
            pathOptions={{ color: '#fff', fillColor: palette.green.base, fillOpacity: 1, weight: 2 }}
          >
            <Tooltip permanent direction="right" offset={[10, 0]}>
              <strong>Amuay</strong>
            </Tooltip>
          </CircleMarker>

          {/* Destination marker */}
          <CircleMarker
            center={[dest.lat, dest.lng]}
            radius={7}
            pathOptions={{ color: '#fff', fillColor: palette.red.base, fillOpacity: 1, weight: 2 }}
          >
            <Tooltip permanent direction="left" offset={[-10, 0]}>
              <strong>Corpus Christi</strong>
            </Tooltip>
          </CircleMarker>

          {/* Vessel markers */}
          {vessels.map((v) => (
            <Marker
              key={v.id}
              position={[v.position.lat, v.position.lng]}
              icon={createVesselIcon(v.heading, statusColor[v.status])}
            >
              <Tooltip direction="top" offset={[0, -14]}>
                <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                  <strong>{v.name}</strong><br />
                  IMO: {v.imo}<br />
                  <span style={{ color: '#cc4400', fontWeight: 600 }}>Venezuelan Crude Oil</span><br />
                  {v.cargo.map((c, i) => (
                    <span key={i}>{c.grade} — {(c.volumeBarrels / 1000).toFixed(0)}k bbl<br /></span>
                  ))}
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
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 6px;
          margin-top: 8px;
        `}
      >
        {vessels.map((v) => (
          <div
            key={v.id}
            className={css`
              display: flex;
              flex-direction: column;
              gap: 1px;
              padding: 6px 10px;
              border-radius: 6px;
              font-size: 11px;
              background: ${darkMode ? '#112733' : palette.gray.light3};
              border: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
              color: ${textColor};
            `}
          >
            <span className={css`font-weight: 600; color: ${labelColor}; font-size: 12px;`}>{v.name}</span>
            <span className={css`color: ${darkMode ? '#ff9966' : '#cc4400'}; font-weight: 500;`}>
              Venezuelan Crude Oil
            </span>
            <span className={css`opacity: 0.8;`}>
              {v.cargo.map((c) => c.grade).join(' + ')} — {(v.totalBarrels / 1000).toFixed(0)}k bbl
            </span>
            <span className={css`opacity: 0.7;`}>ETA {v.eta}</span>
            <div className={css`
              height: 3px; border-radius: 2px; margin-top: 3px;
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
