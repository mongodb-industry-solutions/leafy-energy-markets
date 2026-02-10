'use client';

import { css } from '@emotion/css';
import { CardSkeleton, ParagraphSkeleton } from '@leafygreen-ui/skeleton-loader';
import { useDarkMode } from '@/components/Providers';

export default function LoadingState() {
  const { darkMode } = useDarkMode();

  return (
    <div
      className={css`
        display: flex;
        flex-direction: column;
        gap: 16px;
      `}
    >
      <CardSkeleton darkMode={darkMode} />
      <ParagraphSkeleton darkMode={darkMode} />
      <ParagraphSkeleton darkMode={darkMode} />
    </div>
  );
}
