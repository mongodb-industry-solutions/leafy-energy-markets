from fastapi import APIRouter, Depends, HTTPException
from pymongo import MongoClient
import os

# This is a temporary way to manage dependencies.
# In a real application, you would use a proper dependency injection container.
def get_db():
    # This should be configured from environment variables
    client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/"))
    return client

router = APIRouter()

@router.get("/tariff-scenarios/{scenario_id}")
async def get_tariff_scenario(scenario_id: str, client: MongoClient = Depends(get_db)):
    db_name = os.getenv("MONGO_DB_NAME", "leafy-energy-markets")
    db = client[db_name]
    scenarios_collection = db.tariff_scenarios
    
    scenario = scenarios_collection.find_one({"_id": scenario_id})
    
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
        
    return scenario
