'use client';

import { useState, useEffect, useRef } from 'react';
import { css, keyframes } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Icon from '@leafygreen-ui/icon';
import { Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import SourceCitation from './SourceCitation';
import type { ChatMessage as ChatMessageType } from '@/lib/types';

const cursorBlink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`;

interface ChatMessageProps {
  message: ChatMessageType;
  streaming?: boolean;
  onStreamComplete?: () => void;
}

const WORDS_PER_TICK = 3;
const TICK_MS = 30;

export default function ChatMessage({ message, streaming, onStreamComplete }: ChatMessageProps) {
  const { darkMode } = useDarkMode();
  const isUser = message.role === 'user';
  const [displayedContent, setDisplayedContent] = useState(
    streaming ? '' : message.content
  );
  const wordIndexRef = useRef(0);
  const wordsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!streaming) {
      setDisplayedContent(message.content);
      return;
    }

    // Split into words preserving whitespace structure
    wordsRef.current = message.content.split(/(\s+)/);
    wordIndexRef.current = 0;
    setDisplayedContent('');

    const interval = setInterval(() => {
      wordIndexRef.current += WORDS_PER_TICK;
      const slice = wordsRef.current.slice(0, wordIndexRef.current).join('');
      setDisplayedContent(slice);

      if (wordIndexRef.current >= wordsRef.current.length) {
        clearInterval(interval);
        setDisplayedContent(message.content);
        onStreamComplete?.();
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [streaming, message.content, onStreamComplete]);

  const isStreaming = streaming && displayedContent.length < message.content.length;

  return (
    <div
      className={css`
        display: flex;
        gap: 10px;
        align-items: flex-start;
        max-width: 100%;
        ${isUser ? 'margin-left: auto; flex-direction: row-reverse;' : ''}
      `}
    >
      {/* Avatar */}
      <div
        className={css`
          width: 28px;
          height: 28px;
          min-width: 28px;
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
          size={14}
          fill={isUser ? palette.blue.base : palette.green.base}
        />
      </div>

      {/* Message bubble */}
      <Card
        darkMode={darkMode}
        className={css`
          padding: 12px 16px;
          flex: 1;
          min-width: 0;
          ${isUser
            ? `background: ${darkMode ? palette.blue.dark3 : palette.blue.light3} !important; max-width: 85%;`
            : ''}
        `}
      >
        <div
          className={css`
            color: ${darkMode ? palette.gray.light2 : palette.gray.dark2};
            font-size: 13px;
            line-height: 1.5;
            word-break: break-word;

            p {
              margin: 0 0 6px 0;
              &:last-child { margin-bottom: 0; }
            }

            strong {
              color: ${darkMode ? palette.white : palette.black};
            }

            em {
              color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
            }

            h3 {
              color: ${darkMode ? palette.white : palette.black};
              font-size: 13px;
              font-weight: 700;
              margin: 8px 0 4px;
              padding-bottom: 2px;
              border-bottom: 1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
              &:first-child { margin-top: 0; }
            }

            hr {
              border: none;
              border-top: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
              margin: 6px 0;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin: 4px 0;
              font-size: 12px;
            }

            th, td {
              padding: 3px 8px;
              text-align: left;
              border-bottom: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
            }

            th {
              font-weight: 600;
              color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            }

            ul, ol {
              padding-left: 16px;
              margin: 2px 0 6px;
            }

            li {
              margin-bottom: 2px;
              line-height: 1.4;
            }

            code {
              background: ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'};
              padding: 1px 4px;
              border-radius: 3px;
              font-size: 12px;
              font-family: 'Source Code Pro', monospace;
            }
          `}
        >
          <span dangerouslySetInnerHTML={{ __html: formatMarkdown(displayedContent) }} />
          {isStreaming && (
            <span className={css`
              display: inline-block;
              width: 2px;
              height: 14px;
              background: ${palette.green.base};
              margin-left: 2px;
              vertical-align: text-bottom;
              animation: ${cursorBlink} 0.8s ease-in-out infinite;
            `} />
          )}
        </div>

        {/* Sources — only show when streaming is done */}
        {!isStreaming && message.sources && message.sources.length > 0 && (
          <div
            className={css`
              display: flex;
              gap: 6px;
              flex-wrap: wrap;
              margin-top: 10px;
              padding-top: 10px;
              border-top: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
            `}
          >
            <Body
              className={css`
                font-size: 11px !important;
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

/** Markdown-to-HTML for chat messages */
function formatMarkdown(text: string): string {
  let html = text
    // H3 headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    // H2 headers (##)
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr/>')
    // Tables
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split('|').filter(Boolean).map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) return '';
      const tag = 'td';
      return '<tr>' + cells.map((c) => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
    })
    .replace(/((<tr>.*<\/tr>\s*)+)/g, '<table>$1</table>')
    // Ordered lists
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive li in list
    .replace(/((<li>.*<\/li>\s*)+)/g, '<ul>$1</ul>')
    // Collapse triple+ newlines into double
    .replace(/\n{3,}/g, '\n\n')
    // Paragraphs — double newline
    .replace(/\n\n/g, '</p><p>')
    // Single newline
    .replace(/\n/g, '<br/>');

  // Wrap in paragraph tags
  html = '<p>' + html + '</p>';
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  // Don't nest block elements in p tags
  html = html.replace(/<p>(<h3>)/g, '$1');
  html = html.replace(/(<\/h3>)<\/p>/g, '$1');
  html = html.replace(/<p>(<table>)/g, '$1');
  html = html.replace(/(<\/table>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<hr\/>)/g, '$1');
  html = html.replace(/(<hr\/>)<\/p>/g, '$1');

  return html;
}
