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
