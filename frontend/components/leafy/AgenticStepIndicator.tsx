'use client';

import { css, keyframes } from '@emotion/css';
import Icon from '@leafygreen-ui/icon';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import type { AgenticStep } from '@/lib/types';

interface AgenticStepIndicatorProps {
  steps: AgenticStep[];
  reasoningText?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Keyframes
// ──────────────────────────────────────────────────────────────────────────────

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

const slideIn = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(0, 237, 100, 0.35); }
  50%       { opacity: 0.85; box-shadow: 0 0 0 5px rgba(0, 237, 100, 0); }
`;

// ──────────────────────────────────────────────────────────────────────────────
// Tool-name → icon map (using LeafyGreen icon glyph names)
// ──────────────────────────────────────────────────────────────────────────────

/** Return a 2-char emoji for a tool step label. */
function stepEmoji(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('portfolio'))   return '📊';
  if (lower.includes('policy') || lower.includes('rag')) return '📜';
  if (lower.includes('market intel')) return '🧠';
  if (lower.includes('generator'))   return '⚡';
  if (lower.includes('web search'))  return '🌐';
  if (lower.includes('mongodb') || lower.includes('collection') || lower.includes('aggregation') || lower.includes('schema')) return '🍃';
  return '🔧';
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export default function AgenticStepIndicator({ steps, reasoningText }: AgenticStepIndicatorProps) {
  const { darkMode } = useDarkMode();

  const cardBg        = darkMode ? 'rgba(255,255,255,0.04)' : palette.gray.light3;
  const runningBg     = darkMode ? 'rgba(0,237,100,0.08)'   : 'rgba(0,180,60,0.06)';
  const completedBg   = darkMode ? 'rgba(0,237,100,0.05)'   : 'rgba(0,160,50,0.04)';
  const borderBase    = darkMode ? palette.gray.dark2        : palette.gray.light2;
  const textColor     = darkMode ? palette.gray.light2       : palette.gray.dark2;
  const mutedColor    = darkMode ? palette.gray.dark1        : palette.gray.light1;

  return (
    <div className={css`
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px 0 4px;
    `}>

      {/* Reasoning block */}
      {reasoningText && (
        <div className={css`
          display: flex;
          gap: 10px;
          align-items: flex-start;
          padding: 10px 12px;
          border-radius: 8px;
          background: ${darkMode ? 'rgba(255,204,0,0.06)' : 'rgba(200,160,0,0.07)'};
          border: 1px solid ${darkMode ? 'rgba(255,204,0,0.2)' : 'rgba(200,160,0,0.25)'};
          margin-bottom: 4px;
          animation: ${slideIn} 0.2s ease both;
        `}>
          <span className={css`font-size: 15px; flex-shrink: 0; margin-top: 1px;`}>💡</span>
          <div className={css`
            font-size: 12px;
            font-style: italic;
            color: ${darkMode ? palette.yellow.light2 : palette.yellow.dark2};
            line-height: 1.55;
            white-space: pre-wrap;
          `}>
            {reasoningText}
          </div>
        </div>
      )}

      {/* Planning spinner — no tools fired yet */}
      {steps.length === 0 && (
        <div className={css`
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 8px;
          background: ${runningBg};
          border: 1px solid ${palette.green.dark2};
          animation: ${slideIn} 0.2s ease both;
        `}>
          <div className={css`
            width: 18px; height: 18px; flex-shrink: 0;
            border: 2px solid transparent;
            border-top: 2px solid ${palette.green.base};
            border-radius: 50%;
            animation: ${spin} 0.75s linear infinite;
          `} />
          <div>
            <div className={css`font-size: 13px; font-weight: 600; color: ${darkMode ? palette.green.light1 : palette.green.dark2};`}>
              Selecting tools…
            </div>
            <div className={css`font-size: 11px; color: ${mutedColor}; margin-top: 1px;`}>
              The agent is deciding which tools to call
            </div>
          </div>
        </div>
      )}

      {/* Step cards */}
      {steps.map((step, i) => {
        const delay = `${i * 60}ms`;
        const isCompleted = step.status === 'completed';
        const isRunning   = step.status === 'running';
        const emoji = stepEmoji(step.label);

        return (
          <div
            key={step.id}
            className={css`
              display: flex;
              align-items: center;
              gap: 10px;
              padding: 10px 14px;
              border-radius: 8px;
              background: ${isRunning ? runningBg : isCompleted ? completedBg : cardBg};
              border: 1px solid ${
                isRunning   ? palette.green.dark2 :
                isCompleted ? (darkMode ? 'rgba(0,237,100,0.2)' : 'rgba(0,160,50,0.2)') :
                borderBase
              };
              animation: ${slideIn} 0.25s ease ${delay} both;
              transition: background 0.3s ease, border-color 0.3s ease;
            `}
          >
            {/* Status icon */}
            <div className={css`
              width: 26px; height: 26px; flex-shrink: 0;
              border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              ${isCompleted
                ? `background: ${palette.green.base};`
                : isRunning
                ? `background: ${darkMode ? palette.green.dark2 : palette.green.light3};
                   border: 2px solid ${palette.green.base};
                   animation: ${pulse} 1.4s ease-in-out infinite;`
                : `background: ${cardBg}; border: 2px solid ${borderBase};`}
            `}>
              {isCompleted && (
                <Icon glyph="Checkmark" size={14} fill={palette.white} />
              )}
              {isRunning && (
                <div className={css`
                  width: 12px; height: 12px;
                  border: 2px solid transparent;
                  border-top: 2px solid ${palette.green.base};
                  border-radius: 50%;
                  animation: ${spin} 0.75s linear infinite;
                `} />
              )}
              {!isCompleted && !isRunning && (
                <div className={css`
                  width: 8px; height: 8px;
                  border-radius: 50%;
                  background: ${mutedColor};
                `} />
              )}
            </div>

            {/* Emoji */}
            <span className={css`font-size: 16px; flex-shrink: 0;`}>{emoji}</span>

            {/* Text */}
            <div className={css`flex: 1; min-width: 0;`}>
              <div className={css`
                font-size: 13px;
                font-weight: ${isRunning ? '700' : '500'};
                color: ${
                  isRunning   ? (darkMode ? palette.green.light1 : palette.green.dark2) :
                  isCompleted ? textColor :
                  mutedColor
                };
                line-height: 1.3;
              `}>
                {step.label}
              </div>
              {isRunning && (
                <div className={css`font-size: 11px; color: ${mutedColor}; margin-top: 2px;`}>
                  Running…
                </div>
              )}
              {isCompleted && step.durationMs > 0 && (
                <div className={css`font-size: 10px; color: ${mutedColor}; margin-top: 1px;`}>
                  Completed in {step.durationMs < 1000
                    ? `${step.durationMs}ms`
                    : `${(step.durationMs / 1000).toFixed(1)}s`}
                </div>
              )}
            </div>

            {/* Right-side badge */}
            {isCompleted && (
              <div className={css`
                font-size: 10px;
                font-weight: 600;
                color: ${darkMode ? palette.green.light1 : palette.green.dark2};
                flex-shrink: 0;
              `}>
                ✓ Done
              </div>
            )}
            {isRunning && (
              <div className={css`
                font-size: 10px;
                font-weight: 600;
                color: ${palette.green.base};
                flex-shrink: 0;
              `}>
                In progress
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
