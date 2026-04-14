'use client';

import { css, keyframes } from '@emotion/css';
import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '@leafygreen-ui/button';
import Card from '@leafygreen-ui/card';
import Badge from '@leafygreen-ui/badge';
import Icon from '@leafygreen-ui/icon';
import { H3, Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '../../components/Providers';
import PageHeader from '@/components/shared/PageHeader';
import { BarChart, Bar, XAxis, YAxis, Cell, LabelList, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import TextInput from '@leafygreen-ui/text-input';

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuestionScore {
  id: string;
  question: string;
  category: string;
  answer_preview: string;
  context_count: number;
  tool_calls?: string[];
  expected_tools?: string[];
  source?: 'user' | 'test';
  scores: {
    faithfulness: number | null;
    answer_relevancy: number | null;
    context_relevance: number | null;
    topic_adherence: number | null;
    tool_call_accuracy: number | null;
    tool_call_f1: number | null;
    agent_goal_accuracy: number | null;
  };
}

interface EvalRun {
  _id: string;
  run_tag: string;
  timestamp: string;
  metrics: {
    faithfulness: number | null;
    answer_relevancy: number | null;
    context_relevance: number | null;
    topic_adherence: number | null;
    tool_call_accuracy: number | null;
    tool_call_f1: number | null;
    agent_goal_accuracy: number | null;
  };
  questions: QuestionScore[];
  sample_count: number;
  ragas_faithfulness: boolean;
}

interface RunStatus {
  status: 'idle' | 'running' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

interface AdvisorInteraction {
  question: string;
  tool_calls?: string[];
  timestamp: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtScore(v: number | null | undefined): string {
  if (v == null) return '—';
  return (v * 100).toFixed(0) + '%';
}

function scoreColor(v: number | null | undefined, darkMode: boolean): string {
  if (v == null) return palette.gray.base;
  if (v >= 0.8) return darkMode ? palette.green.light2 : palette.green.dark1;
  if (v >= 0.6) return darkMode ? palette.yellow.light2 : palette.yellow.dark2;
  return darkMode ? palette.red.light2 : palette.red.base;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}

function scoreLabel(v: number | null | undefined): string {
  if (v == null) return '';
  if (v >= 0.85) return 'Excellent';
  if (v >= 0.7) return 'Good';
  if (v >= 0.5) return 'Moderate';
  return 'Needs improvement';
}

function scoreInterpretation(metric: string, v: number | null | undefined): string {
  if (v == null) return '';
  const pct = Math.round((v ?? 0) * 100);
  if (metric === 'faithfulness') {
    if (v >= 0.85) return `${pct}% — The model's answers closely follow what was in the retrieved documents, with minimal hallucination. Retrieved context is being used effectively.`;
    if (v >= 0.65) return `${pct}% — Most of the answer is grounded in context, but some statements may extend beyond or slightly contradict the source documents.`;
    return `${pct}% — The model is generating content not supported by retrieved context. This could mean the documents lack sufficient coverage, or the LLM is over-relying on its training knowledge.`;
  }
  if (metric === 'answer_relevancy') {
    if (v >= 0.85) return `${pct}% — Answers directly address the questions asked, staying on topic with appropriate depth.`;
    if (v >= 0.65) return `${pct}% — Answers are mostly relevant but may include tangential information or miss some aspects of the question.`;
    return `${pct}% — Answers frequently deviate from the question. This can indicate the retrieval step is returning off-topic context, which then misleads the LLM.`;
  }
  if (metric === 'context_relevance') {
    if (v >= 0.85) return `${pct}% — Atlas Vector Search is retrieving highly relevant documents for these questions. Embedding quality is strong.`;
    if (v >= 0.65) return `${pct}% — Retrieved documents are generally relevant but include some noise. Hybrid search filters or chunk sizing may help.`;
    return `${pct}% — Retrieved documents are often off-topic. Consider reviewing the document collection, adjusting the vector search parameters, or adding more targeted documents.`;
  }
  return '';
}

// ── Animations ────────────────────────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// ── Metric card with explanation ──────────────────────────────────────────────

const METRIC_DEFINITIONS: Record<string, { what: string; how: string; scorer: string }> = {
  faithfulness: {
    what: 'Measures whether every claim in the generated answer is directly supported by the retrieved context documents.',
    how: 'The LLM is asked to decompose the answer into atomic statements. Each statement is checked against the context. Score = supported statements ÷ total statements.',
    scorer: 'RAGAS (when installed) or LLM judge fallback',
  },
  answer_relevancy: {
    what: 'Measures how well the answer addresses the original question — penalises answers that are off-topic, incomplete, or include irrelevant padding.',
    how: 'An LLM judge reads the question + answer and returns a 0–1 score. It checks whether the answer is focused, addresses all aspects of the question, and avoids filler.',
    scorer: 'LLM judge (Claude claude-opus-4-6)',
  },
  context_relevance: {
    what: 'Measures whether the documents retrieved by Atlas Vector Search are actually relevant to answering the question.',
    how: 'An LLM judge reads the question and all retrieved chunks (up to 5). It scores how useful those chunks are for answering the question. Low score = retrieval is surfacing noise.',
    scorer: 'LLM judge (Claude claude-opus-4-6)',
  },
};

function MetricCard({
  metricKey, label, value, darkMode, accentColor,
}: {
  metricKey: string;
  label: string;
  value: number | null | undefined;
  darkMode: boolean;
  accentColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const color = scoreColor(value, darkMode);
  const labelColor = darkMode ? palette.gray.light1 : palette.gray.dark2;
  const trackBg = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const expandBg = darkMode ? 'rgba(255,255,255,0.04)' : palette.gray.light3;
  const def = METRIC_DEFINITIONS[metricKey];
  const accent = accentColor ?? palette.green.base;

  return (
    <Card darkMode={darkMode} className={css`flex: 1; min-width: 240px; padding: 0; overflow: hidden;`}>
      <div className={css`height: 3px; background: ${accent}; opacity: 0.85;`} />
      <div className={css`padding: 20px 24px 16px;`}>
        <Body className={css`font-weight: 600; color: ${labelColor}; text-transform: uppercase; font-size: 11px; letter-spacing: 0.06em; margin-bottom: 10px;`}>
          {label}
        </Body>
        <div className={css`display: flex; align-items: flex-end; gap: 12px; margin-bottom: 10px;`}>
          <div className={css`font-size: 40px; font-weight: 700; color: ${color}; line-height: 1;`}>
            {fmtScore(value)}
          </div>
          {value != null && (
            <Badge variant={value >= 0.8 ? 'green' : value >= 0.6 ? 'yellow' : 'red'}>
              {scoreLabel(value)}
            </Badge>
          )}
        </div>
        <div className={css`height: 6px; border-radius: 3px; background: ${trackBg}; overflow: hidden; margin-bottom: 14px;`}>
          <div className={css`height: 100%; width: ${value != null ? Math.round(value * 100) : 0}%; background: ${color}; border-radius: 3px; transition: width 0.6s ease;`} />
        </div>
        {value != null && (
          <Body className={css`font-size: 12px; color: ${color}; line-height: 1.5;`}>
            {scoreInterpretation(metricKey, value)}
          </Body>
        )}
      </div>

      {/* Expandable definition */}
      {def && (
        <>
          <button
            onClick={() => setOpen(v => !v)}
            className={css`
              display: flex; align-items: center; gap: 6px; width: 100%;
              padding: 8px 16px; border: none; border-top: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
              background: ${expandBg}; cursor: pointer; font-family: inherit;
              font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
              color: ${darkMode ? palette.gray.light1 : palette.gray.dark1}; text-align: left;
              &:hover { background: ${darkMode ? 'rgba(255,255,255,0.07)' : palette.gray.light2}; }
            `}
          >
            <Icon glyph={open ? 'ChevronDown' : 'ChevronRight'} size={10} />
            How it's measured
          </button>
          {open && (
            <div className={css`padding: 14px 16px; background: ${expandBg}; animation: ${fadeIn} 0.15s ease;`}>
              <div className={css`display: flex; flex-direction: column; gap: 8px;`}>
                <div>
                  <span className={css`font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: ${darkMode ? palette.gray.light1 : palette.gray.dark2};`}>What it measures</span>
                  <p className={css`margin: 4px 0 0; font-size: 12px; color: ${darkMode ? palette.gray.light2 : palette.gray.dark2}; line-height: 1.5;`}>{def.what}</p>
                </div>
                <div>
                  <span className={css`font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: ${darkMode ? palette.gray.light1 : palette.gray.dark2};`}>How it's calculated</span>
                  <p className={css`margin: 4px 0 0; font-size: 12px; color: ${darkMode ? palette.gray.light2 : palette.gray.dark2}; line-height: 1.5;`}>{def.how}</p>
                </div>
                <div className={css`display: flex; align-items: center; gap: 6px;`}>
                  <Icon glyph="Sparkle" size={12} fill={darkMode ? palette.green.light1 : palette.green.dark1} />
                  <span className={css`font-size: 11px; color: ${darkMode ? palette.green.light1 : palette.green.dark1};`}>{def.scorer}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({
  label, accent, darkMode,
}: { label: string; accent: string; darkMode: boolean }) {
  return (
    <div className={css`display: flex; align-items: center; gap: 8px;`}>
      <div className={css`width: 3px; height: 16px; border-radius: 2px; background: ${accent}; flex-shrink: 0;`} />
      <span className={css`font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: ${darkMode ? palette.gray.light1 : palette.gray.dark2};`}>
        {label}
      </span>
    </div>
  );
}

// ── Tool label map ────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  analyze_portfolio: 'Portfolio Analysis',
  search_policies: 'EU Policy Search',
  search_market_intel: 'Market Intel Search',
  get_generator_status: 'Generator Status',
  web_search: 'Web Search',
  find: 'MongoDB Find',
  aggregate: 'MongoDB Aggregate',
};

// ── Question row with expandable pipeline trace ────────────────────────────────

function QuestionRow({
  q, index, darkMode, ragas_faithfulness,
}: {
  q: QuestionScore;
  index: number;
  darkMode: boolean;
  ragas_faithfulness: boolean;
}) {
  const [open, setOpen] = useState(false);
  const textColor = darkMode ? palette.gray.light2 : palette.gray.dark2;
  const mutedColor = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;
  const rowAltBg = darkMode ? 'rgba(255,255,255,0.03)' : palette.gray.light3;
  const expandBg = darkMode ? 'rgba(255,255,255,0.05)' : palette.gray.light3;
  const codeBg = darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)';

  const faithScore = q.scores.faithfulness;
  const ansRelScore = q.scores.answer_relevancy;
  const ctxRelScore = q.scores.context_relevance;
  const topicAdh = q.scores.topic_adherence;
  const toolF1 = q.scores.tool_call_f1;
  const goalAcc = q.scores.agent_goal_accuracy;

  const pipelineSteps = [
    {
      icon: 'Database',
      label: 'Atlas Vector Search',
      detail: `Retrieved ${q.context_count} context chunk${q.context_count !== 1 ? 's' : ''} using VoyageAI voyage-finance-2 embeddings (1024-dim)`,
      color: palette.blue.base,
    },
    {
      icon: 'Sparkle',
      label: 'Claude LLM',
      detail: 'Generated answer using retrieved context only — no tools, pure RAG',
      color: palette.green.base,
    },
    {
      icon: 'CheckmarkWithCircle',
      label: ragas_faithfulness ? 'RAGAS + LLM Judge' : 'LLM Judge (×3)',
      detail: ragas_faithfulness
        ? 'Faithfulness scored by RAGAS decomposition · Answer relevancy + context relevance by Claude LLM judge'
        : 'All three metrics scored by Claude LLM judge (RAGAS not installed)',
      color: palette.purple.base,
    },
  ];

  return (
    <>
      <tr
        onClick={() => setOpen(v => !v)}
        className={css`
          border-bottom: 1px solid ${open ? 'transparent' : borderColor};
          background: ${open ? (darkMode ? 'rgba(255,255,255,0.06)' : palette.gray.light2) : (index % 2 === 0 ? 'transparent' : rowAltBg)};
          cursor: pointer;
          transition: background 0.12s;
          &:hover { background: ${darkMode ? 'rgba(255,255,255,0.07)' : palette.gray.light2}; }
        `}
      >
        <td className={css`padding: 10px 12px; width: 18px;`}>
          <Icon glyph={open ? 'ChevronDown' : 'ChevronRight'} size={12} fill={mutedColor} />
        </td>
        <td className={css`padding: 10px 12px; max-width: 320px; color: ${textColor}; font-size: 13px;`}>
          {q.question.length > 72 ? q.question.slice(0, 72) + '…' : q.question}
        </td>
        <td className={css`padding: 10px 12px; white-space: nowrap;`}>
          <div className={css`display: flex; flex-direction: column; gap: 3px;`}>
            <Badge variant={q.category === 'Policy' ? 'blue' : q.category === 'Compliance' ? 'yellow' : q.category === 'User Query' ? 'green' : 'green'}>
              {q.category}
            </Badge>
            {q.source === 'user' && (
              <span className={css`font-size: 9px; font-weight: 600; color: ${palette.green.base}; text-transform: uppercase; letter-spacing: 0.05em;`}>
                from chat
              </span>
            )}
          </div>
        </td>
        <td className={css`padding: 10px 12px; text-align: center; color: ${mutedColor}; font-size: 13px;`}>
          {q.context_count}
        </td>
        <td className={css`padding: 10px 12px; text-align: center;`}>
          <span className={css`font-weight: 700; font-size: 13px; color: ${scoreColor(faithScore, darkMode)};`}>{fmtScore(faithScore)}</span>
        </td>
        <td className={css`padding: 10px 12px; text-align: center;`}>
          <span className={css`font-weight: 700; font-size: 13px; color: ${scoreColor(ansRelScore, darkMode)};`}>{fmtScore(ansRelScore)}</span>
        </td>
        <td className={css`padding: 10px 12px; text-align: center;`}>
          <span className={css`font-weight: 700; font-size: 13px; color: ${scoreColor(ctxRelScore, darkMode)};`}>{fmtScore(ctxRelScore)}</span>
        </td>
        <td className={css`padding: 10px 12px; text-align: center;`}>
          <span className={css`font-weight: 700; font-size: 13px; color: ${scoreColor(topicAdh, darkMode)};`}>{fmtScore(topicAdh)}</span>
        </td>
        <td className={css`padding: 10px 12px; text-align: center;`}>
          <span className={css`font-weight: 700; font-size: 13px; color: ${scoreColor(toolF1, darkMode)};`}>{fmtScore(toolF1)}</span>
        </td>
        <td className={css`padding: 10px 12px; text-align: center;`}>
          <span className={css`font-weight: 700; font-size: 13px; color: ${scoreColor(goalAcc, darkMode)};`}>{fmtScore(goalAcc)}</span>
        </td>
      </tr>

      {open && (
        <tr className={css`border-bottom: 1px solid ${borderColor};`}>
          <td colSpan={10} className={css`padding: 0;`}>
            <div className={css`padding: 16px 20px 20px; background: ${expandBg}; animation: ${fadeIn} 0.15s ease;`}>
              <div className={css`display: grid; grid-template-columns: 1fr 1fr; gap: 20px;`}>

                {/* Left: Pipeline trace */}
                <div>
                  <div className={css`font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: ${mutedColor}; margin-bottom: 12px;`}>
                    Pipeline Trace
                  </div>
                  <div className={css`display: flex; flex-direction: column; gap: 0;`}>
                    {pipelineSteps.map((step, i) => (
                      <div key={i} className={css`display: flex; gap: 10px; align-items: stretch;`}>
                        <div className={css`display: flex; flex-direction: column; align-items: center; width: 22px;`}>
                          <div className={css`width: 22px; height: 22px; border-radius: 50%; background: ${step.color}22; border: 1.5px solid ${step.color}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;`}>
                            <Icon glyph={step.icon as any} size={11} fill={step.color} />
                          </div>
                          {i < pipelineSteps.length - 1 && (
                            <div className={css`width: 1.5px; flex: 1; min-height: 10px; background: ${darkMode ? palette.gray.dark2 : palette.gray.light2}; margin: 2px 0;`} />
                          )}
                        </div>
                        <div className={css`padding-bottom: ${i < pipelineSteps.length - 1 ? '10px' : '0'}; padding-top: 2px;`}>
                          <div className={css`font-size: 12px; font-weight: 600; color: ${textColor};`}>{step.label}</div>
                          <div className={css`font-size: 11px; color: ${mutedColor}; line-height: 1.5; margin-top: 2px;`}>{step.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {q.tool_calls && q.tool_calls.length > 0 && (
                    <div className={css`margin-top: 12px;`}>
                      <div className={css`font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: ${mutedColor}; margin-bottom: 6px;`}>
                        Agent Tools Used
                      </div>
                      <div className={css`display: flex; flex-wrap: wrap; gap: 4px;`}>
                        {q.tool_calls.map((tool) => (
                          <span
                            key={tool}
                            className={css`
                              display: inline-flex; align-items: center; gap: 4px;
                              padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;
                              background: ${darkMode ? 'rgba(255,255,255,0.08)' : palette.gray.light2};
                              color: ${darkMode ? palette.gray.light2 : palette.gray.dark2};
                              border: 1px solid ${darkMode ? 'rgba(255,255,255,0.12)' : palette.gray.light1};
                            `}
                          >
                            {TOOL_LABELS[tool] || tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Answer preview + score breakdown */}
                <div className={css`display: flex; flex-direction: column; gap: 14px;`}>
                  {/* Answer preview */}
                  <div>
                    <div className={css`font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: ${mutedColor}; margin-bottom: 8px;`}>
                      Generated Answer
                    </div>
                    <div className={css`background: ${codeBg}; border-radius: 6px; padding: 10px 14px; font-size: 12px; line-height: 1.6; color: ${textColor}; border-left: 3px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};`}>
                      {q.answer_preview || <span className={css`opacity: 0.5; font-style: italic;`}>No preview available</span>}
                      {q.answer_preview && q.answer_preview.length >= 299 && (
                        <span className={css`opacity: 0.5;`}> …</span>
                      )}
                    </div>
                  </div>

                  {/* Score breakdown */}
                  <div>
                    <div className={css`font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: ${mutedColor}; margin-bottom: 8px;`}>
                      Score Breakdown
                    </div>
                    <div className={css`display: flex; flex-direction: column; gap: 6px;`}>
                      {[
                        { label: 'Faithfulness', key: 'faithfulness', v: faithScore },
                        { label: 'Answer Relevancy', key: 'answer_relevancy', v: ansRelScore },
                        { label: 'Context Relevance', key: 'context_relevance', v: ctxRelScore },
                        { label: 'Topic Adherence', key: 'topic_adherence', v: topicAdh },
                        { label: 'Tool Call F1', key: 'tool_call_f1', v: toolF1 },
                        { label: 'Agent Goal Accuracy', key: 'agent_goal_accuracy', v: goalAcc },
                      ].filter(({ v }) => v != null).map(({ label, key, v }) => (
                        <div key={key}>
                          <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 3px;`}>
                            <span className={css`font-size: 11px; font-weight: 600; color: ${mutedColor}; min-width: 130px;`}>{label}</span>
                            <span className={css`font-size: 12px; font-weight: 700; color: ${scoreColor(v, darkMode)};`}>{fmtScore(v)}</span>
                            {v != null && <Badge variant={v >= 0.8 ? 'green' : v >= 0.6 ? 'yellow' : 'red'}>{scoreLabel(v)}</Badge>}
                          </div>
                          {v != null && (
                            <div className={css`font-size: 11px; color: ${mutedColor}; line-height: 1.5; padding-left: 138px;`}>
                              {scoreInterpretation(key, v)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Term Bubble helpers ───────────────────────────────────────────────────────

interface TermHallucinationData {
  term: string;
  avgFaithfulness: number | null;
  queryCount: number;
  evalCount: number;
  tools: string[];
}

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','are','was','were','be','been','being','have','has','had','do',
  'does','did','will','would','could','should','may','might','can','this','that',
  'these','those','it','its','i','you','we','they','he','she','what','how',
  'why','when','where','which','who','any','all','each','both','few','more',
  'most','other','into','through','during','before','after','above','below',
  'between','out','off','over','under','again','then','here','there','s','t',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

function extractHallucinationTerms(
  interactions: AdvisorInteraction[],
  evalQuestions: QuestionScore[],
): TermHallucinationData[] {
  // Frequency + tool usage from real advisor interactions
  const freq: Record<string, { count: number; tools: Set<string> }> = {};
  for (const item of interactions) {
    for (const word of tokenize(item.question)) {
      if (!freq[word]) freq[word] = { count: 0, tools: new Set() };
      freq[word].count++;
      for (const t of item.tool_calls ?? []) freq[word].tools.add(t);
    }
  }

  // Faithfulness scores per term from eval questions
  const faithMap: Record<string, number[]> = {};
  for (const q of evalQuestions) {
    if (q.scores.faithfulness == null) continue;
    const seen = new Set<string>();
    for (const word of tokenize(q.question)) {
      if (seen.has(word)) continue;
      seen.add(word);
      if (!faithMap[word]) faithMap[word] = [];
      faithMap[word].push(q.scores.faithfulness);
    }
  }

  const hasEvalData = Object.keys(faithMap).length > 0;

  if (hasEvalData) {
    // Sort by avg faithfulness ascending — worst (most hallucination) first
    return Object.entries(faithMap)
      .map(([term, scores]) => {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const interData = freq[term];
        return {
          term,
          avgFaithfulness: avg,
          queryCount: interData?.count ?? 0,
          evalCount: scores.length,
          tools: interData ? [...interData.tools] : [],
        };
      })
      .sort((a, b) => (a.avgFaithfulness ?? 1) - (b.avgFaithfulness ?? 1))
      .slice(0, 15);
  }

  // Fallback: just frequency when no eval faithfulness data yet
  return Object.entries(freq)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([term, v]) => ({
      term,
      avgFaithfulness: null,
      queryCount: v.count,
      evalCount: 0,
      tools: [...v.tools],
    }));
}

function termBarColor(v: number | null): string {
  if (v == null) return palette.green.base;
  if (v < 0.5) return palette.red.base;
  if (v < 0.7) return palette.yellow.dark2;
  return palette.green.base;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EvalsPage() {
  const { darkMode } = useDarkMode();
  const [latestRun, setLatestRun] = useState<EvalRun | null>(null);
  const [recentRuns, setRecentRuns] = useState<Omit<EvalRun, 'questions'>[]>([]);
  const [runStatus, setRunStatus] = useState<RunStatus>({
    status: 'idle', started_at: null, completed_at: null, error: null,
  });
  const [loading, setLoading] = useState(true);
  const [interactions, setInteractions] = useState<AdvisorInteraction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 6;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const textColor = darkMode ? palette.gray.light2 : palette.gray.dark2;
  const mutedColor = darkMode ? palette.gray.light1 : palette.gray.dark1;
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;

  const fetchLatest = async () => {
    try {
      const [latestRes, historyRes, interactionsRes] = await Promise.all([
        fetch('/api/evals/results/latest'),
        fetch('/api/evals/results?limit=6'),
        fetch('/api/evals/interactions?limit=50'),
      ]);
      const latest = await latestRes.json();
      const history = await historyRes.json();
      const interactionData = await interactionsRes.json();
      setLatestRun(latest);
      setRecentRuns(history);
      setInteractions(Array.isArray(interactionData) ? interactionData : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/evals/status');
      const status: RunStatus = await res.json();
      setRunStatus(status);
      if (status.status === 'completed' || status.status === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        if (status.status === 'completed') await fetchLatest();
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchLatest();
    fetchStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleRunEvals = async () => {
    try {
      await fetch('/api/evals/run', { method: 'POST' });
      setRunStatus(s => ({ ...s, status: 'running', started_at: new Date().toISOString() }));
      pollRef.current = setInterval(fetchStatus, 4000);
    } catch { /* ignore */ }
  };

  const isRunning = runStatus.status === 'running';

  const allQuestions = latestRun?.questions ?? [];
  const filteredQuestions = searchQuery.trim()
    ? allQuestions.filter(q =>
        q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allQuestions;
  const totalPages = Math.ceil(filteredQuestions.length / PAGE_SIZE);
  const pagedQuestions = filteredQuestions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const hallucinationTerms = useMemo(
    () => extractHallucinationTerms(interactions, latestRun?.questions ?? []),
    [interactions, latestRun],
  );
  const hasEvalFaithfulness = hallucinationTerms.some(t => t.avgFaithfulness != null);

  return (
    <div className={css`display: flex; flex-direction: column; gap: 24px;`}>
      {/* Header */}
      <div className={css`display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px;`}>
        <PageHeader
          title="RAGAS Evaluation Dashboard"
          subtitle={latestRun
            ? `Last run: ${fmtDate(latestRun.timestamp)} · ${latestRun.sample_count} test cases · ${latestRun.ragas_faithfulness ? 'RAGAS + LLM judge' : 'LLM judge only'}`
            : 'Evaluate the RAG pipeline quality across faithfulness, relevancy, and context retrieval'}
        />
        <div className={css`display: flex; align-items: center; gap: 10px; flex-shrink: 0;`}>
          {isRunning && <Badge variant="yellow">Running…</Badge>}
          {runStatus.status === 'failed' && <Badge variant="red">Failed</Badge>}
          <Button
            variant="primary"
            isLoading={isRunning}
            loadingText="Running…"
            onClick={handleRunEvals}
            disabled={isRunning}
            darkMode={darkMode}
          >
            Run Evaluations
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {runStatus.status === 'failed' && runStatus.error && (
        <div className={css`padding: 12px 16px; border-radius: 6px; background: ${darkMode ? 'rgba(207,60,60,0.15)' : palette.red.light3}; border: 1px solid ${darkMode ? palette.red.dark3 : palette.red.light2}; color: ${darkMode ? palette.red.light2 : palette.red.dark2}; font-size: 14px;`}>
          <strong>Evaluation failed:</strong> {runStatus.error}
        </div>
      )}

      {/* Metric cards — RAG quality */}
      <div className={css`display: flex; flex-direction: column; gap: 10px;`}>
        <SectionLabel label="RAG Quality Metrics" accent={palette.blue.base} darkMode={darkMode} />
        <div className={css`display: flex; gap: 16px; flex-wrap: wrap;`}>
          <MetricCard darkMode={darkMode} metricKey="faithfulness" label="Faithfulness" value={latestRun?.metrics.faithfulness} accentColor={palette.blue.base} />
          <MetricCard darkMode={darkMode} metricKey="answer_relevancy" label="Answer Relevancy" value={latestRun?.metrics.answer_relevancy} accentColor={palette.blue.base} />
          <MetricCard darkMode={darkMode} metricKey="context_relevance" label="Context Relevance" value={latestRun?.metrics.context_relevance} accentColor={palette.blue.base} />
        </div>
      </div>

      {/* Metric cards — Agent / tool use */}
      {latestRun && (latestRun.metrics.topic_adherence != null || latestRun.metrics.tool_call_f1 != null) && (
        <div className={css`display: flex; flex-direction: column; gap: 10px;`}>
          <SectionLabel label="Agent & Tool-Use Metrics" accent={palette.purple.base} darkMode={darkMode} />
          <div className={css`display: flex; gap: 16px; flex-wrap: wrap;`}>
            <MetricCard darkMode={darkMode} metricKey="topic_adherence" label="Topic Adherence" value={latestRun?.metrics.topic_adherence} accentColor={palette.purple.base} />
            <MetricCard darkMode={darkMode} metricKey="tool_call_accuracy" label="Tool Call Accuracy" value={latestRun?.metrics.tool_call_accuracy} accentColor={palette.purple.base} />
            <MetricCard darkMode={darkMode} metricKey="tool_call_f1" label="Tool Call F1" value={latestRun?.metrics.tool_call_f1} accentColor={palette.purple.base} />
            <MetricCard darkMode={darkMode} metricKey="agent_goal_accuracy" label="Agent Goal Accuracy" value={latestRun?.metrics.agent_goal_accuracy} accentColor={palette.purple.base} />
          </div>
        </div>
      )}

      {/* ── Per-question breakdown with search + pagination ─── */}
      {latestRun && latestRun.questions && latestRun.questions.length > 0 && (
        <Card darkMode={darkMode} className={css`padding: 24px;`}>
          <div className={css`height: 3px; background: linear-gradient(90deg, ${palette.blue.base} 0%, ${palette.purple.base} 100%); margin: -24px -24px 24px; border-radius: 6px 6px 0 0; opacity: 0.7;`} />
          <div className={css`display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;`}>
            <H3 darkMode={darkMode}>Per-Question Results</H3>
            <div className={css`display: flex; align-items: center; gap: 10px; flex-wrap: wrap;`}>
              <div className={css`width: 260px;`}>
                <TextInput
                  type="search"
                  placeholder="Search questions…"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  darkMode={darkMode}
                  sizeVariant="small"
                  aria-label="Search questions"
                />
              </div>
              <Body className={css`color: ${mutedColor}; font-size: 12px;`}>
                Click a row to see pipeline trace + score explanation
              </Body>
            </div>
          </div>
          <div className={css`overflow-x: auto;`}>
            <table className={css`width: 100%; border-collapse: collapse; font-size: 14px;`}>
              <thead>
                <tr className={css`border-bottom: 2px solid ${borderColor}; text-align: left;`}>
                  <th className={css`padding: 8px 12px; width: 18px;`} />
                  {['Question', 'Category', 'Contexts', 'Faithful', 'Ans. Rel.', 'Ctx. Rel.', 'Topic Adh.', 'Tool F1', 'Goal Acc.'].map(h => (
                    <th key={h} className={css`padding: 8px 12px; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: ${textColor}; white-space: nowrap;`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedQuestions.length > 0 ? (
                  pagedQuestions.map((q, i) => (
                    <QuestionRow
                      key={q.id}
                      q={q}
                      index={i}
                      darkMode={darkMode}
                      ragas_faithfulness={latestRun.ragas_faithfulness}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className={css`padding: 20px 12px; text-align: center; color: ${mutedColor}; font-size: 13px;`}>
                      No questions match "{searchQuery}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={css`display: flex; align-items: center; justify-content: space-between; margin-top: 14px; flex-wrap: wrap; gap: 8px;`}>
              <Body className={css`color: ${mutedColor}; font-size: 12px;`}>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredQuestions.length)} of {filteredQuestions.length}
              </Body>
              <div className={css`display: flex; gap: 4px;`}>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className={css`padding: 4px 10px; border-radius: 4px; border: 1px solid ${borderColor}; background: transparent; color: ${textColor}; font-size: 12px; cursor: pointer; font-family: inherit; &:disabled { opacity: 0.4; cursor: default; } &:not(:disabled):hover { border-color: ${palette.green.base}; }`}
                >
                  ← Prev
                </button>
                {Array.from({ length: totalPages }, (_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentPage(idx + 1)}
                    className={css`padding: 4px 10px; border-radius: 4px; border: 1px solid ${currentPage === idx + 1 ? palette.green.base : borderColor}; background: ${currentPage === idx + 1 ? (darkMode ? palette.green.dark3 : palette.green.light3) : 'transparent'}; color: ${currentPage === idx + 1 ? palette.green.base : textColor}; font-size: 12px; cursor: pointer; font-family: inherit; font-weight: ${currentPage === idx + 1 ? '600' : '400'}; &:hover { border-color: ${palette.green.base}; }`}
                  >
                    {idx + 1}
                  </button>
                ))}
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className={css`padding: 4px 10px; border-radius: 4px; border: 1px solid ${borderColor}; background: transparent; color: ${textColor}; font-size: 12px; cursor: pointer; font-family: inherit; &:disabled { opacity: 0.4; cursor: default; } &:not(:disabled):hover { border-color: ${palette.green.base}; }`}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          <Body className={css`margin-top: 12px; font-size: 12px; color: ${mutedColor};`}>
            {latestRun.ragas_faithfulness
              ? 'Faithfulness: RAGAS decomposition · All other metrics: LLM judge'
              : 'All metrics scored by LLM judge (install ragas for RAGAS-native faithfulness)'}
            {' · Topic Adherence, Agent Goal Accuracy, Tool Call F1: RAGAS agent metrics'}
          </Body>
        </Card>
      )}

      {/* ── Hallucination Term Analysis ──────────────────────── */}
      {interactions.length > 0 && hallucinationTerms.length > 0 && (
        <Card darkMode={darkMode} className={css`padding: 24px;`}>
          <div className={css`height: 3px; background: ${palette.red.base}; margin: -24px -24px 24px; border-radius: 6px 6px 0 0; opacity: 0.6;`} />
          <div className={css`margin-bottom: 16px;`}>
            <H3 darkMode={darkMode}>Hallucination Risk by Query Term</H3>
            <Body className={css`color: ${mutedColor}; font-size: 12px; margin-top: 4px;`}>
              {hasEvalFaithfulness
                ? `Terms from eval questions ranked by avg faithfulness — red bars indicate hallucination risk. Based on ${interactions.length} advisor queries and ${latestRun?.questions?.length ?? 0} eval cases.`
                : `Top query terms from ${interactions.length} EnerLeafy AI queries. Run evaluations to see hallucination risk scores.`}
            </Body>
          </div>

          <div className={css`display: grid; grid-template-columns: 1fr 220px; gap: 24px; align-items: start;`}>
            {/* Horizontal bar chart */}
            <div style={{ height: Math.max(280, hallucinationTerms.length * 34) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={hallucinationTerms}
                  margin={{ top: 4, right: 56, bottom: 4, left: 8 }}
                  barCategoryGap="20%"
                >
                  <CartesianGrid
                    horizontal={false}
                    strokeDasharray="3 3"
                    stroke={darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}
                  />
                  <XAxis
                    type="number"
                    domain={hasEvalFaithfulness ? [0, 1] : [0, 'auto']}
                    tickFormatter={hasEvalFaithfulness ? v => `${Math.round(v * 100)}%` : undefined}
                    tick={{ fontSize: 10, fill: mutedColor }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="term"
                    width={90}
                    tick={{ fontSize: 12, fill: textColor, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  {hasEvalFaithfulness && (
                    <ReferenceLine
                      x={0.7}
                      stroke={darkMode ? palette.yellow.light2 : palette.yellow.dark2}
                      strokeDasharray="4 3"
                      label={{ value: '70%', position: 'top', fontSize: 10, fill: mutedColor }}
                    />
                  )}
                  <Tooltip
                    cursor={{ fill: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as TermHallucinationData;
                      return (
                        <div className={css`background: ${darkMode ? palette.gray.dark3 : palette.white}; border: 1px solid ${borderColor}; border-radius: 6px; padding: 10px 14px; font-size: 12px; color: ${textColor}; box-shadow: 0 4px 12px rgba(0,0,0,0.15); min-width: 180px;`}>
                          <div className={css`font-weight: 700; font-size: 13px; margin-bottom: 6px;`}>&ldquo;{d.term}&rdquo;</div>
                          {d.avgFaithfulness != null && (
                            <div className={css`margin-bottom: 3px;`}>
                              <span className={css`color: ${mutedColor};`}>Avg faithfulness: </span>
                              <span className={css`font-weight: 600; color: ${termBarColor(d.avgFaithfulness)};`}>{Math.round(d.avgFaithfulness * 100)}%</span>
                              {d.avgFaithfulness < 0.5 && <span className={css`margin-left: 6px; color: ${palette.red.base}; font-size: 11px;`}>⚠ High hallucination risk</span>}
                            </div>
                          )}
                          {d.evalCount > 0 && (
                            <div className={css`color: ${mutedColor};`}>Appears in {d.evalCount} eval question{d.evalCount > 1 ? 's' : ''}</div>
                          )}
                          {d.queryCount > 0 && (
                            <div className={css`color: ${mutedColor};`}>Asked {d.queryCount}× by users</div>
                          )}
                          {d.tools.length > 0 && (
                            <div className={css`margin-top: 5px; padding-top: 5px; border-top: 1px solid ${borderColor}; color: ${darkMode ? palette.green.light1 : palette.green.dark1};`}>
                              Tools: {d.tools.map(t => TOOL_LABELS[t] || t).join(', ')}
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey={hasEvalFaithfulness ? 'avgFaithfulness' : 'queryCount'}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={22}
                  >
                    {hallucinationTerms.map(entry => (
                      <Cell key={entry.term} fill={termBarColor(entry.avgFaithfulness)} fillOpacity={0.85} />
                    ))}
                    <LabelList
                      dataKey={hasEvalFaithfulness ? 'avgFaithfulness' : 'queryCount'}
                      position="right"
                      formatter={(v: number) => hasEvalFaithfulness ? `${Math.round(v * 100)}%` : `${v}×`}
                      style={{ fill: mutedColor, fontSize: 11 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Sidebar: legend + tool usage */}
            <div>
              {hasEvalFaithfulness && (
                <div className={css`margin-bottom: 16px;`}>
                  <div className={css`font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: ${mutedColor}; margin-bottom: 8px;`}>Faithfulness Legend</div>
                  {[
                    { label: '< 50% — High risk', color: palette.red.base },
                    { label: '50–70% — Moderate', color: palette.yellow.dark2 },
                    { label: '> 70% — Low risk', color: palette.green.base },
                  ].map(row => (
                    <div key={row.label} className={css`display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 12px; color: ${textColor};`}>
                      <div className={css`width: 12px; height: 12px; border-radius: 2px; flex-shrink: 0; background: ${row.color};`} />
                      {row.label}
                    </div>
                  ))}
                </div>
              )}

              <div className={css`padding-top: ${hasEvalFaithfulness ? '12px' : '0'}; border-top: ${hasEvalFaithfulness ? `1px solid ${borderColor}` : 'none'};`}>
                <div className={css`font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: ${mutedColor}; margin-bottom: 8px;`}>
                  Tool Usage
                </div>
                {(() => {
                  const toolCounts: Record<string, number> = {};
                  for (const item of interactions) {
                    for (const t of item.tool_calls ?? []) {
                      toolCounts[t] = (toolCounts[t] ?? 0) + 1;
                    }
                  }
                  const total = Object.values(toolCounts).reduce((a, b) => a + b, 0) || 1;
                  return Object.entries(toolCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([tool, count]) => (
                      <div key={tool} className={css`margin-bottom: 6px;`}>
                        <div className={css`display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;`}>
                          <span className={css`color: ${textColor};`}>{TOOL_LABELS[tool] || tool}</span>
                          <span className={css`color: ${mutedColor};`}>{count}×</span>
                        </div>
                        <div className={css`height: 3px; border-radius: 2px; background: ${darkMode ? palette.gray.dark2 : palette.gray.light2};`}>
                          <div className={css`height: 100%; width: ${Math.round((count / total) * 100)}%; background: ${darkMode ? palette.green.light1 : palette.green.dark1}; border-radius: 2px;`} />
                        </div>
                      </div>
                    ));
                })()}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Run history */}
      {recentRuns.length > 0 && (
        <Card darkMode={darkMode} className={css`padding: 24px;`}>
          <div className={css`height: 3px; background: ${darkMode ? palette.gray.dark2 : palette.gray.light2}; margin: -24px -24px 24px; border-radius: 6px 6px 0 0;`} />
          <H3 darkMode={darkMode} className={css`margin-bottom: 16px;`}>Run History</H3>
          <div className={css`display: flex; flex-direction: column; gap: 6px;`}>
            {recentRuns.map((run, i) => (
              <div
                key={run._id}
                className={css`
                  display: flex; align-items: center; gap: 16px;
                  padding: 10px 14px; border-radius: 6px;
                  background: ${i === 0 ? (darkMode ? 'rgba(0,163,92,0.08)' : 'rgba(0,163,92,0.06)') : 'transparent'};
                  border: 1px solid ${i === 0 ? (darkMode ? palette.green.dark2 : palette.green.light2) : 'transparent'};
                  flex-wrap: wrap; transition: background 0.12s;
                `}
              >
                <div className={css`display: flex; align-items: center; gap: 8px; min-width: 210px;`}>
                  {i === 0 && <div className={css`width: 6px; height: 6px; border-radius: 50%; background: ${palette.green.base}; flex-shrink: 0;`} />}
                  <Body className={css`color: ${textColor}; font-size: 13px;`}>
                    {fmtDate(run.timestamp)}
                  </Body>
                  {i === 0 && <Badge variant="green">latest</Badge>}
                </div>
                <div className={css`display: flex; gap: 16px; font-size: 12px; flex-wrap: wrap;`}>
                  {[
                    { label: 'Faithful', v: run.metrics.faithfulness, accent: palette.blue.base },
                    { label: 'Ans. Rel.', v: run.metrics.answer_relevancy, accent: palette.blue.base },
                    { label: 'Ctx. Rel.', v: run.metrics.context_relevance, accent: palette.blue.base },
                    ...(run.metrics.tool_call_f1 != null ? [{ label: 'Tool F1', v: run.metrics.tool_call_f1, accent: palette.purple.base }] : []),
                    ...(run.metrics.agent_goal_accuracy != null ? [{ label: 'Goal Acc.', v: run.metrics.agent_goal_accuracy, accent: palette.purple.base }] : []),
                  ].map(({ label, v, accent }) => (
                    <span key={label} className={css`display: flex; align-items: center; gap: 4px;`}>
                      <span className={css`width: 5px; height: 5px; border-radius: 50%; background: ${accent}; flex-shrink: 0; opacity: 0.7;`} />
                      <span className={css`color: ${mutedColor};`}>{label}: </span>
                      <strong style={{ color: scoreColor(v, darkMode) }}>{fmtScore(v)}</strong>
                    </span>
                  ))}
                </div>
                <Body className={css`margin-left: auto; color: ${mutedColor}; font-size: 12px;`}>
                  {run.sample_count} cases
                </Body>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !latestRun && (
        <Card darkMode={darkMode} className={css`padding: 48px; text-align: center;`}>
          <div className={css`display: flex; flex-direction: column; align-items: center; gap: 16px;`}>
            <div className={css`font-size: 16px; font-weight: 600; color: ${textColor};`}>No evaluations run yet</div>
            <Body className={css`color: ${mutedColor}; max-width: 480px;`}>
              Click <strong>Run Evaluations</strong> to test the RAG pipeline against 6 energy market questions
              using RAGAS faithfulness and LLM judge metrics.
            </Body>
            <Button variant="primary" darkMode={darkMode} onClick={handleRunEvals} disabled={isRunning}>
              Run Evaluations
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
