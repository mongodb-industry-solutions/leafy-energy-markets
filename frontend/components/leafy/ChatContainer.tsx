'use client';

import { useRef, useEffect } from 'react';
import { css } from '@emotion/css';
import ChatMessage from './ChatMessage';
import type { ChatMessage as ChatMessageType } from '@/lib/types';

interface ChatContainerProps {
  messages: ChatMessageType[];
  streamingId?: string | null;
  onStreamComplete?: () => void;
}

export default function ChatContainer({ messages, streamingId, onStreamComplete }: ChatContainerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Also scroll during streaming
  useEffect(() => {
    if (!streamingId) return;
    const interval = setInterval(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 200);
    return () => clearInterval(interval);
  }, [streamingId]);

  return (
    <div
      className={css`
        flex: 1;
        overflow-y: auto;
        padding: 16px 0;
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 100%;
      `}
    >
      {messages.map((msg) => (
        <ChatMessage
          key={msg.id}
          message={msg}
          streaming={msg.id === streamingId}
          onStreamComplete={onStreamComplete}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
