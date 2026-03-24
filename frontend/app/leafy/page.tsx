'use client';

import { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { css, keyframes } from '@emotion/css';
import { palette } from '@leafygreen-ui/palette';
import Badge from '@leafygreen-ui/badge';
import Icon from '@leafygreen-ui/icon';
import { Body } from '@leafygreen-ui/typography';
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
  const [streamingId, setStreamingId] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [serverSessionId, setServerSessionId] = useState<string | null>(null);
  const disruptionTriggeredRef = useRef(false);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setSessionId(crypto.randomUUID());
    setServerSessionId(null);
    setActiveAgenticSteps(null);
    setIsTyping(false);
    setStreamingId(null);
  }, []);

  const handleStreamComplete = useCallback(() => {
    setStreamingId(null);
  }, []);

  // Auto-send disruption analysis message when triggered
  useEffect(() => {
    if (disruption.active && disruption.disruption && !disruptionTriggeredRef.current) {
      disruptionTriggeredRef.current = true;
      const msgId = `msg-${Date.now()}-disruption`;
      const systemMsg: ChatMessage = {
        id: msgId,
        role: 'assistant',
        content: `**DISRUPTION ALERT: ${disruption.disruption.name}**\n\n${disruption.disruption.description}\n\n**Estimated impact on your portfolio:**\n- Oil prices: +${disruption.disruption.oilPriceImpactPercent}% (Brent supply disruption)\n- Power prices: +${disruption.disruption.powerPriceImpactPercent}% (North Sea generation curtailed)\n- Gas prices: +${disruption.disruption.gasPriceImpactPercent}% (TTF spike — Norwegian pipeline + LNG delays)\n\n**Recommendation:** Review GAS and POWER positions immediately. Rotterdam-bound vessel traffic is suspended — expect TTF and Brent futures to gap higher. Consider hedging with short-term futures to lock in current rates before spot prices adjust.\n\n*Ask me about specific impacts on your positions or for detailed supply chain analysis.*`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, systemMsg]);
      setStreamingId(msgId);
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
    setStreamingId(null);

    const steps: AgenticStep[] = [
      { id: 'portfolio', label: 'Analyzing portfolio positions...', description: 'Reading current P&L, exposure & risk', status: 'running', durationMs: 0 },
      { id: 'policies', label: 'Searching IEA/EU energy policies...', description: 'MongoDB Atlas Vector Search + voyage-finance-2', status: 'pending', durationMs: 0 },
      { id: 'web', label: 'Searching web for latest market data...', description: 'DuckDuckGo real-time search', status: 'pending', durationMs: 0 },
      { id: 'synthesize', label: 'Generating recommendations...', description: 'LangChain ReAct agent with Claude', status: 'pending', durationMs: 0 },
    ];
    setActiveAgenticSteps([...steps]);

    const stepTimers = [
      setTimeout(() => { steps[0].status = 'completed'; steps[1].status = 'running'; setActiveAgenticSteps([...steps]); }, 3000),
      setTimeout(() => { steps[1].status = 'completed'; steps[2].status = 'running'; setActiveAgenticSteps([...steps]); }, 8000),
      setTimeout(() => { steps[2].status = 'completed'; steps[3].status = 'running'; setActiveAgenticSteps([...steps]); }, 14000),
    ];

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
      stepTimers.forEach(clearTimeout);

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
        await new Promise((r) => setTimeout(r, 800));
      }
      setActiveAgenticSteps(null);

      const toolsUsed = advisorResp.tool_calls.length > 0
        ? `\n\n---\n*Agent tools used: ${advisorResp.tool_calls.join(', ')}*`
        : '';
      const msgId = `msg-${Date.now()}-advisor`;
      const assistantMsg: ChatMessage = {
        id: msgId,
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
      setStreamingId(msgId);
    } catch (err) {
      stepTimers.forEach(clearTimeout);
      setActiveAgenticSteps(null);
      const detail = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-error`,
          role: 'assistant',
          content: `**Something went wrong.**\n\n\`${detail}\`\n\nMake sure the backend is running: \`cd backend && uvicorn app.main:app --reload --port 8000\``,
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
      {/* Compact Header */}
      <div
        className={css`
          padding: 10px 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          flex-shrink: 0;
        `}
      >
        <Icon glyph="Sparkle" size={16} fill={palette.green.base} />
        <span className={css`color: ${darkMode ? palette.white : palette.black}; font-size: 15px; font-weight: 600;`}>
          EnerLeafy AI
        </span>
        <Badge variant="green" className={css`font-size: 10px !important;`}>Vector Search</Badge>
        <Badge variant="blue" className={css`font-size: 10px !important;`}>voyage-finance-2</Badge>
        <Badge variant="yellow" className={css`font-size: 10px !important;`}>L3 Agent</Badge>
      </div>

      {/* Collapsible Vessel Map */}
      <div className={css`flex-shrink: 0; border-bottom: 1px solid ${borderColor};`}>
        <button
          onClick={() => setMapExpanded(!mapExpanded)}
          className={css`
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 20px;
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

      {/* Messages Area — full width */}
      <div
        className={css`
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          padding: 0 20px;
        `}
      >
        {isEmpty ? (
          <div
            className={css`
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 12px;
              animation: ${fadeIn} 0.4s ease;
            `}
          >
            <div
              className={css`
                width: 56px;
                height: 56px;
                border-radius: 50%;
                background: ${darkMode ? palette.green.dark3 : palette.green.light3};
                display: flex;
                align-items: center;
                justify-content: center;
              `}
            >
              <Icon glyph="Sparkle" size={28} fill={palette.green.base} />
            </div>
            <span className={css`color: ${darkMode ? palette.white : palette.black}; font-size: 20px; font-weight: 600;`}>
              How can I help you today?
            </span>
            <Body className={css`color: ${textColor} !important; font-size: 13px !important; text-align: center !important; max-width: 500px !important;`}>
              I can analyze your portfolio, search EU energy policies, check market conditions, and provide actionable trade recommendations.
            </Body>
            <Badge variant="lightgray" className={css`font-size: 10px !important;`}>
              Session: {(serverSessionId || sessionId).slice(0, 8)}...
            </Badge>
          </div>
        ) : (
          <>
            <ChatContainer
              messages={messages}
              streamingId={streamingId}
              onStreamComplete={handleStreamComplete}
            />

            {activeAgenticSteps && (
              <div className={css`width: 100%; max-width: 900px; margin: 0 auto;`}>
                <AgenticStepIndicator steps={activeAgenticSteps} />
              </div>
            )}

            {isTyping && !activeAgenticSteps && (
              <div
                className={css`
                  width: 100%;
                  max-width: 900px;
                  margin: 0 auto;
                  padding: 6px 0;
                  color: ${textColor};
                  font-size: 12px;
                  font-style: italic;
                `}
              >
                EnerLeafy is searching &amp; thinking...
              </div>
            )}
          </>
        )}
      </div>

      {/* Input Area */}
      <div
        className={css`
          flex-shrink: 0;
          padding: 12px 20px;
          border-top: 1px solid ${borderColor};
          background: ${darkMode ? palette.black : palette.white};
        `}
      >
        <div className={css`max-width: 900px; margin: 0 auto;`}>
          {isEmpty && (
            <SuggestedPrompts prompts={suggestedPrompts} onSelect={handlePromptSelect} />
          )}

          <ChatInput onSend={sendMessage} disabled={isTyping} />

          <div
            className={css`
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-top: 6px;
              gap: 6px;
            `}
          >
            <div className={css`display: flex; gap: 6px; align-items: center;`}>
              {messages.length > 0 && (
                <button
                  onClick={handleNewChat}
                  className={css`
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 3px 8px;
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
                    padding: 3px 8px;
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
                    padding: 3px 8px;
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
                padding: 3px 6px;
                border: none;
                background: transparent;
                color: ${mutedColor};
                font-size: 10px;
                cursor: pointer;
                font-family: inherit;
                &:hover { color: ${textColor}; }
              `}
            >
              <Icon glyph="InfoWithCircle" size={12} />
              {showDisclaimer ? 'Hide info' : 'Model info'}
            </button>
          </div>

          {showDisclaimer && (
            <div
              className={css`
                margin-top: 6px;
                padding: 8px 10px;
                border-radius: 6px;
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
