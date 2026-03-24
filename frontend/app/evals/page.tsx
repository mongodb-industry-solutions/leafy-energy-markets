'use client';

import { css } from '@emotion/css';

export default function EvalsPage() {
  return (
    <div
      className={css`
        margin: -32px -40px;
        height: 100vh;
        width: calc(100% + 80px);
      `}
    >
      <iframe
        src="http://localhost:15500"
        className={css`
          width: 100%;
          height: 100%;
          border: none;
        `}
        title="Promptfoo Evals Dashboard"
      />
    </div>
  );
}
