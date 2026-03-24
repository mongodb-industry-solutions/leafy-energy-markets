'use client';

import { createContext, useContext, useRef, useState, useCallback } from 'react';
import type { Position, PortfolioSummary, HourlyExposure, ExposurePoint } from './types';

import { BACKEND_SSE } from './constants';

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
  removePosition: (positionId: string) => void;
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
  removePosition: () => {},
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

    // Backend SSE — let EventSource auto-reconnect on transient errors.
    // Only close after repeated failures (e.g. backend truly down).
    let dashErrors = 0;
    const dashES = new EventSource(`${BACKEND_SSE}/dashboard/stream`);
    dashboardESRef.current = dashES;
    dashES.onmessage = (event) => {
      dashErrors = 0;
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
      dashErrors++;
      if (dashErrors >= 3) {
        dashES.close();
        dashboardESRef.current = null;
      }
    };

    let scenErrors = 0;
    const scenES = new EventSource(`${BACKEND_SSE}/scenarios/stream`);
    scenarioESRef.current = scenES;
    scenES.onmessage = (event) => {
      scenErrors = 0;
      try {
        const data = JSON.parse(event.data);
        setState((prev) => ({
          ...prev,
          scenarioComparison: data,
        }));
      } catch { /* ignore parse errors */ }
    };
    scenES.onerror = () => {
      scenErrors++;
      if (scenErrors >= 3) {
        scenES.close();
        scenarioESRef.current = null;
      }
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

  const removePosition = useCallback((positionId: string) => {
    setState((prev) => {
      const current = prev.positions ?? [];
      const newPositions = current.filter((p) => p.id !== positionId);
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
    <LiveFeedContext.Provider value={{ ...state, startFeed, stopFeed, pushData, addPosition, removePosition }}>
      {children}
    </LiveFeedContext.Provider>
  );
}
