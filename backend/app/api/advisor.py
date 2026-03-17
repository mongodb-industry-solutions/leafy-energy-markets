"""Agentic Leafy AI advisor with LangChain ReAct agent."""

import os
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

class PositionInput(BaseModel):
    id: str
    instrument: str
    type: str
    quantity: float
    avgPrice: float
    currentPrice: float
    unrealizedPnl: float


class GeneratorInput(BaseModel):
    id: str
    name: str
    region: str
    fuel: str
    capacity_mw: float
    status: str


class ChatHistoryItem(BaseModel):
    role: str
    content: str


class AdvisorRequest(BaseModel):
    message: str
    portfolio: list[PositionInput] = Field(default_factory=list)
    generators: list[GeneratorInput] = Field(default_factory=list)
    history: list[ChatHistoryItem] = Field(default_factory=list)


class SourceRef(BaseModel):
    title: str
    type: str
    snippet: str


class AdvisorResponse(BaseModel):
    response: str
    sources: list[SourceRef] = Field(default_factory=list)
    tool_calls: list[str] = Field(default_factory=list)


# ── Search helpers (reuse logic from search.py) ──────────

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
    """Combined search: try vector first, fall back to text."""
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

def _build_agent(coll, portfolio: list[PositionInput], generators: list[GeneratorInput]):
    """Build a LangChain ReAct agent with domain tools."""
    from langchain_anthropic import ChatAnthropic
    from langchain_core.tools import tool
    from langgraph.prebuilt import create_react_agent

    @tool
    def search_policies(query: str) -> str:
        """Search IEA energy policies and EU regulations in the document database. Use this to find relevant policy information."""
        docs = _search_docs(coll, query, limit=5, type_filter="Policy")
        if not docs:
            return "No policy documents found for this query."
        parts = []
        for d in docs:
            parts.append(f"- {d.get('title', 'Untitled')} ({d.get('source', '')}): {d.get('snippet', '')}")
        return "\n".join(parts)

    @tool
    def search_market_intel(query: str) -> str:
        """Search market research, ESG reports, and asset performance documents. Use this for market data and analysis."""
        docs = _search_docs(coll, query, limit=5)
        # Filter to non-policy types
        filtered = [d for d in docs if d.get("type") in ("Research", "ESG", "Asset", "Maritime")]
        if not filtered:
            filtered = docs
        parts = []
        for d in filtered:
            parts.append(f"- [{d.get('type', '')}] {d.get('title', 'Untitled')}: {d.get('snippet', '')}")
        return "\n".join(parts) if parts else "No market intelligence documents found."

    @tool
    def analyze_portfolio() -> str:
        """Analyze the trader's current portfolio positions. Returns concentration breakdown, P&L summary, and risk flags."""
        if not portfolio:
            return "No portfolio positions available."

        total_value = sum(p.currentPrice * p.quantity for p in portfolio)
        total_pnl = sum(p.unrealizedPnl for p in portfolio)

        # Group by type
        by_type: dict[str, dict] = {}
        for p in portfolio:
            if p.type not in by_type:
                by_type[p.type] = {"count": 0, "value": 0, "pnl": 0}
            by_type[p.type]["count"] += 1
            by_type[p.type]["value"] += p.currentPrice * p.quantity
            by_type[p.type]["pnl"] += p.unrealizedPnl

        lines = [
            f"Total positions: {len(portfolio)}",
            f"Total portfolio value: EUR {total_value:,.0f}",
            f"Total unrealized P&L: EUR {total_pnl:,.0f}",
            "",
            "Breakdown by type:",
        ]
        for t, data in sorted(by_type.items()):
            pct = (data["value"] / total_value * 100) if total_value else 0
            lines.append(f"  {t}: {data['count']} positions, EUR {data['value']:,.0f} ({pct:.1f}%), P&L EUR {data['pnl']:,.0f}")

        # Risk flags
        losers = [p for p in portfolio if p.unrealizedPnl < -500]
        if losers:
            lines.append("")
            lines.append("Risk flags (positions with > EUR 500 unrealized loss):")
            for p in losers:
                lines.append(f"  - {p.instrument}: EUR {p.unrealizedPnl:,.0f}")

        return "\n".join(lines)

    @tool
    def get_generator_status() -> str:
        """Get current status of power generators/substations in the network. Returns capacity, fuel mix, and production summary."""
        if not generators:
            return "No generator data available. Start the telemetry generator to see live data."

        total_capacity = sum(g.capacity_mw for g in generators)
        online = [g for g in generators if g.status == "online"]
        total_online = sum(g.capacity_mw for g in online)

        # Fuel mix
        by_fuel: dict[str, float] = {}
        for g in generators:
            by_fuel[g.fuel] = by_fuel.get(g.fuel, 0) + g.capacity_mw

        lines = [
            f"Total generators: {len(generators)} ({len(online)} online)",
            f"Total capacity: {total_capacity:,.0f} MW",
            f"Online capacity: {total_online:,.0f} MW",
            "",
            "Fuel mix:",
        ]
        for fuel, mw in sorted(by_fuel.items(), key=lambda x: -x[1]):
            pct = (mw / total_capacity * 100) if total_capacity else 0
            lines.append(f"  {fuel}: {mw:,.0f} MW ({pct:.1f}%)")

        lines.append("")
        lines.append("Top producers:")
        for g in sorted(generators, key=lambda x: -x.capacity_mw)[:5]:
            lines.append(f"  - {g.name} ({g.region}): {g.capacity_mw} MW [{g.fuel}] - {g.status}")

        return "\n".join(lines)

    @tool
    def web_search(query: str) -> str:
        """Search the web for real-time information about energy markets, oil prices, geopolitical events, weather, or any current topic. Use this when the document database doesn't have current information."""
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

    tools = [search_policies, search_market_intel, analyze_portfolio, get_generator_status, web_search]

    system_prompt = """You are EnerLeafy, an AI energy market investment advisor at a European energy trading firm. You have access to the trader's live portfolio positions, real-time power generator telemetry, IEA energy policies, vessel tracking data, and market research documents stored in MongoDB Atlas.

Document search uses VoyageAI voyage-finance-2 embeddings (domain-specific finance model) for semantic retrieval. You also have web search for real-time market data.

You use a hybrid search approach:
1. RAG (Retrieval-Augmented Generation) via MongoDB Atlas Vector Search with voyage-finance-2 embeddings for internal documents and IEA policies
2. Web search via DuckDuckGo for real-time market data, news, and current events

Provide specific, actionable investment recommendations grounded in data. Always cite your sources. When analyzing the portfolio, use the analyze_portfolio tool. When you need market data or policy information, use the search tools. For current events or real-time prices, use web_search.

Keep responses focused and structured with clear headings. If you recommend trades, explain the rationale."""

    base_url = os.getenv("AZURE_FOUNDRY_ENDPOINT", "").rstrip("/") + "/anthropic"
    llm = ChatAnthropic(
        model="claude-opus-4-6",
        anthropic_api_key=os.getenv("AZURE_FOUNDRY_API_KEY", ""),
        anthropic_api_url=base_url,
        temperature=0.3,
        max_tokens=2048,
    )

    agent = create_react_agent(
        llm,
        tools,
        prompt=system_prompt,
    )

    return agent, tools


# ── Endpoint ─────────────────────────────────────────────

@router.post("/advisor", response_model=AdvisorResponse)
async def advisor_chat(req: AdvisorRequest, client=Depends(get_db)):
    """Portfolio-aware AI advisor using LangChain ReAct agent with Claude on Azure AI Foundry."""
    api_key = os.getenv("AZURE_FOUNDRY_API_KEY")
    endpoint = os.getenv("AZURE_FOUNDRY_ENDPOINT")
    if not api_key or not endpoint:
        return AdvisorResponse(
            response="Azure AI Foundry not configured. Set AZURE_FOUNDRY_API_KEY and AZURE_FOUNDRY_ENDPOINT in deploy/.env to enable the AI advisor.",
            sources=[],
            tool_calls=[],
        )

    db = client[DB_NAME]
    coll = db[COLLECTION]

    try:
        agent, tools = _build_agent(coll, req.portfolio, req.generators)

        # Build message history
        from langchain_core.messages import HumanMessage, AIMessage

        messages = []
        for h in req.history[-6:]:  # Keep last 6 messages for context
            if h.role == "user":
                messages.append(HumanMessage(content=h.content))
            else:
                messages.append(AIMessage(content=h.content))
        messages.append(HumanMessage(content=req.message))

        result = agent.invoke({"messages": messages})

        # Extract the final response and tool calls
        response_text = ""
        tool_calls_used = []
        sources = []

        for msg in result["messages"]:
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                for tc in msg.tool_calls:
                    tool_calls_used.append(tc.get("name", "unknown"))
            if hasattr(msg, "content") and isinstance(msg.content, str):
                response_text = msg.content  # Last AI message wins

        # Try to extract sources from search results
        try:
            docs = _search_docs(coll, req.message, limit=3)
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

        return AdvisorResponse(
            response=response_text,
            sources=sources,
            tool_calls=tool_calls_used,
        )

    except Exception as e:
        logger.exception("Advisor agent error")
        return AdvisorResponse(
            response=f"I encountered an error while processing your request. Please try again.\n\nError: {str(e)}",
            sources=[],
            tool_calls=[],
        )
