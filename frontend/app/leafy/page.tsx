'use client';

import { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { css } from '@emotion/css';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import PageHeader from '@/components/shared/PageHeader';
import ChatContainer from '@/components/leafy/ChatContainer';
import ChatInput from '@/components/leafy/ChatInput';
import SuggestedPrompts from '@/components/leafy/SuggestedPrompts';
import AgenticStepIndicator from '@/components/leafy/AgenticStepIndicator';
import LoadingState from '@/components/shared/LoadingState';
import { suggestedPrompts, demoChatMessages, agenticResponseMessage } from '@/lib/mock-data';
import { agenticSteps } from '@/lib/vessel-data';
import type { ChatMessage, AgenticStep } from '@/lib/types';

const VesselTrackingMap = dynamic(
  () => import('@/components/leafy/VesselTrackingMap'),
  { ssr: false }
);

const TANKER_PROMPT_KEYWORD = 'Venezuelan crude';

function LeafyContent() {
  const { darkMode } = useDarkMode();
  const searchParams = useSearchParams();
  const isDemo = searchParams?.get('demo') === 'true';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [activeAgenticSteps, setActiveAgenticSteps] = useState<AgenticStep[] | null>(null);
  const agenticTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Pre-seed with demo messages if coming from "Ask Leafy why"
  useEffect(() => {
    if (isDemo && messages.length === 0) {
      setMessages(demoChatMessages);
    }
  }, [isDemo]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      agenticTimeouts.current.forEach(clearTimeout);
    };
  }, []);

  const runAgenticFlow = useCallback((userContent: string) => {
    // Add user message
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userContent,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    // Initialize steps as pending
    const steps = agenticSteps.map((s) => ({ ...s, status: 'pending' as const }));
    setActiveAgenticSteps(steps);

    // Run steps sequentially with timeouts
    let cumulativeDelay = 300;
    agenticSteps.forEach((step, i) => {
      // Set step to running
      const startTimeout = setTimeout(() => {
        setActiveAgenticSteps((prev) =>
          prev
            ? prev.map((s, idx) =>
                idx === i ? { ...s, status: 'running' } : idx < i ? { ...s, status: 'completed' } : s
              )
            : null
        );
      }, cumulativeDelay);
      agenticTimeouts.current.push(startTimeout);

      cumulativeDelay += step.durationMs;

      // Set step to completed
      const endTimeout = setTimeout(() => {
        setActiveAgenticSteps((prev) =>
          prev ? prev.map((s, idx) => (idx <= i ? { ...s, status: 'completed' } : s)) : null
        );
      }, cumulativeDelay);
      agenticTimeouts.current.push(endTimeout);
    });

    // After all steps, append response
    const finalTimeout = setTimeout(() => {
      setActiveAgenticSteps(null);
      setMessages((prev) => [
        ...prev,
        { ...agenticResponseMessage, id: `msg-${Date.now()}-agentic` },
      ]);
      setIsTyping(false);
    }, cumulativeDelay + 400);
    agenticTimeouts.current.push(finalTimeout);
  }, []);

  const sendMessage = useCallback((content: string) => {
    // Check if this is the tanker supply forecast prompt
    if (content.includes(TANKER_PROMPT_KEYWORD)) {
      runAgenticFlow(content);
      return;
    }

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
  }, [runAgenticFlow]);

  const handlePromptSelect = useCallback((prompt: string) => {
    sendMessage(prompt);
  }, [sendMessage]);

  return (
    <div
      className={css`
        display: flex;
        flex-direction: column;
        min-height: calc(100vh - 64px);
        overflow-y: auto;
      `}
    >
      <PageHeader
        title="Leafy"
        subtitle="AI-powered energy market intelligence assistant"
      />

      {/* Map section — flows naturally in the scroll */}
      <div className={css`padding: 0 0 4px 0;`}>
        <VesselTrackingMap />
      </div>

      {/* Chat section — takes its natural height */}
      <div
        className={css`
          padding-bottom: 16px;
        `}
      >
        {messages.length === 0 ? (
          <SuggestedPrompts prompts={suggestedPrompts} onSelect={handlePromptSelect} />
        ) : (
          <ChatContainer messages={messages} />
        )}

        {activeAgenticSteps && (
          <AgenticStepIndicator steps={activeAgenticSteps} />
        )}

        {isTyping && !activeAgenticSteps && (
          <div
            className={css`
              padding: 8px 0;
              color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
              font-size: 13px;
              font-style: italic;
            `}
          >
            Leafy is thinking...
          </div>
        )}
      </div>

      {/* ChatInput at bottom within scroll flow */}
      <div className={css`margin-top: auto;`}>
        <ChatInput onSend={sendMessage} disabled={isTyping} />
      </div>
    </div>
  );
}

export default function LeafyPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <LeafyContent />
    </Suspense>
  );
}
