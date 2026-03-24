'use client';

import { createContext, useContext, useState, useCallback } from 'react';

export interface Disruption {
  id: string;
  type: 'hurricane';
  name: string;
  description: string;
  oilPriceImpactPercent: number;
  powerPriceImpactPercent: number;
  gasPriceImpactPercent: number;
  vesselsAffected: boolean;
}

const STORM_SCENARIO: Disruption = {
  id: 'storm-north-sea-2026',
  type: 'hurricane',
  name: 'Severe Storm — North Sea',
  description:
    'A severe extratropical cyclone is crossing the North Sea with 90+ knot winds. All vessel traffic to Rotterdam Europoort is suspended. Norwegian crude and Baltic tanker shipments are delayed. North Sea platforms have reduced output. TTF and Brent futures spiking.',
  oilPriceImpactPercent: 14,
  powerPriceImpactPercent: 18,
  gasPriceImpactPercent: 22,
  vesselsAffected: true,
};

export const DISRUPTION_SCENARIOS = [STORM_SCENARIO];

interface DisruptionContextValue {
  active: boolean;
  disruption: Disruption | null;
  triggerDisruption: (disruptionId: string) => void;
  clearDisruption: () => void;
}

const DisruptionContext = createContext<DisruptionContextValue>({
  active: false,
  disruption: null,
  triggerDisruption: () => {},
  clearDisruption: () => {},
});

export const useDisruption = () => useContext(DisruptionContext);

export function DisruptionProvider({ children }: { children: React.ReactNode }) {
  const [disruption, setDisruption] = useState<Disruption | null>(null);

  const triggerDisruption = useCallback((disruptionId: string) => {
    const scenario = DISRUPTION_SCENARIOS.find((s) => s.id === disruptionId);
    if (scenario) setDisruption(scenario);
  }, []);

  const clearDisruption = useCallback(() => {
    setDisruption(null);
  }, []);

  return (
    <DisruptionContext.Provider
      value={{
        active: disruption !== null,
        disruption,
        triggerDisruption,
        clearDisruption,
      }}
    >
      {children}
    </DisruptionContext.Provider>
  );
}
