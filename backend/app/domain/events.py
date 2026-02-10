from pydantic import BaseModel, Field
from uuid import UUID, uuid4
from datetime import datetime
from typing import ClassVar, Type

class DomainEvent(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        frozen = True

class PriceTickRecorded(DomainEvent):
    instrument_id: str
    price: float
    
class InstrumentListed(DomainEvent):
    instrument_id: str
    name: str

class MeterReadingRecorded(DomainEvent):
    meter_id: str
    reading: float

class TradeExecuted(DomainEvent):
    trade_id: str
    portfolio_id: str
    instrument_id: str
    price: float
    quantity: int

class TariffScenarioCreated(DomainEvent):
    scenario_id: str
    portfolio_id: str
    region: str
    from_date: datetime
    to_date: datetime
    
class ResearchDocumentIngested(DomainEvent):
    document_id: str
    title: str
    content: str

EVENT_TYPE_MAP: dict[str, Type[DomainEvent]] = {
    "PriceTickRecorded": PriceTickRecorded,
    "InstrumentListed": InstrumentListed,
    "MeterReadingRecorded": MeterReadingRecorded,
    "TradeExecuted": TradeExecuted,
    "TariffScenarioCreated": TariffScenarioCreated,
    "ResearchDocumentIngested": ResearchDocumentIngested,
}
