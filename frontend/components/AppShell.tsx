'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { css } from '@emotion/css';
import Icon from '@leafygreen-ui/icon';
import Toggle from '@leafygreen-ui/toggle';
import { H3, Overline } from '@leafygreen-ui/typography';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from './Providers';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', glyph: 'Dashboard' as const },
  { label: 'EnerLeafy AI', href: '/leafy', glyph: 'Sparkle' as const },
  { label: 'Auditing', href: '/audit', glyph: 'OpenNewTab' as const },
  { label: 'CQRS', href: '/cqrs', glyph: 'CurlyBraces' as const },
  { label: 'Architecture', href: '/architecture', glyph: 'University' as const },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { darkMode, toggleDarkMode } = useDarkMode();

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
