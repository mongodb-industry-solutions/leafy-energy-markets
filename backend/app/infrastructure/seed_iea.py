"""Seed the `documents` collection with IEA Policies & Measures data.

Filters for EU/EEA/UK in-force policies that are relevant to energy markets,
strips HTML from descriptions, and generates embeddings.

Run from the backend directory:
    python -m app.infrastructure.seed_iea
"""

import csv
import json
import os
import re
import sys

from dotenv import load_dotenv

_here = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_here, '..', '..', '..'))
load_dotenv(os.path.join(_project_root, 'backend', '.env'))
load_dotenv(os.path.join(_project_root, 'deploy', '.env'))

from app.infrastructure.db import get_client
from app.infrastructure.embeddings import embed_documents

CSV_PATH = os.path.join(
    _project_root,
    'iea-data',
    'IEA_PAMS_Export 2_26_2026, 3_18_26 PM.csv',
)

DB_NAME = os.getenv("MONGO_DB_NAME", "leafy-energy-markets")
COLLECTION = "documents"

# Countries relevant to the demo's European energy market focus
EU_ISOS = {
    'AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
    'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD',
    'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'GBR', 'NOR', 'CHE',
}

# Energy-market keywords used to prioritise the most demo-relevant policies
MARKET_KEYWORDS = re.compile(
    r'electricity|power\s+market|energy\s+market|renewable|tariff|grid|'
    r'carbon|emission|solar|wind|nuclear|hydrogen|storage|battery|'
    r'gas\b|LNG|ETS|allowance|PPA|offshore|capacity\s+market|'
    r'merit\s+order|wholesale|balancing|interconnect|smart\s+grid|'
    r'demand\s+response|flexibility|curtailment|congestion|'
    r'prosumer|feed-in|net\s+metering|auction|subsidy',
    re.IGNORECASE,
)

MAX_DOCS = 200  # keep the collection manageable for a demo
BATCH_SIZE = 50  # embedding batch size


def _strip_html(text: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&[a-zA-Z]+;', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def _extract_country_names(raw: str) -> list[str]:
    try:
        countries = json.loads(raw) if raw else []
        return [c['name'] for c in countries]
    except (json.JSONDecodeError, KeyError):
        return []


def _extract_technologies(raw: str) -> list[str]:
    try:
        techs = json.loads(raw) if raw else []
        if isinstance(techs, list):
            return [t for t in techs if isinstance(t, str)]
        return []
    except (json.JSONDecodeError, TypeError):
        return []


def _policy_type_label(raw: str) -> str:
    try:
        entries = json.loads(raw) if raw else []
        if entries and isinstance(entries, list) and isinstance(entries[0], dict):
            return entries[0].get('name', '')
        return ''
    except (json.JSONDecodeError, TypeError):
        return ''


def _score_relevance(row: dict, desc_clean: str) -> int:
    """Higher is more relevant to energy markets demo."""
    score = 0
    combined = f"{row.get('title', '')} {desc_clean}"
    matches = MARKET_KEYWORDS.findall(combined)
    score += len(matches) * 2

    # Bonus for recent policies
    try:
        year = int(row.get('year', '0'))
        if year >= 2020:
            score += 5
        elif year >= 2015:
            score += 2
    except ValueError:
        pass

    # Bonus for good description length (not too short, not too long)
    if 100 < len(desc_clean) < 2000:
        score += 3

    return score


def load_and_filter() -> list[dict]:
    """Load the IEA CSV, filter to EU energy-market policies, and return docs."""
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Loaded {len(rows)} rows from IEA CSV")

    candidates = []
    for row in rows:
        # Must be in force
        if row.get('status') != 'In force':
            continue

        # Must have a description
        desc = row.get('description', '').strip()
        if not desc or len(desc) < 50:
            continue

        # Must be EU/EEA/UK
        countries = _extract_country_names(row.get('countries', '[]'))
        try:
            country_data = json.loads(row.get('countries', '[]'))
            isos = {c['iso3'] for c in country_data}
        except (json.JSONDecodeError, KeyError):
            continue
        if not (isos & EU_ISOS):
            continue

        desc_clean = _strip_html(desc)
        relevance = _score_relevance(row, desc_clean)

        # Must have at least some market relevance
        if relevance < 4:
            continue

        candidates.append({
            'row': row,
            'desc_clean': desc_clean,
            'countries': countries,
            'relevance': relevance,
        })

    # Sort by relevance descending, take top MAX_DOCS
    candidates.sort(key=lambda c: c['relevance'], reverse=True)
    selected = candidates[:MAX_DOCS]
    print(f"Selected {len(selected)} policies (from {len(candidates)} candidates)")

    docs = []
    for i, c in enumerate(selected):
        row = c['row']
        desc_clean = c['desc_clean']
        # Truncate description to a useful snippet
        snippet = desc_clean[:500] + ('...' if len(desc_clean) > 500 else '')
        techs = _extract_technologies(row.get('technologies', '[]'))
        policy_type = _policy_type_label(row.get('policyType', '[]'))

        doc = {
            'doc_id': f"IEA-{i+1:04d}",
            'title': row.get('title', '').strip(),
            'snippet': snippet,
            'type': 'Policy',
            'date': row.get('year', ''),
            'source': f"IEA – {', '.join(c['countries'][:2])}",
            'status': row.get('status', ''),
            'jurisdiction': row.get('jurisdiction', ''),
            'countries': c['countries'],
            'technologies': techs,
            'policy_type': policy_type,
        }
        docs.append(doc)

    return docs


def seed():
    docs = load_and_filter()
    if not docs:
        print("No documents to seed.")
        return

    client = get_client()
    db = client[DB_NAME]
    coll = db[COLLECTION]

    # Generate embeddings in batches
    print(f"Generating embeddings for {len(docs)} IEA documents...")
    all_embeddings: list[list[float]] = []
    for start in range(0, len(docs), BATCH_SIZE):
        batch = docs[start:start + BATCH_SIZE]
        texts = [f"{d['title']}\n{d['snippet']}" for d in batch]
        embeddings = embed_documents(texts)
        all_embeddings.extend(embeddings)
        print(f"  Embedded {start + len(batch)}/{len(docs)}")

    print("Embeddings generated.")

    # Upsert
    for doc, embedding in zip(docs, all_embeddings):
        coll.update_one(
            {"doc_id": doc["doc_id"]},
            {"$set": {**doc, "embedding": embedding}},
            upsert=True,
        )

    print(f"Upserted {len(docs)} IEA policy documents into {DB_NAME}.{COLLECTION}")
    print("Done.")


if __name__ == "__main__":
    seed()
