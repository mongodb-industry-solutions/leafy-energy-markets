"""
EventStore — reads from and writes to the `trading_events` time series collection.

This is the single event store for the platform. Events are append-only,
queried by streamId + sorted by timestamp, and replayed via fold() to
reconstruct aggregate state at any point in time.

Time series collection config:
  timeField: timestamp
  metaField: streamType
  granularity: seconds
  expireAfterSeconds: 7 days

Note: Time series collections do not support unique indexes or multi-document
transactions. Optimistic concurrency is not enforced at the DB level — the
trading simulator is the single writer, so conflicts don't occur.
"""

from typing import Generic, Type, TypeVar

from pymongo import MongoClient

from app.domain.events import DomainEvent, EVENT_TYPE_MAP
from app.domain.aggregates import Aggregate, fold
from app.infrastructure.db import DB_NAME

A = TypeVar('A', bound=Aggregate)

COLLECTION = "trading_events"


class EventStore(Generic[A]):
    def __init__(self, client: MongoClient, aggregate_type: Type[A]):
        self.db = client[DB_NAME]
        self.events_collection = self.db[COLLECTION]
        self.aggregate_type = aggregate_type

    def get(self, aggregate_id: str) -> A:
        """Loads an aggregate by replaying its events via fold()."""
        event_docs = self.events_collection.find(
            {"streamId": aggregate_id}
        ).sort("timestamp")

        events = []
        for doc in event_docs:
            event_type = EVENT_TYPE_MAP.get(doc["eventType"])
            if not event_type:
                continue
            events.append(event_type(**doc["payload"]))

        aggregate = self.aggregate_type(id=aggregate_id)
        return fold(aggregate, events)

    def save(self, aggregate: A, events: list[DomainEvent]) -> None:
        """Append events to the time series collection."""
        if not events:
            return

        docs = [self._to_event_document(aggregate, event) for event in events]
        self.events_collection.insert_many(docs)

    def _to_event_document(self, aggregate: A, event: DomainEvent) -> dict:
        return {
            "streamId": aggregate.id,
            "streamType": self.aggregate_type.__name__,
            "version": aggregate.version,
            "eventType": event.__class__.__name__,
            "timestamp": event.timestamp,
            "payload": event.model_dump(exclude={'id', 'timestamp'}),
            "metadata": {
                "source": "event-store",
                "schemaVersion": 1,
            }
        }

    # ── Replay / Audit APIs ─────────────────────────────────

    def get_event_stream(self, stream_id: str, up_to_version: int | None = None) -> list[dict]:
        """Get all events for a stream, optionally up to a specific version."""
        query = {"streamId": stream_id}
        if up_to_version is not None:
            query["version"] = {"$lte": up_to_version}

        docs = list(self.events_collection.find(query).sort("timestamp"))
        for doc in docs:
            doc["_id"] = str(doc["_id"])
            if hasattr(doc.get("timestamp"), "isoformat"):
                doc["timestamp"] = doc["timestamp"].isoformat()
        return docs

    def get_all_streams(self) -> list[dict]:
        """List all event streams with summary info."""
        pipeline = [
            {"$group": {
                "_id": "$streamId",
                "streamType": {"$first": "$streamType"},
                "eventCount": {"$sum": 1},
                "firstEvent": {"$min": "$timestamp"},
                "lastEvent": {"$max": "$timestamp"},
            }},
            {"$project": {
                "_id": 0,
                "streamId": "$_id",
                "streamType": 1,
                "eventCount": 1,
                "firstEvent": 1,
                "lastEvent": 1,
            }},
            {"$sort": {"lastEvent": -1}},
        ]
        results = list(self.events_collection.aggregate(pipeline))
        for r in results:
            if hasattr(r.get("firstEvent"), "isoformat"):
                r["firstEvent"] = r["firstEvent"].isoformat()
            if hasattr(r.get("lastEvent"), "isoformat"):
                r["lastEvent"] = r["lastEvent"].isoformat()
        return results

    def replay_stream(self, stream_id: str, up_to_version: int | None = None) -> list[dict]:
        """
        Demonstrates fold() — returns state at each step.
        Returns: [{ version, event, stateAfter }, ...]
        """
        docs = self.get_event_stream(stream_id, up_to_version)

        aggregate = self.aggregate_type(id=stream_id)
        steps = []

        for doc in docs:
            event_type = EVENT_TYPE_MAP.get(doc["eventType"])
            if event_type:
                event = event_type(**doc["payload"])
                aggregate.apply(event)

            steps.append({
                "version": doc.get("version", len(steps) + 1),
                "event": doc,
                "stateAfter": aggregate.model_dump(),
            })

        return steps
