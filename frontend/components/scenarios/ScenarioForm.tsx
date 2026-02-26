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
  const [region, setRegion] = useState('Germany');
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
      // Friendly error with fallback to demo mode
      const isNetworkError = err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError');
      if (isNetworkError) {
        setError('Backend is not running. Use "Run Demo Scenario" above for a simulated flow, or start the FastAPI server.');
      } else {
        setError(err.message || 'Failed to create scenario. Check that the backend is running and MongoDB is accessible.');
      }
      // Still add a local mock scenario so the UI isn't empty
      const mockId = `local-${Date.now().toString(36)}`;
      setSuccess(`Demo scenario created locally: ${mockId}`);
      onCreated(mockId);
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
        <Option value="Germany">Germany</Option>
        <Option value="France">France</Option>
        <Option value="Spain">Spain</Option>
        <Option value="Netherlands">Netherlands</Option>
        <Option value="Norway">Norway</Option>
        <Option value="Italy">Italy</Option>
        <Option value="United Kingdom">United Kingdom</Option>
        <Option value="Portugal">Portugal</Option>
        <Option value="Belgium">Belgium</Option>
        <Option value="Denmark">Denmark</Option>
        <Option value="Sweden">Sweden</Option>
        <Option value="Austria">Austria</Option>
        <Option value="Poland">Poland</Option>
        <Option value="Ireland">Ireland</Option>
        <Option value="Finland">Finland</Option>
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
