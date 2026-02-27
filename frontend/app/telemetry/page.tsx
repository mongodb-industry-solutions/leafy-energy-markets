'use client';

import { css } from '@emotion/css';
import Banner from '@leafygreen-ui/banner';
import { useDarkMode } from '@/components/Providers';
import { useGenerator, GENERATOR_CHART_META } from '@/lib/generator-context';
import PageHeader from '@/components/shared/PageHeader';
import ControlPanel from '@/components/telemetry/ControlPanel';
import TelemetryMetricCards from '@/components/telemetry/TelemetryMetricCards';
import ThroughputChart from '@/components/telemetry/ThroughputChart';
import LatencyChart from '@/components/telemetry/LatencyChart';
import SubstationGrid from '@/components/telemetry/SubstationGrid';
import GeneratorOutputChart from '@/components/telemetry/GeneratorOutputChart';
import EventFeed from '@/components/telemetry/EventFeed';

export default function TelemetryPage() {
  const { darkMode } = useDarkMode();
  const gen = useGenerator();

  return (
    <div className={css`display: flex; flex-direction: column; gap: 24px;`}>
      <PageHeader
        title="Telemetry"
        subtitle="Real-time MongoDB write performance — energy market event ingestion"
      />

      {gen.isSimulated && gen.isRunning && (
        <Banner variant="info" darkMode={darkMode}>
          {gen.mode === 'backend'
            ? 'Backend unavailable — showing simulated metrics. Start the FastAPI server for live MongoDB writes.'
            : 'Running in simulation mode — metrics are generated client-side.'}
        </Banner>
      )}

      <div className={css`display: flex; gap: 24px; align-items: flex-start;`}>
        <ControlPanel
          config={gen.config}
          onChange={gen.setConfig}
          isRunning={gen.isRunning}
          onStart={gen.start}
          onStop={gen.stop}
          mode={gen.mode}
          onModeChange={gen.setMode}
          backendWarning={gen.backendWarning}
        />

        <div className={css`flex: 1; display: flex; flex-direction: column; gap: 16px; min-width: 0;`}>
          <TelemetryMetricCards metrics={gen.latestMetrics} />
          <ThroughputChart data={gen.timeSeries} />
          <LatencyChart data={gen.timeSeries} />
          <SubstationGrid substations={gen.substations} />
          <GeneratorOutputChart
            data={gen.generatorTimeSeries}
            generatorIds={GENERATOR_CHART_META}
          />
          <EventFeed events={gen.feedEvents} />
        </div>
      </div>
    </div>
  );
}
