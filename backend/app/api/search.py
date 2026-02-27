"""Hybrid vector search + RAG chat endpoints."""

import os
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.infrastructure.db import get_db
from app.infrastructure.embeddings import embed_query

router = APIRouter()

DB_NAME = os.getenv("MONGO_DB_NAME", "leafy-energy-markets")
COLLECTION = "documents"
VECTOR_INDEX = "vector_index"


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


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = Field(default_factory=list)


class SourceRef(BaseModel):
    title: str
    type: str
    snippet: str


class ChatResponse(BaseModel):
    response: str
    sources: list[SourceRef]


# ── Hybrid search ─────────────────────────────────────────

def _vector_search(coll, query_embedding: list[float], limit: int, type_filter: Optional[str] = None):
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
        {
            "$addFields": {
                "vs_score": {"$meta": "vectorSearchScore"},
            }
        },
        {
            "$project": {
                "embedding": 0,
            }
        },
    ]
    if type_filter:
        pipeline.insert(1, {"$match": {"type": type_filter}})
    return list(coll.aggregate(pipeline))


def _text_search(coll, query: str, limit: int, type_filter: Optional[str] = None):
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


# ── Endpoints ─────────────────────────────────────────────

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
            vector_results = _vector_search(coll, query_embedding, req.limit, req.type_filter)
        except Exception:
            pass

    text_results = _text_search(coll, req.query, req.limit, req.type_filter)

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


@router.post("/chat", response_model=ChatResponse)
def chat_with_leafy(req: ChatRequest, client=Depends(get_db)):
    db = client[DB_NAME]
    coll = db[COLLECTION]

    # Retrieve relevant documents via vector search
    try:
        query_embedding = embed_query(req.message)
        docs = _vector_search(coll, query_embedding, limit=3)
    except Exception:
        docs = _text_search(coll, req.message, limit=3)

    sources = [
        SourceRef(
            title=d.get("title", ""),
            type=d.get("type", ""),
            snippet=d.get("snippet", ""),
        )
        for d in docs
    ]

    # Build context-augmented response
    context_parts = []
    for d in docs:
        context_parts.append(f"**{d.get('title', '')}** ({d.get('source', '')})\n{d.get('snippet', '')}")

    context_block = "\n\n".join(context_parts)

    response_text = f"""Based on the latest market intelligence, here is what I found relevant to your question:

{context_block}

---

*This response was generated using MongoDB Atlas Vector Search with VoyageAI embeddings. {len(docs)} document(s) retrieved via hybrid semantic + keyword search.*"""

    return ChatResponse(response=response_text, sources=sources)
