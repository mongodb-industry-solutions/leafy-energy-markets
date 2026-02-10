'use client';

import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import Badge from '@leafygreen-ui/badge';
import { Body, Subtitle } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import type { SearchDocument } from '@/lib/types';

interface SearchResultsProps {
  results: SearchDocument[];
}

const typeBadgeVariant: Record<string, 'blue' | 'green' | 'yellow'> = {
  Research: 'blue',
  ESG: 'green',
  Asset: 'yellow',
};

export default function SearchResults({ results }: SearchResultsProps) {
  const { darkMode } = useDarkMode();

  return (
    <div className={css`display: flex; flex-direction: column; gap: 12px;`}>
      {results.map((doc) => (
        <Card
          key={doc.id}
          darkMode={darkMode}
          className={css`
            padding: 20px;
            cursor: pointer;
            transition: transform 0.1s ease;
            &:hover {
              transform: translateY(-1px);
            }
          `}
        >
          <div className={css`display: flex; align-items: center; gap: 10px; margin-bottom: 8px;`}>
            <Badge variant={typeBadgeVariant[doc.type] || 'lightgray'}>{doc.type}</Badge>
            <Body
              className={css`
                color: ${darkMode ? palette.gray.light1 : palette.gray.dark1} !important;
                font-size: 12px !important;
              `}
            >
              {doc.source} &middot; {doc.date}
            </Body>
            <Body
              className={css`
                margin-left: auto !important;
                color: ${palette.green.base} !important;
                font-size: 12px !important;
                font-weight: 600 !important;
              `}
            >
              {Math.round(doc.relevanceScore * 100)}% match
            </Body>
          </div>
          <Subtitle className={css`color: ${darkMode ? palette.white : palette.black} !important; margin-bottom: 6px !important;`}>
            {doc.title}
          </Subtitle>
          <Body
            className={css`
              color: ${darkMode ? palette.gray.light1 : palette.gray.dark1} !important;
              font-size: 14px !important;
              line-height: 1.5 !important;
            `}
          >
            {doc.snippet}
          </Body>
        </Card>
      ))}
    </div>
  );
}
