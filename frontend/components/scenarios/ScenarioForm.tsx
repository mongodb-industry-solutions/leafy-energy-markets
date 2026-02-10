'use client';

import { useState } from 'react';
import { css } from '@emotion/css';
import Button from '@leafygreen-ui/button';
import TextInput from '@leafygreen-ui/text-input';
import { Select, Option } from '@leafygreen-ui/select';
import Banner from '@leafygreen-ui/banner';
import { palette } from '@leafygreen-ui/palette';
import { useDarkMode } from '@/components/Providers';
import { createTariffScenario } from '@/lib/api';

interface ScenarioFormProps {
  onCreated: (scenarioId: string) => void;
}

export default function ScenarioForm({ onCreated }: ScenarioFormProps) {
  const { darkMode } = useDarkMode();
  const [portfolioId, setPortfolioId] = useState('PORTFOLIO-123');
  const [region, setRegion] = useState('NORTH');
  const [fromDate, setFromDate] = useState('2026-02-10T10:00:00Z');
  const [toDate, setToDate] = useState('2026-02-17T10:00:00Z');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await createTariffScenario(portfolioId, {
        region,
        from_date: fromDate,
        to_date: toDate,
      });
      setSuccess(`Scenario created: ${res.scenario_id}`);
      onCreated(res.scenario_id);
    } catch (err: any) {
      setError(err.message || 'Failed to create scenario');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={css`
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        padding: 24px;
        background: ${darkMode ? '#112733' : palette.white};
        border: 1px solid ${darkMode ? palette.gray.dark2 : palette.gray.light2};
        border-radius: 12px;
        margin-bottom: 24px;
      `}
    >
      <TextInput
        label="Portfolio ID"
        value={portfolioId}
        onChange={(e) => setPortfolioId(e.target.value)}
        darkMode={darkMode}
      />
      <Select
        label="Region"
        value={region}
        onChange={(val) => setRegion(val)}
        darkMode={darkMode}
      >
        <Option value="NORTH">NORTH</Option>
        <Option value="SOUTH">SOUTH</Option>
        <Option value="EAST">EAST</Option>
        <Option value="WEST">WEST</Option>
      </Select>
      <TextInput
        label="From Date"
        value={fromDate}
        onChange={(e) => setFromDate(e.target.value)}
        darkMode={darkMode}
      />
      <TextInput
        label="To Date"
        value={toDate}
        onChange={(e) => setToDate(e.target.value)}
        darkMode={darkMode}
      />
      <div
        className={css`
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          gap: 12px;
        `}
      >
        <Button
          variant="primary"
          type="submit"
          disabled={loading}
          darkMode={darkMode}
        >
          {loading ? 'Creating...' : 'Create Scenario'}
        </Button>
      </div>
      {error && (
        <div className={css`grid-column: 1 / -1;`}>
          <Banner variant="danger" darkMode={darkMode}>{error}</Banner>
        </div>
      )}
      {success && (
        <div className={css`grid-column: 1 / -1;`}>
          <Banner variant="success" darkMode={darkMode}>{success}</Banner>
        </div>
      )}
    </form>
  );
}
