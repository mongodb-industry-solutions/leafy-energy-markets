"""
Change Stream projection: events → tariff_scenarios read model.

Resilient implementation:
- max_await_time_ms: prevents blocking forever on each next()
- Resume tokens persisted to _change_stream_cursors collection
- Handles ChangeStreamHistoryLost (code 286) by resetting token
- Exponential backoff on connection failures
- Circuit breaker: gives up after MAX_FAILURES consecutive errors
"""

import logging
import os
import time

from pymongo import MongoClient
from pymongo.errors import OperationFailure, PyMongoError

from app.infrastructure.db import DB_NAME

logger = logging.getLogger(__name__)

MAX_FAILURES = 10
MAX_AWAIT_MS = 5000  # Return from next() every 5s even if no changes
CURSOR_COLLECTION = "_change_stream_cursors"
CURSOR_ID = "tariff_projection"


def _load_resume_token(db):
    """Load persisted resume token, or None on first run."""
    doc = db[CURSOR_COLLECTION].find_one({"_id": CURSOR_ID})
    return doc["token"] if doc else None


def _save_resume_token(db, token):
    """Persist resume token so we survive restarts."""
    db[CURSOR_COLLECTION].update_one(
        {"_id": CURSOR_ID},
        {"$set": {"token": token}},
        upsert=True,
    )


def _clear_resume_token(db):
    """Clear expired token — forces restart from current oplog position."""
    db[CURSOR_COLLECTION].delete_one({"_id": CURSOR_ID})


def _project_event(db, event_doc):
    """Apply a single event to the tariff_scenarios read model."""
    payload = event_doc["payload"]
    scenario_doc = {
        "_id": payload["scenario_id"],
        "portfolio_id": payload["portfolio_id"],
        "region": payload["region"],
        "from_date": payload["from_date"],
        "to_date": payload["to_date"],
        "status": "created",
        "createdAt": event_doc["timestamp"],
    }
    db.tariff_scenarios.update_one(
        {"_id": scenario_doc["_id"]},
        {"$set": scenario_doc},
        upsert=True,
    )
    logger.info("Projected scenario: %s", scenario_doc["_id"])


def project_tariff_scenarios():
    """
    Watch the events collection for TariffScenarioCreated events and
    project them into the tariff_scenarios read model.

    Resilient to disconnects, oplog expiry, and transient failures.
    """
    client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/"))
    db = client[DB_NAME]

    pipeline = [
        {"$match": {
            "operationType": "insert",
            "fullDocument.eventType": "TariffScenarioCreated",
        }}
    ]

    consecutive_failures = 0

    while consecutive_failures < MAX_FAILURES:
        try:
            resume_token = _load_resume_token(db)
            watch_kwargs = {
                "pipeline": pipeline,
                "max_await_time_ms": MAX_AWAIT_MS,
            }
            if resume_token:
                watch_kwargs["resume_after"] = resume_token

            logger.info(
                "Starting change stream (resume=%s)",
                "from token" if resume_token else "from now",
            )

            with db.events.watch(**watch_kwargs) as stream:
                for change in stream:
                    if change is None:
                        continue  # max_await_time_ms timeout — no new events
                    _project_event(db, change["fullDocument"])
                    _save_resume_token(db, stream.resume_token)
                    consecutive_failures = 0  # reset on success

        except OperationFailure as e:
            if e.code == 286:  # ChangeStreamHistoryLost
                logger.warning(
                    "Resume token expired (oplog rolled past saved position) — "
                    "clearing token and restarting from current position"
                )
                _clear_resume_token(db)
                continue  # retry immediately without counting as failure
            logger.exception("Change stream OperationFailure (code=%s)", e.code)
            consecutive_failures += 1

        except PyMongoError:
            consecutive_failures += 1
            backoff = min(30, 2 ** consecutive_failures)
            logger.warning(
                "Change stream disconnected (failure %d/%d) — retrying in %ds",
                consecutive_failures, MAX_FAILURES, backoff,
            )
            time.sleep(backoff)

    logger.error(
        "Change stream gave up after %d consecutive failures — "
        "tariff_scenarios projection is stopped",
        MAX_FAILURES,
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    project_tariff_scenarios()
