from pydantic import BaseModel
from datetime import datetime

class Command(BaseModel):
    pass

class CreateTariffScenario(Command):
    portfolio_id: str
    region: str
    from_date: datetime
    to_date: datetime
