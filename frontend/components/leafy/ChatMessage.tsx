'use client';

import { useState, useEffect, useRef } from 'react';
import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Icon from '@leafygreen-ui/icon';
import { Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import SourceCitation from './SourceCitation';
import MarkdownMessage from './MarkdownMessage';
import type { ChatMessage as ChatMessageType } from '@/lib/types';

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

            /* Streamdown overrides for our theme */
            .streamdown, [data-streamdown] {
              font-size: 13px;
              line-height: 1.5;
              color: inherit;
            }

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

            h1, h2, h3 {
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

            pre {
              margin: 4px 0;
              border-radius: 6px;
              overflow-x: auto;
            }

            pre code {
              display: block;
              padding: 8px 12px;
              background: ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
            }
          `}
        >
          {isUser ? (
            <span>{displayedContent}</span>
          ) : (
            <MarkdownMessage text={displayedContent} isAnimating={isStreaming} />
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
