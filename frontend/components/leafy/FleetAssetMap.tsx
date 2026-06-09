'use client';

import { useState, useEffect, useRef } from 'react';
import { css, keyframes } from '@emotion/css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Badge from '@leafygreen-ui/badge';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import type { FleetAsset, AssetType } from '@/lib/types';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const DARK_TILES  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR   = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>';

const TYPE_COLOR: Record<AssetType, string> = {
  wind:    '#4da6ff',
  solar:   '#ffcc44',
  hydro:   '#66cccc',
  gas:     '#ff9966',
  battery: '#cc99ff',
  biomass: '#88ddaa',
};

const TYPE_ICON: Record<AssetType, string> = {
  wind:    '💨',
  solar:   '☀️',
  hydro:   '💧',
  gas:     '🔥',
  battery: '🔋',
  biomass: '🌿',
};

const STATIC_ASSETS: FleetAsset[] = [
  { id: 'ASSET-WIND-NL-001',    type: 'wind',    name: 'Hollandse Kust Wind', lat: 52.80, lng:  4.10, capacityMw: 200, currentOutputMw: 0, utilisationPct: 0, status: 'idle', recentEvents: [] },
  { id: 'ASSET-WIND-UK-001',    type: 'wind',    name: 'Hornsea Wind Farm',   lat: 53.90, lng:  0.90, capacityMw: 150, currentOutputMw: 0, utilisationPct: 0, status: 'idle', recentEvents: [] },
  { id: 'ASSET-SOLAR-ES-001',   type: 'solar',   name: 'Algarrobico Solar',   lat: 37.15, lng: -1.75, capacityMw: 180, currentOutputMw: 0, utilisationPct: 0, status: 'idle', recentEvents: [] },
  { id: 'ASSET-SOLAR-PT-001',   type: 'solar',   name: 'Sines Solar Park',    lat: 37.95, lng: -8.87, capacityMw: 120, currentOutputMw: 0, utilisationPct: 0, status: 'idle', recentEvents: [] },
  { id: 'ASSET-HYDRO-NO-001',   type: 'hydro',   name: 'Nordland Hydro',      lat: 67.30, lng: 15.50, capacityMw: 300, currentOutputMw: 0, utilisationPct: 0, status: 'idle', recentEvents: [] },
  { id: 'ASSET-GAS-DE-001',     type: 'gas',     name: 'Rhine CCGT',          lat: 51.20, lng:  6.80, capacityMw: 400, currentOutputMw: 0, utilisationPct: 0, status: 'idle', recentEvents: [] },
  { id: 'ASSET-BATTERY-NL-001', type: 'battery', name: 'Rotterdam BESS',      lat: 51.90, lng:  4.50, capacityMw:  50, currentOutputMw: 0, utilisationPct: 0, status: 'idle', recentEvents: [] },
  { id: 'ASSET-BIOMASS-FR-001', type: 'biomass', name: 'Gironde Biomass',     lat: 44.80, lng: -0.55, capacityMw:  80, currentOutputMw: 0, utilisationPct: 0, status: 'idle', recentEvents: [] },
];

const COORD_MAP: Record<string, { lat: number; lng: number }> = Object.fromEntries(
  STATIC_ASSETS.map((a) => [a.id, { lat: a.lat, lng: a.lng }])
);

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function hasActiveAlert(asset: FleetAsset): boolean {
  return asset.recentEvents.some(
    (e) => e.eventType === 'WeatherAlertIssued' || e.eventType === 'PerformanceVarianceDetected',
  );
}

function tooltipHtml(asset: FleetAsset): string {
  const icon = TYPE_ICON[asset.type] ?? '📌';
  const statusColor = asset.status === 'alert' ? '#e74c3c' : asset.status === 'online' ? '#00ed64' : '#888';
  const alertLine = hasActiveAlert(asset)
    ? `<br/><span style="color:#e74c3c">⚠️ ${asset.recentEvents.map((e) => e.eventType.replace(/([A-Z])/g, ' $1').trim()).join(', ')}</span>`
    : '';
  return `
    <div style="font-size:12px;line-height:1.5">
      <strong>${icon} ${asset.name}</strong><br/>
      Output: <strong>${asset.currentOutputMw.toFixed(0)} MW</strong> / ${asset.capacityMw} MW<br/>
      Utilisation: <strong>${asset.utilisationPct.toFixed(0)}%</strong>
      <span style="color:${statusColor};font-weight:600"> ${asset.status.toUpperCase()}</span>
      ${alertLine}
    </div>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Animations
// ──────────────────────────────────────────────────────────────────────────────

const pulse = keyframes`
  0%, 100% { opacity: 0.7; }
  50%       { opacity: 0.2; }
`;

const alertBorder = keyframes`
  0%, 100% { border-color: ${palette.red.base}; }
  50%       { border-color: transparent; }
`;

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export default function FleetAssetMap() {
  const { darkMode } = useDarkMode();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [state, setState] = useState<any>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [stormActive, setStormActive] = useState(false);
  const [stormCenter, setStormCenter] = useState<{ lat: number; lng: number } | null>(null);

  const containerRef   = useRef<HTMLDivElement>(null);
  const mapRef         = useRef<L.Map | null>(null);
  const tileRef        = useRef<L.TileLayer | null>(null);
  const assetsLayer    = useRef<L.LayerGroup | null>(null);
  const stormLayer     = useRef<L.LayerGroup | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sessionIdRef   = useRef<string>('default');
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem('leafy_session_id');
    if (stored) sessionIdRef.current = stored;
  }, []);

  // ── Initialize Leaflet map once ────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [50, 5],
      zoom: 4,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    tileRef.current = L.tileLayer(darkMode ? DARK_TILES : LIGHT_TILES, {
      attribution: TILE_ATTR,
    }).addTo(map);

    assetsLayer.current = L.layerGroup().addTo(map);
    stormLayer.current  = L.layerGroup().addTo(map);
    mapRef.current      = map;
    setMapReady(true);

    // Inject blink keyframes for alert markers once
    if (!document.getElementById('leaflet-emoji-styles')) {
      const style = document.createElement('style');
      style.id = 'leaflet-emoji-styles';
      style.textContent = '@keyframes blink { 0%,49%{opacity:1} 50%,100%{opacity:0.2} }';
      document.head.appendChild(style);
    }

    return () => {
      setMapReady(false);
      map.remove();
      mapRef.current      = null;
      tileRef.current     = null;
      assetsLayer.current = null;
      stormLayer.current  = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Swap tile URL on dark mode change ──────────────────────
  useEffect(() => {
    tileRef.current?.setUrl(darkMode ? DARK_TILES : LIGHT_TILES);
  }, [darkMode]);

  // ── Initial state fetch ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/trading/state?session_id=${sessionIdRef.current}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setState(data);
          setSimRunning(!!data.running);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ── SSE stream ─────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource(`/api/trading/stream?session_id=${sessionIdRef.current}`);
    eventSourceRef.current = es;
    es.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string);
        setState(data);
        setSimRunning(!!data.running);
      } catch { /* ignore */ }
    };
    es.onerror = () => es.close();
    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  // ── Derive asset list ──────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assets: FleetAsset[] = state?.assets
    ? state.assets.map((a: any) => {
        const coords = COORD_MAP[a.id] ?? { lat: 50, lng: 5 };
        return {
          id: a.id,
          type: a.type ?? 'wind',
          name: a.name ?? a.id,
          lat: coords.lat,
          lng: coords.lng,
          capacityMw: a.capacityMw ?? 0,
          currentOutputMw: a.currentOutputMw ?? 0,
          utilisationPct: a.utilizationPct ?? 0,
          status: a.status === 'online' ? 'online' : 'idle',
          recentEvents: [],
        } as FleetAsset;
      })
    : STATIC_ASSETS;

  // ── Redraw asset markers ───────────────────────────────────
  useEffect(() => {
    if (!mapReady || !assetsLayer.current) return;
    assetsLayer.current.clearLayers();

    for (const asset of assets) {
      const alert  = hasActiveAlert(asset);

      const util = asset.capacityMw > 0 ? asset.currentOutputMw / asset.capacityMw : 0;
      const fontSize = Math.round(18 + util * 12);
      const icon = TYPE_ICON[asset.type] ?? '📌';
      const alertStyle = alert ? 'animation:blink 0.6s step-start infinite;' : '';
      const opacity = asset.status === 'idle' ? '0.45' : '1';

      L.marker([asset.lat, asset.lng], {
        icon: L.divIcon({
          html: `<span style="font-size:${fontSize}px;line-height:1;display:block;text-align:center;opacity:${opacity};filter:drop-shadow(0 1px 4px rgba(0,0,0,0.7));${alertStyle}">${icon}</span>`,
          className: '',
          iconSize: [fontSize + 4, fontSize + 4],
          iconAnchor: [(fontSize + 4) / 2, (fontSize + 4) / 2],
        }),
      })
        .bindTooltip(tooltipHtml(asset), { direction: 'top', offset: [0, -(fontSize / 2) - 4] })
        .addTo(assetsLayer.current!);
    }
  }, [assets, mapReady]);

  // ── Redraw storm overlay ───────────────────────────────────
  useEffect(() => {
    if (!stormLayer.current) return;
    stormLayer.current.clearLayers();

    if (stormActive && stormCenter) {
      L.circle([stormCenter.lat, stormCenter.lng], {
        radius: 400000,
        color: palette.red.base,
        fillColor: palette.red.base,
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '8 4',
      })
        .bindTooltip('<span style="font-size:12px;font-weight:700;color:#d33">⛈️ Severe Storm — ES/PT Solar &lt;20%</span>', {
          permanent: true,
          direction: 'center',
        })
        .addTo(stormLayer.current);

      L.marker([stormCenter.lat, stormCenter.lng], {
        icon: L.divIcon({
          html: '<span style="font-size:28px;line-height:1;">⛈️</span>',
          className: '',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
      }).addTo(stormLayer.current);
    }
  }, [stormActive, stormCenter]);

  // ── Derived display values ─────────────────────────────────
  const totalOutputMw       = assets.reduce((s, a) => s + a.currentOutputMw, 0);
  const totalCapacityMw     = assets.reduce((s, a) => s + a.capacityMw, 0);
  const fleetUtilisationPct = totalCapacityMw > 0 ? (totalOutputMw / totalCapacityMw) * 100 : 0;
  const labelColor = darkMode ? palette.white : palette.black;
  const textColor  = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const mutedColor = darkMode ? palette.gray.dark1  : palette.gray.light1;

  return (
    <div className={css`margin-bottom: 8px; padding: 0 8px;`}>
      {/* Header */}
      <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;`}>
        <span className={css`color: ${labelColor}; font-weight: 600; font-size: 14px;`}>
          European Energy Fleet — Live Asset Map
        </span>

        {state && (
          <>
            <Badge variant="blue">{totalOutputMw.toFixed(0)} MW output</Badge>
            <Badge variant="green">{fleetUtilisationPct.toFixed(0)}% utilisation</Badge>
          </>
        )}

        <div className={css`display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: ${textColor}; opacity: 0.7;`}>
          <div className={css`
            width: 6px; height: 6px; border-radius: 50%;
            background: ${simRunning ? '#00ed64' : mutedColor};
            animation: ${simRunning ? `${pulse} 2s ease-in-out infinite` : 'none'};
          `} />
          {simRunning ? 'LIVE' : 'IDLE'}
        </div>

        <button
          onClick={async () => {
            try {
              const res = await fetch(`/api/trading/weather-alert/iberian-storm?session_id=${sessionIdRef.current}`, { method: 'POST' });
              if (res.ok) {
                const data = await res.json();
                setState(data.state);
                setStormActive(true);
                setStormCenter({ lat: 37.5, lng: -4.0 });
              }
            } catch { /* ignore */ }
          }}
          disabled={stormActive}
          className={css`
            margin-left: auto; padding: 5px 12px; border-radius: 6px;
            border: 1px solid ${stormActive ? palette.red.base : palette.yellow.base};
            background: ${stormActive ? `${palette.red.base}22` : `${palette.yellow.base}15`};
            color: ${stormActive ? palette.red.base : palette.yellow.base};
            font-size: 11px; font-weight: 700;
            cursor: ${stormActive ? 'default' : 'pointer'};
            font-family: inherit; display: flex; align-items: center; gap: 5px;
            transition: all 0.2s ease;
            &:hover:not(:disabled) { background: ${palette.yellow.base}30; border-color: ${palette.yellow.base}; }
          `}
        >
          {stormActive ? '⛈️ Storm Active — ES/PT' : '⛈️ Trigger Iberian Storm'}
        </button>
      </div>

      {/* Legend */}
      <div className={css`display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 6px;`}>
        {(Object.entries(TYPE_COLOR) as [AssetType, string][]).map(([type, color]) => (
          <div key={type} className={css`display: flex; align-items: center; gap: 4px; font-size: 10px; color: ${textColor};`}>
            <div className={css`width: 10px; height: 10px; border-radius: 50%; background: ${color}; opacity: 0.85;`} />
            {type}
          </div>
        ))}
        <div className={css`display: flex; align-items: center; gap: 4px; font-size: 10px; color: ${textColor};`}>
          <div className={css`
            width: 10px; height: 10px; border-radius: 50%; background: transparent;
            border: 2px solid ${palette.red.base};
            animation: ${alertBorder} 1s ease-in-out infinite;
          `} />
          alert
        </div>
      </div>

      {/* Map container — Leaflet initialises imperatively into this div */}
      <div
        ref={containerRef}
        className={css`
          height: 45vh; max-height: 400px; min-height: 280px;
          border-radius: 8px; overflow: hidden;
          border: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
        `}
      />

      {/* Asset grid */}
      <div className={css`
        display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 4px; margin-top: 6px;
      `}>
        {assets.map((asset) => {
          const color = TYPE_COLOR[asset.type] ?? '#aaaaaa';
          const alertActive = hasActiveAlert(asset);
          return (
            <div
              key={asset.id}
              className={css`
                display: flex; flex-direction: column; gap: 2px;
                padding: 5px 8px; border-radius: 5px; font-size: 10px;
                background: ${darkMode ? '#112733' : palette.gray.light3};
                border-left: 3px solid ${alertActive ? palette.red.base : color};
                border-top: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
                border-right: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
                border-bottom: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
                color: ${textColor};
              `}
            >
              <span className={css`font-weight: 600; color: ${labelColor}; font-size: 11px;`}>
                {TYPE_ICON[asset.type]} {asset.name}
              </span>
              <span className={css`color: ${darkMode ? '#66aaff' : '#0055aa'}; font-weight: 500;`}>
                {asset.currentOutputMw.toFixed(0)} / {asset.capacityMw} MW
              </span>
              <span className={css`opacity: 0.8;`}>
                {asset.utilisationPct.toFixed(0)}% utilisation
              </span>
              <div className={css`height: 2px; border-radius: 2px; margin-top: 2px; background: ${darkMode ? palette.gray.dark2 : palette.gray.light2};`}>
                <div className={css`
                  height: 100%; width: ${Math.min(asset.utilisationPct, 100)}%; border-radius: 2px;
                  background: ${alertActive ? palette.red.base : color}; transition: width 0.8s ease;
                `} />
              </div>
              {alertActive && (
                <span className={css`color: ${palette.red.base}; font-size: 9px; font-weight: 600;`}>
                  ⚠️ {asset.recentEvents[0]?.eventType.replace(/([A-Z])/g, ' $1').trim()}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {!state && (
        <div className={css`margin-top: 6px; font-size: 10px; color: ${mutedColor}; text-align: center;`}>
          Showing static assets — connect to backend for live data
        </div>
      )}
    </div>
  );
}
