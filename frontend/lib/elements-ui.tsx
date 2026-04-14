'use client';

import React from 'react';
import { css, keyframes } from '@emotion/css';
import { palette } from '@leafygreen-ui/palette';
import {
  sourceRefSchema,
  priceCardSchema,
  positionCardSchema,
  riskAlertSchema,
} from './elements';
import type { z } from 'zod';

const shimmer = keyframes`
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
`;

const loadingStyle = css`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  color: ${palette.gray.dark1};
  background: linear-gradient(90deg, ${palette.gray.light3} 25%, ${palette.gray.light2} 50%, ${palette.gray.light3} 75%);
  background-size: 400px 100%;
  animation: ${shimmer} 1.5s infinite;
`;

// ── Source Reference ────────────────────────────────────────

const typeBadgeColor: Record<string, string> = {
  Research: palette.blue.base,
  ESG: palette.green.base,
  Asset: palette.yellow.dark2,
  Maritime: palette.red.base,
  Policy: palette.purple.base,
};

export function renderSourceRef(data: z.infer<typeof sourceRefSchema>): React.ReactNode {
  const color = typeBadgeColor[data.type] || palette.gray.dark1;
  const icon =
    data.type === 'Policy' ? '📜'
    : data.type === 'Research' ? '📊'
    : data.type === 'ESG' ? '🌱'
    : '📄';
  return (
    <span
      className={css`
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        background: ${color}14;
        color: ${color};
        border: 1px solid ${color}30;
        cursor: default;
        vertical-align: middle;
      `}
      title={data.snippet}
    >
      <span className={css`font-size: 9px; opacity: 0.7;`}>{icon}</span>
      {data.title.length > 45 ? data.title.slice(0, 45) + '…' : data.title}
    </span>
  );
}

// ── Price Card ──────────────────────────────────────────────

export function renderPriceCard(data: z.infer<typeof priceCardSchema>): React.ReactNode {
  const isPositive = data.change >= 0;
  const changeColor = isPositive ? palette.green.base : palette.red.base;
  const changeBg = isPositive ? palette.green.light3 : palette.red.light3;
  return (
    <span
      className={css`
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px 10px;
        border-radius: 6px;
        background: ${changeBg};
        border: 1px solid ${changeColor}30;
        font-size: 12px;
        vertical-align: middle;
      `}
    >
      <span className={css`font-weight: 600; color: ${palette.gray.dark3};`}>
        {data.instrument}
      </span>
      <span className={css`font-weight: 700; font-family: 'Source Code Pro', monospace; color: ${palette.gray.dark3};`}>
        {data.price.toFixed(2)} {data.unit || 'EUR'}
      </span>
      <span className={css`font-weight: 600; font-family: 'Source Code Pro', monospace; color: ${changeColor};`}>
        {isPositive ? '▲' : '▼'} {Math.abs(data.change).toFixed(1)}%
      </span>
    </span>
  );
}

// ── Position Card ───────────────────────────────────────────

export function renderPositionCard(data: z.infer<typeof positionCardSchema>, darkMode: boolean = false): React.ReactNode {
  const isProfit = data.pnl >= 0;
  const pnlColor = isProfit ? (darkMode ? palette.green.light2 : palette.green.dark1) : (darkMode ? palette.red.light2 : palette.red.base);
  const textColor = darkMode ? palette.gray.light2 : palette.gray.dark2;
  const mutedColor = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const bg = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
  const border = darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  return (
    <span
      className={css`
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 6px 12px;
        border-radius: 8px;
        background: ${bg};
        border: 1px solid ${border};
        font-size: 12px;
        vertical-align: middle;
      `}
    >
      <span>
        <span className={css`font-weight: 700; color: ${textColor};`}>{data.instrument}</span>
        <span className={css`margin-left: 4px; font-size: 10px; color: ${mutedColor}; text-transform: uppercase;`}>{data.type}</span>
      </span>
      <span className={css`color: ${mutedColor}; font-family: 'Source Code Pro', monospace;`}>
        {data.quantity} @ {data.avgPrice.toFixed(2)} → {data.currentPrice.toFixed(2)}
      </span>
      <span className={css`font-weight: 700; font-family: 'Source Code Pro', monospace; color: ${pnlColor};`}>
        {isProfit ? '+' : ''}{data.pnl.toFixed(0)} EUR
      </span>
    </span>
  );
}

// ── Risk Alert ──────────────────────────────────────────────

const riskColors = {
  high:   { bg: palette.red.light3,    border: palette.red.light2,    text: palette.red.dark2,    icon: '🔴' },
  medium: { bg: palette.yellow.light3, border: palette.yellow.light2, text: palette.yellow.dark2, icon: '🟡' },
  low:    { bg: palette.green.light3,  border: palette.green.light2,  text: palette.green.dark2,  icon: '🟢' },
};

export function renderRiskAlert(data: z.infer<typeof riskAlertSchema>): React.ReactNode {
  const colors = riskColors[data.level] || riskColors.medium;
  return (
    <span
      className={css`
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 6px;
        background: ${colors.bg};
        border: 1px solid ${colors.border};
        font-size: 12px;
        color: ${colors.text};
        font-weight: 600;
        vertical-align: middle;
      `}
    >
      <span>{colors.icon}</span>
      <span>{data.title}</span>
      {data.detail && (
        <span className={css`font-weight: 400; font-size: 11px; opacity: 0.8;`}>— {data.detail}</span>
      )}
    </span>
  );
}

// ── Loading placeholder (used during animation) ─────────────
export { loadingStyle };
