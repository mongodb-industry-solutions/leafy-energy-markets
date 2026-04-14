'use client';

import React, { useMemo } from 'react';
import { css } from '@emotion/css';
import { palette } from '@leafygreen-ui/palette';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import {
  renderSourceRef,
  renderPriceCard,
  renderPositionCard,
  renderRiskAlert,
} from '@/lib/elements-ui';
import { useDarkMode } from '@/components/Providers';

// Match @element_name{...json...} — handles one level of nested braces
const MARKER_RE = /@([\w]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g;

/**
 * Normalise markdown so Streamdown renders headings and code blocks correctly.
 *
 * Fixes applied:
 *  1. Headings — LLMs sometimes emit "text### Heading" without a blank line.
 *     Most parsers require ≥1 blank line before a heading.
 *  2. Loose language labels — LLMs sometimes write "json\n```\n..." instead of
 *     "```json\n...". We collapse them so the language label is part of the fence.
 */
function normalizeMarkdown(text: string): string {
  let result = text;
  // 1. Ensure headings have a blank line before them
  result = result.replace(/([^\n])\n?(#{1,6} )/g, '$1\n\n$2');
  // 2. Collapse "word\n```\n" → "```word\n" (loose language label before code fence)
  result = result.replace(/\n(\w+)\n```\n/g, '\n```$1\n');
  return result;
}

type Segment =
  | { type: 'text'; content: string }
  | { type: 'element'; name: string; data: Record<string, unknown> };

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKER_RE.exec(text)) !== null) {
    const before = text.slice(last, match.index);
    if (before) segments.push({ type: 'text', content: before });
    try {
      const data = JSON.parse('{' + match[2] + '}');
      segments.push({ type: 'element', name: match[1], data });
    } catch {
      // Invalid JSON in marker — treat whole marker as plain text
      segments.push({ type: 'text', content: match[0] });
    }
    last = match.index + match[0].length;
  }
  const trailing = text.slice(last);
  if (trailing) segments.push({ type: 'text', content: trailing });
  return segments;
}

interface MarkdownMessageProps {
  text: string;
  isAnimating?: boolean;
}

export default function MarkdownMessage({ text, isAnimating }: MarkdownMessageProps) {
  const { darkMode } = useDarkMode();

  const markdownWrapperClass = css`
    h3 {
      border-left: 3px solid ${palette.green.base};
      padding-left: 8px;
      margin: 16px 0 8px;
      font-size: 13px;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    ol > li {
      margin-bottom: 12px;
      padding-left: 4px;
    }
    strong {
      color: ${darkMode ? palette.green.light1 : palette.green.dark1};
    }
  `;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderElement(name: string, data: Record<string, unknown>): React.ReactNode {
    try {
      switch (name) {
        case 'source_ref':    return renderSourceRef(data as any);
        case 'price_card':    return renderPriceCard(data as any);
        case 'position_card': return renderPositionCard(data as any, darkMode);
        case 'risk_alert':    return renderRiskAlert(data as any);
        default:              return null;
      }
    } catch {
      return null;
    }
  }

  const normalized = useMemo(() => normalizeMarkdown(text), [text]);
  const segments = useMemo(() => parseSegments(normalized), [normalized]);

  // Fast path: no custom elements → render all markdown at once
  if (segments.length === 1 && segments[0].type === 'text') {
    return (
      <div className={markdownWrapperClass}>
        <Streamdown isAnimating={isAnimating}>{normalized}</Streamdown>
      </div>
    );
  }

  return (
    <div className={markdownWrapperClass}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return (
            <Streamdown key={i} isAnimating={isAnimating && i === segments.length - 1}>
              {seg.content}
            </Streamdown>
          );
        }
        const el = renderElement(seg.name, seg.data);
        if (!el) return null;
        return (
          <span
            key={i}
            className={css`
              display: block;
              margin: 6px 0;
            `}
          >
            {el}
          </span>
        );
      })}
    </div>
  );
}
