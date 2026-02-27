'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { css, keyframes } from '@emotion/css';

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`;

const scroll = keyframes`
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
`;

const flicker = keyframes`
  0%, 100% { opacity: 1; }
  92% { opacity: 1; }
  93% { opacity: 0.4; }
  94% { opacity: 1; }
  96% { opacity: 0.7; }
  97% { opacity: 1; }
`;

const LEAFY_LOGO = `
:::        :::::::::: ::::::::  ::::::::::::::   :::
:+:        :+:       :+:    :+::+:        :+:   :+:
+:+        +:+       +:+    +:++:+         +:+ +:+
+#+        +#++:++#  +#++:++#+++#++:▓+#     +#++:
+#+        +#+       +#+    +#++#+          +#+
#+#        #+#       #+#    #+##+#         #+#
########## ########## ###    ########     ###
`.trimEnd();

const ENERGY_LOGO = `
:::::::::: ::::    ::: :::::::::: :::::::::   ::::::::  :::   :::
:+:        :+:+:   :+: :+:        :+:    :+: :+:    :+: :+:   :+:
+:+        :+:+:+  +:+ +:+        +:+    +:+ +:+        +:+   +:+
+#++:++#   +#+ +:+ +#+ +#++:++#   +#++:++#:  :#:         :#+#:#
+#+        +#+  +#+#+# +#+        +#+    +#+ +#+   :::▓    +#+
#+#        #+#   #+#+# #+#        #+#    #+# #+#    #+#    #+#
########## ###    #### ########## ###    ###  ########     ###
`.trimEnd();

const MARKETS_LOGO = `
::::    ::::      :::     :::::::::  :::    ::: :::::::::: ::::::::::: ::::::::
+:+:+: :+:+:+   :+: :+:   :+:    :+: :+:   :+: :+:            :+:    :+:    :+:
+:+ +:+:+ +:+  +:+   +:+  +:+    +:+ +:+  +:+  +:+            +:+    +:+
+#+  +:+  +#+ +#++:++#++: +#++:++#:  +#++:++   +#++:++#       +#+    +#++:++#++
+#+       +#+ +#+     +#+ +#+    +#+ +#+  +#+  +#+            +#+           +#+
#+#       #+# #+#     #+# #+#    #+# #+#   #+# #+#            #+#    #+#    #+#
###       ### ###     ### ###    ### ###    ### ##########     ###     ########
`.trimEnd();

const NAV_SECTIONS = [
  { label: 'DASHBOARD', href: '/dashboard', icon: '[]' },
  { label: 'TELEMETRY', href: '/telemetry', icon: '~>' },
  { label: 'LEAFY AI', href: '/leafy', icon: '*>' },
  { label: 'EVENTS', href: '/audit', icon: '>>' },
  { label: 'CQRS', href: '/cqrs', icon: '{}' },
  { label: 'SCENARIOS', href: '/scenarios', icon: '==' },
];

const TICKER_ITEMS = [
  'DE BASE Q2 78.90 +1.2%',
  'TTF GAS APR 34.80 -0.5%',
  'EUA CARBON 72.10 +2.1%',
  'FR PEAK M03 91.30 -1.8%',
  'NL WIND PPA 54.30 +0.8%',
  'UK BASE Q3 82.70 -1.3%',
  'ES SOLAR 46.80 +1.6%',
  'NO HYDRO 40.50 +0.4%',
];

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const tickerText = TICKER_ITEMS.join('   ///   ');

  return (
    <div
      className={css`
        min-height: 100vh;
        background: #000;
        color: #00ED64;
        font-family: 'Courier New', 'Source Code Pro', monospace;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: ${flicker} 8s linear infinite;
      `}
    >
      {/* Scrolling ticker */}
      <div
        className={css`
          width: 100%;
          overflow: hidden;
          border-bottom: 3px solid #00ED64;
          padding: 12px 0;
          background: #000;
        `}
      >
        <div
          className={css`
            display: flex;
            white-space: nowrap;
            animation: ${scroll} 30s linear infinite;
            font-size: 18px;
            font-weight: 700;
            letter-spacing: 3px;
            color: #00ED64;
            opacity: 0.8;
          `}
        >
          <span>{tickerText}   ///   {tickerText}   ///   </span>
        </div>
      </div>

      {/* Main content */}
      <div
        className={css`
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px 24px;
          gap: 32px;
        `}
      >
        {/* ASCII logo */}
        <div
          className={css`
            text-align: center;
            opacity: ${mounted ? 1 : 0};
            transition: opacity 0.5s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
          `}
        >
          <pre
            className={css`
              font-size: clamp(8px, 1.6vw, 18px);
              line-height: 1.2;
              color: #00ED64;
              margin-bottom: 4px;
              text-shadow: 0 0 10px rgba(0, 237, 100, 0.5);
            `}
          >
            {LEAFY_LOGO}
          </pre>
          <pre
            className={css`
              font-size: clamp(6px, 1.2vw, 14px);
              line-height: 1.2;
              color: #00ED64;
              opacity: 0.8;
              margin-bottom: 4px;
              text-shadow: 0 0 8px rgba(0, 237, 100, 0.35);
            `}
          >
            {ENERGY_LOGO}
          </pre>
          <pre
            className={css`
              font-size: clamp(5px, 1vw, 12px);
              line-height: 1.2;
              color: #00ED64;
              opacity: 0.6;
              text-shadow: 0 0 6px rgba(0, 237, 100, 0.25);
            `}
          >
            {MARKETS_LOGO}
          </pre>
          <div
            className={css`
              font-size: 14px;
              letter-spacing: 6px;
              text-transform: uppercase;
              color: #00ED64;
              opacity: 0.5;
              margin-top: 16px;
            `}
          >
            MONGODB ATLAS &middot; EVENT SOURCING &middot; CQRS
          </div>
        </div>

        {/* Navigation grid */}
        <div
          className={css`
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 4px;
            max-width: 720px;
            width: 100%;
          `}
        >
          {NAV_SECTIONS.map((section) => (
            <Link key={section.href} href={section.href} className={css`text-decoration: none;`}>
              <div
                className={css`
                  border: 3px solid #00ED64;
                  padding: 24px 16px;
                  text-align: center;
                  cursor: pointer;
                  transition: all 0.1s ease;
                  background: #000;
                  &:hover {
                    background: #00ED64;
                    color: #000;
                  }
                  &:hover span {
                    color: #000;
                  }
                  &:active {
                    transform: translate(2px, 2px);
                  }
                `}
              >
                <span
                  className={css`
                    display: block;
                    font-size: 20px;
                    margin-bottom: 8px;
                    color: #00ED64;
                  `}
                >
                  {section.icon}
                </span>
                <span
                  className={css`
                    display: block;
                    font-size: 13px;
                    font-weight: 700;
                    letter-spacing: 3px;
                    color: #00ED64;
                  `}
                >
                  {section.label}
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Enter button */}
        <Link href="/dashboard" className={css`text-decoration: none;`}>
          <div
            className={css`
              border: 4px solid #00ED64;
              padding: 16px 64px;
              font-size: 20px;
              font-weight: 900;
              letter-spacing: 8px;
              text-transform: uppercase;
              color: #00ED64;
              cursor: pointer;
              position: relative;
              background: #000;
              &:hover {
                background: #00ED64;
                color: #000;
              }
              &:active {
                transform: translate(3px, 3px);
              }
            `}
          >
            ENTER
            <span
              className={css`
                display: inline-block;
                width: 12px;
                margin-left: 8px;
                animation: ${blink} 1s step-end infinite;
              `}
            >
              _
            </span>
          </div>
        </Link>

        {/* Footer */}
        <div
          className={css`
            font-size: 11px;
            letter-spacing: 2px;
            color: #00ED64;
            opacity: 0.4;
            text-align: center;
          `}
        >
          POWERED BY MONGODB ATLAS &middot; LEAFYGREEN UI &middot; NEXT.JS
        </div>
      </div>

      {/* Bottom border */}
      <div
        className={css`
          border-top: 3px solid #00ED64;
          padding: 6px;
          text-align: center;
          font-size: 10px;
          letter-spacing: 4px;
          color: #00ED64;
          opacity: 0.3;
        `}
      >
        {'>'} SYS.READY {'>'} ALL.MARKETS.ONLINE {'>'} LATENCY.OK
      </div>
    </div>
  );
}
