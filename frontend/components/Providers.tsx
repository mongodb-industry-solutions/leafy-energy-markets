'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import LeafyGreenProvider from '@leafygreen-ui/leafygreen-provider';
import EmotionRegistry from './EmotionRegistry';
import { LiveFeedProvider } from '@/lib/live-feed-context';
import { GeneratorProvider } from '@/lib/generator-context';

interface DarkModeContextValue {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const DarkModeContext = createContext<DarkModeContextValue>({
  darkMode: true,
  toggleDarkMode: () => {},
});

export const useDarkMode = () => useContext(DarkModeContext);

export default function Providers({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkMode] = useState(true);
  const toggleDarkMode = useCallback(() => setDarkMode((prev) => !prev), []);

  return (
    <EmotionRegistry>
      <DarkModeContext.Provider value={{ darkMode, toggleDarkMode }}>
        <LeafyGreenProvider darkMode={darkMode}>
          <LiveFeedProvider>
            <GeneratorProvider>
              {children}
            </GeneratorProvider>
          </LiveFeedProvider>
        </LeafyGreenProvider>
      </DarkModeContext.Provider>
    </EmotionRegistry>
  );
}
