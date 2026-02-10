# Scenario 4: Cross-Border Capacity Allocation & Congestion Revenue Audit

> Replay flow-based market coupling parameters, Euphemia clearing results, and congestion revenue distribution for a curtailed cross-border capacity request.

## The Challenge

The EU's Capacity Allocation and Congestion Management (CACM) Regulation mandates that cross-border electricity capacity is allocated through a single day-ahead coupling (SDAC) using the Euphemia algorithm. When transmission capacity between bidding zones is constrained, the algorithm calculates optimal flows, clearing prices, and congestion revenue distribution. Every step of this process — from TSO-submitted network parameters to the final allocation — must be auditable. Market participants who are curtailed have the right to verify that the flow-based parameters, the algorithm results, and the revenue distribution were calculated correctly.

In this scenario, a French industrial consumer ("IndustriFR") submitted a 500 MW cross-border capacity request for the DE→FR direction in the SDAC day-ahead auction for delivery on 2024-12-15, hour 18:00. The Euphemia algorithm, using flow-based parameters submitted by RTE (France) and Amprion (Germany), curtailed the request to **350 MW** due to binding constraints on the Critical Network Element "Vigy-Uchtelfangen". IndustriFR challenges the curtailment, requesting a complete audit of: (1) the flow-based parameters from both TSOs, (2) the Euphemia clearing prices and flows, (3) the congestion revenue calculation and distribution, and (4) the curtailment justification.

In a CRUD system, the flow-based parameters are overwritten each day with new values. The Euphemia results are stored as final outputs without the input parameters that produced them. When a curtailment dispute arises months later, the original parameters are unavailable. Event sourcing captures the entire allocation lifecycle as a sequence of immutable events: TSO parameter submissions, algorithm inputs, clearing results, revenue distribution, and curtailment notifications. The `fold()` function can reconstruct the complete state at any point in the process, and alternative scenarios ("what if Amprion had submitted different RAM values?") can be explored by replaying with modified parameters.

## Regulatory Context

- **CACM Regulation (EU) 2015/1222**
  - Art. 29: Day-ahead coupling algorithm requirements (Euphemia)
  - Art. 48: Flow-based capacity calculation methodology
  - Art. 63: Congestion revenue distribution between TSOs
- **FCA Regulation (EU) 2016/1719**
  - Forward capacity allocation and long-term transmission rights
- **ENTSO-E Core CCM (Capacity Calculation Methodology)**
  - Flow-based parameters: PTDF matrices, RAM values, CNE definitions
  - Critical Network Element and Critical Contingency (CNEC) framework
- **Transparency Regulation (EU) 543/2013**
  - Art. 8-11: Publication requirements for cross-border capacity and congestion data
  - ENTSO-E Transparency Platform reporting obligations

## Event Sourcing Solution

This scenario introduces three new event types:

- **`CapacityAllocationRequested`** — market participant submits a capacity request for a specific border and direction
- **`CrossBorderFlowRecorded`** — TSO submits flow-based parameters (PTDF/RAM) or Euphemia records algorithm results
- **`CongestionRevenueDistributed`** — revenue from congestion rent is allocated between TSOs

The allocation round is modeled as a single stream (`da-allocation:2024-12-15-H18`) containing events from multiple TSOs and the coupling algorithm. This multi-actor, single-stream approach ensures that all inputs and outputs for a specific delivery hour are co-located and can be replayed together.

```python
# Load complete allocation round
events = events_collection.find({
    "streamId": "da-allocation:2024-12-15-H18"
}).sort("version")

allocation = fold(DayAheadAllocation(id="da-allocation:2024-12-15-H18"), events)
```

The `fold()` replay applies each event in order:
1. TSO parameter submissions establish the network constraints
2. The capacity request establishes the market participant's desired flow
3. Euphemia results show how the algorithm resolved the constrained optimization
4. Price events establish the clearing prices per bidding zone
5. Revenue distribution shows how congestion rent was allocated
6. The curtailment notification provides the final outcome with justification

For "what-if" analysis, the platform can replay with modified parameters: e.g., "What if Amprion had submitted a RAM of 2,200 MW instead of 1,850 MW?" — by substituting the parameter event and re-running `fold()`, the alternative allocation outcome is computed.

## Why MongoDB

- **Multi-document transactions**: Each SDAC allocation round involves 20+ events (multiple TSO submissions, algorithm results per border, price per zone, revenue per TSO pair). The `save()` method's `start_transaction()` ensures atomicity — either all events for an allocation round are persisted, or none are.
- **Version-based optimistic concurrency**: When multiple TSOs submit parameters concurrently for the same delivery hour, the `{streamId, version}` unique index prevents write conflicts. Each TSO's submission gets its own sequential version number.
- **Document model for nested structures**: Flow-based parameters include PTDF matrices and RAM values per Critical Network Element — deeply nested structures that MongoDB's document model handles natively without requiring normalization across multiple tables.
- **Compound indexes**: Index on `{streamId, version}` enables efficient replay of allocation rounds. Index on `{eventType, timestamp}` enables cross-round queries (e.g., "show all curtailments on DE→FR in December 2024").
- **Immutable append-only pattern**: TSO parameter submissions cannot be modified after the auction gate closure. The event store's insert-only design enforces this — parameters submitted by RTE at 10:00 remain exactly as submitted, even if RTE later realizes an error.

## Example Event Stream

The following 8 events represent the complete DE→FR day-ahead allocation for delivery hour 18:00 on stream `da-allocation:2024-12-15-H18`:

```json
{
  "streamId": "da-allocation:2024-12-15-H18",
  "streamType": "DayAheadAllocation",
  "version": 1,
  "eventType": "CrossBorderFlowRecorded",
  "timestamp": "2024-12-14T10:00:00Z",
  "payload": {
    "flow_id": "FB-RTE-20241215-H18",
    "tso": "RTE",
    "bidding_zone": "FR",
    "parameters": {
      "cnec": "Vigy-Uchtelfangen",
      "ptdf_de_fr": 0.42,
      "ram_mw": 2100,
      "fmax_mw": 3200,
      "frm_mw": 250
    }
  },
  "metadata": {
    "schemaVersion": 1,
    "source": "RTE-CGMES-export",
    "submitted_by": "rte-capacity-calc"
  }
}
```

```json
{
  "streamId": "da-allocation:2024-12-15-H18",
  "streamType": "DayAheadAllocation",
  "version": 2,
  "eventType": "CrossBorderFlowRecorded",
  "timestamp": "2024-12-14T10:05:00Z",
  "payload": {
    "flow_id": "FB-AMP-20241215-H18",
    "tso": "Amprion",
    "bidding_zone": "DE-LU",
    "parameters": {
      "cnec": "Vigy-Uchtelfangen",
      "ptdf_de_fr": 0.38,
      "ram_mw": 1850,
      "fmax_mw": 3200,
      "frm_mw": 300
    }
  },
  "metadata": {
    "schemaVersion": 1,
    "source": "Amprion-CGMES-export",
    "submitted_by": "amprion-capacity-calc"
  }
}
```

```json
{
  "streamId": "da-allocation:2024-12-15-H18",
  "streamType": "DayAheadAllocation",
  "version": 3,
  "eventType": "CapacityAllocationRequested",
  "timestamp": "2024-12-14T12:00:00Z",
  "payload": {
    "request_id": "CAP-REQ-2024-IF-1847",
    "participant": "IndustriFR",
    "direction": "DE-to-FR",
    "requested_mw": 500,
    "delivery_hour": "2024-12-15T18:00:00Z",
    "bid_price_eur_per_mwh": 135.00
  },
  "metadata": {
    "schemaVersion": 1,
    "source": "SDAC-order-book",
    "submitted_by": "industrifr-trading-desk"
  }
}
```

```json
{
  "streamId": "da-allocation:2024-12-15-H18",
  "streamType": "DayAheadAllocation",
  "version": 4,
  "eventType": "CrossBorderFlowRecorded",
  "timestamp": "2024-12-14T12:42:00Z",
  "payload": {
    "flow_id": "EUPH-FLOW-20241215-H18-DE-FR",
    "tso": "NEMO-committee",
    "bidding_zone": "DE-FR-border",
    "parameters": {
      "algorithm": "Euphemia",
      "commercial_flow_mw": 1420,
      "binding_cnec": "Vigy-Uchtelfangen",
      "shadow_price_eur": 45.00,
      "curtailment_applied": true
    }
  },
  "metadata": {
    "schemaVersion": 1,
    "source": "Euphemia-SDAC-results",
    "iteration": "final"
  }
}
```

```json
{
  "streamId": "da-allocation:2024-12-15-H18",
  "streamType": "DayAheadAllocation",
  "version": 5,
  "eventType": "PriceTickRecorded",
  "timestamp": "2024-12-14T12:42:00Z",
  "payload": {
    "instrument_id": "SDAC-DA-DE-LU-H18",
    "price": 85.00
  },
  "metadata": {
    "schemaVersion": 1,
    "source": "Euphemia-clearing",
    "price_type": "day_ahead_clearing",
    "bidding_zone": "DE-LU"
  }
}
```

```json
{
  "streamId": "da-allocation:2024-12-15-H18",
  "streamType": "DayAheadAllocation",
  "version": 6,
  "eventType": "PriceTickRecorded",
  "timestamp": "2024-12-14T12:42:00Z",
  "payload": {
    "instrument_id": "SDAC-DA-FR-H18",
    "price": 130.00
  },
  "metadata": {
    "schemaVersion": 1,
    "source": "Euphemia-clearing",
    "price_type": "day_ahead_clearing",
    "bidding_zone": "FR"
  }
}
```

```json
{
  "streamId": "da-allocation:2024-12-15-H18",
  "streamType": "DayAheadAllocation",
  "version": 7,
  "eventType": "CongestionRevenueDistributed",
  "timestamp": "2024-12-14T13:00:00Z",
  "payload": {
    "revenue_id": "CR-20241215-H18-DE-FR",
    "border": "DE-FR",
    "total_revenue_eur": 63900.00,
    "price_spread_eur_per_mwh": 45.00,
    "commercial_flow_mw": 1420,
    "distribution": {
      "RTE": { "share_pct": 60, "amount_eur": 38340.00 },
      "Amprion": { "share_pct": 40, "amount_eur": 25560.00 }
    }
  },
  "metadata": {
    "schemaVersion": 1,
    "source": "SDAC-settlement",
    "methodology": "CACM-Art-63"
  }
}
```

```json
{
  "streamId": "da-allocation:2024-12-15-H18",
  "streamType": "DayAheadAllocation",
  "version": 8,
  "eventType": "TradeExecuted",
  "timestamp": "2024-12-14T13:00:00Z",
  "payload": {
    "trade_id": "ALLOC-2024-IF-1847-CURTAILED",
    "portfolio_id": "industrifr-portfolio",
    "instrument_id": "SDAC-DA-FR-H18",
    "price": 130.00,
    "quantity": 350
  },
  "metadata": {
    "schemaVersion": 1,
    "source": "SDAC-allocation",
    "original_request_mw": 500,
    "allocated_mw": 350,
    "curtailed_mw": 150,
    "curtailment_reason": "flow_based_constraint",
    "binding_cnec": "Vigy-Uchtelfangen",
    "request_ref": "CAP-REQ-2024-IF-1847"
  }
}
```

## Replay Walkthrough

**T+0 (version 1, D-1 10:00)** — RTE submits flow-based parameters for the Vigy-Uchtelfangen Critical Network Element. The PTDF coefficient for DE→FR is 0.42, and the Remaining Available Margin (RAM) is 2,100 MW. These parameters define how much each MW of commercial flow on the DE-FR border impacts the physical line.

**T+1 (version 2, D-1 10:05)** — Amprion submits its own parameters for the same CNEC. The PTDF is 0.38 and the RAM is 1,850 MW. The lower RAM from Amprion's side becomes the binding constraint — the effective capacity is limited by the more restrictive TSO parameter.

**T+2 (version 3, D-1 12:00)** — IndustriFR submits a 500 MW capacity request for DE→FR delivery at hour 18:00, willing to pay up to €135/MWh. The order enters the SDAC order book.

**T+3 (version 4, D-1 12:42)** — Euphemia runs and determines the optimal commercial flow: 1,420 MW across the DE-FR border. The Vigy-Uchtelfangen CNEC is binding with a shadow price of €45/MWh. Curtailment is applied to requests that exceed the feasible flow.

**T+4 (version 5, D-1 12:42)** — Euphemia clearing price for DE-LU bidding zone: **€85.00/MWh**. German generation surplus keeps the price low.

**T+5 (version 6, D-1 12:42)** — Euphemia clearing price for FR bidding zone: **€130.00/MWh**. French demand (cold weather, nuclear maintenance) drives the price up. The price spread of €45/MWh equals the shadow price on the binding CNEC.

**T+6 (version 7, D-1 13:00)** — Congestion revenue is calculated and distributed. Total revenue = 1,420 MW × €45 spread = **€63,900**. Per the bilateral agreement, RTE receives 60% (€38,340) and Amprion receives 40% (€25,560).

**T+7 (version 8, D-1 13:00)** — IndustriFR's 500 MW request is partially fulfilled: **350 MW allocated** at the FR clearing price of €130/MWh. The remaining 150 MW is curtailed due to the binding flow-based constraint on Vigy-Uchtelfangen. The curtailment metadata provides the complete justification chain: which CNEC was binding, the shadow price, and a reference back to the original request.

**Audit outcome**: By replaying all 8 events through `fold()`, IndustriFR can verify: (1) both TSOs' flow-based parameters are consistent with published ENTSO-E Transparency Platform data, (2) the Euphemia results correctly reflect the binding constraint, (3) the congestion revenue was distributed per the agreed methodology, and (4) the curtailment from 500 to 350 MW was justified by the physical network limitations. For "what-if" analysis, replaying with Amprion's RAM increased to 2,200 MW would show whether the curtailment would have been reduced — providing evidence for future infrastructure investment discussions.
