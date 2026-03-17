'use client';

import { useState, useCallback } from 'react';
import { css } from '@emotion/css';
import Button from '@leafygreen-ui/button';
import TextInput from '@leafygreen-ui/text-input';
import { Select, Option } from '@leafygreen-ui/select';
import Icon from '@leafygreen-ui/icon';
import Banner from '@leafygreen-ui/banner';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import { useLiveFeed } from '@/lib/live-feed-context';
import { useGenerator, GENERATOR_CHART_META } from '@/lib/generator-context';
import PageHeader from '@/components/shared/PageHeader';
import PortfolioSummaryCards from '@/components/dashboard/PortfolioSummaryCards';
import PositionsTable from '@/components/dashboard/PositionsTable';
import ExposureChart from '@/components/dashboard/ExposureChart';
import TelemetryMetricCards from '@/components/telemetry/TelemetryMetricCards';
import GeneratorOutputChart from '@/components/telemetry/GeneratorOutputChart';
import SubstationGrid from '@/components/telemetry/SubstationGrid';
import EventFeed from '@/components/telemetry/EventFeed';
import { portfolioSummary, positions, hourlyExposure } from '@/lib/mock-data';
import type { Position } from '@/lib/types';

export default function DashboardPage() {
  const { darkMode } = useDarkMode();
  const liveFeed = useLiveFeed();
  const gen = useGenerator();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showTelemetryDetails, setShowTelemetryDetails] = useState(false);
  const [newInstrument, setNewInstrument] = useState('');
  const [newType, setNewType] = useState<Position['type']>('POWER');
  const [newQuantity, setNewQuantity] = useState('100');
  const [newPrice, setNewPrice] = useState('75.00');

  const activePositions = liveFeed.active && liveFeed.positions ? liveFeed.positions : positions;
  const activeSummary = liveFeed.active && liveFeed.summary ? liveFeed.summary : portfolioSummary;
  const activeExposure = liveFeed.active && liveFeed.exposure ? liveFeed.exposure : hourlyExposure;

  const handleAddPosition = useCallback(() => {
    const qty = Number(newQuantity);
    const price = Number(newPrice);
    if (!newInstrument || isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) return;

    const position: Position = {
      id: `P${String(Date.now()).slice(-6)}`,
      instrument: newInstrument,
      type: newType,
      quantity: qty,
      avgPrice: price,
      currentPrice: price,
      unrealizedPnl: 0,
    };
    gen.addTrackedPosition(position);
    setShowAddForm(false);
    setNewInstrument('');
    setNewQuantity('100');
    setNewPrice('75.00');
  }, [newInstrument, newType, newQuantity, newPrice, gen]);

  const handleLiquidate = useCallback((positionId: string) => {
    gen.removeTrackedPosition(positionId);
  }, [gen]);

  const borderColor = darkMode ? palette.gray.dark2 : palette.gray.light2;

  return (
    <div className={css`display: flex; flex-direction: column; gap: 24px;`}>
      <PageHeader
        title="VPP Dashboard"
        subtitle="Real-time virtual power plant overview — portfolio, telemetry, and position management"
        action={
          <div className={css`display: flex; align-items: center; gap: 8px;`}>
            {liveFeed.active && (
              <span
                className={css`
                  display: inline-flex;
                  align-items: center;
                  gap: 6px;
                  padding: 4px 12px;
                  border-radius: 12px;
                  font-size: 11px;
                  font-weight: 700;
                  text-transform: uppercase;
                  letter-spacing: 0.5px;
                  background: ${palette.red.base};
                  color: ${palette.white};
                  animation: pulse 1.5s ease-in-out infinite;
                  @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                  }
                `}
              >
                <span
                  className={css`
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: ${palette.white};
                  `}
                />
                Live
              </span>
            )}
            <Button
              variant="primary"
              size="small"
              darkMode={darkMode}
              leftGlyph={<Icon glyph="Plus" />}
              onClick={() => setShowAddForm((p) => !p)}
            >
              Add Position
            </Button>
          </div>
        }
      />

      {gen.isSimulated && gen.isRunning && (
        <Banner variant="info" darkMode={darkMode}>
          {gen.mode === 'backend'
            ? 'Backend unavailable — showing simulated metrics. Start the FastAPI server for live MongoDB writes.'
            : 'Running in simulation mode — metrics are generated client-side.'}
        </Banner>
      )}

      {/* Add Position Form */}
      {showAddForm && (
        <div
          className={css`
            display: grid;
            grid-template-columns: 2fr 1fr 1fr 1fr auto;
            gap: 12px;
            padding: 16px 20px;
            background: ${darkMode ? '#112733' : palette.white};
            border: 1px solid ${borderColor};
            border-radius: 12px;
            align-items: end;
          `}
        >
          <TextInput
            label="Instrument"
            placeholder="DE Baseload Q3-26"
            value={newInstrument}
            onChange={(e) => setNewInstrument(e.target.value)}
            darkMode={darkMode}
          />
          <Select
            label="Type"
            value={newType}
            onChange={(val) => setNewType(val as Position['type'])}
            darkMode={darkMode}
          >
            <Option value="POWER">POWER</Option>
            <Option value="GAS">GAS</Option>
            <Option value="CARBON">CARBON</Option>
            <Option value="RENEWABLE">RENEWABLE</Option>
          </Select>
          <TextInput
            label="Quantity"
            type="number"
            value={newQuantity}
            onChange={(e) => setNewQuantity(e.target.value)}
            darkMode={darkMode}
          />
          <TextInput
            label="Price (EUR)"
            type="number"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            darkMode={darkMode}
          />
          <Button
            variant="primary"
            darkMode={darkMode}
            onClick={handleAddPosition}
          >
            Add
          </Button>
        </div>
      )}

      {/* Portfolio Summary */}
      <PortfolioSummaryCards summary={activeSummary} />

      {/* Telemetry Metrics — only when generator running */}
      {gen.isRunning && (
        <TelemetryMetricCards metrics={gen.latestMetrics} />
      )}

      {/* Charts Row */}
      <div className={css`display: flex; gap: 24px; align-items: flex-start; @media (max-width: 1200px) { flex-direction: column; }`}>
        <div className={css`flex: 1; min-width: 0;`}>
          <ExposureChart data={activeExposure} timeSeries={liveFeed.exposureTimeSeries} />
        </div>
        {gen.isRunning && (
          <div className={css`flex: 1; min-width: 0;`}>
            <GeneratorOutputChart
              data={gen.generatorTimeSeries}
              generatorIds={GENERATOR_CHART_META}
            />
          </div>
        )}
      </div>

      {/* Positions Table */}
      <PositionsTable positions={activePositions} onLiquidate={handleLiquidate} />

      {/* Telemetry Details — expandable */}
      {gen.isRunning && (
        <div>
          <Button
            variant="default"
            size="small"
            darkMode={darkMode}
            onClick={() => setShowTelemetryDetails((p) => !p)}
            leftGlyph={<Icon glyph={showTelemetryDetails ? 'ChevronDown' : 'ChevronRight'} />}
          >
            {showTelemetryDetails ? 'Hide' : 'Show'} Telemetry Details
          </Button>
          {showTelemetryDetails && (
            <div className={css`margin-top: 16px; display: flex; flex-direction: column; gap: 16px;`}>
              <SubstationGrid substations={gen.substations} />
              <EventFeed events={gen.feedEvents} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
