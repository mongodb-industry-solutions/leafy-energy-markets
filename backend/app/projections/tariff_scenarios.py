from pymongo import MongoClient
from pymongo.change_stream import ChangeStream
import os

from app.domain.events import EVENT_TYPE_MAP, TariffScenarioCreated

def project_tariff_scenarios():
    """
    A simple projection that listens for events and updates a read model.
    """
    client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/"))
    db_name = os.getenv("MONGO_DB_NAME", "leafy-energy-markets")
    db = client[db_name]
    
    events_collection = db.events
    scenarios_collection = db.tariff_scenarios

    pipeline = [
        {"$match": {"operationType": "insert", "fullDocument.eventType": "TariffScenarioCreated"}}
    ]
    
    try:
        with events_collection.watch(pipeline) as stream:
            print("Watching for new TariffScenarioCreated events...")
            for change in stream:
                event_doc = change["fullDocument"]
                payload = event_doc["payload"]
                
                scenario_doc = {
                    "_id": payload["scenario_id"],
                    "portfolio_id": payload["portfolio_id"],
                    "region": payload["region"],
                    "from_date": payload["from_date"],
                    "to_date": payload["to_date"],
                    "status": "created",
                    "createdAt": event_doc["timestamp"]
                }
                
                scenarios_collection.update_one(
                    {"_id": scenario_doc["_id"]},
                    {"$set": scenario_doc},
                    upsert=True
                )
                print(f"Projected scenario: {scenario_doc['_id']}")

    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    project_tariff_scenarios()
