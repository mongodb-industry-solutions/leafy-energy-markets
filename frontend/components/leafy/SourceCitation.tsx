'use client';

import { css } from '@emotion/css';
import Badge from '@leafygreen-ui/badge';
import Tooltip from '@leafygreen-ui/tooltip';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import type { SourceRef } from '@/lib/types';

interface SourceCitationProps {
  source: SourceRef;
}

const typeBadgeVariant: Record<string, 'blue' | 'green' | 'yellow' | 'red'> = {
  Research: 'blue',
  ESG: 'green',
  Asset: 'yellow',
  Maritime: 'red',
};

export default function SourceCitation({ source }: SourceCitationProps) {
  const { darkMode } = useDarkMode();

  return (
    <Tooltip
      darkMode={darkMode}
      trigger={
        <span className={css`cursor: pointer;`}>
          <Badge variant={typeBadgeVariant[source.type] || 'lightgray'}>
            {source.title.length > 40 ? source.title.slice(0, 40) + '...' : source.title}
          </Badge>
        </span>
      }
    >
      <div className={css`max-width: 300px;`}>
        <strong>{source.title}</strong>
        <br />
        <span style={{ fontSize: 12, opacity: 0.8 }}>{source.snippet}</span>
      </div>
    </Tooltip>
  );
}
