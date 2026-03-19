"""Agentic Leafy AI advisor with LangChain ReAct agent + MongoDB MCP Server + conversation memory."""

import os
import uuid
import logging
from typing import Optional
from contextlib import AsyncExitStack

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.infrastructure.db import get_db
from app.infrastructure.search import search_docs

logger = logging.getLogger(__name__)


def _get_llm():
    """Auto-detect LLM provider: direct Anthropic API or Azure AI Foundry."""
    from langchain_anthropic import ChatAnthropic

    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key:
        return ChatAnthropic(
            model="claude-sonnet-4-20250514",
            api_key=anthropic_key,
            temperature=0.3,
            max_tokens=4096,
        )

    # Fall back to Azure AI Foundry
    base_url = os.getenv("AZURE_FOUNDRY_ENDPOINT", "").rstrip("/") + "/anthropic"
    return ChatAnthropic(
        model="claude-sonnet-4-20250514",
        anthropic_api_key=os.getenv("AZURE_FOUNDRY_API_KEY", ""),
        anthropic_api_url=base_url,
        temperature=0.3,
        max_tokens=4096,
    )


def _llm_configured() -> bool:
    """Check if any LLM provider is configured."""
    if os.getenv("ANTHROPIC_API_KEY"):
        return True
    if os.getenv("AZURE_FOUNDRY_API_KEY") and os.getenv("AZURE_FOUNDRY_ENDPOINT"):
        return True
    return False


router = APIRouter()

DB_NAME = os.getenv("MONGO_DB_NAME", "leafy-energy-markets")
COLLECTION = "documents"


# ── Conversation Memory (MongoDB-backed) ─────────────────

_checkpointer_instance = None


def _get_checkpointer(mongo_client):
    """Return a singleton MongoDBSaver checkpointer for conversation persistence."""
    global _checkpointer_instance
    if _checkpointer_instance is None:
        from langgraph.checkpoint.mongodb import MongoDBSaver
        _checkpointer_instance = MongoDBSaver(mongo_client, db_name=DB_NAME)
        logger.info("MongoDBSaver checkpointer initialized (db=%s)", DB_NAME)
    return _checkpointer_instance


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
    session_id: Optional[str] = None
    portfolio: list[PositionInput] = Field(default_factory=list)
    generators: list[GeneratorInput] = Field(default_factory=list)
    history: list[ChatHistoryItem] = Field(default_factory=list)


class SourceRef(BaseModel):
    title: str
    type: str
    snippet: str


class AdvisorResponse(BaseModel):
    response: str
    session_id: str = ""
    sources: list[SourceRef] = Field(default_factory=list)
    tool_calls: list[str] = Field(default_factory=list)


# ── MCP (Model Context Protocol) ─────────────────────────

async def _enter_mcp_client(stack: AsyncExitStack) -> list:
    """Try to connect MongoDB MCP Server via stdio. Returns tools or [] on failure."""
    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient

        mongo_uri = os.getenv("MONGO_URI", "")
        if not mongo_uri:
            logger.info("MONGO_URI not set — skipping MCP server")
            return []

        mcp = MultiServerMCPClient(
            {
                "mongodb": {
                    "command": "npx",
                    "args": [
                        "-y",
                        "mongodb-mcp-server",
                        "--readOnly",
                        "--connectionString",
                        mongo_uri,
                    ],
                    "transport": "stdio",
                }
            }
        )
        client = await stack.enter_async_context(mcp)
        tools = client.get_tools()
        logger.info("MCP server connected — %d tools available", len(tools))
        return tools
    except Exception as e:
        logger.info("MCP server unavailable: %s — using built-in tools only", e)
        return []


# ── LangChain agent builder ──────────────────────────────

def _build_agent(coll, portfolio: list[PositionInput], generators: list[GeneratorInput], mcp_tools: list | None = None, checkpointer=None):
    """Build a LangChain ReAct agent with domain tools + optional MCP tools + optional checkpointer."""
    from langchain_core.tools import tool
    from langgraph.prebuilt import create_react_agent

    @tool
    def search_policies(query: str) -> str:
        """Search IEA energy policies and EU regulations in the document database. Use this to find relevant policy information."""
        docs = search_docs(coll, query, limit=5, type_filter="Policy")
        if not docs:
            return "No policy documents found for this query."
        parts = []
        for d in docs:
            parts.append(f"- {d.get('title', 'Untitled')} ({d.get('source', '')}): {d.get('snippet', '')}")
        return "\n".join(parts)

    @tool
    def search_market_intel(query: str) -> str:
        """Search market research, ESG reports, and asset performance documents. Use this for market data and analysis."""
        docs = search_docs(coll, query, limit=5)
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

    domain_tools = [search_policies, search_market_intel, analyze_portfolio, get_generator_status, web_search]
    all_tools = domain_tools + (mcp_tools or [])

    mcp_section = ""
    if mcp_tools:
        mcp_section = """

You also have direct access to the MongoDB Atlas database via MCP (Model Context Protocol).
Use the specialized search tools (search_policies, search_market_intel) for semantic document search — they handle embeddings automatically.
Use MCP MongoDB tools (find, aggregate) when you need to run custom queries, explore data schema, or access collections beyond the document store.
Key collections: documents (market intel + IEA policies), telemetry_events (generator time-series metrics), events (CQRS event store)."""

    system_prompt = f"""You are EnerLeafy, an AI energy market investment advisor at a European energy trading firm. You have access to the trader's live portfolio positions, real-time power generator telemetry, IEA energy policies, vessel tracking data, and market research documents stored in MongoDB Atlas.

Your conversation history is persisted in MongoDB — you remember previous messages in this session.

IMPORTANT — For EVERY user question you MUST use your tools before answering:
1. ALWAYS call analyze_portfolio first to understand the trader's current positions, P&L, and risk exposure
2. ALWAYS call search_policies to find relevant EU/IEA energy regulations and policies
3. ALWAYS call web_search to get the latest market news, prices, and current events
4. If the user asks about generators or power supply, call get_generator_status
5. For market research or ESG data, call search_market_intel

After gathering data from ALL relevant tools, synthesize into a response that includes:
- Specific, actionable trade recommendations (buy/sell, instrument, quantity, target price, stop-loss)
- Portfolio risk assessment with specific numbers from the analyze_portfolio results
- Regulatory context citing specific IEA/EU policies by name
- Current market data and news from web search results
- Clear rationale for each recommendation

You use a hybrid search approach:
1. RAG via MongoDB Atlas Vector Search with VoyageAI voyage-finance-2 embeddings for internal documents and IEA policies
2. Web search via DuckDuckGo for real-time market data, news, and current events
{mcp_section}
Keep responses focused and structured with clear headings using markdown. Always cite your sources."""

    llm = _get_llm()

    agent = create_react_agent(
        llm,
        all_tools,
        prompt=system_prompt,
        checkpointer=checkpointer,
    )

    return agent, all_tools


# ── Endpoint ─────────────────────────────────────────────

@router.post("/advisor", response_model=AdvisorResponse)
async def advisor_chat(req: AdvisorRequest, client=Depends(get_db)):
    """Portfolio-aware AI advisor using LangChain ReAct agent with Claude + MCP + MongoDB memory."""
    if not _llm_configured():
        return AdvisorResponse(
            response="No LLM configured. Set ANTHROPIC_API_KEY (direct) or AZURE_FOUNDRY_API_KEY + AZURE_FOUNDRY_ENDPOINT (Azure) in deploy/.env to enable the AI advisor.",
            sources=[],
            tool_calls=[],
        )

    db = client[DB_NAME]
    coll = db[COLLECTION]

    # Resolve session ID — use provided or generate a new one
    session_id = req.session_id or str(uuid.uuid4())

    try:
        async with AsyncExitStack() as stack:
            # MongoDB conversation checkpointer
            checkpointer = _get_checkpointer(client)

            # Try to connect MongoDB MCP Server for direct DB access
            mcp_tools = await _enter_mcp_client(stack)

            agent, tools = _build_agent(coll, req.portfolio, req.generators, mcp_tools, checkpointer=checkpointer)

            from langchain_core.messages import HumanMessage

            # With checkpointer + thread_id, only send the new message.
            # The checkpointer automatically restores previous conversation state.
            config = {"configurable": {"thread_id": session_id}}
            messages = [HumanMessage(content=req.message)]

            result = await agent.ainvoke({"messages": messages}, config)

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
                docs = search_docs(coll, req.message, limit=3)
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
                session_id=session_id,
                sources=sources,
                tool_calls=tool_calls_used,
            )

    except Exception as e:
        logger.exception("Advisor agent error")
        return AdvisorResponse(
            response=f"I encountered an error while processing your request. Please try again.\n\nError: {str(e)}",
            session_id=session_id,
            sources=[],
            tool_calls=[],
        )
