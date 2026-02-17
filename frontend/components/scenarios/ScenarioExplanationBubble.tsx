'use client';

import { css, keyframes } from '@emotion/css';
import { Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';

interface ScenarioExplanationBubbleProps {
  what: string;
  impact: string;
}

const fadeSlideIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

export default function ScenarioExplanationBubble({ what, impact }: ScenarioExplanationBubbleProps) {
  const { darkMode } = useDarkMode();

  const bubbleBg = darkMode ? 'rgba(0, 104, 74, 0.12)' : 'rgba(0, 104, 74, 0.06)';
  const borderColor = darkMode ? palette.green.dark2 : palette.green.light2;
  const textColor = darkMode ? palette.gray.light2 : palette.gray.dark2;
  const labelColor = darkMode ? palette.green.light1 : palette.green.dark1;

  return (
    <div
      className={css`
        background: ${bubbleBg};
        border: 1px solid ${borderColor};
        border-radius: 12px;
        padding: 16px 20px;
        position: relative;
        animation: ${fadeSlideIn} 0.35s ease-out;

        &::before {
          content: '';
          position: absolute;
          top: -7px;
          left: 32px;
          width: 12px;
          height: 12px;
          background: ${bubbleBg};
          border-top: 1px solid ${borderColor};
          border-left: 1px solid ${borderColor};
          transform: rotate(45deg);
        }
      `}
    >
      <div className={css`display: flex; flex-direction: column; gap: 10px;`}>
        <div>
          <Body
            className={css`
              color: ${labelColor} !important;
              font-size: 11px !important;
              font-weight: 700 !important;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 4px !important;
            `}
          >
            What is happening
          </Body>
          <Body
            className={css`
              color: ${textColor} !important;
              font-size: 13px !important;
              line-height: 1.55 !important;
            `}
          >
            {what}
          </Body>
        </div>
        <div
          className={css`
            border-top: 1px solid ${borderColor};
            padding-top: 10px;
          `}
        >
          <Body
            className={css`
              color: ${labelColor} !important;
              font-size: 11px !important;
              font-weight: 700 !important;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 4px !important;
            `}
          >
            Business impact
          </Body>
          <Body
            className={css`
              color: ${textColor} !important;
              font-size: 13px !important;
              line-height: 1.55 !important;
            `}
          >
            {impact}
          </Body>
        </div>
      </div>
    </div>
  );
}
