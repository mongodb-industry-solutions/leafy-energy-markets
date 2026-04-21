'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { css, keyframes } from '@emotion/css';

// ─── Keyframes ────────────────────────────────

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(40px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const scroll = keyframes`
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
`;

const float = keyframes`
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-8px); }
`;

const gradientShift = keyframes`
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.4; }
  50%      { opacity: 0.8; }
`;

// ─── Data ──────────────────────────────────────

const TICKER_ITEMS = [
  { label: 'DE BASE Q2', price: '78.90', delta: '+1.2%', up: true },
  { label: 'TTF GAS APR', price: '34.80', delta: '-0.5%', up: false },
  { label: 'EUA CARBON', price: '72.10', delta: '+2.1%', up: true },
  { label: 'FR PEAK M03', price: '91.30', delta: '-1.8%', up: false },
  { label: 'NL WIND PPA', price: '54.30', delta: '+0.8%', up: true },
  { label: 'UK BASE Q3', price: '82.70', delta: '-1.3%', up: false },
  { label: 'ES SOLAR', price: '46.80', delta: '+1.6%', up: true },
  { label: 'NO HYDRO', price: '40.50', delta: '+0.4%', up: true },
];

const FEATURES = [
  {
    icon: '🌬️',
    accent: '#4da6ff',
    title: 'Wind & Solar Fleet',
    desc: '8 European renewable assets streaming live telemetry. From Hollandse Kust to Algarrobico — real-time output, variance, and forecasts.',
  },
  {
    icon: '📊',
    accent: '#00ED64',
    title: 'Position & Trading',
    desc: 'Forecast vs committed gap tracking across Day-Ahead, Intraday, and Flexibility markets. One-click trade execution.',
  },
  {
    icon: '🧠',
    accent: '#cc99ff',
    title: 'AI Advisor',
    desc: 'LangChain ReAct agent powered by Claude — portfolio analysis, EU policy search, and market intelligence on demand.',
  },
  {
    icon: '🔗',
    accent: '#66cccc',
    title: 'Event Sourcing',
    desc: 'Append-only event store on MongoDB Atlas. CQRS read models via Change Streams. Full audit trail for EU REMIT compliance.',
  },
];

const ENERGY_SOURCES = [
  { icon: '🌬️', label: 'Wind', color: '#4da6ff' },
  { icon: '☀️', label: 'Solar', color: '#ffcc44' },
  { icon: '💧', label: 'Hydro', color: '#66cccc' },
  { icon: '⚡', label: 'Battery', color: '#cc99ff' },
  { icon: '🌿', label: 'Biomass', color: '#88ddaa' },
];

// ─── Component ─────────────────────────────────

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const tickerHtml = TICKER_ITEMS.map(
    (t) => `<span style="color:#667">${t.label}</span>&nbsp;<span style="color:#e0e4e8;font-weight:700">${t.price}</span>&nbsp;<span style="color:${t.up ? '#00ED64' : '#FF6961'};font-weight:600">${t.delta}</span>`
  ).join('<span style="color:#223;margin:0 20px">&middot;</span>');

  return (
    <div
      className={css`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600;700;800&display=swap');
        min-height: 100vh;
        background: #050a08;
        color: #e0e4e8;
        font-family: 'Inter', -apple-system, sans-serif;
        display: flex;
        flex-direction: column;
        overflow-x: hidden;
        position: relative;
      `}
    >
      {/* Organic gradient background */}
      <div
        className={css`
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background:
            radial-gradient(ellipse 80% 60% at 20% 10%, rgba(77, 166, 255, 0.06) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 20%, rgba(0, 237, 100, 0.06) 0%, transparent 60%),
            radial-gradient(ellipse 70% 50% at 50% 80%, rgba(204, 153, 255, 0.04) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 70% 60%, rgba(255, 204, 68, 0.03) 0%, transparent 60%);
        `}
      />

      {/* Subtle dot grid */}
      <div
        className={css`
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          opacity: 0.3;
          background-image: radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px);
          background-size: 32px 32px;
        `}
      />

      {/* Ticker bar */}
      <div
        className={css`
          width: 100%;
          overflow: hidden;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          padding: 10px 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(12px);
          flex-shrink: 0;
          z-index: 2;
        `}
      >
        <div
          className={css`
            display: flex;
            white-space: nowrap;
            animation: ${scroll} 45s linear infinite;
            font-size: 13px;
            font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace;
            letter-spacing: 0.5px;
          `}
          dangerouslySetInnerHTML={{ __html: tickerHtml + tickerHtml }}
        />
      </div>

      {/* Main content */}
      <div
        className={css`
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 24px 60px;
          gap: 56px;
          z-index: 1;
          position: relative;
        `}
      >
        {/* Hero */}
        <div
          className={css`
            text-align: center;
            max-width: 800px;
            opacity: ${mounted ? 1 : 0};
            animation: ${mounted ? fadeUp : 'none'} 1s cubic-bezier(0.22, 1, 0.36, 1);
          `}
        >
          {/* Energy source icons floating */}
          <div
            className={css`
              display: flex;
              justify-content: center;
              gap: 16px;
              margin-bottom: 32px;
            `}
          >
            {ENERGY_SOURCES.map((s, i) => (
              <div
                key={s.label}
                className={css`
                  width: 44px;
                  height: 44px;
                  border-radius: 12px;
                  background: ${s.color}15;
                  border: 1px solid ${s.color}30;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 20px;
                  animation: ${float} ${3 + i * 0.4}s ease-in-out infinite;
                  animation-delay: ${i * 0.2}s;
                `}
                title={s.label}
              >
                {s.icon}
              </div>
            ))}
          </div>

          <div
            className={css`
              font-size: 12px;
              font-weight: 700;
              letter-spacing: 4px;
              text-transform: uppercase;
              color: #667;
              margin-bottom: 20px;
            `}
          >
            European Renewable Energy
          </div>

          {/* Title — editorial serif like Tobias */}
          <h1
            className={css`
              font-family: 'DM Serif Display', Georgia, 'Times New Roman', serif;
              font-size: clamp(52px, 9vw, 108px);
              font-weight: 400;
              letter-spacing: -1px;
              line-height: 1.2;
              margin: 0 0 4px;
              color: #fff;
            `}
          >
            Leafy
          </h1>
          <h1
            className={css`
              font-family: 'DM Serif Display', Georgia, 'Times New Roman', serif;
              font-size: clamp(52px, 9vw, 108px);
              font-weight: 400;
              font-style: italic;
              letter-spacing: -1px;
              line-height: 1.2;
              margin: 0 0 28px;
              padding-bottom: 8px;
              background: linear-gradient(
                135deg,
                #4da6ff 0%,
                #00ED64 20%,
                #88ddaa 40%,
                #ffcc44 60%,
                #cc99ff 80%,
                #4da6ff 100%
              );
              background-size: 300% 300%;
              -webkit-background-clip: text;
              background-clip: text;
              color: transparent;
              animation: ${gradientShift} 6s ease infinite;
            `}
          >
            Energy Markets
          </h1>

          <p
            className={css`
              font-size: 19px;
              line-height: 1.7;
              color: #8892a2;
              max-width: 540px;
              margin: 0 auto 36px;
            `}
          >
            Real-time portfolio management for European renewable energy.
            Event-sourced architecture. AI-augmented trading intelligence.
          </p>

          {/* CTAs */}
          <div className={css`display: flex; gap: 14px; justify-content: center; flex-wrap: wrap;`}>
            <Link href="/dashboard" className={css`text-decoration: none;`}>
              <div
                className={css`
                  display: inline-flex;
                  align-items: center;
                  gap: 10px;
                  padding: 16px 44px;
                  border-radius: 60px;
                  background: linear-gradient(135deg, #00ED64, #00A651);
                  color: #000;
                  font-size: 15px;
                  font-weight: 700;
                  cursor: pointer;
                  transition: all 0.25s ease;
                  box-shadow: 0 4px 20px rgba(0, 237, 100, 0.2);
                  &:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 32px rgba(0, 237, 100, 0.3);
                  }
                `}
              >
                Open Dashboard
                <span className={css`font-size: 16px;`}>→</span>
              </div>
            </Link>

            <Link href="/leafy" className={css`text-decoration: none;`}>
              <div
                className={css`
                  display: inline-flex;
                  align-items: center;
                  gap: 8px;
                  padding: 16px 36px;
                  border-radius: 60px;
                  border: 1px solid rgba(255, 255, 255, 0.12);
                  background: rgba(255, 255, 255, 0.03);
                  color: #c8ccd4;
                  font-size: 15px;
                  font-weight: 600;
                  cursor: pointer;
                  transition: all 0.25s ease;
                  backdrop-filter: blur(8px);
                  &:hover {
                    background: rgba(255, 255, 255, 0.07);
                    border-color: rgba(255, 255, 255, 0.2);
                    color: #fff;
                  }
                `}
              >
                Talk to AI Advisor
              </div>
            </Link>
          </div>
        </div>

        {/* Feature cards */}
        <div
          className={css`
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
            max-width: 920px;
            width: 100%;
            opacity: ${mounted ? 1 : 0};
            animation: ${mounted ? fadeUp : 'none'} 1s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both;
          `}
        >
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className={css`
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 16px;
                padding: 24px 22px;
                transition: all 0.25s ease;
                &:hover {
                  background: rgba(255, 255, 255, 0.04);
                  border-color: ${f.accent}30;
                  transform: translateY(-3px);
                  box-shadow: 0 8px 30px ${f.accent}10;
                }
              `}
            >
              <div
                className={css`
                  width: 40px;
                  height: 40px;
                  border-radius: 10px;
                  background: ${f.accent}15;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 20px;
                  margin-bottom: 14px;
                `}
              >
                {f.icon}
              </div>
              <div className={css`font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 8px;`}>{f.title}</div>
              <div className={css`font-size: 13px; line-height: 1.65; color: #667;`}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Tech + branding bar */}
        <div
          className={css`
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            opacity: ${mounted ? 1 : 0};
            animation: ${mounted ? fadeIn : 'none'} 1.2s ease 0.4s both;
          `}
        >
          <div className={css`font-size: 11px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; color: #445;`}>
            Built with
          </div>
          <div className={css`display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 600px;`}>
            {['MongoDB Atlas', 'Next.js 14', 'FastAPI', 'LangChain', 'Claude AI', 'LeafyGreen UI', 'VoyageAI'].map((t) => (
              <span
                key={t}
                className={css`
                  padding: 6px 16px;
                  border-radius: 20px;
                  font-size: 12px;
                  font-weight: 600;
                  color: #778;
                  border: 1px solid rgba(255, 255, 255, 0.06);
                  background: rgba(255, 255, 255, 0.02);
                  transition: all 0.2s ease;
                  &:hover { border-color: rgba(255,255,255,0.12); color: #aab; }
                `}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className={css`
          border-top: 1px solid rgba(255, 255, 255, 0.04);
          padding: 16px 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
          font-size: 11px;
          color: #334;
          z-index: 1;
          flex-shrink: 0;
        `}
      >
        <span className={css`animation: ${pulse} 3s ease-in-out infinite; color: #00ED64; font-size: 8px;`}>●</span>
        <span>All markets online</span>
        <span className={css`color: #223;`}>·</span>
        <span>MongoDB Atlas</span>
        <span className={css`color: #223;`}>·</span>
        <span>LeafyGreen UI</span>
      </div>
    </div>
  );
}
