'use client';

import { useState, useCallback } from 'react';
import { css, keyframes } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Button from '@leafygreen-ui/button';
import Badge from '@leafygreen-ui/badge';
import Icon from '@leafygreen-ui/icon';
import { Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import PageHeader from '@/components/shared/PageHeader';

import EventTimeline from '@/components/audit/EventTimeline';
import AggregateStateView from '@/components/audit/AggregateStateView';
import ReplayControls from '@/components/audit/ReplayControls';
import EventExplanationBubble from '@/components/audit/EventExplanationBubble';
import MarkdownMessage from '@/components/leafy/MarkdownMessage';
import { COMPLIANCE_SCENARIOS } from '@/lib/compliance-scenarios';
import { streamAuditAnalysis } from '@/lib/api';
import type { ComplianceScenario, StoredEvent, AgenticStep } from '@/lib/types';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
`;
const blink = keyframes`
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
`;
const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

function toolLabel(name: string): string {
  const map: Record<string, string> = {
    search_policies:    'Searching EU/IEA regulatory policies…',
    reconstruct_state:  'Reconstructing aggregate state via fold()…',
    get_event_timeline: 'Reading event timeline…',
    web_search:         'Searching web for regulatory precedents…',
    find:               'Querying MongoDB (MCP)…',
    aggregate:          'Running aggregation pipeline (MCP)…',
  };
  return map[name] || `Calling tool: ${name}…`;
}
function toolLabelDone(name: string): string {
  const map: Record<string, string> = {
    search_policies:    'Searched regulatory policies',
    reconstruct_state:  'Reconstructed aggregate state',
    get_event_timeline: 'Read event timeline',
    web_search:         'Searched web',
    find:               'Queried MongoDB',
    aggregate:          'Ran aggregation',
  };
  return map[name] || `Called: ${name}`;
}

export default function AuditPage() {
  const { darkMode } = useDarkMode();
  const textColor   = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const mutedColor  = darkMode ? palette.gray.dark1  : palette.gray.light1;
  const borderColor = darkMode ? palette.gray.dark2  : palette.gray.light2;

  const [selectedScenario, setSelectedScenario] = useState<ComplianceScenario | null>(null);
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [currentVersion, setCurrentVersion] = useState(1);

  // Analysis state
  const [analysisText, setAnalysisText]       = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisDone, setAnalysisDone]       = useState(false);
  const [analysisSteps, setAnalysisSteps]     = useState<AgenticStep[]>([]);
  const [stepsOpen, setStepsOpen]             = useState(true);
  const toolStartTimes: Record<string, number> = {};

  const loadScenario = useCallback((scenario: ComplianceScenario) => {
    setSelectedScenario(scenario);
    setEvents(scenario.events);
    setCurrentVersion(scenario.events.length > 0 ? scenario.events[scenario.events.length - 1].version : 1);
    setAnalysisText('');
    setAnalysisLoading(false);
    setAnalysisDone(false);
    setAnalysisSteps([]);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!selectedScenario) return;
    setAnalysisLoading(true);
    setAnalysisText('');
    setAnalysisDone(false);
    setAnalysisSteps([]);
    setStepsOpen(true);

    const steps: AgenticStep[] = [];
    let buffer = '';
    let firstToken = true;

    try {
      for await (const event of streamAuditAnalysis(
        selectedScenario.id,
        selectedScenario.title,
        selectedScenario.regulation,
        selectedScenario.description,
        selectedScenario.events.map((e) => ({
          streamId: e.streamId, streamType: e.streamType,
          version: e.version, eventType: e.eventType,
          timestamp: e.timestamp, payload: e.payload, metadata: e.metadata,
        })),
        currentVersion,
      )) {
        if (event.type === 'tool_start') {
          toolStartTimes[event.name] = Date.now();
          steps.push({ id: `${event.name}-${steps.length}`, label: toolLabel(event.name), description: '', status: 'running', durationMs: 0 });
          setAnalysisSteps([...steps]);

        } else if (event.type === 'tool_end') {
          const idx = [...steps].reverse().findIndex(s => s.status === 'running');
          if (idx !== -1) {
            const ri = steps.length - 1 - idx;
            steps[ri].status = 'completed';
            steps[ri].label = toolLabelDone(event.name);
            steps[ri].durationMs = Date.now() - (toolStartTimes[event.name] ?? Date.now());
            setAnalysisSteps([...steps]);
          }

        } else if (event.type === 'token') {
          buffer += event.text;
          if (firstToken) {
            firstToken = false;
            setAnalysisLoading(false);
          }
          setAnalysisText(buffer);

        } else if (event.type === 'done') {
          steps.forEach((s) => { if (s.status === 'running') s.status = 'completed'; });
          setAnalysisSteps([...steps]);
          setAnalysisText(buffer);
          setAnalysisDone(true);

        } else if (event.type === 'error') {
          throw new Error((event as {type:'error'; message:string}).message);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAnalysisText(`**Analysis unavailable** — ${msg}\n\nMake sure the backend is running.`);
      setAnalysisDone(true);
    } finally {
      setAnalysisLoading(false);
    }
  }, [selectedScenario, currentVersion]);

  const hasAnalysis = analysisText.length > 0 || analysisLoading;

  return (
    <div className={css`display: flex; flex-direction: column; gap: 24px;`}>
      <PageHeader
        title="Auditing"
        subtitle="Compliance audit with AI-powered event analysis — fold() replay, time-travel debugging"
      />

      {/* Scenario Selector */}
      <Card darkMode={darkMode} className={css`padding: 20px;`}>
        <Body className={css`color: ${textColor} !important; font-size: 13px !important; font-weight: 600 !important; margin-bottom: 12px !important;`}>
          Compliance Scenarios
        </Body>
        <div className={css`display: flex; gap: 12px; flex-wrap: wrap;`}>
          {COMPLIANCE_SCENARIOS.map((s) => {
            const active = selectedScenario?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => loadScenario(s)}
                className={css`
                  background: ${active ? (darkMode ? palette.green.dark3 : palette.green.light3) : (darkMode ? 'rgba(255,255,255,0.05)' : palette.gray.light3)};
                  border: 1px solid ${active ? palette.green.base : borderColor};
                  border-radius: 8px; padding: 12px 16px; cursor: pointer;
                  text-align: left; flex: 1; min-width: 220px; transition: all 0.15s ease;
                  &:hover { border-color: ${palette.green.base}; }
                `}
              >
                <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 4px;`}>
                  <Body className={css`color: ${darkMode ? palette.white : palette.black} !important; font-size: 13px !important; font-weight: 600 !important;`}>
                    {s.title}
                  </Body>
                </div>
                <Badge variant="blue">{s.regulation}</Badge>
                <Body className={css`color: ${textColor} !important; font-size: 11px !important; margin-top: 6px !important; line-height: 1.4 !important;`}>
                  {s.description}
                </Body>
              </button>
            );
          })}
        </div>
      </Card>

      {selectedScenario && events.length > 0 && (
        <>
          <ReplayControls
            maxVersion={events[events.length - 1].version}
            currentVersion={currentVersion}
            onChange={setCurrentVersion}
          />

          <EventExplanationBubble scenarioId={selectedScenario.id} version={currentVersion} />

          {/* AI Analysis */}
          <div className={css`display: flex; flex-direction: column; gap: 16px;`}>
            <div className={css`display: flex; align-items: center; gap: 12px;`}>
              <Button
                variant="primary"
                darkMode={darkMode}
                leftGlyph={<Icon glyph="Sparkle" />}
                disabled={analysisLoading}
                onClick={handleAnalyze}
              >
                {analysisLoading
                  ? 'Analyzing…'
                  : analysisDone
                  ? 'Re-analyze'
                  : 'Deep Analysis (AI Agent)'
                }
              </Button>
              {analysisLoading && !analysisText && (
                <Body className={css`color: ${textColor} !important; font-size: 12px !important; font-style: italic !important;`}>
                  Running compliance analysis…
                </Body>
              )}
            </div>

            {hasAnalysis && (
              <Card darkMode={darkMode} className={css`padding: 0; overflow: hidden; animation: ${fadeIn} 0.2s ease;`}>

                {/* Reasoning panel */}
                {analysisSteps.length > 0 && (
                  <div className={css`border-bottom: 1px solid ${borderColor};`}>
                    <button
                      onClick={() => setStepsOpen(v => !v)}
                      className={css`
                        display: flex; align-items: center; gap: 8px;
                        width: 100%; padding: 10px 16px; border: none;
                        background: ${darkMode ? 'rgba(255,255,255,0.03)' : palette.gray.light3};
                        cursor: pointer; font-family: inherit; font-size: 12px;
                        font-weight: 600; color: ${darkMode ? palette.green.light1 : palette.green.dark2};
                        text-align: left;
                        &:hover { background: ${darkMode ? 'rgba(255,255,255,0.06)' : palette.gray.light2}; }
                      `}
                    >
                      <Icon glyph={stepsOpen ? 'ChevronDown' : 'ChevronRight'} size={12} />
                      Agent Reasoning
                      <span className={css`font-weight: 400; color: ${mutedColor};`}>
                        — {analysisSteps.filter(s => s.status === 'completed').length}/{analysisSteps.length} steps
                        {analysisSteps.some(s => s.status === 'running') && (
                          <span className={css`margin-left: 8px; color: ${palette.green.base};`}>in progress…</span>
                        )}
                      </span>
                    </button>
                    {stepsOpen && (
                      <div className={css`padding: 12px 16px; display: flex; flex-direction: column; gap: 8px;`}>
                        {analysisSteps.map((step, i) => (
                          <div key={step.id} className={css`display: flex; align-items: center; gap: 10px;`}>
                            <div className={css`
                              width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
                              display: flex; align-items: center; justify-content: center;
                              ${step.status === 'completed'
                                ? `background: ${palette.green.base};`
                                : `background: transparent; border: 2px solid ${palette.green.base};`}
                            `}>
                              {step.status === 'completed'
                                ? <Icon glyph="Checkmark" size={10} fill={palette.white} />
                                : <div className={css`width: 8px; height: 8px; border: 2px solid transparent; border-top-color: ${palette.green.base}; border-radius: 50%; animation: ${spin} 0.8s linear infinite;`} />
                              }
                            </div>
                            <span className={css`
                              font-size: 12px;
                              color: ${step.status === 'running' ? (darkMode ? palette.white : palette.black) : textColor};
                              font-weight: ${step.status === 'running' ? '600' : '400'};
                            `}>
                              {step.label}
                              {step.status === 'completed' && step.durationMs > 0 && (
                                <span className={css`margin-left: 6px; font-size: 10px; opacity: 0.5;`}>
                                  {(step.durationMs / 1000).toFixed(1)}s
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Analysis content */}
                <div className={css`padding: 20px 24px;`}>
                  {/* Header badges */}
                  <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;`}>
                    <Badge variant="green">AI Compliance Analysis</Badge>
                    <Badge variant="blue">{selectedScenario.regulation}</Badge>
                    {analysisDone && (
                      <Badge variant="lightgray">Complete</Badge>
                    )}
                  </div>

                  {/* The actual markdown — rendered properly */}
                  <div className={css`
                    color: ${darkMode ? palette.gray.light2 : palette.gray.dark2};
                    font-size: 13px;
                    line-height: 1.7;

                    h1, h2, h3 {
                      color: ${darkMode ? palette.white : palette.black};
                      font-size: 14px;
                      font-weight: 700;
                      margin: 16px 0 8px;
                      padding-bottom: 4px;
                      border-bottom: 1px solid ${borderColor};
                      &:first-child { margin-top: 0; }
                    }
                    p { margin: 0 0 10px; &:last-child { margin-bottom: 0; } }
                    strong { color: ${darkMode ? palette.white : palette.black}; }
                    ul, ol { padding-left: 20px; margin: 6px 0 10px; }
                    li { margin-bottom: 4px; line-height: 1.6; }
                    /* Tables: display:block + overflow-x:auto makes wide tables scroll horizontally */
                    table { display: block; overflow-x: auto; max-width: 100%; width: max-content;
                             border-collapse: collapse; margin: 10px 0; font-size: 12px; }
                    th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid ${borderColor}; white-space: nowrap; }
                    th { font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px;
                         color: ${darkMode ? palette.gray.light1 : palette.gray.dark1}; }
                    /* Code blocks: scrollable, with language label styled */
                    pre { overflow-x: auto; border-radius: 6px; margin: 10px 0;
                          background: ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}; padding: 12px 14px; }
                    pre code { background: transparent; padding: 0; font-size: 12px; font-family: 'Source Code Pro', monospace;
                                display: block; line-height: 1.6; color: ${darkMode ? palette.gray.light2 : palette.gray.dark2}; }
                    code { background: ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
                    /* Streamdown code-fence language label */
                    [data-language]::before, .code-lang { font-size: 10px; opacity: 0.5; font-weight: 600; text-transform: uppercase; }
                    blockquote { border-left: 3px solid ${palette.green.base}; padding-left: 12px; margin: 8px 0; opacity: 0.85; }
                    hr { border: none; border-top: 1px solid ${borderColor}; margin: 12px 0; }
                  `}>
                    <MarkdownMessage text={analysisText} isAnimating={!analysisDone && analysisText.length > 0} />
                    {/* Blinking cursor while streaming */}
                    {!analysisDone && analysisText.length > 0 && (
                      <span className={css`
                        display: inline-block; width: 7px; height: 14px; margin-left: 2px;
                        background: ${palette.green.base}; vertical-align: middle;
                        animation: ${blink} 0.7s ease-in-out infinite; border-radius: 1px;
                      `} />
                    )}
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Timeline + State */}
          <div className={css`display: flex; gap: 24px; align-items: flex-start;`}>
            <EventTimeline events={events} selectedVersion={currentVersion} onSelectVersion={setCurrentVersion} />
            <AggregateStateView events={events} currentVersion={currentVersion} />
          </div>
        </>
      )}

      {!selectedScenario && (
        <Card darkMode={darkMode} className={css`padding: 40px; text-align: center;`}>
          <Body className={css`color: ${textColor} !important; font-size: 14px !important;`}>
            Select a compliance scenario above to begin inspecting the event stream and replaying fold() state reconstruction.
          </Body>
        </Card>
      )}
    </div>
  );
}
