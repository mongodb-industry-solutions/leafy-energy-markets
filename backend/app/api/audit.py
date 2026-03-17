"""LLM-powered compliance audit analysis using LangChain ReAct agent."""

import os
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.infrastructure.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter()

DB_NAME = os.getenv("MONGO_DB_NAME", "leafy-energy-markets")
COLLECTION = "documents"
VECTOR_INDEX = "vector_index"


# ── Request / Response models ─────────────────────────────

class EventInput(BaseModel):
    streamId: str
    streamType: str
    version: int
    eventType: str
    timestamp: str
    payload: dict
    metadata: dict = Field(default_factory=dict)


class AuditRequest(BaseModel):
    scenario_id: str
    scenario_title: str
    regulation: str
    description: str
    events: list[EventInput]
    current_version: int


class SourceRef(BaseModel):
    title: str
    type: str
    snippet: str


class AuditResponse(BaseModel):
    analysis: str
    sources: list[SourceRef] = Field(default_factory=list)
    tool_calls: list[str] = Field(default_factory=list)


# ── Search helpers ────────────────────────────────────────

def _vector_search(coll, query_embedding: list[float], limit: int, type_filter: Optional[str] = None):
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


def _text_search(coll, query: str, limit: int, type_filter: Optional[str] = None):
    filter_doc: dict = {
        "$or": [
            {"title": {"$regex": query, "$options": "i"}},
            {"snippet": {"$regex": query, "$options": "i"}},
        ]
    }
    if type_filter:
        filter_doc["type"] = type_filter
    return list(coll.find(filter_doc, {"embedding": 0}).limit(limit))


def _search_docs(coll, query: str, limit: int = 5, type_filter: Optional[str] = None) -> list[dict]:
    try:
        from app.infrastructure.embeddings import embed_query
        embedding = embed_query(query)
        results = _vector_search(coll, embedding, limit, type_filter)
        if results:
            return results
    except Exception:
        pass
    return _text_search(coll, query, limit, type_filter)


# ── LangChain agent builder ──────────────────────────────

def _build_audit_agent(coll, events: list[EventInput], regulation: str):
    """Build a LangChain ReAct agent for compliance audit analysis."""
    from langchain_anthropic import ChatAnthropic
    from langchain_core.tools import tool
    from langgraph.prebuilt import create_react_agent

    @tool
    def search_policies(query: str) -> str:
        """Search IEA energy policies and EU regulations. Use this to find relevant regulatory context for the compliance analysis."""
        docs = _search_docs(coll, query, limit=5, type_filter="Policy")
        if not docs:
            return "No policy documents found for this query."
        parts = []
        for d in docs:
            parts.append(f"- {d.get('title', 'Untitled')} ({d.get('source', '')}): {d.get('snippet', '')}")
        return "\n".join(parts)

    @tool
    def reconstruct_state(up_to_version: int) -> str:
        """Reconstruct the aggregate state at a specific event version by folding events up to that version. This simulates the fold() function used in CQRS event sourcing."""
        state: dict = {}
        for evt in events:
            if evt.version > up_to_version:
                break
            state["_version"] = evt.version
            state["_eventType"] = evt.eventType
            state["_streamId"] = evt.streamId
            state["_timestamp"] = evt.timestamp

            if evt.eventType == "TradeExecuted":
                prev_pos = state.get("net_position", 0)
                state["portfolio_id"] = evt.payload.get("portfolio_id")
                state["instrument_id"] = evt.payload.get("instrument_id")
                state["last_trade_price"] = evt.payload.get("price")
                state["net_position"] = prev_pos + evt.payload.get("quantity", 0)
                state["trade_count"] = state.get("trade_count", 0) + 1
            elif evt.eventType == "MeterReadingRecorded":
                state["meter_id"] = evt.payload.get("meter_id")
                state["last_reading"] = evt.payload.get("reading")
                if evt.metadata.get("corrects_version"):
                    state["correction_applied"] = True
                    state["corrects_version"] = evt.metadata["corrects_version"]
            elif evt.eventType == "PriceTickRecorded":
                state["last_price"] = evt.payload.get("price")
                state["price_type"] = evt.metadata.get("price_type", "market")
            elif evt.eventType == "FlexibilityBidSubmitted":
                state["bid_id"] = evt.payload.get("bid_id")
                state["capacity_mw"] = evt.payload.get("capacity_mw")
                state["bid_price"] = evt.payload.get("price_eur_per_mwh")
            elif evt.eventType == "FlexibilityActivated":
                state["activated"] = True
                state["activated_by"] = evt.payload.get("activated_by")
            elif evt.eventType == "FlexibilityDeliveryVerified":
                state["delivered_mw"] = evt.payload.get("delivered_mw")
                state["methodology"] = evt.payload.get("methodology")
                state["result"] = evt.payload.get("result")
            elif evt.eventType == "CrossBorderFlowRecorded":
                state["last_flow_tso"] = evt.payload.get("tso")
                state["ram_mw"] = evt.payload.get("ram_mw")
            elif evt.eventType == "CapacityAllocationRequested":
                state["requested_mw"] = evt.payload.get("requested_mw")
                state["participant"] = evt.payload.get("participant")
            elif evt.eventType == "CongestionRevenueDistributed":
                state["congestion_revenue"] = evt.payload.get("total_revenue_eur")
            else:
                # Generic: merge payload into state
                for k, v in evt.payload.items():
                    state[k] = v

        return json.dumps(state, indent=2, default=str)

    @tool
    def get_event_timeline() -> str:
        """Get the full timeline of events in this compliance scenario. Shows each event with timestamp, type, and key payload data."""
        lines = []
        for evt in events:
            payload_summary = ", ".join(f"{k}={v}" for k, v in list(evt.payload.items())[:4])
            lines.append(f"v{evt.version} [{evt.timestamp}] {evt.eventType}: {payload_summary}")
        return "\n".join(lines)

    @tool
    def web_search(query: str) -> str:
        """Search the web for real-time regulatory information, case law, ACER decisions, or current EU energy regulation updates."""
        try:
            from duckduckgo_search import DDGS
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=5))
            if not results:
                return "No web results found."
            parts = []
            for r in results:
                parts.append(f"- **{r.get('title', '')}**: {r.get('body', '')} (Source: {r.get('href', '')})")
            return "\n".join(parts)
        except Exception as e:
            return f"Web search unavailable: {e}"

    tools = [search_policies, reconstruct_state, get_event_timeline, web_search]

    system_prompt = f"""You are a compliance auditor AI specializing in European energy market regulation. You are analyzing a specific compliance scenario related to {regulation}.

Your job is to:
1. Examine the event stream using the reconstruct_state and get_event_timeline tools
2. Search for relevant regulatory context using the search_policies tool
3. Provide a detailed compliance analysis explaining:
   - What happened in this scenario (based on the events)
   - What the applicable regulation requires
   - Whether the parties are compliant
   - What the financial and regulatory implications are
   - How the CQRS event sourcing architecture ensures audit integrity

Be specific about event versions, timestamps, and monetary amounts. Reference the regulation by name.
Use the voyage-finance-2 embedding model results for regulatory document search.
Keep your analysis structured with clear headings."""

    base_url = os.getenv("AZURE_FOUNDRY_ENDPOINT", "").rstrip("/") + "/anthropic"
    llm = ChatAnthropic(
        model="claude-opus-4-6",
        anthropic_api_key=os.getenv("AZURE_FOUNDRY_API_KEY", ""),
        anthropic_api_url=base_url,
        temperature=0.2,
        max_tokens=2048,
    )

    agent = create_react_agent(
        llm,
        tools,
        prompt=system_prompt,
    )

    return agent, tools


# ── Endpoint ─────────────────────────────────────────────

@router.post("/audit/analyze", response_model=AuditResponse)
async def analyze_audit_scenario(req: AuditRequest, client=Depends(get_db)):
    """AI-powered compliance audit analysis using LangChain ReAct agent."""
    api_key = os.getenv("AZURE_FOUNDRY_API_KEY")
    endpoint = os.getenv("AZURE_FOUNDRY_ENDPOINT")
    if not api_key or not endpoint:
        return AuditResponse(
            analysis="Azure AI Foundry not configured. Set AZURE_FOUNDRY_API_KEY and AZURE_FOUNDRY_ENDPOINT in deploy/.env to enable AI audit analysis.",
            sources=[],
            tool_calls=[],
        )

    db = client[DB_NAME]
    coll = db[COLLECTION]

    try:
        agent, tools = _build_audit_agent(coll, req.events, req.regulation)

        from langchain_core.messages import HumanMessage

        prompt = f"""Analyze this compliance scenario:

**Scenario:** {req.scenario_title}
**Regulation:** {req.regulation}
**Description:** {req.description}

The event stream has {len(req.events)} events. The user is currently viewing event version {req.current_version}.

Please reconstruct the state at version {req.current_version}, review the full event timeline, and search for any relevant regulatory policies. Then provide a comprehensive compliance analysis."""

        result = agent.invoke({"messages": [HumanMessage(content=prompt)]})

        response_text = ""
        tool_calls_used = []
        sources = []

        for msg in result["messages"]:
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                for tc in msg.tool_calls:
                    tool_calls_used.append(tc.get("name", "unknown"))
            if hasattr(msg, "content") and isinstance(msg.content, str):
                response_text = msg.content

        # Extract relevant sources
        try:
            docs = _search_docs(coll, f"{req.regulation} {req.scenario_title}", limit=3)
            sources = [
                SourceRef(
                    title=d.get("title", ""),
                    type=d.get("type", ""),
                    snippet=d.get("snippet", ""),
                )
                for d in docs
            ]
        except Exception:
            pass

        return AuditResponse(
            analysis=response_text,
            sources=sources,
            tool_calls=tool_calls_used,
        )

    except Exception as e:
        logger.exception("Audit analysis error")
        return AuditResponse(
            analysis=f"Error during compliance analysis: {str(e)}",
            sources=[],
            tool_calls=[],
        )
