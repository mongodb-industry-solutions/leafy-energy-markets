'use client';

import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Icon from '@leafygreen-ui/icon';
import { Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import SourceCitation from './SourceCitation';
import type { ChatMessage as ChatMessageType } from '@/lib/types';

interface ChatMessageProps {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const { darkMode } = useDarkMode();
  const isUser = message.role === 'user';

  return (
    <div
      className={css`
        display: flex;
        gap: 12px;
        align-items: flex-start;
        max-width: 85%;
        ${isUser ? 'margin-left: auto; flex-direction: row-reverse;' : ''}
      `}
    >
      {/* Avatar */}
      <div
        className={css`
          width: 32px;
          height: 32px;
          min-width: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: ${isUser
            ? darkMode ? palette.blue.dark2 : palette.blue.light3
            : darkMode ? palette.green.dark3 : palette.green.light3};
        `}
      >
        <Icon
          glyph={isUser ? 'Person' : 'Sparkle'}
          size={16}
          fill={isUser ? palette.blue.base : palette.green.base}
        />
      </div>

      {/* Message bubble */}
      <Card
        darkMode={darkMode}
        className={css`
          padding: 16px;
          ${isUser
            ? `background: ${darkMode ? palette.blue.dark3 : palette.blue.light3} !important;`
            : ''}
        `}
      >
        <div
          className={css`
            color: ${darkMode ? palette.gray.light2 : palette.gray.dark2};
            font-size: 14px;
            line-height: 1.65;
            white-space: pre-wrap;

            strong {
              color: ${darkMode ? palette.white : palette.black};
            }

            h3 {
              color: ${darkMode ? palette.white : palette.black};
              font-size: 15px;
              font-weight: 600;
              margin: 16px 0 8px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin: 12px 0;
              font-size: 13px;
            }

            th, td {
              padding: 6px 12px;
              text-align: left;
              border-bottom: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
            }

            th {
              font-weight: 600;
              color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
            }

            ul, ol {
              padding-left: 20px;
              margin: 8px 0;
            }

            li {
              margin-bottom: 4px;
            }

            code {
              background: ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 13px;
            }
          `}
          dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }}
        />

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <div
            className={css`
              display: flex;
              gap: 8px;
              flex-wrap: wrap;
              margin-top: 12px;
              padding-top: 12px;
              border-top: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
            `}
          >
            <Body
              className={css`
                font-size: 12px !important;
                color: ${darkMode ? palette.gray.light1 : palette.gray.dark1} !important;
                margin-right: 4px !important;
              `}
            >
              Sources:
            </Body>
            {message.sources.map((src, i) => (
              <SourceCitation key={i} source={src} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/** Simple markdown-to-HTML for demo (handles bold, headers, tables, lists) */
function formatMarkdown(text: string): string {
  let html = text
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Tables
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split('|').filter(Boolean).map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) return ''; // separator row
      const tag = 'td';
      return '<tr>' + cells.map((c) => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
    })
    // Wrap consecutive tr in table
    .replace(/((<tr>.*<\/tr>\n?)+)/g, '<table>$1</table>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/((<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    // Line breaks
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');

  return html;
}
