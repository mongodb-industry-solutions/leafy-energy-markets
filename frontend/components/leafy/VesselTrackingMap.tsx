'use client';

import { useState, useEffect, useMemo } from 'react';
import { css, keyframes } from '@emotion/css';
import Badge from '@leafygreen-ui/badge';
import { palette } from '@leafygreen-ui/palette';
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

/** Only include vessels currently in European/near-European waters */
function isInEuropeanWaters(v: Vessel): boolean {
  return v.position.lat > 30 && v.position.lng > -20;
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

  // Oil/gas tankers in European waters, max 10 for the tile panel
  const europeanVessels = useMemo(
    () => vessels.filter(isInEuropeanWaters).slice(0, 10),
    [vessels]
  );

  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const labelColor = darkMode ? palette.white : palette.black;
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;

  const totalLNG = fleetSummary.totalCubicMeters;
  const totalBbl = fleetSummary.totalBarrels;

  return (
    <div className={css`margin-bottom: 8px; padding: 0 8px;`}>
      {/* Map title */}
      <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;`}>
        <span className={css`color: ${labelColor}; font-weight: 600; font-size: 14px;`}>
          European Energy Supply — Live Global Energy Flow
        </span>
        <Badge variant="red">{europeanVessels.length} tracked near Rotterdam</Badge>
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

      {/* Global Energy Flow iframe map */}
      <div
        className={css`
          height: 45vh;
          max-height: 400px;
          min-height: 280px;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid ${borderColor};
          position: relative;
        `}
      >
        <iframe
          src="https://global-energy-flow.com/"
          title="Global Energy Flow — Live Tanker Tracking"
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="fullscreen"
          loading="lazy"
        />
        {/* Fallback open button — visible even if iframe blocks embedding */}
        <a
          href="https://global-energy-flow.com/"
          target="_blank"
          rel="noopener noreferrer"
          className={css`
            position: absolute;
            bottom: 10px;
            right: 10px;
            z-index: 10;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 5px 10px;
            border-radius: 5px;
            font-size: 11px;
            font-weight: 600;
            text-decoration: none;
            background: ${darkMode ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)'};
            color: ${darkMode ? palette.gray.light2 : palette.gray.dark2};
            border: 1px solid ${borderColor};
            backdrop-filter: blur(4px);
            transition: opacity 0.15s;
            &:hover { opacity: 0.85; }
          `}
        >
          ↗ Open Global Energy Flow
        </a>
      </div>

      {/* Vessel tiles — oil/gas tankers near Europe, max 10 */}
      <div
        className={css`
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 4px;
          margin-top: 6px;
        `}
      >
        {europeanVessels.map((v) => (
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
