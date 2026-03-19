'use client';

import { css } from '@emotion/css';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';

export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const LEVEL_CONFIG: Record<AutonomyLevel, { label: string; description: string; color: string; bg: string }> = {
  0: { label: 'L0 — No Agency', description: 'Retrieval only, no autonomous actions', color: palette.gray.dark1, bg: palette.gray.light3 },
  1: { label: 'L1 — Reasoning', description: 'Chain-of-thought reasoning over context', color: palette.blue.dark1, bg: palette.blue.light3 },
  2: { label: 'L2 — Co-pilot', description: 'Conditional agency with human approval', color: palette.green.dark1, bg: palette.green.light3 },
  3: { label: 'L3 — Autonomous', description: 'High autonomy to act on tasks via tool use', color: '#8B6914', bg: '#FFF3CD' },
  4: { label: 'L4 — Job', description: 'Performs entire job functions', color: palette.red.dark2, bg: palette.red.light3 },
  5: { label: 'L5 — Agent Teams', description: 'Teams of agents collaborating', color: palette.purple.dark2, bg: palette.purple.light3 },
  6: { label: 'L6 — Agent Manager', description: 'Manages teams of agents', color: palette.purple.dark2, bg: palette.purple.light3 },
};

interface AutonomyBadgeProps {
  level: AutonomyLevel;
  compact?: boolean;
}

export default function AutonomyBadge({ level, compact = false }: AutonomyBadgeProps) {
  const { darkMode } = useDarkMode();
  const config = LEVEL_CONFIG[level];

  const badgeBg = darkMode ? `${config.color}22` : config.bg;
  const badgeColor = darkMode ? config.bg : config.color;

  return (
    <span
      title={`BVP Agent Autonomy Scale: ${config.label} — ${config.description}`}
      className={css`
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: ${compact ? '1px 6px' : '2px 8px'};
        border-radius: 4px;
        background: ${badgeBg};
        color: ${badgeColor};
        font-size: ${compact ? '10px' : '11px'};
        font-weight: 600;
        white-space: nowrap;
        cursor: help;
        border: 1px solid ${darkMode ? `${config.color}44` : `${config.color}33`};
      `}
    >
      {compact ? `L${level}` : config.label}
    </span>
  );
}

/** Full autonomy scale visualization for the architecture page. */
export function AutonomyScale({ highlights }: { highlights?: Record<number, string> }) {
  const { darkMode } = useDarkMode();
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;

  return (
    <div className={css`display: flex; flex-direction: column; gap: 0;`}>
      {([0, 1, 2, 3, 4, 5, 6] as AutonomyLevel[]).map((level) => {
        const config = LEVEL_CONFIG[level];
        const highlight = highlights?.[level];
        const isHighlighted = !!highlight;

        return (
          <div
            key={level}
            className={css`
              display: flex;
              align-items: stretch;
              gap: 16px;
              padding: 10px 16px;
              border-bottom: 1px solid ${borderColor};
              background: ${isHighlighted ? (darkMode ? `${config.color}11` : `${config.bg}88`) : 'transparent'};
            `}
          >
            <div className={css`width: 160px; flex-shrink: 0;`}>
              <AutonomyBadge level={level} />
            </div>
            <div className={css`flex: 1;`}>
              <div className={css`font-size: 13px; color: ${textColor};`}>
                {config.description}
              </div>
              {highlight && (
                <div className={css`font-size: 12px; color: ${config.color}; font-weight: 600; margin-top: 4px;`}>
                  {highlight}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div className={css`
        padding: 8px 16px;
        font-size: 11px;
        color: ${darkMode ? palette.gray.dark1 : palette.gray.light1};
      `}>
        Source: <a
          href="https://www.bvp.com/atlas/bessemers-ai-agent-autonomy-scale"
          target="_blank"
          rel="noopener noreferrer"
          className={css`color: ${palette.blue.base};`}
        >Bessemer Venture Partners — AI Agent Autonomy Scale</a>
      </div>
    </div>
  );
}
