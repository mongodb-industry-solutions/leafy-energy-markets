"""Seed the `documents` collection with market intelligence data + VoyageAI embeddings.

Run from the backend directory:
    python -m app.infrastructure.seed_documents
"""

import os
import sys

# Ensure dotenv is loaded before any imports that read env vars
from dotenv import load_dotenv

_here = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_here, '..', '..', '..'))
load_dotenv(os.path.join(_project_root, 'backend', '.env'))
load_dotenv(os.path.join(_project_root, 'deploy', '.env'))

from app.infrastructure.db import get_client
from app.infrastructure.embeddings import embed_documents

DOCUMENTS = [
    {
        "doc_id": "DOC-001",
        "title": "European Power Market Outlook Q2 2026",
        "snippet": "Wholesale electricity prices across Central Europe are expected to rise 8-12% in Q2 driven by lower wind generation forecasts and increased industrial demand following the manufacturing recovery.",
        "type": "Research",
        "date": "2026-01-28",
        "source": "Internal Research",
    },
    {
        "doc_id": "DOC-002",
        "title": "Carbon Credit Market Analysis — EU ETS Phase 4",
        "snippet": "The Market Stability Reserve (MSR) is expected to absorb 250M allowances in 2026, tightening supply. Carbon prices projected to reach EUR 80-85 by year-end.",
        "type": "Research",
        "date": "2026-02-01",
        "source": "Bloomberg NEF",
    },
    {
        "doc_id": "DOC-003",
        "title": "ESG Compliance Report — Portfolio NORTH Region",
        "snippet": "The NORTH region portfolio maintains 62% renewable energy exposure, exceeding the 50% target. Carbon intensity reduced by 18% YoY. Recommended: increase wind PPA allocation.",
        "type": "ESG",
        "date": "2026-02-03",
        "source": "Sustainability Team",
    },
    {
        "doc_id": "DOC-004",
        "title": "Wind Farm Asset Performance — Netherlands Cluster",
        "snippet": "The NL offshore wind cluster achieved 42% capacity factor in January, above 38% seasonal average. Curtailment incidents decreased 15% following grid upgrade completion.",
        "type": "Asset",
        "date": "2026-02-04",
        "source": "Asset Management",
    },
    {
        "doc_id": "DOC-005",
        "title": "Natural Gas Storage Report — TTF Hub",
        "snippet": "EU gas storage levels at 58% capacity, 12 percentage points above 5-year average. LNG imports from US remain strong. TTF front-month trading at EUR 34.8/MWh.",
        "type": "Research",
        "date": "2026-02-05",
        "source": "GIE/AGSI+",
    },
    {
        "doc_id": "DOC-006",
        "title": "Solar PPA Pricing Trends — Iberian Peninsula",
        "snippet": "Spanish solar PPA prices stabilized at EUR 45-48/MWh for 10-year contracts. Portuguese prices ~3% premium. Grid congestion in Andalusia creating basis risk.",
        "type": "Asset",
        "date": "2026-01-30",
        "source": "Internal Research",
    },
    {
        "doc_id": "DOC-007",
        "title": "ESG Risk Assessment — Carbon-Intensive Positions",
        "snippet": "Three portfolio positions flagged for elevated transition risk: UK Baseload Q3-26, IT Peakload Q2-26, and DE Peakload M04-26. Combined carbon exposure: 12,400 tCO2.",
        "type": "ESG",
        "date": "2026-02-02",
        "source": "Risk Management",
    },
    {
        "doc_id": "DOC-008",
        "title": "Nordic Hydro Reservoir Levels — February Update",
        "snippet": "Norwegian reservoir levels at 45.2% capacity, 3 points below median. Swedish levels normal. Price impact: upside risk for NO and SE power prices in spring.",
        "type": "Research",
        "date": "2026-02-06",
        "source": "NVE/Vattenfall",
    },
]

DB_NAME = os.getenv("MONGO_DB_NAME", "leafy-energy-markets")
COLLECTION = "documents"
INDEX_NAME = "vector_index"


def seed():
    client = get_client()
    db = client[DB_NAME]
    coll = db[COLLECTION]

    # Generate embeddings for all documents
    texts = [f"{d['title']}\n{d['snippet']}" for d in DOCUMENTS]
    print(f"Generating embeddings for {len(texts)} documents via VoyageAI...")
    embeddings = embed_documents(texts)
    print("Embeddings generated.")

    # Upsert documents
    for doc, embedding in zip(DOCUMENTS, embeddings):
        coll.update_one(
            {"doc_id": doc["doc_id"]},
            {"$set": {**doc, "embedding": embedding}},
            upsert=True,
        )
    print(f"Upserted {len(DOCUMENTS)} documents into {DB_NAME}.{COLLECTION}")

    # Check if vector search index exists (Atlas only)
    try:
        existing = list(coll.list_search_indexes())
        names = [idx.get("name") for idx in existing]
        if INDEX_NAME not in names:
            print(f"Creating Atlas Vector Search index '{INDEX_NAME}'...")
            coll.create_search_index(
                model={
                    "name": INDEX_NAME,
                    "type": "vectorSearch",
                    "definition": {
                        "fields": [
                            {
                                "type": "vector",
                                "path": "embedding",
                                "numDimensions": len(embeddings[0]),
                                "similarity": "cosine",
                            }
                        ]
                    },
                }
            )
            print(f"Vector search index '{INDEX_NAME}' created.")
        else:
            print(f"Vector search index '{INDEX_NAME}' already exists.")
    except Exception as e:
        print(f"Note: Could not manage search indexes (may require Atlas): {e}")

    print("Done.")


if __name__ == "__main__":
    seed()
