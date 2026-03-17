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

const HURRICANE_SCENARIO: Disruption = {
  id: 'hurricane-gulf-2026',
  type: 'hurricane',
  name: 'Hurricane — Gulf of Mexico',
  description:
    'A Category 4 hurricane has been detected in the Gulf of Mexico. All vessel traffic through the region is suspended. Venezuelan crude oil shipments are delayed indefinitely. Refineries along the US Gulf Coast are shutting down precautionary operations.',
  oilPriceImpactPercent: 18,
  powerPriceImpactPercent: 12,
  gasPriceImpactPercent: 15,
  vesselsAffected: true,
};

export const DISRUPTION_SCENARIOS = [HURRICANE_SCENARIO];

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
