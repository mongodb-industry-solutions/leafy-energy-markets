'use client';

import { css } from '@emotion/css';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import type { SuggestedPrompt } from '@/lib/types';

interface SuggestedPromptsProps {
  prompts: SuggestedPrompt[];
  onSelect: (prompt: string) => void;
}

export default function SuggestedPrompts({ prompts, onSelect }: SuggestedPromptsProps) {
  const { darkMode } = useDarkMode();
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;

  return (
    <div
      className={css`
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: center;
        margin-bottom: 12px;
      `}
    >
      {prompts.map((p, i) => (
        <button
          key={i}
          onClick={() => onSelect(p.prompt)}
          title={p.description}
          className={css`
            padding: 8px 16px;
            border-radius: 20px;
            border: 1px solid ${borderColor};
            background: ${darkMode ? 'rgba(255,255,255,0.04)' : 'transparent'};
            color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
            font-size: 13px;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.15s ease;
            font-family: inherit;
            &:hover {
              border-color: ${palette.green.base};
              color: ${palette.green.base};
              background: ${darkMode ? 'rgba(0,237,100,0.08)' : palette.green.light3};
            }
          `}
        >
          {p.title}
        </button>
      ))}
    </div>
  );
}
