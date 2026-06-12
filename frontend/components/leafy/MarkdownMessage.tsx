'use client';

import { useMemo } from 'react';
import { css } from '@emotion/css';
import { palette } from '@leafygreen-ui/palette';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDarkMode } from '@/components/Providers';

// Strip all @element_name{...} inline markers — no chips, plain text only
const MARKER_RE = /@[\w]+\{(?:[^{}]|\{[^{}]*\})*\}/g;

function normalizeMarkdown(text: string): string {
  let result = text.replace(MARKER_RE, '');
  // Ensure headings have a blank line before them
  result = result.replace(/([^\n])\n?(#{1,6} )/g, '$1\n\n$2');
  // Collapse loose language labels before code fences
  result = result.replace(/\n(\w+)\n```\n/g, '\n```$1\n');
  // Remove blank lines between table rows (LLM often inserts them, breaking GFM)
  result = result.replace(/(\|[^\n]*)\n\n(\|)/g, '$1\n$2');
  result = result.replace(/(\|[^\n]*)\n\n(\|)/g, '$1\n$2');
  // Ensure a blank line before the first table row so the block is recognised
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
    p {
      margin: 6px 0;
      line-height: 1.6;
    }
    ul {
      padding-left: 20px;
    }
    li {
      margin-bottom: 4px;
    }
    code {
      background: ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 12px;
    }
    pre {
      background: ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'};
      padding: 10px 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 8px 0;
    }
    pre code {
      background: none;
      padding: 0;
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
    /* Typing cursor during streaming */
    ${isAnimating ? `
      &::after {
        content: '▋';
        display: inline-block;
        opacity: 1;
        animation: blink-cursor 0.7s step-start infinite;
        color: ${palette.green.base};
        font-size: 13px;
        margin-left: 2px;
      }
      @keyframes blink-cursor {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }
    ` : ''}
  `;

  const normalized = useMemo(() => normalizeMarkdown(text), [text]);

  return (
    <div className={wrapperClass}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
