'use client';

import { createContext, useContext, useRef, useState, useCallback } from 'react';
import type { Position, PortfolioSummary, HourlyExposure } from './types';

const BACKEND = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export interface ScenarioLiveData {
  hourlyPnl: { hour: number; baseline: number; dynamic: number; difference: number }[];
  baselineCost: number;
  dynamicCost: number;
  savingsAbsolute: number;
  savingsPercent: number;
}

export interface LiveFeedState {
  active: boolean;
  positions: Position[] | null;
  summary: PortfolioSummary | null;
  exposure: HourlyExposure[] | null;
  scenarioComparison: ScenarioLiveData | null;
}

interface LiveFeedContextValue extends LiveFeedState {
  startFeed: () => void;
  stopFeed: () => void;
}

const LiveFeedContext = createContext<LiveFeedContextValue>({
  active: false,
  positions: null,
  summary: null,
  exposure: null,
  scenarioComparison: null,
  startFeed: () => {},
  stopFeed: () => {},
});

export const useLiveFeed = () => useContext(LiveFeedContext);

export function LiveFeedProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LiveFeedState>({
    active: false,
    positions: null,
    summary: null,
    exposure: null,
    scenarioComparison: null,
  });

  const dashboardESRef = useRef<EventSource | null>(null);
  const scenarioESRef = useRef<EventSource | null>(null);

  const stopFeed = useCallback(() => {
    if (dashboardESRef.current) {
      dashboardESRef.current.close();
      dashboardESRef.current = null;
    }
    if (scenarioESRef.current) {
      scenarioESRef.current.close();
      scenarioESRef.current = null;
    }
    setState({
      active: false,
      positions: null,
      summary: null,
      exposure: null,
      scenarioComparison: null,
    });
  }, []);

  const startFeed = useCallback(() => {
    // Clean up any existing connections
    if (dashboardESRef.current) dashboardESRef.current.close();
    if (scenarioESRef.current) scenarioESRef.current.close();

    setState((prev) => ({ ...prev, active: true }));

    // Dashboard SSE
    const dashES = new EventSource(`${BACKEND}/dashboard/stream`);
    dashboardESRef.current = dashES;
    dashES.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setState((prev) => ({
          ...prev,
          active: true,
          positions: data.positions || null,
          summary: data.summary || null,
          exposure: data.exposure || null,
        }));
      } catch { /* ignore parse errors */ }
    };
    dashES.onerror = () => {
      dashES.close();
      dashboardESRef.current = null;
    };

    // Scenario SSE
    const scenES = new EventSource(`${BACKEND}/scenarios/stream`);
    scenarioESRef.current = scenES;
    scenES.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setState((prev) => ({
          ...prev,
          scenarioComparison: data,
        }));
      } catch { /* ignore parse errors */ }
    };
    scenES.onerror = () => {
      scenES.close();
      scenarioESRef.current = null;
    };
  }, []);

  return (
    <LiveFeedContext.Provider value={{ ...state, startFeed, stopFeed }}>
      {children}
    </LiveFeedContext.Provider>
  );
}
