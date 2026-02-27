'use client';

import { createContext, useContext, useRef, useState, useCallback } from 'react';
import type { Position, PortfolioSummary, HourlyExposure, ExposurePoint } from './types';

const BACKEND = '/api';

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
  exposureTimeSeries: ExposurePoint[] | null;
  scenarioComparison: ScenarioLiveData | null;
}

interface LiveFeedContextValue extends LiveFeedState {
  startFeed: () => void;
  stopFeed: () => void;
  pushData: (data: {
    positions?: Position[];
    summary?: PortfolioSummary;
    exposure?: HourlyExposure[];
    exposureTimeSeries?: ExposurePoint[];
    scenarioComparison?: ScenarioLiveData;
  }) => void;
  addPosition: (position: Position) => void;
}

const LiveFeedContext = createContext<LiveFeedContextValue>({
  active: false,
  positions: null,
  summary: null,
  exposure: null,
  exposureTimeSeries: null,
  scenarioComparison: null,
  startFeed: () => {},
  stopFeed: () => {},
  pushData: () => {},
  addPosition: () => {},
});

export const useLiveFeed = () => useContext(LiveFeedContext);

export function LiveFeedProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LiveFeedState>({
    active: false,
    positions: null,
    summary: null,
    exposure: null,
    exposureTimeSeries: null,
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
      exposureTimeSeries: null,
      scenarioComparison: null,
    });
  }, []);

  const startFeed = useCallback(() => {
    // Clean up any existing connections
    if (dashboardESRef.current) dashboardESRef.current.close();
    if (scenarioESRef.current) scenarioESRef.current.close();

    setState((prev) => ({ ...prev, active: true }));

    // Try backend SSE — if it fails, the feed still works via pushData()
    const dashES = new EventSource(`${BACKEND}/dashboard/stream`);
    dashboardESRef.current = dashES;
    dashES.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setState((prev) => ({
          ...prev,
          active: true,
          positions: data.positions || prev.positions,
          summary: data.summary || prev.summary,
          exposure: data.exposure || prev.exposure,
        }));
      } catch { /* ignore parse errors */ }
    };
    dashES.onerror = () => {
      dashES.close();
      dashboardESRef.current = null;
    };

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

  // Push data directly (used by simulation mode to feed the dashboard)
  const pushData = useCallback((data: {
    positions?: Position[];
    summary?: PortfolioSummary;
    exposure?: HourlyExposure[];
    exposureTimeSeries?: ExposurePoint[];
    scenarioComparison?: ScenarioLiveData;
  }) => {
    setState((prev) => ({
      ...prev,
      positions: data.positions ?? prev.positions,
      summary: data.summary ?? prev.summary,
      exposure: data.exposure ?? prev.exposure,
      exposureTimeSeries: data.exposureTimeSeries ?? prev.exposureTimeSeries,
      scenarioComparison: data.scenarioComparison ?? prev.scenarioComparison,
    }));
  }, []);

  const addPosition = useCallback((position: Position) => {
    setState((prev) => {
      const current = prev.positions ?? [];
      const newPositions = [...current, position];
      const totalPnl = newPositions.reduce((s, p) => s + p.unrealizedPnl, 0);
      const portfolioValue = newPositions.reduce((s, p) => s + p.currentPrice * p.quantity, 0);
      return {
        ...prev,
        positions: newPositions,
        summary: prev.summary
          ? {
              ...prev.summary,
              activePositions: newPositions.length,
              totalPnl,
              portfolioValue: Math.round(portfolioValue),
              pnlDelta: `${totalPnl >= 0 ? '+' : ''}${(totalPnl / (portfolioValue || 1) * 100).toFixed(1)}%`,
            }
          : prev.summary,
      };
    });
  }, []);

  return (
    <LiveFeedContext.Provider value={{ ...state, startFeed, stopFeed, pushData, addPosition }}>
      {children}
    </LiveFeedContext.Provider>
  );
}
