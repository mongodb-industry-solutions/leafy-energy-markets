'use client';

import { css } from '@emotion/css';
import Link from 'next/link';
import Badge from '@leafygreen-ui/badge';
import { Body, Subtitle } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import type { TariffScenario } from '@/lib/types';

interface ScenarioListProps {
  scenarios: TariffScenario[];
}

export default function ScenarioList({ scenarios }: ScenarioListProps) {
  const { darkMode } = useDarkMode();
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const bgColor = darkMode ? '#112733' : palette.white;
  const hoverBg = darkMode ? 'rgba(255,255,255,0.03)' : palette.gray.light3;

  if (scenarios.length === 0) {
    return (
      <Body
        className={css`
          color: ${darkMode ? palette.gray.light1 : palette.gray.dark1} !important;
          text-align: center;
          padding: 40px;
        `}
      >
        No scenarios yet. Create one above or run the demo.
      </Body>
    );
  }

  return (
    <div
      className={css`
        border: 1px solid ${borderColor};
        border-radius: 12px;
        overflow: hidden;
      `}
    >
      {/* Header */}
      <div
        className={css`
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
          gap: 12px;
          padding: 12px 20px;
          background: ${darkMode ? palette.gray.dark3 : palette.gray.light3};
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
        `}
      >
        <span>Scenario ID</span>
        <span>Portfolio</span>
        <span>Region</span>
        <span>Status</span>
        <span>Created</span>
      </div>
      {/* Rows */}
      {scenarios.map((s) => (
        <Link key={s._id} href={`/scenarios/${s._id}`}>
          <div
            className={css`
              display: grid;
              grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
              gap: 12px;
              padding: 14px 20px;
              background: ${bgColor};
              border-top: 1px solid ${borderColor};
              cursor: pointer;
              transition: background 0.15s;
              &:hover {
                background: ${hoverBg};
              }
            `}
          >
            <Body
              className={css`
                color: ${palette.green.base} !important;
                font-family: monospace !important;
                font-size: 13px !important;
              `}
            >
              {s._id.slice(0, 16)}...
            </Body>
            <Body className={css`color: ${darkMode ? palette.gray.light1 : palette.gray.dark1} !important; font-size: 13px !important;`}>
              {s.portfolio_id}
            </Body>
            <Body className={css`color: ${darkMode ? palette.gray.light1 : palette.gray.dark1} !important; font-size: 13px !important;`}>
              {s.region}
            </Body>
            <div>
              <Badge variant={s.status === 'created' ? 'blue' : 'lightgray'}>
                {s.status}
              </Badge>
            </div>
            <Body className={css`color: ${darkMode ? palette.gray.light1 : palette.gray.dark1} !important; font-size: 13px !important;`}>
              {new Date(s.createdAt).toLocaleDateString()}
            </Body>
          </div>
        </Link>
      ))}
    </div>
  );
}
