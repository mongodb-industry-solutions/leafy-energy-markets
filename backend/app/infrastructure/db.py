import logging
import os

from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

logger = logging.getLogger(__name__)

_client: MongoClient | None = None

# Atlas connection-pool best practices:
#  - maxPoolSize: size the pool for your concurrent workload
#  - minPoolSize: keep warm connections to avoid cold-start latency
#  - maxIdleTimeMS: reclaim idle connections (Atlas closes after 10 min)
#  - retryWrites / retryReads: automatic retry on transient failures
#  - w: "majority" for durable writes
#  - serverSelectionTimeoutMS: fail fast if cluster is unreachable
#  - connectTimeoutMS: TCP connect timeout
#  - appName: shows in Atlas monitoring for easy identification

POOL_DEFAULTS = dict(
    maxPoolSize=50,
    minPoolSize=5,
    maxIdleTimeMS=45_000,
    retryWrites=True,
    retryReads=True,
    w="majority",
    serverSelectionTimeoutMS=30_000,
    connectTimeoutMS=20_000,
    socketTimeoutMS=60_000,
    appName="leafy-energy-markets",
)


def get_client() -> MongoClient:
    """Return the singleton MongoClient, creating it on first call."""
    global _client
    if _client is None:
        uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
        if not uri:
            raise RuntimeError(
                "MONGO_URI is not set. "
                "Add it to backend/.env or deploy/.env, e.g.:\n"
                "  MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/"
            )
        _client = MongoClient(uri, **POOL_DEFAULTS)
        # Verify connection — log warning but don't crash if Atlas is cold
        try:
            _client.admin.command("ping")
            logger.info("MongoDB connected — pool ready (max=%d)", POOL_DEFAULTS["maxPoolSize"])
        except ConnectionFailure as exc:
            logger.warning("MongoDB ping failed (Atlas may be cold): %s — will retry on demand", exc)
    return _client


def close_client():
    """Drain the pool and release the client."""
    global _client
    if _client is not None:
        _client.close()
        _client = None
        logger.info("MongoDB client closed")


def get_db():
    """FastAPI dependency — returns the singleton MongoClient."""
    return get_client()
