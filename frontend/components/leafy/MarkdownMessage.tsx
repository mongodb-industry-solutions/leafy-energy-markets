'use client';

import { useMemo } from 'react';
import { css } from '@emotion/css';
import { palette } from '@leafygreen-ui/palette';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import { useDarkMode } from '@/components/Providers';

// Strip all @element_name{...} inline markers — no chips, plain text only
const MARKER_RE = /@[\w]+\{(?:[^{}]|\{[^{}]*\})*\}/g;

function normalizeMarkdown(text: string): string {
  let result = text.replace(MARKER_RE, '');
  // Ensure headings have a blank line before them
  result = result.replace(/([^\n])\n?(#{1,6} )/g, '$1\n\n$2');
  // Collapse loose language labels before code fences
  result = result.replace(/\n(\w+)\n```\n/g, '\n```$1\n');
  // Ensure blank line before table rows so the parser recognises them as tables
  result = result.replace(/([^\n])\n(\|)/g, '$1\n\n$2');
  return result;
}

interface MarkdownMessageProps {
  text: string;
  isAnimating?: boolean;
}

export default function MarkdownMessage({ text, isAnimating }: MarkdownMessageProps) {
  const { darkMode } = useDarkMode();

  const wrapperClass = css`
    h3 {
      border-left: 3px solid ${palette.green.base};
      padding-left: 8px;
      margin: 16px 0 8px;
      font-size: 13px;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    ol > li {
      margin-bottom: 10px;
      padding-left: 4px;
    }
    strong {
      color: ${darkMode ? palette.green.light1 : palette.green.dark1};
    }
    /* Tables */
    table {
      display: block;
      overflow-x: auto;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 12px;
      width: max-content;
      max-width: 100%;
    }
    th, td {
      padding: 6px 12px;
      text-align: left;
      border: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
      white-space: nowrap;
    }
    th {
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      background: ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'};
      color: ${darkMode ? palette.white : palette.black};
    }
    tr:nth-child(even) td {
      background: ${darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'};
    }
    /* Remove any residual table toolbar icons */
    [data-streamdown-table-toolbar],
    [data-streamdown-code-toolbar] {
      display: none !important;
    }
  `;

  const normalized = useMemo(() => normalizeMarkdown(text), [text]);

  return (
    <div className={wrapperClass}>
      <Streamdown
        isAnimating={isAnimating}
        controls={false}
      >
        {normalized}
      </Streamdown>
    </div>
  );
}
