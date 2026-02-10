# Scenario 3: Flexibility Market Clearing & Aggregator Compliance

> Replay flexibility activations, meter readings, and baseline calculations to resolve a delivery dispute between a demand response aggregator and a DSO.

## The Challenge

The EU Electricity Directive 2019/944 establishes the right of demand response aggregators to participate in flexibility markets — local markets where Distribution System Operators (DSOs) procure load reduction or generation increase to resolve grid congestion. Platforms like NODES (Norway) and GOPACS (Netherlands) already operate such markets. A core challenge is **delivery verification**: after a flexibility activation, the DSO must determine whether the aggregator actually delivered the contracted load reduction. This requires comparing actual metered consumption against a counterfactual **baseline** — what the consumer would have consumed without the activation.

In this scenario, a demand response aggregator ("FlexCo") submitted a 5 MW load reduction bid for a DSO flexibility market in the Netherlands. The DSO (Enexis) activated the bid during a local congestion event. Post-delivery, the DSO's verification system measures only **3.2 MW** of actual reduction, triggering an under-delivery penalty. FlexCo disputes the finding, arguing that the discrepancy is due to the baseline methodology: the DSO used Method A (average of last 10 similar days), while FlexCo's internal calculation using Method B (regression-adjusted baseline) shows **4.8 MW** reduction — within the contractual tolerance band.

With a CRUD system, only the final verification result would be stored. The DSO's 3.2 MW figure would overwrite any intermediate calculations. When the aggregator disputes, there is no way to compare the two methodologies side-by-side using the same underlying meter data. Event sourcing preserves every input — the bid, the activation signal, each individual meter reading, and both verification calculations — as separate, immutable events. Replaying the stream with Method A yields 3.2 MW; replaying with Method B yields 4.8 MW. The dispute is resolved by transparent comparison.

## Regulatory Context

- **EU Electricity Directive 2019/944**
  - Art. 13-14: Active customer rights and demand response participation
  - Art. 15-17: Citizen energy communities and aggregation rights
  - Art. 32: DSO obligation to procure flexibility services using market-based mechanisms
- **EU Regulation 2019/943 (Electricity Regulation)**
  - Art. 6: Balancing market principles applicable to demand response
- **Network Code on Demand Response (draft)**
  - Baseline methodology requirements and verification standards
- **Dutch Grid Code (Netcode Elektriciteit)**
  - DSO flexibility procurement and aggregator access rules

## Event Sourcing Solution

This scenario introduces three new event types that extend the platform's domain model:

- **`FlexibilityBidSubmitted`** — aggregator submits a bid with asset portfolio and capacity
- **`FlexibilityActivated`** — DSO activates the bid during a congestion event
- **`FlexibilityDeliveryVerified`** — verification result (can appear multiple times with different methodologies)

The platform uses **cross-stream replay** to resolve the dispute. The bid stream (`flex-bid:FLEX-2024-NL-0847`) references 5 individual meter streams (`meter:nl-flex-001` through `meter:nl-flex-005`). The `fold()` function replays:

1. The bid event to establish contracted capacity
2. The activation event to establish the delivery window
3. Meter readings from all 5 assets (start and end of activation)
4. Both verification events to compare methodologies

```python
# Cross-stream replay: load bid stream + all referenced meter streams
bid_events = events_collection.find({"streamId": "flex-bid:FLEX-2024-NL-0847"}).sort("version")
meter_events = events_collection.find({
    "streamId": {"$in": [
        "meter:nl-flex-001", "meter:nl-flex-002", "meter:nl-flex-003",
        "meter:nl-flex-004", "meter:nl-flex-005"
    ]},
    "timestamp": {"$gte": activation_start, "$lte": activation_end}
}).sort("timestamp")
```

Both verification events are preserved in the same stream. The DSO's Method A result (3.2 MW, under-delivery) and the aggregator's Method B result (4.8 MW, within tolerance) coexist as separate events with different `metadata.methodology` values. The same meter data, two different baselines, two different conclusions — all transparently auditable.

## Why MongoDB

- **Change Streams for real-time activation monitoring**: When a `FlexibilityActivated` event is inserted, a Change Stream triggers the real-time monitoring pipeline. The projection starts tracking meter readings for the activated assets against the contracted capacity.
- **Compound indexes for meter-id+time queries**: Index on `{streamId, timestamp}` enables efficient retrieval of meter readings for specific assets during the activation window. With 5 assets and readings every 15 minutes, this keeps queries fast.
- **Multi-document transactions**: The `save()` method ensures that the bid submission (which references multiple assets) and the verification result (which references multiple meter readings) are written atomically.
- **Document model for nested asset portfolios**: The `FlexibilityBidSubmitted` payload contains an array of asset references with individual capacities — MongoDB's document model handles this naturally without join tables.
- **Version-based optimistic concurrency**: Prevents duplicate activation signals or conflicting verification writes from concurrent TSO/aggregator submissions.

## Example Event Stream

The following 8 events represent the flexibility activation and dispute on stream `flex-bid:FLEX-2024-NL-0847`:

```json
{
  "streamId": "flex-bid:FLEX-2024-NL-0847",
  "streamType": "FlexibilityBid",
  "version": 1,
  "eventType": "FlexibilityBidSubmitted",
  "timestamp": "2024-12-15T08:00:00Z",
  "payload": {
    "bid_id": "FLEX-2024-NL-0847",
    "aggregator_id": "flexco-nl",
    "market_id": "GOPACS-NL-SOUTH",
    "capacity_mw": 5.0,
    "price_eur_per_mwh": 145.00,
    "delivery_period_start": "2024-12-15T17:00:00Z",
    "delivery_period_end": "2024-12-15T18:00:00Z",
    "assets": [
      {"meter_id": "nl-flex-001", "capacity_mw": 1.2},
      {"meter_id": "nl-flex-002", "capacity_mw": 1.0},
      {"meter_id": "nl-flex-003", "capacity_mw": 1.3},
      {"meter_id": "nl-flex-004", "capacity_mw": 0.8},
      {"meter_id": "nl-flex-005", "capacity_mw": 0.7}
    ]
  },
  "metadata": {
    "schemaVersion": 1,
    "submitted_by": "flexco-ops-platform"
  }
}
```

```json
{
  "streamId": "flex-bid:FLEX-2024-NL-0847",
  "streamType": "FlexibilityBid",
  "version": 2,
  "eventType": "FlexibilityActivated",
  "timestamp": "2024-12-15T16:45:00Z",
  "payload": {
    "bid_id": "FLEX-2024-NL-0847",
    "activated_by": "enexis-dso",
    "congestion_area": "NL-SOUTH-SUB-12",
    "activation_start": "2024-12-15T17:00:00Z",
    "activation_end": "2024-12-15T18:00:00Z"
  },
  "metadata": {
    "schemaVersion": 1,
    "source": "GOPACS-activation-engine"
  }
}
```

```json
{
  "streamId": "flex-bid:FLEX-2024-NL-0847",
  "streamType": "FlexibilityBid",
  "version": 3,
  "eventType": "MeterReadingRecorded",
  "timestamp": "2024-12-15T17:00:00Z",
  "payload": {
    "meter_id": "nl-flex-001",
    "reading": 4521.3
  },
  "metadata": {
    "schemaVersion": 1,
    "reading_type": "activation_start",
    "source": "enexis-smart-meter"
  }
}
```

```json
{
  "streamId": "flex-bid:FLEX-2024-NL-0847",
  "streamType": "FlexibilityBid",
  "version": 4,
  "eventType": "MeterReadingRecorded",
  "timestamp": "2024-12-15T17:00:00Z",
  "payload": {
    "meter_id": "nl-flex-002",
    "reading": 2187.6
  },
  "metadata": {
    "schemaVersion": 1,
    "reading_type": "activation_start",
    "source": "enexis-smart-meter"
  }
}
```

```json
{
  "streamId": "flex-bid:FLEX-2024-NL-0847",
  "streamType": "FlexibilityBid",
  "version": 5,
  "eventType": "MeterReadingRecorded",
  "timestamp": "2024-12-15T18:00:00Z",
  "payload": {
    "meter_id": "nl-flex-001",
    "reading": 4522.1
  },
  "metadata": {
    "schemaVersion": 1,
    "reading_type": "activation_end",
    "source": "enexis-smart-meter"
  }
}
```

```json
{
  "streamId": "flex-bid:FLEX-2024-NL-0847",
  "streamType": "FlexibilityBid",
  "version": 6,
  "eventType": "MeterReadingRecorded",
  "timestamp": "2024-12-15T18:00:00Z",
  "payload": {
    "meter_id": "nl-flex-002",
    "reading": 2188.2
  },
  "metadata": {
    "schemaVersion": 1,
    "reading_type": "activation_end",
    "source": "enexis-smart-meter"
  }
}
```

```json
{
  "streamId": "flex-bid:FLEX-2024-NL-0847",
  "streamType": "FlexibilityBid",
  "version": 7,
  "eventType": "FlexibilityDeliveryVerified",
  "timestamp": "2024-12-15T19:30:00Z",
  "payload": {
    "bid_id": "FLEX-2024-NL-0847",
    "verified_by": "enexis-dso",
    "methodology": "method_a_10day_average",
    "baseline_mw": 8.4,
    "measured_mw": 5.2,
    "delivered_mw": 3.2,
    "contracted_mw": 5.0,
    "result": "under_delivery",
    "penalty_eur": 580.00
  },
  "metadata": {
    "schemaVersion": 1,
    "source": "enexis-verification-engine"
  }
}
```

```json
{
  "streamId": "flex-bid:FLEX-2024-NL-0847",
  "streamType": "FlexibilityBid",
  "version": 8,
  "eventType": "FlexibilityDeliveryVerified",
  "timestamp": "2024-12-16T10:15:00Z",
  "payload": {
    "bid_id": "FLEX-2024-NL-0847",
    "verified_by": "flexco-nl",
    "methodology": "method_b_regression_adjusted",
    "baseline_mw": 10.0,
    "measured_mw": 5.2,
    "delivered_mw": 4.8,
    "contracted_mw": 5.0,
    "result": "within_tolerance",
    "tolerance_band_pct": 10.0
  },
  "metadata": {
    "schemaVersion": 1,
    "source": "flexco-verification-engine",
    "disputes_version": 7,
    "dispute_reason": "baseline_methodology_disagreement"
  }
}
```

## Replay Walkthrough

**T+0 (version 1, 08:00)** — FlexCo submits a 5 MW load reduction bid for the GOPACS-NL-SOUTH market. The bid specifies 5 individual assets with their respective capacities (1.2 + 1.0 + 1.3 + 0.8 + 0.7 = 5.0 MW). Delivery window: 17:00–18:00.

**T+1 (version 2, 16:45)** — Enexis DSO detects congestion in area NL-SOUTH-SUB-12 and activates FlexCo's bid. The activation signal is sent 15 minutes before the delivery window starts.

**T+2 (version 3, 17:00)** — Activation start: smart meter reading for asset nl-flex-001 records cumulative consumption of 4,521.3 MWh. This establishes the consumption baseline.

**T+3 (version 4, 17:00)** — Activation start: smart meter reading for asset nl-flex-002 records 2,187.6 MWh. (In the full stream, versions 3–6 would include all 5 assets; 2 are shown here for brevity.)

**T+4 (version 5, 18:00)** — Activation end: asset nl-flex-001 reads 4,522.1 MWh. Consumption during activation = 4,522.1 − 4,521.3 = 0.8 MWh. Expected consumption without activation (Method A baseline) was 2.0 MWh → reduction = 1.2 MW.

**T+5 (version 6, 18:00)** — Activation end: asset nl-flex-002 reads 2,188.2 MWh. Consumption during activation = 0.6 MWh. Expected (Method A) = 1.6 MWh → reduction = 1.0 MW.

**T+6 (version 7, 19:30)** — DSO verification: Enexis applies Method A (10-day average baseline). Total baseline consumption = 8.4 MW, actual measured = 5.2 MW, delivered reduction = **3.2 MW**. This is below the contracted 5.0 MW → **under_delivery**. Penalty of €580 issued.

**T+7 (version 8, next day 10:15)** — Aggregator counter-verification: FlexCo applies Method B (regression-adjusted baseline accounting for temperature, day-of-week, and industrial production schedule). Total baseline = 10.0 MW, actual measured = 5.2 MW, delivered reduction = **4.8 MW**. This is within the 10% tolerance band of the contracted 5.0 MW → **within_tolerance**.

**Dispute resolution**: Both verification events coexist in the same stream. The measured consumption (5.2 MW) is identical in both — the disagreement is entirely in the baseline. By replaying the meter readings (versions 3–6) through both baseline methodologies, the platform provides an auditable, side-by-side comparison. A regulatory arbiter can inspect the same raw meter data and independently verify which baseline methodology is more appropriate for the specific assets and conditions.
