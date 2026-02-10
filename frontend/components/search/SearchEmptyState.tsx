'use client';

import { css } from '@emotion/css';
import { Body, Subtitle } from '@leafygreen-ui/typography';
import Icon from '@leafygreen-ui/icon';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';

export default function SearchEmptyState() {
  const { darkMode } = useDarkMode();

  return (
    <div
      className={css`
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        text-align: center;
      `}
    >
      <Icon
        glyph="MagnifyingGlass"
        size={48}
        fill={darkMode ? palette.gray.dark1 : palette.gray.light1}
        className={css`margin-bottom: 16px;`}
      />
      <Subtitle className={css`color: ${darkMode ? palette.gray.light1 : palette.gray.dark1} !important; margin-bottom: 8px !important;`}>
        No results found
      </Subtitle>
      <Body className={css`color: ${darkMode ? palette.gray.dark1 : palette.gray.light1} !important;`}>
        Try adjusting your search terms or filters.
      </Body>
    </div>
  );
}
