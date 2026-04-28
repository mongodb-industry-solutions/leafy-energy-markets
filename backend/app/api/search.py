"""Hybrid vector search endpoint."""

import os
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.infrastructure.db import get_db
from app.infrastructure.embeddings import embed_query
from app.infrastructure.search import vector_search, text_search

router = APIRouter()

from app.infrastructure.db import DB_NAME
COLLECTION = "documents"


# ── Request / Response models ─────────────────────────────

class SearchRequest(BaseModel):
    query: str
    type_filter: Optional[str] = None
    limit: int = Field(default=5, ge=1, le=20)


class SearchResult(BaseModel):
    doc_id: str
    title: str
    snippet: str
    type: str
    date: str
    source: str
    score: float


class SearchResponse(BaseModel):
    results: list[SearchResult]


# ── Hybrid search ─────────────────────────────────────────

def _reciprocal_rank_fusion(
    vector_results: list[dict],
    text_results: list[dict],
    k: int = 60,
) -> list[dict]:
    """Merge results using reciprocal rank fusion (RRF)."""
    scores: dict[str, float] = {}
    docs: dict[str, dict] = {}

    for rank, doc in enumerate(vector_results):
        doc_id = doc.get("doc_id", str(doc.get("_id")))
        scores[doc_id] = scores.get(doc_id, 0) + 1 / (k + rank + 1)
        docs[doc_id] = doc

    for rank, doc in enumerate(text_results):
        doc_id = doc.get("doc_id", str(doc.get("_id")))
        scores[doc_id] = scores.get(doc_id, 0) + 1 / (k + rank + 1)
        if doc_id not in docs:
            docs[doc_id] = doc

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    results = []
    for doc_id, score in ranked:
        doc = docs[doc_id]
        doc["rrf_score"] = score
        results.append(doc)
    return results


# ── Endpoint ──────────────────────────────────────────────

@router.post("/search", response_model=SearchResponse)
def search_documents(req: SearchRequest, client=Depends(get_db)):
    db = client[DB_NAME]
    coll = db[COLLECTION]

    # Generate query embedding
    try:
        query_embedding = embed_query(req.query)
    except Exception:
        query_embedding = None

    # Run both searches
    vector_results = []
    if query_embedding:
        try:
            vector_results = vector_search(coll, query_embedding, req.limit, req.type_filter)
        except Exception:
            pass

    text_results = text_search(coll, req.query, req.limit, req.type_filter)

    # Merge with RRF
    if vector_results:
        merged = _reciprocal_rank_fusion(vector_results, text_results)
    else:
        merged = text_results
        for i, doc in enumerate(merged):
            doc["rrf_score"] = 1.0 / (60 + i + 1)

    results = []
    for doc in merged[: req.limit]:
        results.append(
            SearchResult(
                doc_id=doc.get("doc_id", str(doc.get("_id", ""))),
                title=doc.get("title", ""),
                snippet=doc.get("snippet", ""),
                type=doc.get("type", ""),
                date=doc.get("date", ""),
                source=doc.get("source", ""),
                score=round(doc.get("rrf_score", doc.get("vs_score", 0)), 4),
            )
        )
    return SearchResponse(results=results)
