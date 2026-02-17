'use client';

import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Icon from '@leafygreen-ui/icon';
import { Subtitle, Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import type { SuggestedPrompt } from '@/lib/types';

interface SuggestedPromptsProps {
  prompts: SuggestedPrompt[];
  onSelect: (prompt: string) => void;
}

export default function SuggestedPrompts({ prompts, onSelect }: SuggestedPromptsProps) {
  const { darkMode } = useDarkMode();

  return (
    <div
      className={css`
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 16px;
        padding: 40px 0;
      `}
    >
      {prompts.map((p, i) => (
        <Card
          key={i}
          darkMode={darkMode}
          className={css`
            padding: 20px;
            cursor: pointer;
            transition: transform 0.1s ease, box-shadow 0.15s ease;
            &:hover {
              transform: translateY(-2px);
            }
          `}
          onClick={() => onSelect(p.prompt)}
        >
          <div className={css`display: flex; align-items: center; gap: 8px; margin-bottom: 8px;`}>
            <Icon glyph="Sparkle" size={16} fill={palette.green.base} />
            <Subtitle className={css`color: ${darkMode ? palette.white : palette.black} !important;`}>
              {p.title}
            </Subtitle>
          </div>
          <Body
            className={css`
              color: ${darkMode ? palette.gray.light1 : palette.gray.dark1} !important;
              font-size: 13px !important;
            `}
          >
            {p.description}
          </Body>
        </Card>
      ))}
    </div>
  );
}
