'use client';

import { useState, useCallback } from 'react';
import { css } from '@emotion/css';
import Button from '@leafygreen-ui/button';
import TextInput from '@leafygreen-ui/text-input';
import { Select, Option } from '@leafygreen-ui/select';
import Icon from '@leafygreen-ui/icon';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import { useLiveFeed } from '@/lib/live-feed-context';
import PageHeader from '@/components/shared/PageHeader';
import PortfolioSummaryCards from '@/components/dashboard/PortfolioSummaryCards';
import PositionsTable from '@/components/dashboard/PositionsTable';
import ExposureChart from '@/components/dashboard/ExposureChart';
import { portfolioSummary, positions, hourlyExposure } from '@/lib/mock-data';
import type { Position } from '@/lib/types';

export default function DashboardPage() {
  const { darkMode } = useDarkMode();
  const liveFeed = useLiveFeed();
  const [showAddForm, setShowAddForm] = useState(false);
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
      id: `P${String(activePositions.length + 1).padStart(3, '0')}`,
      instrument: newInstrument,
      type: newType,
      quantity: qty,
      avgPrice: price,
      currentPrice: price,
      unrealizedPnl: 0,
    };
    liveFeed.addPosition(position);
    setShowAddForm(false);
    setNewInstrument('');
    setNewQuantity('100');
    setNewPrice('75.00');
  }, [newInstrument, newType, newQuantity, newPrice, activePositions.length, liveFeed]);

  return (
    <div>
      <PageHeader
        title="Portfolio Dashboard"
        subtitle="Real-time overview of energy portfolio positions and exposure"
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

      {showAddForm && (
        <div
          className={css`
            display: grid;
            grid-template-columns: 2fr 1fr 1fr 1fr auto;
            gap: 12px;
            padding: 16px 20px;
            margin-bottom: 16px;
            background: ${darkMode ? '#112733' : palette.white};
            border: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
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

      <PortfolioSummaryCards summary={activeSummary} />
      <PositionsTable positions={activePositions} />
      <ExposureChart data={activeExposure} timeSeries={liveFeed.exposureTimeSeries} />
    </div>
  );
}
