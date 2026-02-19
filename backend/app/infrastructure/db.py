import os
from pymongo import MongoClient

_client: MongoClient | None = None


def get_client() -> MongoClient:
    global _client
    if _client is None:
        uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
        if not uri:
            raise RuntimeError(
                "MONGO_URI is not set. "
                "Add it to backend/.env or deploy/.env, e.g.:\n"
                "  MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/"
            )
        _client = MongoClient(uri)
    return _client


def close_client():
    global _client
    if _client is not None:
        _client.close()
        _client = None


def get_db():
    """FastAPI dependency — returns the singleton MongoClient."""
    return get_client()
