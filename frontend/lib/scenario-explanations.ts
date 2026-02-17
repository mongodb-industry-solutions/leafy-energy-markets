export interface ScenarioExplanation {
  what: string;
  impact: string;
}

export const SCENARIO_EXPLANATIONS: Record<string, ScenarioExplanation> = {
  summary: {
    what: 'The comparison shows two tariff strategies for the same portfolio over the same time period. The flat tariff applies a uniform rate of EUR 74.2/MWh across all hours. The dynamic tariff uses time-of-use pricing combined with load shifting to exploit the natural wholesale price curve.',
    impact: 'The dynamic strategy saves the difference shown above by shifting flexible load to off-peak hours when wholesale prices are 30-40% lower. For a Balance Responsible Party managing a EUR 28M portfolio, even single-digit percentage savings translate to significant absolute reductions in procurement costs.',
  },
  comparison: {
    what: 'The line chart compares hourly costs under both tariff strategies. The red line (baseline) peaks during hours 08:00-20:00 when industrial demand pushes wholesale prices to EUR 85-110/MWh. The green line (dynamic) is consistently lower, with the widest gap during peak hours where load shifting has the greatest effect.',
    impact: 'The gap between the two lines represents money saved each hour. Peak-hour savings are 2-3x larger than off-peak savings because the price differential is greatest when demand is highest. This pattern is consistent across European power markets and is the core mechanism behind time-of-use tariff optimization.',
  },
  savings: {
    what: 'The bar chart breaks down savings hour-by-hour. The tallest bars appear during peak hours (10:00-14:00) where the price differential between flat and dynamic tariffs is greatest. Small or negative bars may appear during off-peak hours when the dynamic tariff sometimes exceeds the flat rate due to grid fees or balancing costs.',
    impact: 'For a BRP managing a EUR 28M portfolio, these hourly savings compound across the settlement period. The savings pattern also informs optimal load-shifting schedules — the tallest bars indicate the hours where shifting additional flexible demand would yield the greatest returns.',
  },
};
