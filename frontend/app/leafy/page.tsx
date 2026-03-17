'use client';

import { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { css } from '@emotion/css';
import { palette } from '@leafygreen-ui/palette';
import Badge from '@leafygreen-ui/badge';
import Button from '@leafygreen-ui/button';
import Icon from '@leafygreen-ui/icon';
import { Body } from '@leafygreen-ui/typography';
import { useDarkMode } from '@/components/Providers';
import PageHeader from '@/components/shared/PageHeader';
import ChatContainer from '@/components/leafy/ChatContainer';
import ChatInput from '@/components/leafy/ChatInput';
import SuggestedPrompts from '@/components/leafy/SuggestedPrompts';
import AgenticStepIndicator from '@/components/leafy/AgenticStepIndicator';
import LoadingState from '@/components/shared/LoadingState';
import {
  suggestedPrompts,
  demoChatMessages,
  agenticResponseMessage,
  searchDocuments as mockSearchDocs,
} from '@/lib/mock-data';
import { agenticSteps } from '@/lib/vessel-data';
import { searchMarketIntelligence, chatWithLeafy, chatWithAdvisor } from '@/lib/api';
import { useLiveFeed } from '@/lib/live-feed-context';
import { useGenerator } from '@/lib/generator-context';
import { useDisruption, DISRUPTION_SCENARIOS } from '@/lib/disruption-context';
import { positions as mockPositions } from '@/lib/mock-data';
import type { ChatMessage, AgenticStep, DocumentType } from '@/lib/types';

const VesselTrackingMap = dynamic(
  () => import('@/components/leafy/VesselTrackingMap'),
  { ssr: false }
);

const TANKER_PROMPT_KEYWORD = 'Venezuelan crude';

function isSearchQuery(text: string): boolean {
  const words = text.trim().split(/\s+/);
  return words.length <= 6 && !text.includes('?');
}

function formatSearchResults(docs: { title: string; snippet: string; type: string; source: string; date: string; score: number }[]): string {
  if (docs.length === 0) return 'No results found for your query.';
  const lines = docs.map((d, i) =>
    `### ${i + 1}. ${d.title}\n**${d.type}** · ${d.source} · ${d.date}\n\n${d.snippet}\n\n*Relevance: ${(d.score * 100).toFixed(0)}%*`
  );
  return `Found **${docs.length} documents** matching your query:\n\n${lines.join('\n\n---\n\n')}\n\n*Results powered by MongoDB Atlas Vector Search + VoyageAI voyage-finance-2 embeddings.*`;
}

function LeafyContent() {
  const { darkMode } = useDarkMode();
  const searchParams = useSearchParams();
  const isDemo = searchParams?.get('demo') === 'true';
  const liveFeed = useLiveFeed();
  const gen = useGenerator();
  const disruption = useDisruption();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [activeAgenticSteps, setActiveAgenticSteps] = useState<AgenticStep[] | null>(null);
  const agenticTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const disruptionTriggeredRef = useRef(false);

  useEffect(() => {
    if (isDemo && messages.length === 0) {
      setMessages(demoChatMessages);
    }
  }, [isDemo]);

  useEffect(() => {
    return () => {
      agenticTimeouts.current.forEach(clearTimeout);
    };
  }, []);

  // Auto-send disruption analysis message when triggered
  useEffect(() => {
    if (disruption.active && disruption.disruption && !disruptionTriggeredRef.current) {
      disruptionTriggeredRef.current = true;
      const systemMsg: ChatMessage = {
        id: `msg-${Date.now()}-disruption`,
        role: 'assistant',
        content: `**DISRUPTION ALERT: ${disruption.disruption.name}**\n\n${disruption.disruption.description}\n\n**Estimated impact on your portfolio:**\n- Oil prices: +${disruption.disruption.oilPriceImpactPercent}% (supply disruption)\n- Power prices: +${disruption.disruption.powerPriceImpactPercent}% (fuel cost pass-through)\n- Gas prices: +${disruption.disruption.gasPriceImpactPercent}% (Gulf Coast LNG terminal shutdowns)\n\n**Recommendation:** Review GAS and POWER positions immediately. Consider hedging with short-term futures to lock in current rates before spot prices adjust. Venezuelan crude shipments (${vessels()} currently in transit) are delayed indefinitely.\n\n*Ask me about specific impacts on your positions or for detailed supply chain analysis.*`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, systemMsg]);
    }
    if (!disruption.active) {
      disruptionTriggeredRef.current = false;
    }
  }, [disruption.active, disruption.disruption]);

  const runAgenticFlow = useCallback((userContent: string) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userContent,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    const steps = agenticSteps.map((s) => ({ ...s, status: 'pending' as const }));
    setActiveAgenticSteps(steps);

    let cumulativeDelay = 300;
    agenticSteps.forEach((step, i) => {
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

      const endTimeout = setTimeout(() => {
        setActiveAgenticSteps((prev) =>
          prev ? prev.map((s, idx) => (idx <= i ? { ...s, status: 'completed' } : s)) : null
        );
      }, cumulativeDelay);
      agenticTimeouts.current.push(endTimeout);
    });

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

  const sendMessage = useCallback(async (content: string) => {
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

    const currentPositions = liveFeed.active && liveFeed.positions ? liveFeed.positions : mockPositions;
    const generatorSummaries = gen.substations
      .filter((s) => s.status === 'online')
      .map((s) => ({
        id: s.id,
        name: s.name,
        region: s.region,
        fuel: s.fuel,
        capacity_mw: s.capacity_mw,
        status: s.status,
      }));

    const chatHistory = messages
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      try {
        const advisorResp = await chatWithAdvisor(
          content,
          currentPositions,
          generatorSummaries,
          chatHistory,
        );
        if (advisorResp.response) {
          const toolsUsed = advisorResp.tool_calls.length > 0
            ? `\n\n*Tools used: ${advisorResp.tool_calls.join(', ')}*`
            : '';
          const assistantMsg: ChatMessage = {
            id: `msg-${Date.now()}-advisor`,
            role: 'assistant',
            content: advisorResp.response + toolsUsed,
            timestamp: new Date().toISOString(),
            sources: advisorResp.sources.map((s) => ({
              title: s.title,
              type: s.type as DocumentType,
              snippet: s.snippet,
            })),
          };
          setMessages((prev) => [...prev, assistantMsg]);
          setIsTyping(false);
          return;
        }
      } catch {
        // Fall through to search/chat
      }

      if (isSearchQuery(content)) {
        const results = await searchMarketIntelligence(content);
        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now()}-search`,
          role: 'assistant',
          content: formatSearchResults(results),
          timestamp: new Date().toISOString(),
          sources: results.map((r) => ({
            title: r.title,
            type: r.type as DocumentType,
            snippet: r.snippet,
          })),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        const resp = await chatWithLeafy(content);
        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now()}-chat`,
          role: 'assistant',
          content: resp.response,
          timestamp: new Date().toISOString(),
          sources: resp.sources.map((s) => ({
            title: s.title,
            type: s.type as DocumentType,
            snippet: s.snippet,
          })),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch {
      const matchingDemo = demoChatMessages.find(
        (m) => m.role === 'user' && content.includes(m.content.slice(0, 30))
      );

      if (matchingDemo) {
        const response = demoChatMessages.find((m) => m.role === 'assistant');
        if (response) {
          setMessages((prev) => [...prev, { ...response, id: `msg-${Date.now()}-resp` }]);
          setIsTyping(false);
          return;
        }
      }

      const q = content.toLowerCase();
      const mockResults = mockSearchDocs.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.snippet.toLowerCase().includes(q) ||
          d.source.toLowerCase().includes(q)
      );

      if (mockResults.length > 0) {
        const formatted = formatSearchResults(
          mockResults.map((d) => ({ ...d, doc_id: d.id, score: d.relevanceScore }))
        );
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-mock`,
            role: 'assistant',
            content: formatted + '\n\n*Note: Using cached results — connect backend for live vector search.*',
            timestamp: new Date().toISOString(),
            sources: mockResults.map((d) => ({
              title: d.title,
              type: d.type,
              snippet: d.snippet,
            })),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-fallback`,
            role: 'assistant',
            content: `I've analyzed your question about: "${content.slice(0, 80)}..."

Based on the current portfolio data and market conditions, here are the key insights:

- **Portfolio Performance**: Your portfolio shows a net P&L of EUR 1,247,830 with 14 active positions across power, gas, carbon, and renewable instruments.
- **Market Conditions**: European wholesale prices are trending upward, with TTF gas at EUR 34.8/MWh and EUA carbon credits approaching EUR 72/tCO2.
- **Recommendation**: Consider reviewing your positions in the Dashboard for potential optimization opportunities.

*Connect the backend for live AI-powered responses with MongoDB Atlas Vector Search + VoyageAI voyage-finance-2.*`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setIsTyping(false);
    }
  }, [runAgenticFlow, liveFeed, gen.substations, messages]);

  const handlePromptSelect = useCallback(
    (prompt: string) => {
      sendMessage(prompt);
    },
    [sendMessage]
  );

  const handleTriggerDisruption = useCallback((id: string) => {
    disruption.triggerDisruption(id);
  }, [disruption]);

  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const mutedColor = darkMode ? palette.gray.light1 : palette.gray.dark1;

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
        title="EnerLeafy AI"
        subtitle="AI-powered energy market intelligence — search, chat, vessel tracking, and disruption analysis"
        action={
          <div className={css`display: flex; gap: 8px; align-items: center;`}>
            <Badge variant="green">Vector Search</Badge>
            <Badge variant="blue">voyage-finance-2</Badge>
            {!disruption.active ? (
              <Button
                variant="danger"
                size="small"
                darkMode={darkMode}
                leftGlyph={<Icon glyph="Warning" />}
                onClick={() => handleTriggerDisruption(DISRUPTION_SCENARIOS[0].id)}
              >
                Trigger Disruption
              </Button>
            ) : (
              <Button
                variant="default"
                size="small"
                darkMode={darkMode}
                onClick={() => disruption.clearDisruption()}
              >
                Clear Disruption
              </Button>
            )}
          </div>
        }
      />

      {/* Map section */}
      <div className={css`padding: 0 0 4px 0;`}>
        <VesselTrackingMap />
      </div>

      {/* Chat section */}
      <div className={css`padding-bottom: 16px;`}>
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
              color: ${mutedColor};
              font-size: 13px;
              font-style: italic;
            `}
          >
            EnerLeafy is searching & thinking...
          </div>
        )}
      </div>

      {/* ChatInput at bottom */}
      <div className={css`margin-top: auto;`}>
        <ChatInput onSend={sendMessage} disabled={isTyping} placeholder="Search documents or ask a question..." />
      </div>

      {/* Model & Data Disclaimers */}
      <div
        className={css`
          margin-top: 16px;
          padding: 12px 16px;
          border-top: 1px solid ${borderColor};
          display: flex;
          flex-direction: column;
          gap: 8px;
        `}
      >
        <Body
          className={css`
            color: ${mutedColor} !important;
            font-size: 11px !important;
            line-height: 1.5 !important;
          `}
        >
          <strong>Models:</strong> Embeddings powered by <a href="https://docs.voyageai.com/docs/embeddings" target="_blank" rel="noopener noreferrer" className={css`color: ${palette.blue.base};`}>VoyageAI voyage-finance-2</a> (domain-specific finance embeddings, 1024 dimensions).
          LLM agent powered by Claude on Azure AI Foundry via <a href="https://python.langchain.com/" target="_blank" rel="noopener noreferrer" className={css`color: ${palette.blue.base};`}>LangChain</a>.
          Vector search via MongoDB Atlas.
        </Body>
        <Body
          className={css`
            color: ${mutedColor} !important;
            font-size: 11px !important;
            line-height: 1.5 !important;
          `}
        >
          <strong>IEA/IRENA Data Disclaimer:</strong> This platform uses data from the IEA/IRENA Policies and Measures Database (PAMS).
          The IEA data is subject to the <a href="https://www.iea.org/terms/terms-of-use-for-the-policies-and-measures-databases-pams" target="_blank" rel="noopener noreferrer" className={css`color: ${palette.blue.base};`}>IEA Terms of Use for PAMS databases</a>.
          The IEA is not responsible for any analysis, interpretation, or conclusions derived from the data.
          Data sourced from IEA/IRENA joint database, filtered for EU/EEA in-force energy policies.
        </Body>
      </div>
    </div>
  );
}

function vessels(): string {
  return '5 tankers';
}

export default function LeafyPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <LeafyContent />
    </Suspense>
  );
}
