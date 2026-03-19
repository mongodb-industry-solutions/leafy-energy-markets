"""Shared search helpers for vector + text search over MongoDB."""

from typing import Optional

VECTOR_INDEX = "vector_index"


def vector_search(coll, query_embedding: list[float], limit: int, type_filter: Optional[str] = None):
    """Run $vectorSearch aggregation pipeline."""
    pipeline = [
        {
            "$vectorSearch": {
                "index": VECTOR_INDEX,
                "path": "embedding",
                "queryVector": query_embedding,
                "numCandidates": limit * 10,
                "limit": limit,
            }
        },
        {"$addFields": {"vs_score": {"$meta": "vectorSearchScore"}}},
        {"$project": {"embedding": 0}},
    ]
    if type_filter:
        pipeline.insert(1, {"$match": {"type": type_filter}})
    return list(coll.aggregate(pipeline))


def text_search(coll, query: str, limit: int, type_filter: Optional[str] = None):
    """Fallback keyword search using regex (works without Atlas Search index)."""
    filter_doc: dict = {
        "$or": [
            {"title": {"$regex": query, "$options": "i"}},
            {"snippet": {"$regex": query, "$options": "i"}},
        ]
    }
    if type_filter:
        filter_doc["type"] = type_filter
    return list(coll.find(filter_doc, {"embedding": 0}).limit(limit))


def search_docs(coll, query: str, limit: int = 5, type_filter: Optional[str] = None) -> list[dict]:
    """Combined search: try vector first, fall back to text."""
    try:
        from app.infrastructure.embeddings import embed_query
        embedding = embed_query(query)
        results = vector_search(coll, embedding, limit, type_filter)
        if results:
            return results
    except Exception:
        pass
    return text_search(coll, query, limit, type_filter)
