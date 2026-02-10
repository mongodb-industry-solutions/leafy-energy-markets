from pymongo import MongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError
from typing import Generic, Type, TypeVar
from pydantic import BaseModel
import os

from app.domain.events import DomainEvent, EVENT_TYPE_MAP
from app.domain.aggregates import Aggregate, fold

A = TypeVar('A', bound=Aggregate)

class EventStore(Generic[A]):
    def __init__(self, client: MongoClient, aggregate_type: Type[A]):
        db_name = os.getenv("MONGO_DB_NAME", "leafy-energy-markets")
        self.db = client[db_name]
        self.events_collection = self.db.events
        self.aggregate_type = aggregate_type

    def get(self, aggregate_id: str) -> A:
        """
        Loads an aggregate by replaying its events.
        """
        event_docs = self.events_collection.find({"streamId": aggregate_id}).sort("version")
        
        events = []
        for doc in event_docs:
            event_type = EVENT_TYPE_MAP.get(doc["eventType"])
            if not event_type:
                # Handle unknown event types, maybe log a warning
                continue
            events.append(event_type(**doc["payload"]))
        
        aggregate = self.aggregate_type(id=aggregate_id)
        return fold(aggregate, events)

    def save(self, aggregate: A, events: list[DomainEvent]) -> None:
        """
        Saves new events for an aggregate, ensuring optimistic concurrency.
        """
        if not events:
            return

        with self.db.client.start_session() as session:
            with session.start_transaction():
                for event in events:
                    event_doc = self._to_event_document(aggregate, event)
                    try:
                        self.events_collection.insert_one(event_doc, session=session)
                    except DuplicateKeyError:
                        # This should be a proper exception that the command handler can catch
                        raise
    
    def _to_event_document(self, aggregate: A, event: DomainEvent) -> dict:
        return {
            "streamId": aggregate.id,
            "streamType": self.aggregate_type.__name__,
            "version": aggregate.version,
            "eventType": event.__class__.__name__,
            "timestamp": event.timestamp,
            "payload": event.model_dump(exclude={'id', 'timestamp'}),
            "metadata": {
                "schemaVersion": 1,
            }
        }
