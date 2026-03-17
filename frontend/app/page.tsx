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

const glow = keyframes`
  0%, 100% { text-shadow: 0 0 30px rgba(0,237,100,0.7), 0 0 60px rgba(0,237,100,0.4), 0 0 120px rgba(0,237,100,0.2); }
  50% { text-shadow: 0 0 50px rgba(0,237,100,1), 0 0 100px rgba(0,237,100,0.6), 0 0 160px rgba(0,237,100,0.3); }
`;

const wobble = keyframes`
  0%, 100% { transform: rotate(-2deg) scale(1); }
  25% { transform: rotate(1deg) scale(1.02); }
  50% { transform: rotate(-1deg) scale(1); }
  75% { transform: rotate(2deg) scale(1.01); }
`;

const MONITOR_IMAGE = '/img/658212a6662a0375785ec77751b4b582.jpg';

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
          flex-shrink: 0;
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
          padding: 16px 24px;
          gap: 16px;
        `}
      >
        {/* WordArt Logo — BIG and ridiculous */}
        <div
          className={css`
            text-align: center;
            opacity: ${mounted ? 1 : 0};
            transition: opacity 0.5s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            animation: ${wobble} 6s ease-in-out infinite;
          `}
        >
          <h1
            className={css`
              font-size: clamp(60px, 14vw, 160px);
              font-weight: 900;
              letter-spacing: 6px;
              line-height: 0.9;
              margin: 0;
              color: transparent;
              background: linear-gradient(
                180deg,
                #AAFF00 0%,
                #00FF6A 20%,
                #00ED64 40%,
                #00C853 60%,
                #FFD700 80%,
                #00FF6A 100%
              );
              background-size: 100% 200%;
              -webkit-background-clip: text;
              background-clip: text;
              -webkit-text-stroke: 2px rgba(0, 237, 100, 0.4);
              filter: drop-shadow(0 4px 8px rgba(0, 237, 100, 0.6)) drop-shadow(0 0 40px rgba(0, 237, 100, 0.3));
              animation: ${glow} 2s ease-in-out infinite;
              font-family: 'Impact', 'Arial Black', sans-serif;
              text-transform: uppercase;
              transform: skewY(-2deg);
            `}
          >
            Leafy
          </h1>
          <h1
            className={css`
              font-size: clamp(50px, 11vw, 130px);
              font-weight: 900;
              letter-spacing: 8px;
              line-height: 0.9;
              margin: 0;
              color: transparent;
              background: linear-gradient(
                180deg,
                #00FF6A 0%,
                #00ED64 30%,
                #00C853 50%,
                #FFD700 70%,
                #00FF6A 100%
              );
              background-size: 100% 200%;
              -webkit-background-clip: text;
              background-clip: text;
              -webkit-text-stroke: 2px rgba(0, 237, 100, 0.3);
              filter: drop-shadow(0 4px 8px rgba(0, 237, 100, 0.5)) drop-shadow(0 0 30px rgba(0, 237, 100, 0.25));
              animation: ${glow} 2s ease-in-out infinite;
              animation-delay: 0.3s;
              font-family: 'Impact', 'Arial Black', sans-serif;
              text-transform: uppercase;
              font-style: italic;
              transform: skewY(-2deg);
            `}
          >
            Energy
          </h1>
          <h1
            className={css`
              font-size: clamp(40px, 9vw, 110px);
              font-weight: 900;
              letter-spacing: 14px;
              line-height: 0.9;
              margin: 0;
              color: transparent;
              background: linear-gradient(
                180deg,
                #FFD700 0%,
                #00FF6A 30%,
                #00ED64 50%,
                #00C853 70%,
                #AAFF00 100%
              );
              background-size: 100% 200%;
              -webkit-background-clip: text;
              background-clip: text;
              -webkit-text-stroke: 2px rgba(0, 237, 100, 0.2);
              filter: drop-shadow(0 4px 8px rgba(0, 237, 100, 0.4)) drop-shadow(0 0 25px rgba(0, 237, 100, 0.2));
              animation: ${glow} 2s ease-in-out infinite;
              animation-delay: 0.6s;
              font-family: 'Impact', 'Arial Black', sans-serif;
              text-transform: uppercase;
              transform: skewY(-2deg);
            `}
          >
            Markets
          </h1>
          <div
            className={css`
              font-size: 13px;
              letter-spacing: 6px;
              text-transform: uppercase;
              color: #00ED64;
              opacity: 0.5;
              margin-top: 10px;
            `}
          >
            MONGODB ATLAS &middot; EVENT SOURCING &middot; CQRS
          </div>
        </div>

        {/* Monitor the situation — BIG */}
        <div
          className={css`
            border: 4px solid #00ED64;
            padding: 6px;
            max-width: 800px;
            width: 90%;
            opacity: ${mounted ? 1 : 0};
            transition: opacity 0.8s ease 0.3s;
            box-shadow: 0 0 30px rgba(0, 237, 100, 0.2), inset 0 0 20px rgba(0, 237, 100, 0.05);
          `}
        >
          <img
            src={MONITOR_IMAGE}
            alt="We'll monitor the situation"
            className={css`
              width: 100%;
              height: auto;
              display: block;
              filter: brightness(0.95) saturate(0.8);
            `}
          />
          <div
            className={css`
              text-align: center;
              font-size: clamp(16px, 3vw, 28px);
              letter-spacing: 6px;
              padding: 14px 0 10px;
              color: #00ED64;
              font-weight: 900;
              text-transform: uppercase;
              text-shadow: 0 0 20px rgba(0, 237, 100, 0.5);
            `}
          >
            &gt; We&apos;ll monitor the situation
          </div>
        </div>

        {/* Enter button */}
        <Link href="/dashboard" className={css`text-decoration: none;`}>
          <div
            className={css`
              border: 4px solid #00ED64;
              padding: 18px 80px;
              font-size: 24px;
              font-weight: 900;
              letter-spacing: 10px;
              text-transform: uppercase;
              color: #00ED64;
              cursor: pointer;
              position: relative;
              background: #000;
              box-shadow: 0 0 20px rgba(0, 237, 100, 0.15);
              &:hover {
                background: #00ED64;
                color: #000;
                box-shadow: 0 0 40px rgba(0, 237, 100, 0.4);
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
                width: 14px;
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
          flex-shrink: 0;
        `}
      >
        {'>'} SYS.READY {'>'} ALL.MARKETS.ONLINE {'>'} LATENCY.OK
      </div>
    </div>
  );
}
