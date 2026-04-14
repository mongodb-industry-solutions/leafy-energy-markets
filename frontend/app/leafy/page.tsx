'use client';

import { Suspense, useState, useCallback, useEffect } from 'react';
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

const VesselTrackingMap = dynamic(
  () => import('@/components/leafy/VesselTrackingMap'),
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
  const [stepsVisible, setStepsVisible] = useState(false);  // steps panel open/closed
  const [mapExpanded, setMapExpanded] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [reasoningText, setReasoningText] = useState('');

  // Initialise client-side only to avoid SSR/client hydration mismatch
  const [sessionId, setSessionId] = useState('');
  const [serverSessionId, setServerSessionId] = useState<string | null>(null);
  useEffect(() => { setSessionId(crypto.randomUUID()); }, []);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setServerSessionId(null);
    setActiveAgenticSteps(null);
    setStepsVisible(false);
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

    const currentPositions =
      liveFeed.active && liveFeed.positions ? liveFeed.positions : mockPositions;
    const generatorSummaries = gen.substations
      .filter((s) => s.status === 'online')
      .map((s) => ({
        id: s.id, name: s.name, region: s.region,
        fuel: s.fuel, capacity_mw: s.capacity_mw, status: s.status,
      }));
    const chatHistory = messages
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    const msgId = `msg-${Date.now()}-advisor`;
    // Mutable ref for accumulated tokens within this send call
    let tokenBuffer = '';
    let firstToken = true;
    const steps: AgenticStep[] = [];
    const toolStartTimes: Record<string, number> = {};
    setActiveAgenticSteps([]);
    setStepsVisible(true);
    setReasoningText('');

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
          tokenBuffer += event.text;
          if (firstToken) {
            firstToken = false;
            setIsTyping(false);
            // Don't clear steps — keep them visible as "reasoning" panel
            setMessages((prev) => [
              ...prev,
              {
                id: msgId,
                role: 'assistant' as const,
                content: tokenBuffer,
                timestamp: new Date().toISOString(),
              },
            ]);
            setStreamingMsgId(msgId);
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId ? { ...m, content: tokenBuffer } : m
              )
            );
          }

        } else if (event.type === 'done') {
          if (event.session_id && !serverSessionId) {
            setServerSessionId(event.session_id);
          }
          // Mark all running steps as completed
          const finalSteps = steps.map((s) =>
            s.status === 'running' ? { ...s, status: 'completed' as const } : s
          );
          setActiveAgenticSteps(finalSteps);
          // Ensure final content is set
          if (!firstToken) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId ? { ...m, content: tokenBuffer } : m
              )
            );
          }
          setStreamingMsgId(null);

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
        </button>
        {mapExpanded && (
          <div className={css`animation: ${fadeIn} 0.2s ease;`}>
            <VesselTrackingMap />
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
                {/* 1. Initial dot only if panel is not yet open (before activeAgenticSteps is set) */}
                {isTyping && activeAgenticSteps === null && (
                  <div className={css`display: flex; align-items: center; gap: 8px; color: ${textColor}; font-size: 12px; font-style: italic; padding: 4px 0;`}>
                    <span className={css`width: 6px; height: 6px; border-radius: 50%; background: ${palette.green.base}; animation: ${blink} 1s ease-in-out infinite;`} />
                    EnerLeafy is thinking...
                  </div>
                )}

                {/* 2. Reasoning panel — appears immediately when message is sent, BEFORE the response text */}
                {activeAgenticSteps !== null && (
                  <div
                    className={css`
                      border: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
                      border-radius: 8px;
                      overflow: hidden;
                      animation: ${fadeIn} 0.2s ease;
                    `}
                  >
                    <button
                      onClick={() => setStepsVisible((v) => !v)}
                      className={css`
                        display: flex; align-items: center; gap: 6px; width: 100%;
                        padding: 7px 12px; border: none;
                        background: ${darkMode ? 'rgba(255,255,255,0.03)' : palette.gray.light3};
                        cursor: pointer; font-family: inherit; font-size: 11px; font-weight: 600;
                        color: ${darkMode ? palette.green.light1 : palette.green.dark2}; text-align: left;
                        &:hover { background: ${darkMode ? 'rgba(255,255,255,0.06)' : palette.gray.light2}; }
                      `}
                    >
                      <Icon glyph={stepsVisible ? 'ChevronDown' : 'ChevronRight'} size={12} />
                      Agent Reasoning
                      <span className={css`font-weight: 400; color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};`}>
                        {activeAgenticSteps.length === 0 ? (
                          <span className={css`margin-left: 6px; color: ${palette.green.base};`}>planning…</span>
                        ) : (
                          <>
                            {' '}— {activeAgenticSteps.filter(s => s.status === 'completed').length}/{activeAgenticSteps.length} tools
                            {activeAgenticSteps.some(s => s.status === 'running') && (
                              <span className={css`margin-left: 6px; color: ${palette.green.base};`}>in progress…</span>
                            )}
                          </>
                        )}
                      </span>
                    </button>
                    {stepsVisible && (
                      <div className={css`padding: 4px 12px 12px; animation: ${fadeIn} 0.15s ease;`}>
                        <AgenticStepIndicator steps={activeAgenticSteps} reasoningText={reasoningText} />
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Streaming message — rendered AFTER reasoning so user sees steps first */}
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
