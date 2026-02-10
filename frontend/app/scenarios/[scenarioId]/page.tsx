'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getTariffScenario } from '@/lib/api';
import { scenarioComparison, mockScenarios } from '@/lib/mock-data';
import ScenarioDetailView from '@/components/scenarios/ScenarioDetailView';
import LoadingState from '@/components/shared/LoadingState';
import ErrorBanner from '@/components/shared/ErrorBanner';
import type { TariffScenario } from '@/lib/types';

export default function ScenarioDetailPage() {
  const params = useParams();
  const scenarioId = params?.scenarioId as string;
  const [scenario, setScenario] = useState<TariffScenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getTariffScenario(scenarioId);
        setScenario(data);
      } catch {
        // Fall back to mock data for demo
        const mock = mockScenarios.find((s) => s._id === scenarioId);
        if (mock) {
          setScenario(mock);
        } else {
          // Create a mock scenario with the given ID
          setScenario({
            _id: scenarioId,
            portfolio_id: 'PORTFOLIO-123',
            region: 'NORTH',
            from_date: '2026-02-10T10:00:00Z',
            to_date: '2026-02-17T10:00:00Z',
            status: 'created',
            createdAt: new Date().toISOString(),
          });
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [scenarioId]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorBanner message={error} />;
  if (!scenario) return <ErrorBanner message="Scenario not found" />;

  return (
    <ScenarioDetailView
      scenario={scenario}
      comparison={scenarioComparison}
    />
  );
}
