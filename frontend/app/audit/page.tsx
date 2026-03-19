'use client';

import { useState, useCallback } from 'react';
import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Button from '@leafygreen-ui/button';
import Badge from '@leafygreen-ui/badge';
import Icon from '@leafygreen-ui/icon';
import { Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import PageHeader from '@/components/shared/PageHeader';
import AutonomyBadge from '@/components/shared/AutonomyBadge';
import EventTimeline from '@/components/audit/EventTimeline';
import AggregateStateView from '@/components/audit/AggregateStateView';
import ReplayControls from '@/components/audit/ReplayControls';
import EventExplanationBubble from '@/components/audit/EventExplanationBubble';
import { COMPLIANCE_SCENARIOS } from '@/lib/compliance-scenarios';
import { analyzeAuditScenario } from '@/lib/api';
import type { ComplianceScenario, StoredEvent } from '@/lib/types';

export default function AuditPage() {
  const { darkMode } = useDarkMode();
  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;

  const [selectedScenario, setSelectedScenario] = useState<ComplianceScenario | null>(null);
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [currentVersion, setCurrentVersion] = useState(1);
  const [deepAnalysis, setDeepAnalysis] = useState<string | null>(null);
  const [deepAnalysisLoading, setDeepAnalysisLoading] = useState(false);
  const [deepAnalysisSources, setDeepAnalysisSources] = useState<{ title: string; type: string; snippet: string }[]>([]);
  const [deepAnalysisTools, setDeepAnalysisTools] = useState<string[]>([]);

  const loadScenario = useCallback((scenario: ComplianceScenario) => {
    setSelectedScenario(scenario);
    setEvents(scenario.events);
    setCurrentVersion(scenario.events.length > 0 ? scenario.events[scenario.events.length - 1].version : 1);
    setDeepAnalysis(null);
    setDeepAnalysisSources([]);
    setDeepAnalysisTools([]);
  }, []);

  const handleDeepAnalysis = useCallback(async () => {
    if (!selectedScenario) return;
    setDeepAnalysisLoading(true);
    setDeepAnalysis(null);
    try {
      const resp = await analyzeAuditScenario(
        selectedScenario.id,
        selectedScenario.title,
        selectedScenario.regulation,
        selectedScenario.description,
        selectedScenario.events.map((e) => ({
          streamId: e.streamId,
          streamType: e.streamType,
          version: e.version,
          eventType: e.eventType,
          timestamp: e.timestamp,
          payload: e.payload,
          metadata: e.metadata,
        })),
        currentVersion,
      );
      setDeepAnalysis(resp.analysis);
      setDeepAnalysisSources(resp.sources);
      setDeepAnalysisTools(resp.tool_calls);
    } catch (err) {
      setDeepAnalysis('Deep analysis unavailable — connect the backend to enable AI-powered compliance analysis.');
    } finally {
      setDeepAnalysisLoading(false);
    }
  }, [selectedScenario, currentVersion]);

  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;

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
          {COMPLIANCE_SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => loadScenario(s)}
              className={css`
                background: ${selectedScenario?.id === s.id
                  ? darkMode
                    ? palette.green.dark3
                    : palette.green.light3
                  : darkMode
                  ? 'rgba(255,255,255,0.05)'
                  : palette.gray.light3};
                border: 1px solid ${selectedScenario?.id === s.id ? palette.green.base : borderColor};
                border-radius: 8px;
                padding: 12px 16px;
                cursor: pointer;
                text-align: left;
                flex: 1;
                min-width: 220px;
                transition: all 0.15s ease;
                &:hover {
                  border-color: ${palette.green.base};
                }
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
          ))}
        </div>
      </Card>

      {/* Inspector */}
      {selectedScenario && events.length > 0 && (
        <>
          {/* Replay Controls */}
          <ReplayControls
            maxVersion={events[events.length - 1].version}
            currentVersion={currentVersion}
            onChange={setCurrentVersion}
          />

          {/* Explanation Bubble */}
          <EventExplanationBubble
            scenarioId={selectedScenario.id}
            version={currentVersion}
          />

          {/* Deep Analysis Button & Result */}
          <div className={css`display: flex; flex-direction: column; gap: 12px;`}>
            <Button
              variant="primary"
              darkMode={darkMode}
              leftGlyph={<Icon glyph="Sparkle" />}
              disabled={deepAnalysisLoading}
              onClick={handleDeepAnalysis}
            >
              {deepAnalysisLoading ? 'Analyzing...' : <><span>Deep Analysis (AI Agent)</span> <AutonomyBadge level={2} compact /></>}
            </Button>

            {deepAnalysis && (
              <Card darkMode={darkMode} className={css`padding: 20px;`}>
                <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 12px;`}>
                  <Badge variant="green">AI Compliance Analysis</Badge>
                  <Badge variant="blue">voyage-finance-2</Badge>
                  {deepAnalysisTools.length > 0 && (
                    <Body className={css`color: ${textColor} !important; font-size: 11px !important;`}>
                      Tools: {deepAnalysisTools.join(', ')}
                    </Body>
                  )}
                </div>
                <Body
                  className={css`
                    color: ${darkMode ? palette.gray.light2 : palette.gray.dark2} !important;
                    font-size: 13px !important;
                    line-height: 1.7 !important;
                    white-space: pre-wrap;
                  `}
                >
                  {deepAnalysis}
                </Body>
                {deepAnalysisSources.length > 0 && (
                  <div className={css`margin-top: 12px; padding-top: 12px; border-top: 1px solid ${borderColor};`}>
                    <Body className={css`color: ${textColor} !important; font-size: 11px !important; font-weight: 600 !important; margin-bottom: 6px !important;`}>
                      Sources
                    </Body>
                    {deepAnalysisSources.map((s, i) => (
                      <Body key={i} className={css`color: ${textColor} !important; font-size: 11px !important; line-height: 1.4 !important;`}>
                        [{s.type}] {s.title}
                      </Body>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Timeline + State */}
          <div className={css`display: flex; gap: 24px; align-items: flex-start;`}>
            <EventTimeline
              events={events}
              selectedVersion={currentVersion}
              onSelectVersion={setCurrentVersion}
            />
            <AggregateStateView
              events={events}
              currentVersion={currentVersion}
            />
          </div>
        </>
      )}

      {/* Empty state */}
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
