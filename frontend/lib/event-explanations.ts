interface EventExplanation {
  what: string;
  impact: string;
}

type ScenarioExplanations = Record<number, EventExplanation>;

export const EVENT_EXPLANATIONS: Record<string, ScenarioExplanations> = {
  'imbalance-settlement': {
    1: {
      what: 'The Balance Responsible Party (BRP) buys 50 MWh on the intraday market at €82.50/MWh, establishing an initial long position ahead of the 14:00 Imbalance Settlement Period.',
      impact: 'This trade is the baseline for the BRP\'s settlement obligation. If the BRP\'s actual consumption exceeds its contracted position, it will be exposed to the imbalance price — which during scarcity can exceed €10,000/MWh. Every trade must be preserved for the TSO audit trail.',
    },
    2: {
      what: 'The intraday market price ticks up to €84.00/MWh, reflecting increasing demand approaching the delivery hour.',
      impact: 'The price movement signals tightening supply. For the auditor, this price tick establishes the market context — the BRP\'s earlier buy at €82.50 was well-timed. This data point will be used to validate that all settlement prices were correctly applied.',
    },
    3: {
      what: 'The smart meter at substation de-sub-4471 records 1,204.8 MWh at the start of the 15-minute ISP (14:00). This is the baseline consumption reading from the metered data provider (50Hertz).',
      impact: 'This is the "starting line" for the settlement period. The difference between this reading and the end-of-ISP reading will determine actual consumption. Any error here propagates directly into the imbalance calculation — and the customer\'s financial exposure.',
    },
    4: {
      what: 'The BRP sells 20 MWh back at €86.20/MWh, reducing the net position from 50 MWh to 30 MWh. The BRP is locking in profit on the price rise.',
      impact: 'The net position is now 30 MWh long. If actual consumption during the ISP is close to 30 MWh, the BRP is balanced. If consumption is higher, the BRP faces imbalance charges. This sell trade is critical evidence — in a CRUD system it could be overwritten, but event sourcing preserves it permanently.',
    },
    5: {
      what: 'The smart meter records 1,243.0 MWh at the end of the ISP (14:15). This is the original end reading from 50Hertz. Consumption = 1,243.0 − 1,204.8 = 38.2 MWh.',
      impact: 'Based on this reading, the BRP consumed 38.2 MWh but only held 30 MWh — an apparent shortfall of 8.2 MWh. At the imbalance price, this could mean a significant penalty. However, this reading will later be corrected. The immutable audit trail preserves both the original and the correction.',
    },
    6: {
      what: 'The imbalance settlement price is published at €850.00/MWh — an extreme scarcity price for this ISP.',
      impact: 'At €850/MWh, even a small shortfall is extremely expensive. The original 8.2 MWh apparent shortfall would cost the BRP ~€6,970. This is why the meter correction in the next event is so consequential for the customer\'s bottom line.',
    },
    7: {
      what: 'A corrected meter reading arrives the next day: 1,241.9 MWh (down from 1,243.0). The metadata explicitly references version 5, the reading it corrects, due to a meter calibration adjustment.',
      impact: 'With the corrected reading, actual consumption = 1,241.9 − 1,204.8 = 37.1 MWh. The BRP held 30 MWh, so the true shortfall is only 7.1 MWh — not 8.2. More critically, fold() now proves both readings exist in the audit trail. The BRP can demonstrate to the TSO that the correction was applied and traceable, potentially saving ~€935 at the €850/MWh imbalance price.',
    },
  },

  'remit-surveillance': {
    1: {
      what: 'The EPEX DE Intraday 17:00 delivery instrument is officially listed for trading on the EPEX SPOT exchange in the DE-LU bidding zone.',
      impact: 'This is the baseline — a clean order book with no prior activity. For ACER investigators, this proves the instrument existed before the suspicious trading pattern began. All subsequent events are sequenced against this anchor.',
    },
    2: {
      what: 'Trader AW-TR-042 at AlphaWatt places the first buy order: 10 MWh at €72.00/MWh via a limit buy order.',
      impact: 'This is the first step of the suspected spoofing pattern — a small initial buy to establish presence in the order book. In isolation, this trade looks normal. But ACER\'s surveillance algorithms will correlate it with the rapid sequence that follows.',
    },
    3: {
      what: 'The market price immediately jumps to €78.50/MWh after the order book update — a €6.50 increase triggered by the buy order.',
      impact: 'The price impact from a relatively small 10 MWh order suggests a thin order book. For ACER, this price reaction is the first signal — the trader may be exploiting low liquidity to move prices with small orders.',
    },
    4: {
      what: 'The same trader places a second aggressive buy: 10 MWh at €95.00/MWh — well above the current market price. This is a limit buy far above fair value.',
      impact: 'This is the key spoofing indicator. Buying at €95 when the market is at €78.50 is designed to artificially inflate the price. The trader is showing aggressive demand they don\'t intend to keep. In a CRUD system, if the order were cancelled, this record would disappear. Event sourcing preserves it.',
    },
    5: {
      what: 'The market price spikes to €118.00/MWh — a 64% increase from the opening price of €72 in under 2 minutes.',
      impact: 'The price is now fully inflated. Any market participant who needs to buy at this moment pays an artificially high price. Energy consumers downstream — industrial buyers, utilities — face inflated costs that will flow through to electricity bills.',
    },
    6: {
      what: 'The trader immediately sells 120 MWh at €116.50/MWh via a market sell order — far more volume than they accumulated (20 MWh bought). Net position swings to -100 MWh.',
      impact: 'This is the profit-taking. The trader built a small long position cheaply, inflated the price, then dumped a massive short position at the peak. The estimated profit: buying 20 MWh at avg €83.50, selling 120 MWh at €116.50. Counter-parties — real energy companies hedging actual physical delivery — absorb the losses.',
    },
    7: {
      what: 'The market price collapses back to €78.00/MWh within seconds of the massive sell order.',
      impact: 'The price collapse confirms the manipulation pattern: the €118 price was entirely artificial, unsupported by real supply-demand fundamentals. The full cycle — accumulate, inflate, dump, collapse — completed in under 2 minutes. This is the textbook spoofing signature that ACER\'s algorithms flag.',
    },
    8: {
      what: 'The compliance system issues a freeze order, locking AlphaWatt\'s trading on this instrument. The trade record references ACER investigation ACER-2024-DE-SPOOF-0891.',
      impact: 'The trader\'s account is frozen pending investigation. Because every order, price movement, and cancellation is preserved as an immutable event, ACER has a complete, tamper-proof evidence chain. The trader cannot claim orders were "never placed" — the event stream proves the full sequence. Penalties under REMIT can reach €1M or 10% of annual turnover.',
    },
  },

  'flexibility-market': {
    1: {
      what: 'Aggregator FlexCo submits a flexibility bid on the GOPACS market: 5.0 MW of load reduction at €145/MWh for the NL-South congestion area.',
      impact: 'This bid commits FlexCo to reduce electricity consumption by 5 MW if activated. If they under-deliver, they face financial penalties. The bid price of €145/MWh reflects the value of avoiding grid congestion — cheaper than the DSO building new infrastructure.',
    },
    2: {
      what: 'Enexis DSO activates FlexCo\'s bid to resolve congestion in the NL-SOUTH-SUB-12 area. The activation is irreversible — FlexCo must now deliver.',
      impact: 'FlexCo is now contractually obligated to reduce load by 5 MW. The activation time (16:45) starts the clock — meter readings will be compared against a baseline to determine actual delivery. The DSO is counting on this reduction to avoid transformer overload.',
    },
    3: {
      what: 'Meter nl-flex-001 records 4,521.3 MWh at the start of the activation period (17:00). This is the first of two sub-meters in FlexCo\'s portfolio.',
      impact: 'This reading establishes the consumption baseline for meter 1. The difference between start and end readings will show how much load was actually reduced. Both parties — DSO and aggregator — must agree on these readings for the settlement to be valid.',
    },
    4: {
      what: 'Meter nl-flex-002 records 2,187.6 MWh at activation start. Both sub-meters are now baselined.',
      impact: 'With both meters read, the total starting consumption is established. The accuracy of these readings directly determines whether FlexCo meets its 5 MW commitment. Even a 0.1 MWh discrepancy across two meters can shift the verdict from "delivered" to "under-delivered".',
    },
    5: {
      what: 'Meter nl-flex-001 records 4,522.1 MWh at activation end (18:00). The reading increased by only 0.8 MWh over the hour — indicating significant load reduction.',
      impact: 'Meter 1 consumed only 0.8 MWh during the hour, compared to its normal profile. This suggests FlexCo successfully curtailed load on this meter. The exact savings depend on the baseline methodology — which is where the dispute will arise.',
    },
    6: {
      what: 'Meter nl-flex-002 records 2,188.2 MWh at activation end. Consumption increased by 0.6 MWh over the hour.',
      impact: 'Meter 2 also shows low consumption. Combined, both meters consumed 1.4 MWh total during the activation hour. But was 5 MW reduced? That depends entirely on what the baseline (expected consumption without curtailment) would have been — and that\'s where Method A and Method B diverge.',
    },
    7: {
      what: 'Enexis DSO verifies delivery using Method A (10-day rolling average baseline): measured delivery is 3.2 MW — below the contracted 5.0 MW. Result: under-delivery with a €580 penalty.',
      impact: 'Method A uses a simple historical average as the counterfactual baseline. Under this methodology, FlexCo fell 1.8 MW short. The €580 penalty reduces FlexCo\'s revenue from the flexibility activation. This verification is now on the immutable record — but FlexCo can dispute it.',
    },
    8: {
      what: 'FlexCo counter-verifies using Method B (regression-adjusted baseline): measured delivery is 4.8 MW — within the ±10% tolerance band of the 5.0 MW commitment. The metadata explicitly disputes version 7.',
      impact: 'Method B accounts for weather, temperature, and time-of-week effects, producing a more accurate counterfactual. Under this methodology, FlexCo delivered 96% of its commitment — well within tolerance. Both verifications coexist in the audit trail, enabling regulatory arbitration. The €580 penalty is at stake, and the event stream provides the transparent evidence both parties need.',
    },
  },

  'cross-border-capacity': {
    1: {
      what: 'RTE (French TSO) submits flow-based parameters for the Vigy-Uchtelfangen CNEC: Remaining Available Margin (RAM) of 2,100 MW from the French side of the border.',
      impact: 'This RAM value determines how much cross-border capacity is available for commercial trading. A higher RAM means more capacity and lower prices for French importers. RTE\'s parameters directly influence the Euphemia algorithm\'s output — every MW of RAM affects the clearing price.',
    },
    2: {
      what: 'Amprion (German TSO) submits its flow-based parameters for the same CNEC: RAM of 1,850 MW from the German side. This is the binding constraint — lower than RTE\'s value.',
      impact: 'Amprion\'s more conservative RAM of 1,850 MW will be the bottleneck. The Vigy-Uchtelfangen line between Germany and France cannot carry more than this. Market participants requesting cross-border capacity may face curtailment. For auditors, the question is: was 1,850 MW justified, or could Amprion have offered more?',
    },
    3: {
      what: 'IndustriFR, a French industrial consumer, requests 500 MW of cross-border capacity from Germany to France for delivery hour 18.',
      impact: 'IndustriFR needs this power from the cheaper German market (typically €20-40/MWh below French prices). If the full 500 MW is allocated, IndustriFR saves significantly on energy costs. But the binding constraint of 1,850 MW means not all requests can be fulfilled — setting up the curtailment decision.',
    },
    4: {
      what: 'The Euphemia algorithm clears the day-ahead market: total commercial flow DE→FR is 1,420 MW, with curtailment applied. Not all capacity requests were fully satisfied.',
      impact: 'The 1,420 MW flow is below Amprion\'s 1,850 MW constraint, but some participants were still curtailed to reach an optimal market outcome. IndustriFR\'s 500 MW request will be reduced. This is the decision IndustriFR will audit — was the curtailment algorithm applied correctly and transparently?',
    },
    5: {
      what: 'The German day-ahead clearing price is published: €85.00/MWh for the DE-LU bidding zone.',
      impact: 'Germany clears at the lower price. This is the price German generators receive and the base cost for cross-border flows. The price differential with France determines congestion revenue — money that flows to TSOs for grid investment.',
    },
    6: {
      what: 'The French day-ahead clearing price is published: €130.00/MWh — a €45 spread above the German price.',
      impact: 'The €45/MWh spread confirms significant congestion on the DE-FR border. French consumers pay €130 instead of €85 because transmission capacity is constrained. IndustriFR, who wanted 500 MW at ~€85 (German price), will instead pay €130/MWh for whatever capacity is allocated — a 53% cost increase.',
    },
    7: {
      what: 'Congestion revenue of €63,900 is distributed between RTE and Amprion based on the €45 price spread across 1,420 MW of commercial flow, per CACM Article 63.',
      impact: 'The congestion revenue (€63,900 for this single hour) funds grid infrastructure investment. Over a year, this amounts to hundreds of millions in revenue for TSOs. For the auditor, this event proves the revenue was calculated correctly from the price spread and allocated to the right parties.',
    },
    8: {
      what: 'IndustriFR receives its final allocation: 350 MW at €130/MWh — curtailed by 150 MW from the original 500 MW request. The metadata records the curtailment reason as flow-based constraint.',
      impact: 'IndustriFR lost 150 MW of cheaper German power. At €130/MWh instead of ~€85/MWh, the allocated 350 MW costs €45,500/hour. The lost 150 MW must be sourced domestically at French prices. The complete event trail — from TSO parameters to Euphemia clearing to final allocation — gives IndustriFR the audit evidence to challenge the curtailment or to request Amprion justify the 1,850 MW RAM.',
    },
  },
};
