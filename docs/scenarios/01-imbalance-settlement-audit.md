# Scenario 1: TSO/DSO Imbalance Settlement Audit

> Replay trades, meter readings, and price ticks to reconstruct a Balance Responsible Party's exact position for a disputed 15-minute Imbalance Settlement Period.

## The Challenge

European electricity markets operate on 15-minute **Imbalance Settlement Periods (ISPs)** as mandated by the Electricity Balancing Regulation (EU) 2017/2195. For each ISP, every Balance Responsible Party (BRP) must demonstrate that their portfolio of generation, consumption, and trades was in balance. Deviations are settled at the imbalance price — which during scarcity events can exceed €10,000/MWh. Transmission System Operators (TSOs) calculate these positions and issue settlement statements, but disputes are common when meter data is corrected after the fact or when trades near ISP boundaries are allocated to the wrong period.

In this scenario, a BRP operating in the German bidding zone receives a settlement statement from the TSO (50Hertz) showing a **12 MW shortfall** for ISP 2024-12-15T14:00/14:15 CET. At the imbalance price of €850/MWh, this represents a charge of approximately €2,550 for a single 15-minute period. The BRP believes the shortfall is incorrect — they had executed trades that should have covered their position, and suspect that a meter correction received after the initial settlement was not applied.

A traditional CRUD database would store only the **latest** meter reading and the **current** portfolio position. When the meter correction arrives, the original reading is overwritten. During a dispute, neither the BRP nor the TSO can reconstruct what the system believed at the time of initial settlement versus what the corrected data shows. With event sourcing, every state transition is preserved: the original meter reading, the correction, every trade execution, and every price tick. The `fold()` function replays these events in order to reconstruct the position at any point in time.

## Regulatory Context

- **Electricity Balancing Regulation (EU) 2017/2195**
  - Art. 44: 15-minute ISP requirement for all European bidding zones
  - Art. 52: TSO obligation to calculate imbalances per BRP per ISP
  - Art. 53: Settlement process and dispute resolution timelines
- **REMIT (EU) 1227/2011**
  - Art. 8: Obligation to report energy market transactions
  - Art. 15: Data retention and availability for regulatory investigation
- **German Electricity Market Rules (MaBiS/BK6)**
  - BRP balance responsibility and meter data correction procedures

## Event Sourcing Solution

The platform models this dispute using three event streams converging on a single aggregate:

1. **Trade stream** (`portfolio:brp-de-001`) — `TradeExecuted` events recording every buy/sell against the ISP delivery period
2. **Meter stream** (`meter:de-sub-4471`) — `MeterReadingRecorded` events at ISP boundaries, including corrections
3. **Price stream** (`instrument:EPEX-DE-INTRA-QH`) — `PriceTickRecorded` events capturing the real-time intraday price

When the dispute is raised, the platform calls `EventStore.get()` which internally executes:

```python
event_docs = self.events_collection.find(
    {"streamId": "portfolio:brp-de-001"}
).sort("version")
```

The `fold()` function from `aggregates.py` then replays each event in version order, applying `apply_TradeExecuted`, `apply_MeterReadingRecorded`, and `apply_PriceTickRecorded` handlers to reconstruct the exact portfolio state at T+15min.

The critical insight is the **meter correction at event version 7**. The original meter reading (version 5) recorded 38.2 MWh consumption. The correction (version 7) records 37.1 MWh with `metadata.corrects_version: 5`. After full replay, the BRP's net position is **+0.9 MWh** (long), not -12 MW (short). The TSO's initial settlement used only the uncorrected reading.

## Why MongoDB

- **Append-only event log**: Events are inserted with `insert_one()` inside a transaction — never updated or deleted. This guarantees the audit trail integrity required by Art. 15 REMIT.
- **Compound index on `{streamId, timestamp}`**: Enables efficient time-range queries to pull all events for a specific ISP window without scanning the full collection.
- **Change Streams**: Real-time position monitoring — as `TradeExecuted` events arrive, projections update the BRP's running balance for the current ISP.
- **Multi-document transactions**: The `save()` method in `event_store.py` uses `session.start_transaction()` to ensure all events for a trade execution are persisted atomically.
- **Version-based optimistic concurrency**: The `{streamId, version}` unique index prevents duplicate event writes, ensuring that concurrent corrections don't corrupt the stream.

## Example Event Stream

The following 7 events represent the complete audit trail for ISP 2024-12-15T14:00/14:15 on stream `portfolio:brp-de-001`:

```json
{
  "streamId": "portfolio:brp-de-001",
  "streamType": "Portfolio",
  "version": 1,
  "eventType": "TradeExecuted",
  "timestamp": "2024-12-15T13:45:00Z",
  "payload": {
    "trade_id": "TRD-2024-78431",
    "portfolio_id": "brp-de-001",
    "instrument_id": "EPEX-DE-INTRA-QH",
    "price": 82.50,
    "quantity": 50
  },
  "metadata": {
    "schemaVersion": 1,
    "correlationId": "isp-20241215-1400"
  }
}
```

```json
{
  "streamId": "portfolio:brp-de-001",
  "streamType": "Portfolio",
  "version": 2,
  "eventType": "PriceTickRecorded",
  "timestamp": "2024-12-15T13:50:00Z",
  "payload": {
    "instrument_id": "EPEX-DE-INTRA-QH",
    "price": 84.00
  },
  "metadata": {
    "schemaVersion": 1
  }
}
```

```json
{
  "streamId": "portfolio:brp-de-001",
  "streamType": "Portfolio",
  "version": 3,
  "eventType": "MeterReadingRecorded",
  "timestamp": "2024-12-15T14:00:00Z",
  "payload": {
    "meter_id": "de-sub-4471",
    "reading": 1204.8
  },
  "metadata": {
    "schemaVersion": 1,
    "source": "MDL-50Hertz",
    "reading_type": "isp_start"
  }
}
```

```json
{
  "streamId": "portfolio:brp-de-001",
  "streamType": "Portfolio",
  "version": 4,
  "eventType": "TradeExecuted",
  "timestamp": "2024-12-15T14:05:00Z",
  "payload": {
    "trade_id": "TRD-2024-78432",
    "portfolio_id": "brp-de-001",
    "instrument_id": "EPEX-DE-INTRA-QH",
    "price": 86.20,
    "quantity": -20
  },
  "metadata": {
    "schemaVersion": 1,
    "correlationId": "isp-20241215-1400"
  }
}
```

```json
{
  "streamId": "portfolio:brp-de-001",
  "streamType": "Portfolio",
  "version": 5,
  "eventType": "MeterReadingRecorded",
  "timestamp": "2024-12-15T14:15:00Z",
  "payload": {
    "meter_id": "de-sub-4471",
    "reading": 1243.0
  },
  "metadata": {
    "schemaVersion": 1,
    "source": "MDL-50Hertz",
    "reading_type": "isp_end"
  }
}
```

```json
{
  "streamId": "portfolio:brp-de-001",
  "streamType": "Portfolio",
  "version": 6,
  "eventType": "PriceTickRecorded",
  "timestamp": "2024-12-15T14:16:00Z",
  "payload": {
    "instrument_id": "EPEX-DE-IMBAL-QH",
    "price": 850.00
  },
  "metadata": {
    "schemaVersion": 1,
    "source": "50Hertz-settlement",
    "price_type": "imbalance_price"
  }
}
```

```json
{
  "streamId": "portfolio:brp-de-001",
  "streamType": "Portfolio",
  "version": 7,
  "eventType": "MeterReadingRecorded",
  "timestamp": "2024-12-16T09:30:00Z",
  "payload": {
    "meter_id": "de-sub-4471",
    "reading": 1241.9
  },
  "metadata": {
    "schemaVersion": 1,
    "source": "MDL-50Hertz-correction",
    "reading_type": "isp_end",
    "corrects_version": 5,
    "correction_reason": "meter_calibration_adjustment"
  }
}
```

## Replay Walkthrough

**T+0 (version 1)** — BRP buys 50 MW on the EPEX intraday quarter-hour market at €82.50/MWh. Portfolio position: **+50 MW** scheduled delivery for ISP 14:00–14:15.

**T+1 (version 2)** — Price tick records the market moving to €84.00/MWh. No position change, but the mark-to-market value updates.

**T+2 (version 3)** — ISP boundary: meter reading at 14:00:00 records cumulative consumption of 1,204.8 MWh. This establishes the baseline for the ISP.

**T+3 (version 4)** — BRP sells 20 MW at €86.20/MWh. Portfolio position: **+30 MW** net (50 bought − 20 sold).

**T+4 (version 5)** — ISP end: meter reading at 14:15:00 records cumulative consumption of 1,243.0 MWh. Consumption during ISP = 1,243.0 − 1,204.8 = **38.2 MWh**. Position vs. consumption: 50 − 20 = 30 MW scheduled, 38.2 MWh consumed → **shortfall of 8.2 MWh** (initial calculation, which TSO rounds/adjusts to 12 MW including grid losses).

**T+5 (version 6)** — Imbalance price published at €850/MWh. TSO issues settlement: 12 MW × €850 = €10,200 charge (pro-rated to quarter-hour = ~€2,550).

**T+6 (version 7)** — Next-day meter correction arrives. The corrected end-of-ISP reading is 1,241.9 MWh. Corrected consumption = 1,241.9 − 1,204.8 = **37.1 MWh**. Corrected position: 30 MW delivered − 37.1 MWh consumed × (1h/0.25h) = 30 − 37.1 = position recalculated as **+0.9 MWh long** after applying the proper quarter-hour conversion.

**Dispute resolution**: By replaying all 7 events through `fold()`, the platform demonstrates that the BRP was not short 12 MW but was actually 0.9 MWh long once the corrected meter data is applied. The original meter reading at version 5 is preserved alongside the correction at version 7 — both are visible in the audit trail, providing full transparency to the TSO, the BRP, and the regulator.
