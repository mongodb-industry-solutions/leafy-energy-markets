'use client';

import { useRef, useEffect } from 'react';
import { css } from '@emotion/css';
import ChatMessage from './ChatMessage';
import type { ChatMessage as ChatMessageType } from '@/lib/types';

interface ChatContainerProps {
  messages: ChatMessageType[];
}

export default function ChatContainer({ messages }: ChatContainerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div
      className={css`
        flex: 1;
        overflow-y: auto;
        padding: 24px 0;
        display: flex;
        flex-direction: column;
        gap: 20px;
      `}
    >
      {messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
