'use client';

import { Suspense, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { css } from '@emotion/css';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import PageHeader from '@/components/shared/PageHeader';
import ChatContainer from '@/components/copilot/ChatContainer';
import ChatInput from '@/components/copilot/ChatInput';
import SuggestedPrompts from '@/components/copilot/SuggestedPrompts';
import LoadingState from '@/components/shared/LoadingState';
import { suggestedPrompts, demoChatMessages } from '@/lib/mock-data';
import type { ChatMessage } from '@/lib/types';

function CopilotContent() {
  const { darkMode } = useDarkMode();
  const searchParams = useSearchParams();
  const isDemo = searchParams?.get('demo') === 'true';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  // Pre-seed with demo messages if coming from "Ask Copilot why"
  useEffect(() => {
    if (isDemo && messages.length === 0) {
      setMessages(demoChatMessages);
    }
  }, [isDemo]);

  const sendMessage = useCallback((content: string) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    // Check if this matches a demo prompt and use the pre-seeded response
    const matchingDemo = demoChatMessages.find(
      (m) => m.role === 'user' && content.includes(m.content.slice(0, 30))
    );

    setTimeout(() => {
      if (matchingDemo) {
        const response = demoChatMessages.find((m) => m.role === 'assistant');
        if (response) {
          setMessages((prev) => [...prev, { ...response, id: `msg-${Date.now()}-resp` }]);
          setIsTyping(false);
          return;
        }
      }

      // Generic response for non-demo prompts
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-resp`,
        role: 'assistant',
        content: `I've analyzed your question about: "${content.slice(0, 80)}..."

Based on the current portfolio data and market conditions, here are the key insights:

- **Portfolio Performance**: Your portfolio shows a net P&L of EUR 1,247,830 with 14 active positions across power, gas, carbon, and renewable instruments.
- **Market Conditions**: European wholesale prices are trending upward, with TTF gas at EUR 34.8/MWh and EUA carbon credits approaching EUR 72/tCO2.
- **Recommendation**: Consider running a tariff scenario comparison in the Scenario Builder to quantify potential savings from dynamic pricing strategies.

*This is a demo response. In production, this would be powered by MongoDB Atlas Vector Search + Claude.*`,
        timestamp: new Date().toISOString(),
        sources: [
          { title: 'European Power Market Outlook Q2 2026', type: 'Research', snippet: 'Wholesale prices expected to rise 8-12% in Q2...' },
        ],
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsTyping(false);
    }, 1500);
  }, []);

  const handlePromptSelect = useCallback((prompt: string) => {
    sendMessage(prompt);
  }, [sendMessage]);

  return (
    <div
      className={css`
        display: flex;
        flex-direction: column;
        height: calc(100vh - 64px);
      `}
    >
      <PageHeader
        title="Copilot"
        subtitle="AI-powered energy market intelligence assistant"
      />

      {messages.length === 0 ? (
        <SuggestedPrompts prompts={suggestedPrompts} onSelect={handlePromptSelect} />
      ) : (
        <ChatContainer messages={messages} />
      )}

      {isTyping && (
        <div
          className={css`
            padding: 8px 0;
            color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
            font-size: 13px;
            font-style: italic;
          `}
        >
          Copilot is thinking...
        </div>
      )}

      <ChatInput onSend={sendMessage} disabled={isTyping} />
    </div>
  );
}

export default function CopilotPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CopilotContent />
    </Suspense>
  );
}
