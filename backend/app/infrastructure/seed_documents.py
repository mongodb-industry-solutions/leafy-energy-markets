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
    # ── EU Regulatory Policy Documents ─────────────────────────────────────────
    {
        "doc_id": "POL-001",
        "title": "REMIT — EU Regulation 1227/2011 on Wholesale Energy Market Integrity and Transparency",
        "snippet": (
            "REMIT (Regulation on Wholesale Energy Market Integrity and Transparency) prohibits insider trading "
            "and market manipulation in wholesale energy markets. Key obligations: (1) Mandatory transaction "
            "reporting to ACER via Registered Reporting Mechanisms (RRMs); (2) Disclosure of inside information "
            "that could materially affect prices — must be published promptly and non-discriminatorily; "
            "(3) Prohibition on orders or transactions that give false or misleading price signals; "
            "(4) REMIT II (EU 2024/1106) extends reporting to derivatives, expands surveillance scope, "
            "and introduces new data quality requirements. National Regulatory Authorities (NRAs) and ACER "
            "share enforcement jurisdiction. Fines can reach EUR 10M or 10% of annual turnover."
        ),
        "type": "Policy",
        "date": "2011",
        "source": "EU — ACER/REMIT",
        "status": "In force",
        "jurisdiction": "EU-wide",
        "countries": ["Germany", "France", "Netherlands", "Spain", "Italy", "Belgium", "Poland"],
        "technologies": ["Electricity", "Natural Gas", "LNG", "Derivatives"],
        "policy_type": "Regulation",
    },
    {
        "doc_id": "POL-002",
        "title": "EU ETS — Emissions Trading System Phase 4 (2021–2030) and Market Stability Reserve",
        "snippet": (
            "The EU Emissions Trading System (ETS) is the world's largest carbon market, covering ~40% of EU "
            "greenhouse gas emissions. Phase 4 (2021–2030): linear reduction factor increased to 2.2%/year "
            "(4.3% from 2024 under Fit for 55). Market Stability Reserve (MSR) absorbs surplus allowances "
            "when Total Number of Allowances in Circulation (TNAC) > 833M. EUA prices: EUR 60–80/tCO2. "
            "Carbon Border Adjustment Mechanism (CBAM) complements ETS from 2026. Free allocation "
            "phased out for power sector 2026–2034. Aviation and maritime sectors added 2024–2026. "
            "Innovation Fund (EUR 38B) and Modernisation Fund support low-carbon transition."
        ),
        "type": "Policy",
        "date": "2021",
        "source": "EU — DG CLIMA",
        "status": "In force",
        "jurisdiction": "EU-wide",
        "countries": ["Germany", "France", "Netherlands", "Poland", "Spain", "Italy"],
        "technologies": ["Electricity", "Industry", "Aviation", "Maritime", "Carbon"],
        "policy_type": "Cap-and-trade",
    },
    {
        "doc_id": "POL-003",
        "title": "REPowerEU — EU Energy Independence and Security of Supply Plan (2022)",
        "snippet": (
            "REPowerEU (May 2022) targets ending EU dependence on Russian fossil fuels by 2027. "
            "Key measures: (1) Diversify gas supply — LNG imports from US, Qatar, Norway increased by 50 bcm/y; "
            "(2) Accelerate renewable deployment — solar target 600 GW by 2030, wind 510 GW; "
            "(3) Biomethane target 35 bcm by 2030; (4) Mandatory gas storage filling to 90% by Nov 1 each year "
            "(EU 2022/1369); (5) Demand reduction — mandatory 15% gas demand cut (EU 2022/1369); "
            "(6) EUR 300B investment through NextGenerationEU. EU LNG infrastructure: floating storage "
            "and regasification units (FSRUs) deployed in Germany, Netherlands, Italy. "
            "TTF hub now global LNG pricing benchmark."
        ),
        "type": "Policy",
        "date": "2022",
        "source": "EU — European Commission",
        "status": "In force",
        "jurisdiction": "EU-wide",
        "countries": ["Germany", "Netherlands", "France", "Italy", "Spain", "Poland"],
        "technologies": ["Natural Gas", "LNG", "Solar", "Wind", "Hydrogen"],
        "policy_type": "Strategic Plan",
    },
    {
        "doc_id": "POL-004",
        "title": "EU Balancing Guideline (EBGL) — Commission Regulation 2017/2195",
        "snippet": (
            "EU Regulation 2017/2195 (Electricity Balancing Guideline) establishes a harmonised framework for "
            "balancing electricity markets. Key provisions: (1) Standard balancing products (aFRR, mFRR, RR) "
            "traded via common European platforms (PICASSO, MARI, TERRE); (2) Imbalance settlement period "
            "harmonised to 15 minutes by 2025; (3) TSOs required to procure balancing capacity through "
            "market-based mechanisms with full transparency; (4) Cross-zonal capacity allocation for balancing "
            "(at least 1.5% of peak load); (5) Balance Responsible Parties (BRPs) financially responsible "
            "for real-time imbalances — positive imbalance price ≤ marginal price, negative ≥ marginal; "
            "(6) Imbalance adjustment process to correct for measurement errors. Enforced by national NRAs."
        ),
        "type": "Policy",
        "date": "2017",
        "source": "EU — ENTSO-E",
        "status": "In force",
        "jurisdiction": "EU-wide",
        "countries": ["Germany", "France", "Netherlands", "Belgium", "Spain", "Poland", "Denmark"],
        "technologies": ["Electricity", "Grid Balancing", "Demand Response"],
        "policy_type": "Regulation",
    },
    {
        "doc_id": "POL-005",
        "title": "RED III — Renewable Energy Directive III (EU 2023/2413) — 42.5% Target by 2030",
        "snippet": (
            "Directive 2023/2413 (RED III) raises the EU renewable energy target to 42.5% by 2030 "
            "(with 2.5% indicative top-up to 45%). Sector-specific sub-targets: industry +1.6%/year renewable "
            "energy share; buildings — 49% renewable in new buildings; district heating and cooling +2.2%/year; "
            "transport — 29% renewable or 14.5% GHG reduction by 2030. Streamlined permitting: maximum "
            "12 months for renewable projects in 'go-to areas'; 24 months otherwise. "
            "Power Purchase Agreements (PPAs): Member States must remove barriers to corporate PPAs. "
            "Guarantees of Origin (GOs) system strengthened for renewable electricity."
        ),
        "type": "Policy",
        "date": "2023",
        "source": "EU — DG ENER",
        "status": "In force",
        "jurisdiction": "EU-wide",
        "countries": ["Germany", "Spain", "France", "Italy", "Netherlands", "Denmark", "Poland"],
        "technologies": ["Solar", "Wind", "Biomass", "Hydrogen", "Geothermal"],
        "policy_type": "Directive",
    },
    {
        "doc_id": "POL-006",
        "title": "EU Gas Storage Regulation — Mandatory Filling Targets (EU 2022/1032)",
        "snippet": (
            "EU Regulation 2022/1032 mandates minimum gas storage filling targets to ensure winter security "
            "of supply. Targets: 80% by Nov 1 2022; 90% by Nov 1 each subsequent year. "
            "Storage operators must report weekly filling levels to national authorities and ENTSOG. "
            "Member States with underground storage have primary filling obligations; "
            "Member States without storage access solidarity corridors. "
            "Storage access: TSOs must offer non-discriminatory third-party access (TPA). "
            "Emergency measures: EU coordinated demand reduction if filling falls below 25% mid-winter. "
            "GIE/AGSI+ database provides real-time EU storage levels. "
            "Current TTF front-month price sensitive to storage fill rates and LNG import volumes."
        ),
        "type": "Policy",
        "date": "2022",
        "source": "EU — ENTSOG/GIE",
        "status": "In force",
        "jurisdiction": "EU-wide",
        "countries": ["Germany", "Netherlands", "France", "Italy", "Austria", "Hungary", "Poland"],
        "technologies": ["Natural Gas", "LNG", "Storage"],
        "policy_type": "Regulation",
    },
    {
        "doc_id": "POL-007",
        "title": "ACER Market Monitoring Report — Wholesale Electricity and Natural Gas Markets",
        "snippet": (
            "ACER Annual Market Monitoring Report tracks competition, efficiency, and transparency of EU "
            "wholesale energy markets. Key findings 2025: (1) TTF natural gas prices: avg EUR 35–42/MWh, "
            "down 60% from 2022 peak but 3× pre-crisis levels; (2) Cross-border capacity utilisation: "
            "79% average across all interconnectors; (3) REMIT surveillance: 45 investigations opened in 2024, "
            "EUR 280M in fines across Member States; (4) Intraday market coupling achieved 87% price "
            "convergence; (5) Renewable curtailment: 8.2 TWh lost in 2024 (grid congestion, Germany/Spain); "
            "(6) Demand response capacity: 45 GW registered across EU-27, up 23% YoY. "
            "XBID (cross-border intraday) volume: 285 TWh/year."
        ),
        "type": "Policy",
        "date": "2025",
        "source": "ACER",
        "status": "In force",
        "jurisdiction": "EU-wide",
        "countries": ["Germany", "France", "Netherlands", "Spain", "Italy", "Belgium"],
        "technologies": ["Electricity", "Natural Gas", "Grid"],
        "policy_type": "Market Report",
    },
    {
        "doc_id": "POL-008",
        "title": "Electricity Market Design Reform — EU 2024/1747 (Revised Internal Electricity Market Regulation)",
        "snippet": (
            "EU 2024/1747 reforms the Internal Electricity Market Regulation to accelerate low-cost renewables "
            "and protect consumers. Key changes: (1) Two-way Contracts for Difference (CfDs) mandatory for "
            "all new public support to nuclear, hydro, and wind/solar above thresholds; (2) Power Purchase "
            "Agreements (PPAs) — Member States must issue guarantees to unlock long-term corporate PPAs; "
            "(3) Peak shaving product: DSOs can procure demand reduction to avoid grid congestion; "
            "(4) Intraday market: gate closure time extended to 30 minutes before delivery; "
            "(5) Capacity mechanisms: must include storage and demand response alongside generation; "
            "(6) Bidding zones review: ENTSO-E must complete zonal configuration review by 2025."
        ),
        "type": "Policy",
        "date": "2024",
        "source": "EU — DG ENER",
        "status": "In force",
        "jurisdiction": "EU-wide",
        "countries": ["Germany", "France", "Netherlands", "Spain", "Italy", "Poland", "Belgium"],
        "technologies": ["Electricity", "Solar", "Wind", "Nuclear", "Storage", "Demand Response"],
        "policy_type": "Regulation",
    },
    # ── Market Intelligence Documents ────────────────────────────────────────
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

from app.infrastructure.db import DB_NAME
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
