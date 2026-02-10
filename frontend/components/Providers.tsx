'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import LeafyGreenProvider from '@leafygreen-ui/leafygreen-provider';
import EmotionRegistry from './EmotionRegistry';

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
          {children}
        </LeafyGreenProvider>
      </DarkModeContext.Provider>
    </EmotionRegistry>
  );
}
