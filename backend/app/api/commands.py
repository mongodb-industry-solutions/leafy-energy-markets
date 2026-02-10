from fastapi import APIRouter, Depends
from pymongo import MongoClient
import uuid

from app.domain.commands import CreateTariffScenario
from app.domain.events import TariffScenarioCreated
from app.domain.aggregates import TariffScenario
from app.infrastructure.event_store import EventStore

# This is a temporary way to manage dependencies.
# In a real application, you would use a proper dependency injection container.
def get_db():
    # This should be configured from environment variables
    client = MongoClient("mongodb://localhost:27017/")
    return client

router = APIRouter()

@router.post("/portfolios/{portfolio_id}/tariff-scenarios")
async def create_tariff_scenario(
    portfolio_id: str,
    command: CreateTariffScenario,
    client: MongoClient = Depends(get_db)
):
    # In a real app, you'd have a command handler that takes care of this logic.
    event_store = EventStore(client, TariffScenario)
    
    # The portfolioId in the command should match the one in the URL
    # Here we are just ensuring the command is consistent.
    command.portfolio_id = portfolio_id
    
    scenario_id = str(uuid.uuid4())
    
    # Create the aggregate
    scenario = TariffScenario(id=scenario_id)

    # Create the event
    event = TariffScenarioCreated(
        scenario_id=scenario_id,
        portfolio_id=command.portfolio_id,
        region=command.region,
        from_date=command.from_date,
        to_date=command.to_date
    )
    
    # Record the event
    scenario.record(event)
    
    # Save the events
    event_store.save(scenario, scenario._pending_events)
    
    return {"scenario_id": scenario_id}
