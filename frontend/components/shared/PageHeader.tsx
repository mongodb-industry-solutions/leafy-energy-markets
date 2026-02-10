'use client';

import { css } from '@emotion/css';
import { H2, Body } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  const { darkMode } = useDarkMode();

  return (
    <div
      className={css`
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 32px;
      `}
    >
      <div>
        <H2
          className={css`
            color: ${darkMode ? palette.white : palette.black} !important;
            margin-bottom: 4px !important;
          `}
        >
          {title}
        </H2>
        {subtitle && (
          <Body
            className={css`
              color: ${darkMode ? palette.gray.light1 : palette.gray.dark1} !important;
            `}
          >
            {subtitle}
          </Body>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
