'use client';

import { css, keyframes } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Badge from '@leafygreen-ui/badge';
import { Body, Overline } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import type { SubstationData, GeneratorFuel } from '@/lib/types';

interface SubstationGridProps {
  substations: SubstationData[];
}

const FUEL_BADGE: Record<GeneratorFuel, 'green' | 'blue' | 'yellow' | 'red' | 'lightgray'> = {
  solar: 'yellow',
  wind: 'blue',
  gas: 'red',
  hydro: 'blue',
  nuclear: 'lightgray',
  biogas: 'green',
};

const FUEL_LABEL: Record<GeneratorFuel, string> = {
  solar: 'Solar',
  wind: 'Wind',
  gas: 'Gas',
  hydro: 'Hydro',
  nuclear: 'Nuclear',
  biogas: 'Biogas',
};

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

function UtilizationBar({ pct, darkMode }: { pct: number; darkMode: boolean }) {
  const color = pct > 85 ? palette.green.base : pct > 50 ? palette.yellow.base : palette.red.base;
  return (
    <div
      className={css`
        width: 100%;
        height: 4px;
        border-radius: 2px;
        background: ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
        margin-top: 8px;
      `}
    >
      <div
        className={css`
          height: 100%;
          border-radius: 2px;
          background: ${color};
          width: ${Math.min(100, pct)}%;
          transition: width 0.6s ease;
        `}
      />
    </div>
  );
}

function Sparkline({ data, darkMode }: { data: number[]; darkMode: boolean }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const h = 28;
  const w = 80;
  const step = w / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} className={css`flex-shrink: 0;`}>
      <polyline
        points={points}
        fill="none"
        stroke={palette.green.base}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SubstationGrid({ substations }: SubstationGridProps) {
  const { darkMode } = useDarkMode();
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const dimColor = darkMode ? palette.gray.light2 : palette.gray.dark2;

  return (
    <Card
      darkMode={darkMode}
      className={css`padding: 20px;`}
    >
      <div className={css`display: flex; align-items: center; gap: 10px; margin-bottom: 14px;`}>
        <Body
          className={css`
            color: ${textColor} !important;
            font-size: 13px !important;
            font-weight: 600 !important;
          `}
        >
          Substation Telemetry
        </Body>
        <Badge variant="green">time-series collection</Badge>
        <Body
          className={css`
            color: ${dimColor} !important;
            font-size: 11px !important;
            font-style: italic;
          `}
        >
          metaField: substation_id &nbsp;|&nbsp; timeField: timestamp &nbsp;|&nbsp; granularity: seconds
        </Body>
      </div>

      <div
        className={css`
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        `}
      >
        {substations.map((sub) => {
          const utilPct = (sub.latest.output_mw / sub.capacity_mw) * 100;
          const sparkData = sub.history.map((h) => h.output_mw);

          return (
            <div
              key={sub.id}
              className={css`
                background: ${darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'};
                border: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
                border-radius: 8px;
                padding: 14px;
              `}
            >
              {/* Header */}
              <div className={css`display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;`}>
                <div className={css`display: flex; align-items: center; gap: 6px;`}>
                  <div
                    className={css`
                      width: 7px;
                      height: 7px;
                      border-radius: 50%;
                      background: ${sub.status === 'online' ? palette.green.base : sub.status === 'ramping' ? palette.yellow.base : palette.gray.base};
                      animation: ${sub.status === 'online' ? pulse : 'none'} 2s ease-in-out infinite;
                    `}
                  />
                  <Body
                    className={css`
                      color: ${darkMode ? palette.white : palette.black} !important;
                      font-size: 12px !important;
                      font-weight: 600 !important;
                      white-space: nowrap;
                      overflow: hidden;
                      text-overflow: ellipsis;
                      max-width: 140px;
                    `}
                  >
                    {sub.name}
                  </Body>
                </div>
                <Badge variant={FUEL_BADGE[sub.fuel]}>{FUEL_LABEL[sub.fuel]}</Badge>
              </div>

              {/* Region */}
              <Overline
                className={css`
                  color: ${dimColor} !important;
                  font-size: 10px !important;
                  margin-bottom: 8px !important;
                  display: block;
                `}
              >
                {sub.region} &nbsp;|&nbsp; {sub.capacity_mw} MW capacity
              </Overline>

              {/* Output + Sparkline */}
              <div className={css`display: flex; align-items: flex-end; justify-content: space-between;`}>
                <div>
                  <Body
                    className={css`
                      color: ${darkMode ? palette.white : palette.black} !important;
                      font-size: 22px !important;
                      font-weight: 700 !important;
                      line-height: 1 !important;
                    `}
                  >
                    {sub.latest.output_mw.toFixed(1)}
                  </Body>
                  <Body
                    className={css`
                      color: ${dimColor} !important;
                      font-size: 10px !important;
                    `}
                  >
                    MW
                  </Body>
                </div>
                <Sparkline data={sparkData} darkMode={darkMode} />
              </div>

              {/* Utilization bar */}
              <UtilizationBar pct={utilPct} darkMode={darkMode} />

              {/* Sub-metrics */}
              <div className={css`display: flex; justify-content: space-between; margin-top: 8px;`}>
                <div>
                  <Body className={css`color: ${dimColor} !important; font-size: 10px !important;`}>
                    Voltage
                  </Body>
                  <Body className={css`color: ${textColor} !important; font-size: 11px !important; font-weight: 600 !important;`}>
                    {sub.latest.voltage_kv.toFixed(1)} kV
                  </Body>
                </div>
                <div>
                  <Body className={css`color: ${dimColor} !important; font-size: 10px !important;`}>
                    Freq
                  </Body>
                  <Body className={css`color: ${textColor} !important; font-size: 11px !important; font-weight: 600 !important;`}>
                    {sub.latest.frequency_hz.toFixed(2)} Hz
                  </Body>
                </div>
                <div>
                  <Body className={css`color: ${dimColor} !important; font-size: 10px !important;`}>
                    Util
                  </Body>
                  <Body className={css`color: ${textColor} !important; font-size: 11px !important; font-weight: 600 !important;`}>
                    {utilPct.toFixed(0)}%
                  </Body>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
