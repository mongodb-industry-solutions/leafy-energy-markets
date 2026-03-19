'use client';

import { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { css, keyframes } from '@emotion/css';
import { palette } from '@leafygreen-ui/palette';
import Badge from '@leafygreen-ui/badge';
import Icon from '@leafygreen-ui/icon';
import { H2, Body } from '@leafygreen-ui/typography';
import { useDarkMode } from '@/components/Providers';
import ChatContainer from '@/components/leafy/ChatContainer';
import ChatInput from '@/components/leafy/ChatInput';
import SuggestedPrompts from '@/components/leafy/SuggestedPrompts';
import AgenticStepIndicator from '@/components/leafy/AgenticStepIndicator';
import LoadingState from '@/components/shared/LoadingState';
import { suggestedPrompts } from '@/lib/mock-data';
import { chatWithAdvisor } from '@/lib/api';
import { useLiveFeed } from '@/lib/live-feed-context';
import { useGenerator } from '@/lib/generator-context';
import { useDisruption, DISRUPTION_SCENARIOS } from '@/lib/disruption-context';
import { positions as mockPositions } from '@/lib/mock-data';
import type { ChatMessage, AgenticStep, DocumentType } from '@/lib/types';

const VesselTrackingMap = dynamic(
  () => import('@/components/leafy/VesselTrackingMap'),
  { ssr: false }
);

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

/** Map a tool call name to a human-readable step label. */
function toolCallLabel(name: string): string {
  const labels: Record<string, string> = {
    analyze_portfolio: 'Analyzed portfolio positions & P&L',
    search_policies: 'Searched IEA/EU energy policies (RAG)',
    search_market_intel: 'Searched market intelligence documents',
    get_generator_status: 'Checked power generator status',
    web_search: 'Searched web for latest market data',
    find: 'Queried MongoDB collection (MCP)',
    aggregate: 'Ran MongoDB aggregation pipeline (MCP)',
    listCollections: 'Listed MongoDB collections (MCP)',
    collectionSchema: 'Inspected collection schema (MCP)',
  };
  return labels[name] || `Called tool: ${name}`;
}

function LeafyContent() {
  const { darkMode } = useDarkMode();
  const liveFeed = useLiveFeed();
  const gen = useGenerator();
  const disruption = useDisruption();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [activeAgenticSteps, setActiveAgenticSteps] = useState<AgenticStep[] | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // Session ID for MongoDB conversation memory
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [serverSessionId, setServerSessionId] = useState<string | null>(null);
  const disruptionTriggeredRef = useRef(false);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setSessionId(crypto.randomUUID());
    setServerSessionId(null);
    setActiveAgenticSteps(null);
    setIsTyping(false);
  }, []);

  // Auto-send disruption analysis message when triggered
  useEffect(() => {
    if (disruption.active && disruption.disruption && !disruptionTriggeredRef.current) {
      disruptionTriggeredRef.current = true;
      const systemMsg: ChatMessage = {
        id: `msg-${Date.now()}-disruption`,
        role: 'assistant',
        content: `**DISRUPTION ALERT: ${disruption.disruption.name}**\n\n${disruption.disruption.description}\n\n**Estimated impact on your portfolio:**\n- Oil prices: +${disruption.disruption.oilPriceImpactPercent}% (supply disruption)\n- Power prices: +${disruption.disruption.powerPriceImpactPercent}% (fuel cost pass-through)\n- Gas prices: +${disruption.disruption.gasPriceImpactPercent}% (Gulf Coast LNG terminal shutdowns)\n\n**Recommendation:** Review GAS and POWER positions immediately. Consider hedging with short-term futures to lock in current rates before spot prices adjust.\n\n*Ask me about specific impacts on your positions or for detailed supply chain analysis.*`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, systemMsg]);
    }
    if (!disruption.active) {
      disruptionTriggeredRef.current = false;
    }
  }, [disruption.active, disruption.disruption]);

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    setActiveAgenticSteps([
      { id: 'portfolio', label: 'Analyzing portfolio positions...', description: 'Reading current P&L, exposure & risk', status: 'running', durationMs: 0 },
      { id: 'policies', label: 'Searching IEA/EU energy policies...', description: 'MongoDB Atlas Vector Search + voyage-finance-2', status: 'pending', durationMs: 0 },
      { id: 'web', label: 'Searching web for latest market data...', description: 'DuckDuckGo real-time search', status: 'pending', durationMs: 0 },
      { id: 'synthesize', label: 'Generating recommendations...', description: 'LangChain ReAct agent with Claude', status: 'pending', durationMs: 0 },
    ]);

    try {
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

      const advisorResp = await chatWithAdvisor(
        content,
        currentPositions,
        generatorSummaries,
        chatHistory,
        serverSessionId || sessionId,
      );

      if (advisorResp.session_id && !serverSessionId) {
        setServerSessionId(advisorResp.session_id);
      }

      if (advisorResp.tool_calls.length > 0) {
        const completedSteps: AgenticStep[] = advisorResp.tool_calls.map((tc, i) => ({
          id: `tool-${i}`,
          label: toolCallLabel(tc),
          description: '',
          status: 'completed' as const,
          durationMs: 0,
        }));
        setActiveAgenticSteps(completedSteps);
        await new Promise((r) => setTimeout(r, 1200));
      }
      setActiveAgenticSteps(null);

      const toolsUsed = advisorResp.tool_calls.length > 0
        ? `\n\n---\n*Agent tools used: ${advisorResp.tool_calls.join(', ')}*`
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
    } catch {
      setActiveAgenticSteps(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-error`,
          role: 'assistant',
          content: `**Backend unavailable.**\n\nTo enable the AI advisor agent:\n1. Start the backend: \`cd backend && uvicorn app.main:app --reload\`\n2. Set \`ANTHROPIC_API_KEY\` (direct) or \`AZURE_FOUNDRY_API_KEY\` + \`AZURE_FOUNDRY_ENDPOINT\` in \`deploy/.env\`\n\nThe agent uses a LangChain ReAct architecture with tools for portfolio analysis, IEA policy search (RAG), and web search.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  }, [liveFeed, gen.substations, messages, serverSessionId, sessionId]);

  const handlePromptSelect = useCallback(
    (prompt: string) => {
      sendMessage(prompt);
    },
    [sendMessage]
  );

  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const mutedColor = darkMode ? palette.gray.dark1 : palette.gray.light1;
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const isEmpty = messages.length === 0;

  return (
    <div
      className={css`
        display: flex;
        flex-direction: column;
        height: calc(100vh - 64px);
        overflow: hidden;
      `}
    >
      {/* Minimal Header */}
      <div
        className={css`
          padding: 16px 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          flex-shrink: 0;
        `}
      >
        <Icon glyph="Sparkle" size={20} fill={palette.green.base} />
        <H2 className={css`color: ${darkMode ? palette.white : palette.black} !important; font-size: 18px !important; margin: 0 !important;`}>
          EnerLeafy AI
        </H2>
        <Badge variant="green">Vector Search</Badge>
        <Badge variant="blue">voyage-finance-2</Badge>
        <Badge variant="yellow">L3 Agent</Badge>
      </div>

      {/* Collapsible Vessel Map */}
      <div
        className={css`
          flex-shrink: 0;
          border-bottom: 1px solid ${borderColor};
        `}
      >
        <button
          onClick={() => setMapExpanded(!mapExpanded)}
          className={css`
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 24px;
            width: 100%;
            border: none;
            background: transparent;
            cursor: pointer;
            color: ${textColor};
            font-size: 12px;
            font-family: inherit;
            &:hover { color: ${palette.green.base}; }
          `}
        >
          <Icon glyph={mapExpanded ? 'ChevronDown' : 'ChevronRight'} size={12} />
          Vessel Tracking Map
          {disruption.active && (
            <Badge variant="red" className={css`margin-left: 4px;`}>Disruption Active</Badge>
          )}
        </button>
        {mapExpanded && (
          <div className={css`animation: ${fadeIn} 0.2s ease;`}>
            <VesselTrackingMap />
          </div>
        )}
      </div>

      {/* Messages Area (scrollable, flex-grow) */}
      <div
        className={css`
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          padding: 0 24px;
        `}
      >
        {isEmpty ? (
          /* Empty State */
          <div
            className={css`
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 16px;
              animation: ${fadeIn} 0.4s ease;
            `}
          >
            <div
              className={css`
                width: 64px;
                height: 64px;
                border-radius: 50%;
                background: ${darkMode ? palette.green.dark3 : palette.green.light3};
                display: flex;
                align-items: center;
                justify-content: center;
              `}
            >
              <Icon glyph="Sparkle" size={32} fill={palette.green.base} />
            </div>
            <H2 className={css`color: ${darkMode ? palette.white : palette.black} !important; font-size: 24px !important; margin: 0 !important;`}>
              How can I help you today?
            </H2>
            <Body className={css`color: ${textColor} !important; font-size: 14px !important; text-align: center !important; max-width: 500px !important;`}>
              I can analyze your portfolio, search EU energy policies, check market conditions, and provide actionable trade recommendations.
            </Body>
            <Badge variant="lightgray" className={css`font-size: 10px !important;`}>
              Session: {(serverSessionId || sessionId).slice(0, 8)}...
            </Badge>
          </div>
        ) : (
          /* Chat Messages */
          <>
            <ChatContainer messages={messages} />

            {activeAgenticSteps && (
              <div className={css`max-width: 768px; margin: 0 auto; width: 100%;`}>
                <AgenticStepIndicator steps={activeAgenticSteps} />
              </div>
            )}

            {isTyping && !activeAgenticSteps && (
              <div
                className={css`
                  max-width: 768px;
                  margin: 0 auto;
                  width: 100%;
                  padding: 8px 0;
                  color: ${textColor};
                  font-size: 13px;
                  font-style: italic;
                `}
              >
                EnerLeafy is searching &amp; thinking...
              </div>
            )}
          </>
        )}
      </div>

      {/* Input Area (sticky bottom) */}
      <div
        className={css`
          flex-shrink: 0;
          padding: 16px 24px;
          border-top: 1px solid ${borderColor};
          background: ${darkMode ? palette.black : palette.white};
        `}
      >
        <div className={css`max-width: 768px; margin: 0 auto;`}>
          {/* Suggested prompts (empty state only) */}
          {isEmpty && (
            <SuggestedPrompts prompts={suggestedPrompts} onSelect={handlePromptSelect} />
          )}

          {/* Chat input */}
          <ChatInput onSend={sendMessage} disabled={isTyping} />

          {/* Bottom bar */}
          <div
            className={css`
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-top: 8px;
              gap: 8px;
            `}
          >
            <div className={css`display: flex; gap: 8px; align-items: center;`}>
              {messages.length > 0 && (
                <button
                  onClick={handleNewChat}
                  className={css`
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    border-radius: 12px;
                    border: 1px solid ${borderColor};
                    background: transparent;
                    color: ${textColor};
                    font-size: 11px;
                    cursor: pointer;
                    font-family: inherit;
                    &:hover { border-color: ${palette.green.base}; color: ${palette.green.base}; }
                  `}
                >
                  <Icon glyph="Plus" size={12} />
                  New Chat
                </button>
              )}
              {!disruption.active ? (
                <button
                  onClick={() => disruption.triggerDisruption(DISRUPTION_SCENARIOS[0].id)}
                  className={css`
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    border-radius: 12px;
                    border: 1px solid ${darkMode ? palette.red.dark2 : palette.red.light2};
                    background: transparent;
                    color: ${palette.red.base};
                    font-size: 11px;
                    cursor: pointer;
                    font-family: inherit;
                    &:hover { background: ${darkMode ? 'rgba(255,0,0,0.08)' : palette.red.light3}; }
                  `}
                >
                  <Icon glyph="Warning" size={12} />
                  Trigger Disruption
                </button>
              ) : (
                <button
                  onClick={() => disruption.clearDisruption()}
                  className={css`
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    border-radius: 12px;
                    border: 1px solid ${borderColor};
                    background: transparent;
                    color: ${textColor};
                    font-size: 11px;
                    cursor: pointer;
                    font-family: inherit;
                    &:hover { border-color: ${palette.green.base}; }
                  `}
                >
                  Clear Disruption
                </button>
              )}
            </div>

            <button
              onClick={() => setShowDisclaimer(!showDisclaimer)}
              className={css`
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 4px 8px;
                border: none;
                background: transparent;
                color: ${mutedColor};
                font-size: 11px;
                cursor: pointer;
                font-family: inherit;
                &:hover { color: ${textColor}; }
              `}
            >
              <Icon glyph="InfoWithCircle" size={12} />
              {showDisclaimer ? 'Hide info' : 'Model info'}
            </button>
          </div>

          {/* Collapsible Disclaimer */}
          {showDisclaimer && (
            <div
              className={css`
                margin-top: 8px;
                padding: 10px 12px;
                border-radius: 8px;
                background: ${darkMode ? 'rgba(255,255,255,0.03)' : palette.gray.light3};
                animation: ${fadeIn} 0.2s ease;
              `}
            >
              <Body className={css`color: ${mutedColor} !important; font-size: 10px !important; line-height: 1.5 !important;`}>
                <strong>Models:</strong> Claude (Anthropic API / Azure AI Foundry, auto-detected) via LangChain ReAct.
                Embeddings: VoyageAI voyage-finance-2 (1024d).
                Search: MongoDB Atlas Vector Search. DB access: MongoDB MCP Server.
                Memory: MongoDBSaver (per-session). Autonomy: Level 3 (BVP Scale).
              </Body>
              <Body className={css`color: ${mutedColor} !important; font-size: 10px !important; line-height: 1.5 !important; margin-top: 4px !important;`}>
                <strong>IEA/IRENA:</strong> Data from IEA/IRENA PAMS. IEA not responsible for analysis derived from data.
              </Body>
            </div>
          )}
        </div>
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
