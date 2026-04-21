interface EventExplanation {
  what: string;
  impact: string;
}

type ScenarioExplanations = Record<number, EventExplanation>;

export const EVENT_EXPLANATIONS: Record<string, ScenarioExplanations> = {
  'imbalance-settlement': {
    1: {
      what: 'KNMI publishes an early-morning wind forecast for Hollandse Kust Wind (ASSET-WIND-NL-001): 128 MW expected output for the 14:00-14:15 ISP, based on 9.4 m/s offshore wind speed and 82% confidence.',
      impact: 'This forecast becomes the basis for the BRP\'s day-ahead commitment. At 128 MW out of 200 MW capacity, the farm is expected to run at 64% load factor. The trading desk will use this number to sell power on EPEX. If the forecast is wrong, the BRP faces imbalance exposure.',
    },
    2: {
      what: 'The trading desk sets the capacity allocation for Hollandse Kust at 128 MW for the 14:00 ISP, directly based on the v1 wind forecast. The BRP nomination is locked to BRP-NL-LEAFY-001.',
      impact: 'This is the commitment decision. By allocating exactly the forecasted 128 MW, the desk is betting the forecast is accurate. The metadata records that this allocation is based on forecast version 1 — critical audit evidence when the forecast is later revised upward.',
    },
    3: {
      what: 'The desk executes a day-ahead sell trade: 128 MW at EUR 74.20/MWh on EPEX-NL-DA for the 14:00 quarter-hour. The BRP is now contractually obligated to deliver 128 MW during this ISP.',
      impact: 'This trade locks in EUR 2,374.40 in day-ahead revenue (128 MW x 0.25h x EUR 74.20). Any deviation between this commitment and actual output will be settled at the imbalance price. The trade was correctly sized to the forecast — but the forecast will prove stale.',
    },
    4: {
      what: 'At 12:45, KNMI publishes an updated wind forecast: 172 MW expected output (up from 128 MW), with wind speed rising to 12.8 m/s and confidence improving to 91%. The forecast delta is +34.4%.',
      impact: 'This is the critical event. The updated forecast arrives after the day-ahead trade is already executed and the BRP nomination is locked. The desk now knows the farm will likely produce 172 MW, but they committed to deliver only 128 MW. The 44 MW surplus will hit the imbalance settlement. In a well-functioning market, the BRP should have traded the surplus intraday — but the immutable event trail proves the forecast update arrived after the commitment window.',
    },
    5: {
      what: 'The TenneT metered data provider records 8,412.60 MWh on meter NL-HKW-METER-001 at the start of the 14:00 ISP. This is the baseline generation reading for Hollandse Kust.',
      impact: 'This meter reading establishes the "starting line" for the settlement period. The difference between this and the end-of-ISP reading determines actual generation. Meter accuracy is critical — even a 0.1 MWh error at 200 MW capacity shifts the imbalance calculation.',
    },
    6: {
      what: 'The end-of-ISP meter reading is 8,455.90 MWh, giving actual generation of 43.30 MWh over 15 minutes — equivalent to 173.2 MW average output. The farm exceeded both the original forecast (128 MW) and the updated forecast (172 MW).',
      impact: 'Actual output of 173.2 MW vs. the 128 MW commitment means the BRP over-delivered by 45.2 MW. In a "long" system (surplus), over-delivery should be credited. In a "short" system, it helps balance the grid. The TSO\'s treatment of this surplus determines whether the BRP profits or is penalized.',
    },
    7: {
      what: 'An automated performance variance alert fires: Hollandse Kust delivered 173.2 MW against a 128 MW commitment — a 35.3% over-delivery. The variance is flagged as "over_delivery" direction.',
      impact: 'This automated detection triggers the compliance workflow. The 45.2 MW variance is well above the typical tolerance band. For auditors, this event proves the system detected the mismatch in real-time. The question now is: how does the TSO settle this surplus?',
    },
    8: {
      what: 'A position gap of 45.2 MW long is detected for BRP-NL-LEAFY-001. TenneT\'s preliminary settlement applies an imbalance price of EUR 320/MWh and charges the BRP EUR 3,616 for the over-delivery.',
      impact: 'This is the disputed event. TenneT has incorrectly treated the over-delivery as a negative imbalance — charging the BRP EUR 3,616 instead of crediting them. Under EBGL Article 55, over-delivery in a long system should be compensated at the single imbalance price, not penalized. The BRP\'s position gap is real (they produced more than committed), but the financial treatment is wrong.',
    },
    9: {
      what: 'The preliminary P&L snapshot shows a net loss of EUR 1,241.60: day-ahead revenue of EUR 2,374.40 minus the incorrect imbalance charge of EUR 3,616.00. Settlement status is marked "preliminary".',
      impact: 'The BRP is showing a loss on a period where it over-performed. This is the trigger for the dispute. The day-ahead sale was profitable, but the TSO\'s incorrect imbalance treatment turns the whole ISP into a loss. The note field explicitly flags the dispute — this is the audit trail that will support the correction.',
    },
    10: {
      what: 'TenneT accepts the dispute (DISP-2025-NL-00417) and issues a corrected settlement: the 45.2 MW over-delivery is now credited at EUR 128/MWh (single imbalance price), giving a credit of EUR 1,446.40. The corrected net P&L is EUR 3,820.80.',
      impact: 'The correction swings the P&L from -EUR 1,241.60 to +EUR 3,820.80 — a EUR 5,062.40 difference. The metadata explicitly references version 9 (the incorrect settlement) and cites EBGL Article 55 as the legal basis. Because event sourcing preserves both the incorrect and corrected settlements, the full dispute trail is immutable. No one can claim the original charge "never happened" — both versions coexist in the audit log, providing complete regulatory transparency.',
    },
  },
};
