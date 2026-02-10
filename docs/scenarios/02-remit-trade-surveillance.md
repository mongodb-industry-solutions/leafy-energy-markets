# Scenario 2: REMIT Trade Surveillance & Market Abuse Detection

> Produce a complete, immutable chronological audit trail of a spoofing pattern on an intraday energy market for ACER investigation.

## The Challenge

The EU's Regulation on Energy Market Integrity and Transparency (REMIT) requires that all energy market participants preserve complete records of their trading activity, including orders that were placed and subsequently cancelled. The Agency for the Cooperation of Energy Regulators (ACER) operates the ARIS (ACER REMIT Information System) surveillance platform, which applies algorithmic detection to identify potential market manipulation across European energy markets. When ACER flags suspicious activity, the market participant must produce a complete, chronologically ordered record of every order, trade, and cancellation — not just the final settled positions.

In this scenario, ACER's surveillance algorithms flag a **spoofing pattern** on the `EPEX-DE-INTRA-1700` contract (German intraday, 17:00 delivery) during a price spike on 2024-12-15. A trader at participant firm "AlphaWatt GmbH" placed 15 rapid buy orders within 90 seconds, driving the market price from €72 to €118/MWh. The trader then cancelled 12 of the 15 orders and executed a large sell order at the inflated price. The price collapsed back to €78 within minutes. ACER requests the complete event trail for this 10-minute window.

In a CRUD system, cancelled orders are typically deleted or marked with a `status: cancelled` flag — the original order details, the timing of placement, and the cancellation sequence are lost. The final database state shows only the 3 filled buy orders and 1 sell order, making the spoofing pattern invisible. With event sourcing, every `TradeExecuted` event — including those representing order placements and cancellations — is immutably preserved in chronological order. The pattern of rapid accumulation → price impact → sell at peak → price collapse is clearly visible in the event stream.

## Regulatory Context

- **REMIT (EU) 1227/2011**
  - Art. 3: Prohibition of insider trading in wholesale energy markets
  - Art. 5: Prohibition of market manipulation (including spoofing, layering, wash trades)
  - Art. 8: Obligation to report transactions to ACER
  - Art. 15: Record-keeping — market participants must retain records for 5 years
- **REMIT Implementing Regulation (EU) 1348/2014**
  - Art. 4-6: Detailed reporting requirements for trade and order data
  - Annex I: Data fields required for transaction reporting
- **ACER Guidance Note 2/2019**
  - Definition of spoofing and layering patterns
  - Indicators of market manipulation in continuous intraday markets

## Event Sourcing Solution

The platform models this investigation using the existing `Instrument` aggregate. All trading activity on `EPEX-DE-INTRA-1700` is captured as a stream of events:

- `InstrumentListed` — establishes the contract
- `TradeExecuted` — every order placement (buy or sell), with `quantity > 0` for buys and `quantity < 0` for sells
- `PriceTickRecorded` — market price updates triggered by each trade

When ACER requests the audit trail, the platform queries:

```python
event_docs = self.events_collection.find({
    "streamId": "instrument:EPEX-DE-INTRA-1700",
    "timestamp": {
        "$gte": "2024-12-15T16:48:00Z",
        "$lte": "2024-12-15T16:58:00Z"
    }
}).sort("version")
```

The `fold()` replay reconstructs the instrument state at each point in time. The metadata fields `trader_id` and `order_type` enable cross-referencing with the trader's other activity across instruments for correlation analysis.

The key difference from a CRUD approach: **cancelled orders are not deletions**. They are `TradeExecuted` events with `metadata.order_type: "cancel"` that reference the original order via `metadata.cancels_trade_id`. Both the placement and the cancellation are preserved as separate, immutable events.

## Why MongoDB

- **Immutable insert-only pattern**: The `EventStore.save()` method only calls `insert_one()` — there are no update or delete operations on the events collection. This guarantees REMIT Art. 15 compliance for data integrity.
- **5-year retention with no TTL**: Unlike operational collections that may use TTL indexes, the events collection has no expiry. Events are retained indefinitely to meet the 5-year minimum retention requirement.
- **Compound indexes for instrument+time queries**: Index on `{streamId, timestamp}` enables ACER investigators to pull events for a specific instrument and time window without scanning the entire collection.
- **Atlas Search**: For broader investigations, Atlas Search enables full-text queries across event payloads — e.g., finding all events involving a specific `trader_id` across all instruments.
- **Document model for nested metadata**: Each event's `metadata` field can carry investigation-specific context (trader ID, order type, desk, strategy tag) without schema changes.

## Example Event Stream

The following 8 events capture the spoofing pattern on stream `instrument:EPEX-DE-INTRA-1700`:

```json
{
  "streamId": "instrument:EPEX-DE-INTRA-1700",
  "streamType": "Instrument",
  "version": 1,
  "eventType": "InstrumentListed",
  "timestamp": "2024-12-15T06:00:00Z",
  "payload": {
    "instrument_id": "EPEX-DE-INTRA-1700",
    "name": "EPEX DE Intraday 17:00 Delivery 2024-12-15"
  },
  "metadata": {
    "schemaVersion": 1,
    "market": "EPEX_SPOT",
    "delivery_zone": "DE-LU"
  }
}
```

```json
{
  "streamId": "instrument:EPEX-DE-INTRA-1700",
  "streamType": "Instrument",
  "version": 42,
  "eventType": "TradeExecuted",
  "timestamp": "2024-12-15T16:48:12Z",
  "payload": {
    "trade_id": "ORD-2024-AW-5501",
    "portfolio_id": "alphawatt-trading",
    "instrument_id": "EPEX-DE-INTRA-1700",
    "price": 72.00,
    "quantity": 10
  },
  "metadata": {
    "schemaVersion": 1,
    "trader_id": "AW-TR-042",
    "order_type": "limit_buy",
    "desk": "intraday-de"
  }
}
```

```json
{
  "streamId": "instrument:EPEX-DE-INTRA-1700",
  "streamType": "Instrument",
  "version": 43,
  "eventType": "PriceTickRecorded",
  "timestamp": "2024-12-15T16:48:13Z",
  "payload": {
    "instrument_id": "EPEX-DE-INTRA-1700",
    "price": 78.50
  },
  "metadata": {
    "schemaVersion": 1,
    "trigger": "order_book_update"
  }
}
```

```json
{
  "streamId": "instrument:EPEX-DE-INTRA-1700",
  "streamType": "Instrument",
  "version": 56,
  "eventType": "TradeExecuted",
  "timestamp": "2024-12-15T16:49:04Z",
  "payload": {
    "trade_id": "ORD-2024-AW-5514",
    "portfolio_id": "alphawatt-trading",
    "instrument_id": "EPEX-DE-INTRA-1700",
    "price": 95.00,
    "quantity": 10
  },
  "metadata": {
    "schemaVersion": 1,
    "trader_id": "AW-TR-042",
    "order_type": "limit_buy",
    "desk": "intraday-de"
  }
}
```

```json
{
  "streamId": "instrument:EPEX-DE-INTRA-1700",
  "streamType": "Instrument",
  "version": 57,
  "eventType": "PriceTickRecorded",
  "timestamp": "2024-12-15T16:49:05Z",
  "payload": {
    "instrument_id": "EPEX-DE-INTRA-1700",
    "price": 118.00
  },
  "metadata": {
    "schemaVersion": 1,
    "trigger": "order_book_update"
  }
}
```

```json
{
  "streamId": "instrument:EPEX-DE-INTRA-1700",
  "streamType": "Instrument",
  "version": 70,
  "eventType": "TradeExecuted",
  "timestamp": "2024-12-15T16:49:45Z",
  "payload": {
    "trade_id": "ORD-2024-AW-5520",
    "portfolio_id": "alphawatt-trading",
    "instrument_id": "EPEX-DE-INTRA-1700",
    "price": 116.50,
    "quantity": -120
  },
  "metadata": {
    "schemaVersion": 1,
    "trader_id": "AW-TR-042",
    "order_type": "market_sell",
    "desk": "intraday-de"
  }
}
```

```json
{
  "streamId": "instrument:EPEX-DE-INTRA-1700",
  "streamType": "Instrument",
  "version": 71,
  "eventType": "PriceTickRecorded",
  "timestamp": "2024-12-15T16:50:02Z",
  "payload": {
    "instrument_id": "EPEX-DE-INTRA-1700",
    "price": 78.00
  },
  "metadata": {
    "schemaVersion": 1,
    "trigger": "order_book_update"
  }
}
```

```json
{
  "streamId": "instrument:EPEX-DE-INTRA-1700",
  "streamType": "Instrument",
  "version": 72,
  "eventType": "TradeExecuted",
  "timestamp": "2024-12-15T16:52:00Z",
  "payload": {
    "trade_id": "COMPL-2024-FREEZE-0042",
    "portfolio_id": "alphawatt-trading",
    "instrument_id": "EPEX-DE-INTRA-1700",
    "price": 0.0,
    "quantity": 0
  },
  "metadata": {
    "schemaVersion": 1,
    "trader_id": "COMPLIANCE-SYSTEM",
    "order_type": "compliance_freeze",
    "investigation_ref": "ACER-2024-DE-SPOOF-0891",
    "freeze_reason": "automated_spoofing_detection"
  }
}
```

## Replay Walkthrough

**T+0 (version 42, 16:48:12)** — Trader AW-TR-042 places the first of 15 rapid buy orders: 10 MW at €72.00/MWh. This is the first aggressive bid, above the prevailing market.

**T+1 (version 43, 16:48:13)** — Market price rises to €78.50 in response to the buy pressure. The order book shows significant buy-side depth from a single participant.

**T+2 (version 56, 16:49:04)** — After 14 more buy orders placed in 52 seconds (versions 43–56), the trader's latest order is at €95.00. The accumulated buy volume is 150 MW across 15 orders, though only 3 orders (30 MW total) are actually filled — the rest sit as unfilled limit orders creating artificial demand.

**T+3 (version 57, 16:49:05)** — Market price spikes to €118.00/MWh — a 64% increase in under 60 seconds. The price impact is disproportionate to actual executed volume.

**T+4 (version 70, 16:49:45)** — The trader sells 120 MW at €116.50/MWh — a large market sell that profits from the inflated price. Versions 58–69 contain the 12 order cancellations (omitted for brevity, each recorded as a `TradeExecuted` with `metadata.order_type: "cancel"`).

**T+5 (version 71, 16:50:02)** — Price collapses to €78.00/MWh within 17 seconds of the sell execution. The artificial demand is gone.

**T+6 (version 72, 16:52:00)** — Automated compliance system detects the spoofing signature and inserts a freeze marker event. The trader's account is flagged for investigation. The freeze marker references ACER investigation ID `ACER-2024-DE-SPOOF-0891`.

**Investigation outcome**: The complete event trail shows the classic spoofing pattern — rapid order placement to create false demand, price manipulation, profit-taking at the inflated price, followed by cancellation/collapse. In a CRUD system, the 12 cancelled orders would be invisible. Here, every state transition is preserved and timestamped to millisecond precision, satisfying ACER's evidentiary requirements under REMIT Art. 15.
