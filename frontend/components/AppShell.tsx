'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { css, keyframes } from '@emotion/css';
import { SideNav, SideNavItem } from '@leafygreen-ui/side-nav';
import Icon from '@leafygreen-ui/icon';
import Toggle from '@leafygreen-ui/toggle';
import Button from '@leafygreen-ui/button';
import { H3, Overline } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from './Providers';
import { useGenerator } from '@/lib/generator-context';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', glyph: 'Dashboard' as const },
  { label: 'EnerLeafy AI', href: '/leafy', glyph: 'Sparkle' as const },
  { label: 'Auditing', href: '/audit', glyph: 'OpenNewTab' as const },
  { label: 'CQRS', href: '/cqrs', glyph: 'CurlyBraces' as const },
  { label: 'Architecture', href: '/architecture', glyph: 'University' as const },
];

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { darkMode, toggleDarkMode } = useDarkMode();
  const gen = useGenerator();
  const [genExpanded, setGenExpanded] = useState(false);

  const bg = darkMode ? palette.black : palette.white;
  const sideNavBg = darkMode ? '#112733' : palette.gray.light3;
  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;

  // Home page renders full-screen without sidebar
  if (pathname === '/') {
    return <>{children}</>;
  }

  return (
    <div
      className={css`
        display: flex;
        height: 100vh;
        background: ${bg};
      `}
    >
      {/* Sidebar */}
      <nav
        className={css`
          width: 270px;
          min-width: 270px;
          background: ${sideNavBg};
          border-right: 1px solid ${borderColor};
          display: flex;
          flex-direction: column;
          padding: 24px 0;
          overflow-y: auto;
        `}
      >
        {/* App title */}
        <Link href="/" className={css`text-decoration: none;`}>
          <div
            className={css`
              padding: 0 24px 24px;
              border-bottom: 1px solid ${borderColor};
              margin-bottom: 16px;
              cursor: pointer;
            `}
          >
            <div
              className={css`
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 4px;
              `}
            >
              <Icon glyph="Diagram3" size={24} fill={palette.green.base} />
              <H3
                className={css`
                  color: ${darkMode ? palette.white : palette.black} !important;
                  margin: 0 !important;
                  font-size: 18px !important;
                `}
              >
                EnergyMarket
              </H3>
            </div>
            <Overline
              className={css`
                color: ${palette.green.base} !important;
                margin-left: 34px !important;
              `}
            >
              Leafy
            </Overline>
          </div>
        </Link>

        {/* Nav items */}
        <div
          className={css`
            flex: 1;
            padding: 0 12px;
          `}
        >
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={css`
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 10px 16px;
                    margin-bottom: 4px;
                    border-radius: 8px;
                    cursor: pointer;
                    background: ${isActive
                      ? darkMode
                        ? palette.green.dark3
                        : palette.green.light3
                      : 'transparent'};
                    color: ${isActive
                      ? palette.green.base
                      : darkMode
                      ? palette.gray.light1
                      : palette.gray.dark1};
                    font-weight: ${isActive ? 600 : 400};
                    font-size: 14px;
                    transition: background 0.15s ease;
                    &:hover {
                      background: ${isActive
                        ? darkMode
                          ? palette.green.dark3
                          : palette.green.light3
                        : darkMode
                        ? 'rgba(255,255,255,0.05)'
                        : palette.gray.light3};
                    }
                  `}
                >
                  <Icon
                    glyph={item.glyph}
                    size={18}
                    fill={isActive ? palette.green.base : undefined}
                  />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Generator Widget */}
        <div
          className={css`
            padding: 12px 16px;
            margin: 0 12px;
            border: 1px solid ${borderColor};
            border-radius: 8px;
            background: ${darkMode ? 'rgba(0,237,100,0.04)' : 'rgba(0,124,52,0.04)'};
          `}
        >
          <div
            className={css`
              display: flex;
              align-items: center;
              justify-content: space-between;
              cursor: pointer;
            `}
            onClick={() => setGenExpanded((p) => !p)}
          >
            <div className={css`display: flex; align-items: center; gap: 8px;`}>
              {gen.isRunning && (
                <div
                  className={css`
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: ${palette.green.base};
                    animation: ${pulse} 1.5s ease-in-out infinite;
                  `}
                />
              )}
              <span
                className={css`
                  font-size: 12px;
                  font-weight: 600;
                  color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
                `}
              >
                {gen.isRunning ? 'Generator Running' : 'Generator'}
              </span>
            </div>
            {gen.isRunning && gen.latestMetrics && (
              <span
                className={css`
                  font-size: 11px;
                  font-weight: 700;
                  color: ${palette.green.base};
                  font-family: 'Source Code Pro', monospace;
                `}
              >
                {gen.latestMetrics.actual_throughput.toLocaleString()}/s
              </span>
            )}
            {!gen.isRunning && (
              <Icon
                glyph={genExpanded ? 'ChevronUp' : 'ChevronDown'}
                size={14}
                fill={darkMode ? palette.gray.light1 : palette.gray.dark1}
              />
            )}
          </div>

          {gen.isRunning ? (
            <div className={css`margin-top: 8px; display: flex; gap: 8px;`}>
              <Button
                variant="danger"
                size="xsmall"
                darkMode={darkMode}
                onClick={() => gen.stop()}
                className={css`flex: 1;`}
              >
                Stop
              </Button>
              <Link href="/dashboard">
                <Button
                  variant="default"
                  size="xsmall"
                  darkMode={darkMode}
                >
                  Details
                </Button>
              </Link>
            </div>
          ) : genExpanded ? (
            <div className={css`margin-top: 10px;`}>
              <div className={css`margin-bottom: 8px;`}>
                <div className={css`display: flex; justify-content: space-between; margin-bottom: 2px;`}>
                  <span className={css`font-size: 11px; color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};`}>Events/sec</span>
                  <span className={css`font-size: 11px; color: ${palette.green.base}; font-weight: 600;`}>{gen.config.events_per_second.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={10000}
                  step={100}
                  value={gen.config.events_per_second}
                  className={css`width: 100%; accent-color: ${palette.green.base};`}
                  onChange={(e) => gen.setConfig({ ...gen.config, events_per_second: Number(e.target.value) })}
                />
              </div>
              <Button
                variant="primary"
                size="xsmall"
                darkMode={darkMode}
                onClick={() => gen.start()}
                className={css`width: 100%;`}
              >
                Start Generator
              </Button>
              <Link href="/dashboard" className={css`display: block; text-align: center; margin-top: 6px; font-size: 11px; color: ${palette.green.base}; text-decoration: none; &:hover { text-decoration: underline; }`}>
                Full Dashboard →
              </Link>
            </div>
          ) : null}
        </div>

        {/* Dark mode toggle */}
        <div
          className={css`
            padding: 16px 24px;
            border-top: 1px solid ${borderColor};
            margin-top: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          `}
        >
          <span
            className={css`
              font-size: 13px;
              color: ${darkMode ? palette.gray.light1 : palette.gray.dark1};
            `}
          >
            Dark mode
          </span>
          <Toggle
            aria-label="Dark mode toggle"
            checked={darkMode}
            onChange={toggleDarkMode}
            size="small"
            darkMode={darkMode}
          />
        </div>
      </nav>

      {/* Main content */}
      <main
        className={css`
          flex: 1;
          overflow-y: auto;
          padding: 32px 40px;
          background: ${bg};
        `}
      >
        {children}
      </main>
    </div>
  );
}
