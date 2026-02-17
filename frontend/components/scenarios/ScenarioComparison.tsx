'use client';

import { useState } from 'react';
import { css } from '@emotion/css';
import Card from '@leafygreen-ui/card';
import { Tabs, Tab } from '@leafygreen-ui/tabs';
import { H3, Body } from '@leafygreen-ui/typography';
import Badge from '@leafygreen-ui/badge';
import { palette } from '@leafygreen-ui/palette';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { useDarkMode } from '@/components/Providers';
import MetricCard from '@/components/shared/MetricCard';
import ScenarioExplanationBubble from '@/components/scenarios/ScenarioExplanationBubble';
import { SCENARIO_EXPLANATIONS } from '@/lib/scenario-explanations';
import type { ScenarioComparison as ComparisonType } from '@/lib/types';

interface ScenarioComparisonProps {
  comparison: ComparisonType;
}

export default function ScenarioComparison({ comparison }: ScenarioComparisonProps) {
  const { darkMode } = useDarkMode();
  const [selectedTab, setSelectedTab] = useState(0);
  const { baseline, dynamic, savingsPercent, savingsAbsolute } = comparison;

  const chartData = baseline.hourlyPnl.map((h) => ({
    hour: `${String(h.hour).padStart(2, '0')}:00`,
    Baseline: h.baseline,
    Dynamic: h.dynamic,
    Savings: h.difference,
  }));

  const textColor = darkMode ? palette.gray.light1 : palette.gray.dark1;

  return (
    <div className={css`display: flex; flex-direction: column; gap: 20px;`}>
      {/* Summary cards */}
      <div className={css`display: flex; gap: 16px; flex-wrap: wrap;`}>
        <MetricCard
          label="Baseline Total Cost"
          value={`EUR ${baseline.totalCost.toLocaleString()}`}
        />
        <MetricCard
          label="Dynamic Total Cost"
          value={`EUR ${dynamic.totalCost.toLocaleString()}`}
        />
        <MetricCard
          label="Total Savings"
          value={`EUR ${savingsAbsolute.toLocaleString()}`}
          delta={`-${savingsPercent}%`}
          deltaType="positive"
        />
        <MetricCard
          label="Avg Price Reduction"
          value={`EUR ${(baseline.avgPrice - dynamic.avgPrice).toFixed(1)}/MWh`}
          delta={`-${((baseline.avgPrice - dynamic.avgPrice) / baseline.avgPrice * 100).toFixed(1)}%`}
          deltaType="positive"
        />
      </div>

      {/* Summary explanation */}
      <ScenarioExplanationBubble
        what={SCENARIO_EXPLANATIONS.summary.what}
        impact={SCENARIO_EXPLANATIONS.summary.impact}
      />

      {/* Chart tabs */}
      <Card darkMode={darkMode} className={css`padding: 24px;`}>
        <Tabs
          aria-label="Scenario comparison views"
          setSelected={setSelectedTab}
          selected={selectedTab}
          darkMode={darkMode}
        >
          <Tab name="Comparison">
            <div className={css`padding-top: 20px; height: 350px;`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#2d3e4f' : '#e8e8e8'} />
                  <XAxis dataKey="hour" stroke={textColor} fontSize={12} />
                  <YAxis stroke={textColor} fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: darkMode ? '#1c2d38' : '#fff',
                      border: `1px solid ${darkMode ? '#3d5468' : '#ddd'}`,
                      borderRadius: 8,
                      color: darkMode ? '#fff' : '#000',
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="Baseline" stroke="#FF6961" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Dynamic" stroke={palette.green.base} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Tab>
          <Tab name="Savings Breakdown">
            <div className={css`padding-top: 20px; height: 350px;`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#2d3e4f' : '#e8e8e8'} />
                  <XAxis dataKey="hour" stroke={textColor} fontSize={12} />
                  <YAxis stroke={textColor} fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: darkMode ? '#1c2d38' : '#fff',
                      border: `1px solid ${darkMode ? '#3d5468' : '#ddd'}`,
                      borderRadius: 8,
                      color: darkMode ? '#fff' : '#000',
                    }}
                  />
                  <Bar dataKey="Savings" fill={palette.green.base} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Tab>
        </Tabs>
      </Card>

      {/* Chart explanation — depends on selected tab */}
      {selectedTab === 0 ? (
        <ScenarioExplanationBubble
          what={SCENARIO_EXPLANATIONS.comparison.what}
          impact={SCENARIO_EXPLANATIONS.comparison.impact}
        />
      ) : (
        <ScenarioExplanationBubble
          what={SCENARIO_EXPLANATIONS.savings.what}
          impact={SCENARIO_EXPLANATIONS.savings.impact}
        />
      )}
    </div>
  );
}
