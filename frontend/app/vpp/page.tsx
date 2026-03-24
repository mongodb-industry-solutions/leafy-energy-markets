'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { css, keyframes } from '@emotion/css';
import { palette } from '@leafygreen-ui/palette';
import Badge from '@leafygreen-ui/badge';
import Icon from '@leafygreen-ui/icon';
import Button from '@leafygreen-ui/button';
import { H2, Body } from '@leafygreen-ui/typography';
import { useDarkMode } from '@/components/Providers';
import { useGenerator } from '@/lib/generator-context';

const VPPScene = dynamic(() => import('@/components/vpp/VPPScene'), { ssr: false });

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

export default function VPPPage() {
  const { darkMode } = useDarkMode();
  const gen = useGenerator();
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;

  const onlineCount = gen.substations.filter((s) => s.status === 'online').length;
  const totalCapacity = gen.substations.reduce((sum, s) => sum + s.capacity_mw, 0);
  const totalOutput = gen.substations
    .filter((s) => s.status === 'online')
    .reduce((sum, s) => sum + s.latest.output_mw, 0);
  const utilization = totalCapacity > 0 ? (totalOutput / totalCapacity) * 100 : 0;

  return (
    <div
      className={css`
        display: flex;
        flex-direction: column;
        height: calc(100vh - 64px);
        overflow: hidden;
      `}
    >
      {/* Header */}
      <div
        className={css`
          padding: 16px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid ${borderColor};
          flex-shrink: 0;
        `}
      >
        <div className={css`display: flex; align-items: center; gap: 12px;`}>
          <Icon glyph="Diagram2" size={20} fill={palette.green.base} />
          <H2 className={css`color: ${darkMode ? palette.white : palette.black} !important; font-size: 18px !important; margin: 0 !important;`}>
            Virtual Power Plant
          </H2>
          {gen.isRunning ? (
            <Badge variant="green">
              <span className={css`display: flex; align-items: center; gap: 4px;`}>
                <span className={css`
                  display: inline-block;
                  width: 6px; height: 6px;
                  border-radius: 50%;
                  background: ${palette.green.base};
                  animation: ${pulse} 1.5s ease-in-out infinite;
                `} />
                Live
              </span>
            </Badge>
          ) : (
            <Badge variant="lightgray">Offline</Badge>
          )}
        </div>

        <div className={css`display: flex; align-items: center; gap: 12px;`}>
          {/* Stats */}
          {gen.isRunning && (
            <div className={css`display: flex; gap: 16px; margin-right: 12px;`}>
              <div className={css`text-align: center;`}>
                <div className={css`font-size: 10px; color: ${textColor}; text-transform: uppercase; letter-spacing: 0.5px;`}>Sources</div>
                <div className={css`font-size: 16px; font-weight: 700; color: ${palette.green.base}; font-family: 'Source Code Pro', monospace;`}>
                  {onlineCount}/{gen.substations.length}
                </div>
              </div>
              <div className={css`text-align: center;`}>
                <div className={css`font-size: 10px; color: ${textColor}; text-transform: uppercase; letter-spacing: 0.5px;`}>Output</div>
                <div className={css`font-size: 16px; font-weight: 700; color: ${palette.green.base}; font-family: 'Source Code Pro', monospace;`}>
                  {totalOutput.toFixed(0)} MW
                </div>
              </div>
              <div className={css`text-align: center;`}>
                <div className={css`font-size: 10px; color: ${textColor}; text-transform: uppercase; letter-spacing: 0.5px;`}>Utilization</div>
                <div className={css`font-size: 16px; font-weight: 700; color: ${utilization > 70 ? palette.green.base : palette.yellow.base}; font-family: 'Source Code Pro', monospace;`}>
                  {utilization.toFixed(1)}%
                </div>
              </div>
            </div>
          )}

          {gen.isRunning ? (
            <Button variant="danger" size="small" darkMode={darkMode} onClick={() => gen.stop()}>
              Stop Generator
            </Button>
          ) : (
            <Button variant="primary" size="small" darkMode={darkMode} onClick={() => gen.start()}>
              Start Generator
            </Button>
          )}
        </div>
      </div>

      {/* 3D Scene */}
      <div className={css`flex: 1; position: relative;`}>
        <Suspense
          fallback={
            <div className={css`
              display: flex; align-items: center; justify-content: center;
              height: 100%; color: ${textColor};
            `}>
              Loading 3D scene...
            </div>
          }
        >
          <VPPScene substations={gen.substations} isRunning={gen.isRunning} />
        </Suspense>

        {/* Overlay legend */}
        <div
          className={css`
            position: absolute;
            bottom: 16px;
            left: 16px;
            background: rgba(255, 255, 255, 0.9);
            border: 1px solid rgba(0, 0, 0, 0.12);
            border-radius: 8px;
            padding: 12px 16px;
            backdrop-filter: blur(8px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          `}
        >
          <div className={css`font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 600;`}>
            Energy Sources
          </div>
          {gen.substations.map((s) => {
            const colors: Record<string, string> = {
              solar: '#F5A623', wind: '#4A90D9', gas: '#D9534F',
              hydro: '#5BC0DE', nuclear: '#999999', biogas: '#00A35C',
            };
            return (
              <div key={s.id} className={css`
                display: flex; align-items: center; gap: 8px;
                font-size: 11px; color: #333; margin-bottom: 4px;
              `}>
                <span className={css`
                  width: 8px; height: 8px; border-radius: 50%;
                  background: ${colors[s.fuel] || '#888'};
                  opacity: ${s.status === 'online' ? 1 : 0.3};
                `} />
                <span className={css`width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`}>
                  {s.name.split(' ').slice(0, 2).join(' ')}
                </span>
                <span className={css`color: ${s.status === 'online' ? colors[s.fuel] : '#999'}; font-family: 'Source Code Pro', monospace; font-size: 10px; font-weight: 600;`}>
                  {gen.isRunning && s.status === 'online'
                    ? `${s.latest.output_mw.toFixed(0)} MW`
                    : s.status}
                </span>
              </div>
            );
          })}
        </div>

        {/* Controls hint */}
        <div
          className={css`
            position: absolute;
            bottom: 16px;
            right: 16px;
            font-size: 10px;
            color: #666;
            background: rgba(255,255,255,0.7);
            padding: 4px 8px;
            border-radius: 4px;
          `}
        >
          Drag to rotate · Scroll to zoom · Shift+drag to pan
        </div>
      </div>
    </div>
  );
}
