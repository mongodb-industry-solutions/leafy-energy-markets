'use client';

import { css } from '@emotion/css';
import { useEffect, useRef, useState } from 'react';
import Button from '@leafygreen-ui/button';
import Card from '@leafygreen-ui/card';
import Badge from '@leafygreen-ui/badge';
import { H2, H3, Subtitle, Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuestionScore {
  id: string;
  question: string;
  category: string;
  answer_preview: string;
  context_count: number;
  scores: {
    faithfulness: number | null;
    answer_relevancy: number | null;
    context_relevance: number | null;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtScore(v: number | null | undefined): string {
  if (v == null) return '—';
  return (v * 100).toFixed(0) + '%';
}

function scoreColor(v: number | null | undefined): string {
  if (v == null) return palette.gray.base;
  if (v >= 0.8) return palette.green.dark1;
  if (v >= 0.6) return palette.yellow.dark2;
  return palette.red.base;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number | null | undefined;
  description: string;
}) {
  const color = scoreColor(value);
  return (
    <Card
      className={css`
        flex: 1;
        min-width: 180px;
        padding: 20px 24px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      `}
    >
      <Body
        className={css`
          font-weight: 600;
          color: ${palette.gray.dark2};
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.06em;
        `}
      >
        {label}
      </Body>
      <div
        className={css`
          font-size: 36px;
          font-weight: 700;
          color: ${color};
          line-height: 1;
        `}
      >
        {fmtScore(value)}
      </div>
      {/* Score bar */}
      <div
        className={css`
          height: 6px;
          border-radius: 3px;
          background: ${palette.gray.light2};
          overflow: hidden;
        `}
      >
        <div
          className={css`
            height: 100%;
            width: ${value != null ? Math.round(value * 100) : 0}%;
            background: ${color};
            border-radius: 3px;
            transition: width 0.6s ease;
          `}
        />
      </div>
      <Body
        className={css`
          color: ${palette.gray.dark1};
          font-size: 12px;
        `}
      >
        {description}
      </Body>
    </Card>
  );
}

function ScoreCell({ value }: { value: number | null | undefined }) {
  return (
    <span
      className={css`
        font-weight: 600;
        color: ${scoreColor(value)};
      `}
    >
      {fmtScore(value)}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EvalsPage() {
  const [latestRun, setLatestRun] = useState<EvalRun | null>(null);
  const [recentRuns, setRecentRuns] = useState<Omit<EvalRun, 'questions'>[]>([]);
  const [runStatus, setRunStatus] = useState<RunStatus>({
    status: 'idle',
    started_at: null,
    completed_at: null,
    error: null,
  });
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLatest = async () => {
    try {
      const [latestRes, historyRes] = await Promise.all([
        fetch('/api/evals/results/latest'),
        fetch('/api/evals/results?limit=5'),
      ]);
      const latest = await latestRes.json();
      const history = await historyRes.json();
      setLatestRun(latest);
      setRecentRuns(history);
    } catch {
      // silently ignore — backend might not be ready
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
        if (status.status === 'completed') {
          await fetchLatest();
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchLatest();
    fetchStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleRunEvals = async () => {
    try {
      await fetch('/api/evals/run', { method: 'POST' });
      setRunStatus((s) => ({ ...s, status: 'running', started_at: new Date().toISOString() }));
      // Poll every 4 seconds while running
      pollRef.current = setInterval(fetchStatus, 4000);
    } catch {
      // ignore
    }
  };

  const isRunning = runStatus.status === 'running';

  return (
    <div
      className={css`
        padding: 32px 40px;
        max-width: 1200px;
        display: flex;
        flex-direction: column;
        gap: 28px;
      `}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className={css`
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        `}
      >
        <div>
          <H2>RAGAS Evaluation Dashboard</H2>
          <Body
            className={css`
              color: ${palette.gray.dark1};
              margin-top: 4px;
            `}
          >
            {latestRun
              ? `Last run: ${fmtDate(latestRun.timestamp)} · ${latestRun.sample_count} test cases`
              : 'No evaluation runs yet — click Run to start.'}
          </Body>
        </div>
        <div
          className={css`
            display: flex;
            align-items: center;
            gap: 12px;
          `}
        >
          {isRunning && (
            <Badge variant="yellow">Running…</Badge>
          )}
          {runStatus.status === 'failed' && (
            <Badge variant="red">Failed</Badge>
          )}
          <Button
            variant="primary"
            isLoading={isRunning}
            loadingText="Running…"
            onClick={handleRunEvals}
            disabled={isRunning}
          >
            Run Evaluations
          </Button>
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {runStatus.status === 'failed' && runStatus.error && (
        <div
          className={css`
            padding: 12px 16px;
            border-radius: 6px;
            background: ${palette.red.light3};
            border: 1px solid ${palette.red.light2};
            color: ${palette.red.dark2};
            font-size: 14px;
          `}
        >
          <strong>Evaluation failed:</strong> {runStatus.error}
        </div>
      )}

      {/* ── Metric cards ────────────────────────────────────────────────── */}
      <div
        className={css`
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        `}
      >
        <MetricCard
          label="Faithfulness"
          value={latestRun?.metrics.faithfulness}
          description="Answer grounded in retrieved context (RAGAS)"
        />
        <MetricCard
          label="Answer Relevancy"
          value={latestRun?.metrics.answer_relevancy}
          description="Answer relevance to the question (LLM judge)"
        />
        <MetricCard
          label="Context Relevance"
          value={latestRun?.metrics.context_relevance}
          description="Retrieved docs relevant to the question (LLM judge)"
        />
      </div>

      {/* ── Per-question breakdown ───────────────────────────────────────── */}
      {latestRun && latestRun.questions && latestRun.questions.length > 0 && (
        <Card
          className={css`
            padding: 24px;
          `}
        >
          <H3
            className={css`
              margin-bottom: 16px;
            `}
          >
            Per-Question Results
          </H3>
          <div
            className={css`
              overflow-x: auto;
            `}
          >
            <table
              className={css`
                width: 100%;
                border-collapse: collapse;
                font-size: 14px;
              `}
            >
              <thead>
                <tr
                  className={css`
                    border-bottom: 2px solid ${palette.gray.light2};
                    text-align: left;
                  `}
                >
                  {['Question', 'Category', 'Contexts', 'Faithfulness', 'Ans. Relevancy', 'Ctx. Relevance'].map(
                    (h) => (
                      <th
                        key={h}
                        className={css`
                          padding: 8px 12px;
                          font-weight: 600;
                          color: ${palette.gray.dark2};
                          white-space: nowrap;
                        `}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {latestRun.questions.map((q, i) => (
                  <tr
                    key={q.id}
                    className={css`
                      border-bottom: 1px solid ${palette.gray.light2};
                      background: ${i % 2 === 0 ? 'transparent' : palette.gray.light3};
                      &:hover {
                        background: ${palette.gray.light2};
                      }
                    `}
                  >
                    <td
                      className={css`
                        padding: 10px 12px;
                        max-width: 340px;
                      `}
                    >
                      <span title={q.question}>
                        {q.question.length > 70 ? q.question.slice(0, 70) + '…' : q.question}
                      </span>
                    </td>
                    <td
                      className={css`
                        padding: 10px 12px;
                        white-space: nowrap;
                      `}
                    >
                      <Badge
                        variant={
                          q.category === 'Policy'
                            ? 'blue'
                            : q.category === 'Compliance'
                            ? 'yellow'
                            : 'green'
                        }
                      >
                        {q.category}
                      </Badge>
                    </td>
                    <td
                      className={css`
                        padding: 10px 12px;
                        text-align: center;
                        color: ${palette.gray.dark1};
                      `}
                    >
                      {q.context_count}
                    </td>
                    <td className={css`padding: 10px 12px; text-align: center;`}>
                      <ScoreCell value={q.scores.faithfulness} />
                    </td>
                    <td className={css`padding: 10px 12px; text-align: center;`}>
                      <ScoreCell value={q.scores.answer_relevancy} />
                    </td>
                    <td className={css`padding: 10px 12px; text-align: center;`}>
                      <ScoreCell value={q.scores.context_relevance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {latestRun.ragas_faithfulness && (
            <Body
              className={css`
                margin-top: 12px;
                font-size: 12px;
                color: ${palette.gray.dark1};
              `}
            >
              Faithfulness scored using RAGAS · Answer Relevancy and Context Relevance scored using LLM judge
            </Body>
          )}
        </Card>
      )}

      {/* ── Run history ─────────────────────────────────────────────────── */}
      {recentRuns.length > 0 && (
        <Card
          className={css`
            padding: 24px;
          `}
        >
          <H3
            className={css`
              margin-bottom: 16px;
            `}
          >
            Run History
          </H3>
          <div
            className={css`
              display: flex;
              flex-direction: column;
              gap: 8px;
            `}
          >
            {recentRuns.map((run, i) => (
              <div
                key={run._id}
                className={css`
                  display: flex;
                  align-items: center;
                  gap: 16px;
                  padding: 10px 12px;
                  border-radius: 6px;
                  background: ${i === 0 ? palette.gray.light3 : 'transparent'};
                  border: 1px solid ${i === 0 ? palette.gray.light2 : 'transparent'};
                  flex-wrap: wrap;
                `}
              >
                <Body
                  className={css`
                    color: ${palette.gray.dark2};
                    min-width: 200px;
                  `}
                >
                  {fmtDate(run.timestamp)}
                  {i === 0 && (
                    <Badge
                      className={css`margin-left: 8px;`}
                      variant="green"
                    >
                      latest
                    </Badge>
                  )}
                </Body>
                <div
                  className={css`
                    display: flex;
                    gap: 20px;
                    font-size: 13px;
                  `}
                >
                  <span>
                    <span className={css`color: ${palette.gray.dark1};`}>Faithfulness: </span>
                    <strong style={{ color: scoreColor(run.metrics.faithfulness) }}>
                      {fmtScore(run.metrics.faithfulness)}
                    </strong>
                  </span>
                  <span>
                    <span className={css`color: ${palette.gray.dark1};`}>Ans. Relevancy: </span>
                    <strong style={{ color: scoreColor(run.metrics.answer_relevancy) }}>
                      {fmtScore(run.metrics.answer_relevancy)}
                    </strong>
                  </span>
                  <span>
                    <span className={css`color: ${palette.gray.dark1};`}>Ctx. Relevance: </span>
                    <strong style={{ color: scoreColor(run.metrics.context_relevance) }}>
                      {fmtScore(run.metrics.context_relevance)}
                    </strong>
                  </span>
                </div>
                <Body
                  className={css`
                    margin-left: auto;
                    color: ${palette.gray.dark1};
                    font-size: 12px;
                  `}
                >
                  {run.sample_count} cases
                </Body>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!loading && !latestRun && (
        <Card
          className={css`
            padding: 48px;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
          `}
        >
          <Subtitle>No evaluations run yet</Subtitle>
          <Body className={css`color: ${palette.gray.dark1}; max-width: 480px;`}>
            Click <strong>Run Evaluations</strong> to evaluate the RAG pipeline against{' '}
            {6} pre-defined energy market questions using RAGAS faithfulness and LLM judge metrics.
          </Body>
          <Button variant="primary" onClick={handleRunEvals} disabled={isRunning}>
            Run Evaluations
          </Button>
        </Card>
      )}
    </div>
  );
}
