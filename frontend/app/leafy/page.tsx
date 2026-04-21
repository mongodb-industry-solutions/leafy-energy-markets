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
import { streamAdvisor } from '@/lib/api';
import { useLiveFeed } from '@/lib/live-feed-context';
import { useGenerator } from '@/lib/generator-context';
import { positions as mockPositions } from '@/lib/mock-data';
import type { ChatMessage, AgenticStep } from '@/lib/types';

const FleetAssetMap = dynamic(
  () => import('@/components/leafy/FleetAssetMap'),
  { ssr: false }
);

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
`;

/** Map a tool call name to a human-readable step label. */
function toolCallLabel(name: string): string {
  const labels: Record<string, string> = {
    analyze_portfolio:    'Analyzed portfolio positions & P&L',
    search_policies:      'Searched IEA/EU energy policies (RAG)',
    search_market_intel:  'Searched market intelligence documents',
    get_generator_status: 'Checked power generator status',
    web_search:           'Searched web for latest market data',
    find:                 'Queried MongoDB collection (MCP)',
    aggregate:            'Ran MongoDB aggregation pipeline (MCP)',
    listCollections:      'Listed MongoDB collections (MCP)',
    collectionSchema:     'Inspected collection schema (MCP)',
  };
  return labels[name] || `Called tool: ${name}`;
}

function LeafyContent() {
  const { darkMode } = useDarkMode();
  const liveFeed = useLiveFeed();
  const gen = useGenerator();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [activeAgenticSteps, setActiveAgenticSteps] = useState<AgenticStep[] | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [reasoningText, setReasoningText] = useState('');
  const [reasoningCollapsed, setReasoningCollapsed] = useState(false);

  // Typewriter: full received text lives in a ref; a 16ms interval drips it into the message
  const tokenAccumRef = useRef('');
  const streamDoneRef = useRef(false); // set to true when SSE 'done' fires

  useEffect(() => {
    if (!streamingMsgId) {
      tokenAccumRef.current = '';
      streamDoneRef.current = false;
      return;
    }
    const id = setInterval(() => {
      const target = tokenAccumRef.current;
      setMessages((prev) => {
        const msg = prev.find((m) => m.id === streamingMsgId);
        if (!msg) return prev;
        if (msg.content.length >= target.length) {
          // Typewriter caught up — if stream is done, finalize
          if (streamDoneRef.current) {
            setTimeout(() => {
              setStreamingMsgId(null);
              setTimeout(() => setActiveAgenticSteps(null), 400);
            }, 50);
          }
          return prev;
        }
        // Adaptive chunk: 10% of remaining (min 8 chars) — fast but visible
        const remaining = target.length - msg.content.length;
        const chunk = Math.max(8, Math.floor(remaining * 0.1));
        const next = target.slice(0, msg.content.length + chunk);
        return prev.map((m) => (m.id === streamingMsgId ? { ...m, content: next } : m));
      });
    }, 16);
    return () => clearInterval(id);
  }, [streamingMsgId]);

  // Initialise client-side only to avoid SSR/client hydration mismatch
  const [sessionId, setSessionId] = useState('');
  const [serverSessionId, setServerSessionId] = useState<string | null>(null);
  useEffect(() => { setSessionId(crypto.randomUUID()); }, []);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setServerSessionId(null);
    setActiveAgenticSteps(null);
    setIsTyping(false);
    setStreamingMsgId(null);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);
    setStreamingMsgId(null);

    // Fetch live trading state to provide fleet + prices + weather context
    let tradingState: Record<string, unknown> | null = null;
    try {
      const tsRes = await fetch('/api/trading/state');
      if (tsRes.ok) tradingState = await tsRes.json();
    } catch { /* backend unavailable */ }

    // Build fleet context from live assets
    const fleetAssets = (tradingState?.assets as Record<string, unknown>[] | undefined)?.map((a: Record<string, unknown>) => ({
      id: a.id, type: a.type, name: a.name, region: a.region,
      capacityMw: a.capacityMw, currentOutputMw: a.currentOutputMw,
      forecastOutputMw: a.forecastOutputMw, varianceMw: a.varianceMw,
      utilizationPct: a.utilizationPct, status: a.status,
    })) ?? [];

    const prices = tradingState?.prices ?? {};
    const portfolio = tradingState?.portfolio ?? {};
    const recentEvents = ((tradingState?.recentEvents as Record<string, unknown>[] | undefined) ?? [])
      .filter((e: Record<string, unknown>) =>
        e.streamType === 'WeatherForecast' || e.eventType === 'PerformanceVarianceDetected'
      )
      .slice(0, 10);

    const currentPositions = fleetAssets;
    const generatorSummaries = [
      { context: 'live_market_prices', ...prices as object },
      { context: 'portfolio_state', ...portfolio as object },
      { context: 'weather_and_performance_events', events: recentEvents },
    ];

    const chatHistory = messages
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    const msgId = `msg-${Date.now()}-advisor`;
    tokenAccumRef.current = '';
    let firstToken = true;
    const steps: AgenticStep[] = [];
    const toolStartTimes: Record<string, number> = {};
    setActiveAgenticSteps([]);
    setReasoningText('');
    setReasoningCollapsed(false);

    try {
      for await (const event of streamAdvisor(
        content,
        currentPositions,
        generatorSummaries,
        chatHistory,
        serverSessionId || sessionId,
      )) {
        if (event.type === 'tool_start') {
          const step: AgenticStep = {
            id: `tool-${steps.length}`,
            label: toolCallLabel(event.name),
            description: '',
            status: 'running',
            durationMs: 0,
          };
          toolStartTimes[event.name] = Date.now();
          steps.push(step);
          setActiveAgenticSteps([...steps]);

        } else if (event.type === 'tool_end') {
          const idx = [...steps].reverse().findIndex(
            (s) => s.label === toolCallLabel(event.name) && s.status === 'running'
          );
          if (idx !== -1) {
            const realIdx = steps.length - 1 - idx;
            steps[realIdx].status = 'completed';
            steps[realIdx].durationMs = Date.now() - (toolStartTimes[event.name] ?? Date.now());
            setActiveAgenticSteps([...steps]);
          }

        } else if (event.type === 'reasoning') {
          setReasoningText(prev => prev + event.text);

        } else if (event.type === 'token') {
          tokenAccumRef.current += event.text;
          if (firstToken) {
            firstToken = false;
            setIsTyping(false);
            // Create the message with empty content — typewriter interval will fill it
            setMessages((prev) => [
              ...prev,
              {
                id: msgId,
                role: 'assistant' as const,
                content: '',
                timestamp: new Date().toISOString(),
              },
            ]);
            setStreamingMsgId(msgId);
          }
          // No else — typewriter useEffect handles content updates at 60fps

        } else if (event.type === 'done') {
          if (event.session_id && !serverSessionId) {
            setServerSessionId(event.session_id);
          }
          // Mark all running steps as completed, then collapse reasoning
          const finalSteps = steps.map((s) =>
            s.status === 'running' ? { ...s, status: 'completed' as const } : s
          );
          setActiveAgenticSteps(finalSteps);
          setReasoningCollapsed(true);

          // Signal typewriter to finalize when it catches up (don't flush instantly)
          streamDoneRef.current = true;

          // If no tokens were ever received, clean up immediately
          if (firstToken) {
            setStreamingMsgId(null);
            setTimeout(() => setActiveAgenticSteps(null), 400);
          }

        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
    } catch (err) {
      setActiveAgenticSteps(steps.length > 0 ? steps : null);
      setStreamingMsgId(null);
      const detail = err instanceof Error ? err.message : String(err);
      if (firstToken) {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-error`,
            role: 'assistant' as const,
            content: `**Something went wrong.**\n\n\`${detail}\`\n\nMake sure the backend is running: \`cd backend && uvicorn app.main:app --reload --port 8000\``,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setIsTyping(false);
    }
  }, [liveFeed, gen.substations, messages, serverSessionId, sessionId]);

  const handlePromptSelect = useCallback(
    (prompt: string) => { sendMessage(prompt); },
    [sendMessage]
  );

  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const mutedColor  = darkMode ? palette.gray.dark1 : palette.gray.light1;
  const textColor   = darkMode ? palette.gray.light1 : palette.gray.dark1;
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
        <Badge variant="green"  className={css`font-size: 10px !important;`}>Vector Search</Badge>
        <Badge variant="blue"   className={css`font-size: 10px !important;`}>voyage-finance-2</Badge>
        <Badge variant="yellow" className={css`font-size: 10px !important;`}>AI Agent</Badge>
      </div>

      {/* Collapsible Fleet Asset Map */}
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
          Fleet Asset Map
        </button>
        {mapExpanded && (
          <div className={css`animation: ${fadeIn} 0.2s ease;`}>
            <FleetAssetMap />
          </div>
        )}
      </div>

      {/* Messages Area */}
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
            {/*
              Key layout: completed messages → reasoning panel → streaming message.
              This ensures the user sees tool-call progress BEFORE the answer appears.
              We separate the live streaming message from the ChatContainer so we can
              insert the reasoning panel between historical messages and the new response.
            */}
            <ChatContainer
              messages={streamingMsgId ? messages.filter((m) => m.id !== streamingMsgId) : messages}
              streamingId={null}
              onStreamComplete={() => {}}
            />

            {/* Active response area */}
            {(isTyping || !!streamingMsgId || activeAgenticSteps !== null) && (
              <div
                className={css`
                  width: 100%;
                  max-width: 900px;
                  margin: 0 auto;
                  display: flex;
                  flex-direction: column;
                  gap: 8px;
                  padding-bottom: 4px;
                `}
              >
                {/* 1. Prominent planning banner — before the first tool fires */}
                {isTyping && activeAgenticSteps === null && (
                  <div className={css`
                    display: flex; align-items: center; gap: 12px;
                    padding: 12px 16px;
                    border-radius: 10px;
                    background: ${darkMode ? 'rgba(0,237,100,0.07)' : 'rgba(0,180,60,0.06)'};
                    border: 1px solid ${darkMode ? palette.green.dark2 : palette.green.light2};
                    animation: ${fadeIn} 0.2s ease;
                  `}>
                    <span className={css`font-size: 22px; flex-shrink: 0;`}>🧠</span>
                    <div>
                      <div className={css`
                        font-size: 14px; font-weight: 700;
                        color: ${darkMode ? palette.green.light1 : palette.green.dark2};
                      `}>
                        Planning…
                      </div>
                      <div className={css`
                        font-size: 11px; color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
                        margin-top: 2px;
                      `}>
                        EnerLeafy is analyzing your request and selecting tools
                      </div>
                    </div>
                    <div className={css`
                      margin-left: auto; width: 18px; height: 18px; flex-shrink: 0;
                      border: 2px solid transparent;
                      border-top: 2px solid ${palette.green.base};
                      border-radius: 50%;
                      animation: ${blink} 1s ease-in-out infinite;
                    `} />
                  </div>
                )}

                {/* 2. Agent reasoning panel — always expanded when steps are present */}
                {activeAgenticSteps !== null && (
                  <div
                    className={css`
                      border: 1px solid ${darkMode ? palette.green.dark2 : palette.green.light2};
                      border-radius: 10px;
                      overflow: hidden;
                      animation: ${fadeIn} 0.2s ease;
                      background: ${darkMode ? 'rgba(0,237,100,0.04)' : 'rgba(0,180,60,0.03)'};
                    `}
                  >
                    {/* Header — clickable to toggle collapse */}
                    <button
                      onClick={() => setReasoningCollapsed(c => !c)}
                      className={css`
                        display: flex; align-items: center; gap: 8px; width: 100%;
                        padding: 9px 14px;
                        background: ${darkMode ? 'rgba(0,237,100,0.07)' : 'rgba(0,160,50,0.06)'};
                        border-bottom: ${reasoningCollapsed ? 'none' : `1px solid ${darkMode ? palette.green.dark2 : palette.green.light2}`};
                        border: none; cursor: pointer; font-family: inherit; text-align: left;
                      `}
                    >
                      <span className={css`font-size: 12px; transition: transform 0.2s; transform: rotate(${reasoningCollapsed ? '-90deg' : '0deg'});`}>▼</span>
                      <span className={css`font-size: 16px;`}>🧠</span>
                      <span className={css`
                        font-size: 13px; font-weight: 700;
                        color: ${darkMode ? palette.green.light1 : palette.green.dark2};
                      `}>
                        Agent Reasoning
                      </span>
                      <span className={css`
                        font-size: 11px; font-weight: 400;
                        color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
                      `}>
                        {activeAgenticSteps.length === 0 ? (
                          <span className={css`color: ${palette.green.base}; font-weight: 600;`}>selecting tools…</span>
                        ) : (
                          <>
                            {activeAgenticSteps.filter(s => s.status === 'completed').length}/{activeAgenticSteps.length} tools
                            {activeAgenticSteps.some(s => s.status === 'running') && (
                              <span className={css`margin-left: 6px; color: ${palette.green.base}; font-weight: 600;`}>
                                in progress…
                              </span>
                            )}
                            {activeAgenticSteps.every(s => s.status === 'completed') && (
                              <span className={css`margin-left: 6px; color: ${darkMode ? palette.green.light1 : palette.green.dark2}; font-weight: 600;`}>
                                ✓ all done
                              </span>
                            )}
                          </>
                        )}
                      </span>
                    </button>

                    {/* Steps — collapsible with max-height */}
                    {!reasoningCollapsed && (
                      <div className={css`padding: 6px 14px 14px; animation: ${fadeIn} 0.15s ease; max-height: 200px; overflow-y: auto;`}>
                        <AgenticStepIndicator steps={activeAgenticSteps} reasoningText={reasoningText} />
                      </div>
                    )}
                  </div>
                )}

                {/* 3. "Leafying" indicator — all steps done, waiting for first token */}
                {activeAgenticSteps !== null &&
                  activeAgenticSteps.length > 0 &&
                  activeAgenticSteps.every((s) => s.status === 'completed') &&
                  !streamingMsgId && (
                  <div className={css`
                    display: flex; align-items: center; gap: 8px;
                    padding: 8px 14px;
                    border-radius: 8px;
                    background: ${darkMode ? 'rgba(0,237,100,0.05)' : 'rgba(0,180,60,0.04)'};
                    color: ${darkMode ? palette.green.light1 : palette.green.dark1};
                    font-size: 12px; font-style: italic;
                    animation: ${fadeIn} 0.2s ease;
                  `}>
                    <span className={css`
                      width: 8px; height: 8px; border-radius: 50%;
                      background: ${palette.green.base};
                      animation: ${blink} 0.9s ease-in-out infinite;
                      flex-shrink: 0;
                    `} />
                    …Leafying — composing response
                  </div>
                )}

                {/* 4. Streaming message — rendered AFTER reasoning so user sees steps first */}
                {streamingMsgId && (
                  <ChatContainer
                    messages={messages.filter((m) => m.id === streamingMsgId)}
                    streamingId={streamingMsgId}
                    onStreamComplete={() => setStreamingMsgId(null)}
                  />
                )}
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

          <ChatInput onSend={sendMessage} disabled={isTyping || !!streamingMsgId} />

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
