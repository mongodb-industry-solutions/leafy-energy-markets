from typing import TypeVar, List
from pydantic import BaseModel
from .events import DomainEvent, InstrumentListed, PriceTickRecorded, TariffScenarioCreated

class Aggregate(BaseModel):
    id: str
    version: int = 0
    
    _pending_events: List[DomainEvent] = []

    def apply(self, event: DomainEvent):
        """
        Applies an event to the aggregate, changing its state.
        This uses a dynamic dispatch pattern (apply_<event_name>).
        """
        method_name = f"apply_{event.__class__.__name__}"
        method = getattr(self, method_name, None)
        if method:
            method(event)
        self.version += 1

    def record(self, event: DomainEvent):
        """
        Records a new event to be saved.
        """
        self.apply(event)
        self._pending_events.append(event)


class Instrument(Aggregate):
    name: str | None = None
    last_price: float | None = None

    def apply_InstrumentListed(self, event: InstrumentListed):
        self.name = event.name
    
    def apply_PriceTickRecorded(self, event: PriceTickRecorded):
        self.last_price = event.price

class TariffScenario(Aggregate):
    portfolio_id: str | None = None
    region: str | None = None

    def apply_TariffScenarioCreated(self, event: TariffScenarioCreated):
        self.portfolio_id = event.portfolio_id
        self.region = event.region

A = TypeVar('A', bound=Aggregate)

def fold(aggregate: A, events: list[DomainEvent]) -> A:
    """
    Folds a list of events onto an aggregate to reconstruct its state.
    """
    for event in events:
        aggregate.apply(event)
    return aggregate
