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

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const slideIn = keyframes`
  from { opacity: 0; transform: translateX(-6px); }
  to   { opacity: 1; transform: translateX(0); }
`;

export default function AgenticStepIndicator({ steps, reasoningText }: AgenticStepIndicatorProps) {
  const { darkMode } = useDarkMode();
  const textColor = darkMode ? palette.gray.light2 : palette.gray.dark2;
  const mutedColor = darkMode ? palette.gray.dark1 : palette.gray.light1;
  const lineColor = darkMode ? palette.gray.dark2 : palette.gray.light2;

  return (
    <div
      className={css`
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 8px 0 0;
      `}
    >
      {/* Reasoning text — shown before tools fire */}
      {reasoningText && (
        <div
          className={css`
            display: flex;
            gap: 8px;
            align-items: flex-start;
            padding: 6px 0 10px;
            border-bottom: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
            margin-bottom: 8px;
          `}
        >
          <span className={css`font-size: 14px; flex-shrink: 0; margin-top: 1px;`}>💡</span>
          <div
            className={css`
              font-size: 11px;
              font-style: italic;
              color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
              line-height: 1.5;
              white-space: pre-wrap;
            `}
          >
            {reasoningText}
          </div>
        </div>
      )}

      {/* Planning spinner — shown when steps is empty */}
      {steps.length === 0 && (
        <div
          className={css`
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 0;
          `}
        >
          <div
            className={css`
              width: 16px;
              height: 16px;
              border: 2px solid transparent;
              border-top: 2px solid ${palette.green.base};
              border-radius: 50%;
              animation: ${spin} 0.8s linear infinite;
              flex-shrink: 0;
            `}
          />
          <span
            className={css`
              font-size: 12px;
              font-style: italic;
              color: ${mutedColor};
            `}
          >
            Selecting tools…
          </span>
        </div>
      )}

      {steps.map((step, i) => {
        const delay = `${i * 80}ms`;
        const isLast = i === steps.length - 1;
        const isCompleted = step.status === 'completed';
        const isRunning = step.status === 'running';
        const isPending = step.status === 'pending';

        return (
          <div
            key={step.id}
            className={css`
              display: flex; gap: 12px; align-items: stretch;
              animation: ${slideIn} 0.2s ease ${delay} both;
            `}
          >
            {/* Vertical line + icon column */}
            <div className={css`display: flex; flex-direction: column; align-items: center; width: 20px;`}>
              {/* Step icon */}
              <div
                className={css`
                  width: 20px;
                  height: 20px;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  flex-shrink: 0;
                  ${isCompleted
                    ? `background: ${palette.green.base};`
                    : isRunning
                    ? `background: ${darkMode ? palette.green.dark2 : palette.green.light3}; border: 2px solid ${palette.green.base};`
                    : `background: transparent; border: 2px solid ${mutedColor};`}
                `}
              >
                {isCompleted && (
                  <Icon glyph="Checkmark" size={12} fill={palette.white} />
                )}
                {isRunning && (
                  <div
                    className={css`
                      width: 10px;
                      height: 10px;
                      border: 2px solid transparent;
                      border-top: 2px solid ${palette.green.base};
                      border-radius: 50%;
                      animation: ${spin} 0.8s linear infinite;
                    `}
                  />
                )}
              </div>
              {/* Connector line */}
              {!isLast && (
                <div
                  className={css`
                    width: 2px;
                    flex: 1;
                    min-height: 12px;
                    background: ${isCompleted ? palette.green.base : lineColor};
                  `}
                />
              )}
            </div>

            {/* Step content */}
            <div className={css`padding-bottom: ${isLast ? '0' : '12px'}; flex: 1;`}>
              <div
                className={css`
                  font-size: 13px;
                  font-weight: ${isRunning ? '600' : '400'};
                  color: ${isPending ? mutedColor : textColor};
                  line-height: 20px;
                `}
              >
                {step.label}
              </div>
              {isRunning && (
                <div
                  className={css`
                    font-size: 11px;
                    color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
                    margin-top: 2px;
                  `}
                >
                  {step.description}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
