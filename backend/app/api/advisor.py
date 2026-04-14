"""Agentic Leafy AI advisor with LangChain ReAct agent + MongoDB MCP Server + conversation memory."""

import os
import uuid
import json
import logging
from typing import Optional
from contextlib import AsyncExitStack

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import anthropic as _anthropic

from app.infrastructure.db import get_db
from app.infrastructure.search import search_docs

logger = logging.getLogger(__name__)

# ── Azure AI Foundry auth shims ───────────────────────────────────────────────
# The Anthropic SDK always injects `X-Api-Key` via auth_headers(). Azure APIM
# (grove-gateway) authenticates via `api-key` (subscription key) and will
# reject or conflict with the extra Anthropic header. These thin subclasses
# suppress auth_headers so only the `api-key` in default_headers reaches
# the gateway — no x-api-key leaks through.


class _AzureAnthropicSync(_anthropic.Anthropic):
    """Anthropic client that suppresses X-Api-Key for Azure APIM (uses `api-key` instead)."""

    @property
    def auth_headers(self) -> dict:  # type: ignore[override]
        return {}  # api-key is supplied via default_headers; no x-api-key sent

    def _validate_headers(self, *_: object) -> None:  # type: ignore[override]
        return  # Azure APIM auth is via `api-key`; SDK's X-Api-Key check is not applicable


class _AzureAnthropicAsync(_anthropic.AsyncAnthropic):
    """Async variant of _AzureAnthropicSync."""

    @property
    def auth_headers(self) -> dict:  # type: ignore[override]
        return {}

    def _validate_headers(self, headers: object, custom_headers: object) -> None:  # type: ignore[override]
        return


def _get_llm():
    """Auto-detect LLM provider: Azure AI Foundry → direct Anthropic API → error.

    Azure AI Foundry is the primary provider (configured via AZURE_FOUNDRY_* in deploy/.env).
    A real Anthropic key (sk-ant-*) in deploy/.env is used as fallback when Azure is not set.

    URL construction: ChatAnthropic passes base_url to the Anthropic SDK, which calls
    _enforce_trailing_slash() then concatenates the endpoint path (e.g. /v1/messages) via
    raw_path bytes — so the full gateway path is preserved correctly without double-slashes.
    """
    from langchain_anthropic import ChatAnthropic

    # 1. Azure AI Foundry (primary)
    azure_key = os.getenv("AZURE_FOUNDRY_API_KEY")
    azure_endpoint = os.getenv("AZURE_FOUNDRY_ENDPOINT")
    if azure_key and azure_endpoint:
        model = os.getenv("AZURE_FOUNDRY_MODEL", "claude-opus-4-6")
        base_url = azure_endpoint.rstrip("/")
        logger.info("LLM: Azure AI Foundry (%s) at %s", model, base_url)

        # Build ChatAnthropic then replace its @cached_property client slots with
        # our shims. Because @cached_property stores in __dict__, pre-populating
        # __dict__ causes Python's attribute lookup to bypass the descriptor.
        llm = ChatAnthropic(
            model=model,
            api_key=azure_key,  # required by pydantic validation; not sent in requests
            base_url=base_url,
            temperature=0.3,
            max_tokens=4096,
        )
        _common = dict(
            api_key=azure_key,
            base_url=base_url,
            default_headers={"api-key": azure_key},
        )
        llm.__dict__["_client"] = _AzureAnthropicSync(**_common)
        llm.__dict__["_async_client"] = _AzureAnthropicAsync(**_common)
        return llm

    # 2. Direct Anthropic API (fallback) — requires sk-ant-* key in deploy/.env
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    if anthropic_key.startswith("sk-ant-"):
        logger.info("LLM: Anthropic direct (claude-opus-4-6)")
        return ChatAnthropic(
            model="claude-opus-4-6",
            api_key=anthropic_key,
            temperature=0.3,
            max_tokens=4096,
        )

    raise ValueError("No LLM configured. Set AZURE_FOUNDRY_API_KEY + AZURE_FOUNDRY_ENDPOINT in deploy/.env.")


def _llm_configured() -> bool:
    """Check if any LLM provider is configured."""
    if os.getenv("AZURE_FOUNDRY_API_KEY") and os.getenv("AZURE_FOUNDRY_ENDPOINT"):
        return True
    if os.getenv("ANTHROPIC_API_KEY", "").startswith("sk-ant-"):
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
    def get_energy_prices() -> str:
        """Fetch live energy commodity prices: Brent crude, WTI crude, TTF natural gas, and Henry Hub gas. Returns current spot prices with recent change data."""
        import httpx
        lines = []

        # EIA petroleum spot prices (free, no key required for public endpoints)
        eia_key = os.getenv("EIA_API_KEY", "")
        try:
            params: dict = {
                "frequency": "daily",
                "data[0]": "value",
                "sort[0][column]": "period",
                "sort[0][direction]": "desc",
                "length": 2,
            }
            if eia_key:
                params["api_key"] = eia_key
            resp = httpx.get(
                "https://api.eia.gov/v2/petroleum/pri/spt/data/",
                params=params,
                timeout=8,
            )
            if resp.status_code == 200:
                data = resp.json().get("response", {}).get("data", [])
                seen: set[str] = set()
                for row in data:
                    name = row.get("series-description", row.get("product-name", ""))
                    val = row.get("value")
                    period = row.get("period", "")
                    key = row.get("product", name)
                    if key not in seen and val is not None:
                        seen.add(key)
                        lines.append(f"- {name}: ${val:.2f}/bbl ({period})")
        except Exception as e:
            lines.append(f"EIA API unavailable: {e}")

        # Fallback: web search for current prices if EIA returned nothing
        if not lines:
            try:
                from ddgs import DDGS
                with DDGS() as ddgs:
                    results = list(ddgs.text("Brent crude WTI TTF natural gas spot price today USD", max_results=3))
                for r in results:
                    lines.append(f"- {r.get('title', '')}: {r.get('body', '')[:200]}")
            except Exception as e:
                lines.append(f"Price data unavailable: {e}")

        return "\n".join(lines) if lines else "Energy price data currently unavailable."

    @tool
    def get_energy_news(topic: str = "European energy markets") -> str:
        """Fetch the latest energy market news headlines. Use this for breaking news on oil prices, gas supply, EU energy policy, OPEC decisions, or LNG markets."""
        import httpx
        news_key = os.getenv("NEWS_API_KEY", "")
        lines = []

        if news_key:
            try:
                resp = httpx.get(
                    "https://newsapi.org/v2/everything",
                    params={
                        "q": topic,
                        "language": "en",
                        "sortBy": "publishedAt",
                        "pageSize": 5,
                        "apiKey": news_key,
                    },
                    timeout=8,
                )
                if resp.status_code == 200:
                    articles = resp.json().get("articles", [])
                    for a in articles:
                        title = a.get("title", "")
                        source = a.get("source", {}).get("name", "")
                        desc = a.get("description", "")[:160]
                        published = a.get("publishedAt", "")[:10]
                        lines.append(f"- [{published}] **{title}** ({source}): {desc}")
            except Exception as e:
                lines.append(f"NewsAPI unavailable: {e}")

        # Fallback: DuckDuckGo news search
        if not lines:
            try:
                from ddgs import DDGS
                with DDGS() as ddgs:
                    results = list(ddgs.news(topic, max_results=5))
                for r in results:
                    date = str(r.get("date", ""))[:10]
                    lines.append(f"- [{date}] **{r.get('title', '')}** ({r.get('source', '')}): {r.get('body', '')[:160]}")
            except Exception as e:
                lines.append(f"News search unavailable: {e}")

        return "\n".join(lines) if lines else "No energy news found for the requested topic."

    @tool
    def web_search(query: str) -> str:
        """Search the web for real-time information about energy markets, oil prices, geopolitical events, weather, or any current topic. Use this when the document database doesn't have current information."""
        try:
            from ddgs import DDGS
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

    domain_tools = [search_policies, search_market_intel, analyze_portfolio, get_generator_status, get_energy_prices, get_energy_news, web_search]
    all_tools = domain_tools + (mcp_tools or [])

    mcp_section = ""
    if mcp_tools:
        mcp_section = """

You also have direct access to the MongoDB Atlas database via MCP (Model Context Protocol).
Use the specialized search tools (search_policies, search_market_intel) for semantic document search — they handle embeddings automatically.
Use MCP MongoDB tools (find, aggregate) when you need to run custom queries, explore data schema, or access collections beyond the document store.
Key collections: documents (market intel + IEA policies), telemetry_events (generator time-series metrics), events (CQRS event store)."""

    system_prompt = f"""You are EnerLeafy, an L3 autonomous AI energy market advisor (human-in-the-loop) at a European energy trading firm. You have access to the trader's live portfolio, power generator telemetry, IEA/EU energy policies, vessel tracking data, and market research in MongoDB Atlas.

Your conversation history is persisted in MongoDB — you remember previous messages in this session.

## TOOL USAGE (MANDATORY)
Call tools in your FIRST action ONLY. Call ALL needed tools SIMULTANEOUSLY in one batch. NEVER repeat a tool call.
REQUIRED for every question (call all at once in first action):
1. analyze_portfolio — current positions, P&L, and risk
2. search_policies — relevant EU/IEA regulations
3. get_energy_prices — live Brent/WTI/TTF/Henry Hub spot prices from EIA
4. get_energy_news — latest energy market headlines (topic: the user's question)
Optional (only if needed):
5. web_search — ONE comprehensive query for additional real-time context not covered by prices/news
6. get_generator_status — only if the question is about power supply or generation capacity
7. search_market_intel — only if specific research, ESG, or maritime data is needed
After receiving ALL tool results, write your complete final answer. Do NOT call more tools after receiving results unless critically needed for a specific fact you don't have.

## INLINE RICH ELEMENTS
You can embed rich UI elements inline in your markdown using @name{{...json...}} markers. The frontend renders these as interactive cards. Use them whenever you reference prices, positions, risks, or sources.

Available elements:
- @source_ref{{"title":"Doc title","type":"Research|ESG|Asset|Maritime|Policy","snippet":"Brief excerpt"}} — cite a document inline
- @price_card{{"instrument":"TTF Front-Month","price":42.50,"change":-2.3,"unit":"EUR/MWh"}} — show a live price badge
- @position_card{{"instrument":"DE Baseload Q2-26","type":"long","quantity":500,"avgPrice":78.20,"currentPrice":79.50,"pnl":650}} — show a portfolio position
- @risk_alert{{"level":"high","title":"Concentration risk","detail":"75% exposure to single commodity"}} — flag a risk

Rules for elements:
- The JSON inside braces must be valid JSON on a single line (no line breaks inside the marker)
- Place elements inline within your sentences, e.g. "The @price_card{{"instrument":"TTF","price":42.5,"change":-2.3}} is under pressure due to..."
- Use @source_ref for every document you cite from search results
- Use @price_card when mentioning specific commodity prices
- Use @position_card when discussing specific portfolio positions from analyze_portfolio
- Use @risk_alert for any risk flags (high/medium/low)
- You can use multiple elements in the same paragraph

## RESPONSE FORMAT
Structure your response concisely — minimize whitespace:

### Market Assessment
Brief synthesis of current conditions (2-3 sentences max). Use @price_card for key prices.

### Portfolio Impact
Key metrics from analyze_portfolio. Use @position_card for notable positions and @risk_alert for risk flags.

### Recommended Actions
Present 2-4 specific actions the trader should take. For each action:
- **Action**: Clear instruction (e.g., "Sell 200 units DE Baseload Q2-26 at EUR 79.50")
- **Rationale**: Why, citing specific data/policies (use @source_ref)
- **Risk**: What happens if wrong
- **Priority**: High/Medium/Low

### Pending Decisions (Human Approval Required)
As an L3 agent, you MUST present decisions that require human authorization:
- Positions to liquidate or significantly adjust — state exact instruments, quantities, and target prices
- Regulatory filings or reclamations to submit (e.g., REMIT reporting to ACER, complaint to national regulator)
- Hedging strategies that change portfolio risk profile
- Use the CQRS/Event Sourcing audit trail to reconstruct trade history using the .fold() method when analyzing compliance issues

Format each decision as: `**DECISION N** — [question]? → **YES** / NO`

## STYLE RULES
- Be direct and concise. No filler text.
- Use tables for numeric comparisons.
- Use bullet points, not paragraphs, for lists.
- Quantify everything: EUR amounts, percentages, MW, bbl.
- Reference specific EU regulations by name and article when relevant.
- When analyzing vessel cargo impact, connect it to specific portfolio positions.
- Do NOT add a separate "Sources" section — use @source_ref inline instead.

You use hybrid search: RAG via MongoDB Atlas Vector Search (VoyageAI voyage-finance-2) + DuckDuckGo web search for real-time data.
{mcp_section}"""

    llm = _get_llm()

    from langgraph.prebuilt import create_react_agent

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
            # MongoDB conversation checkpointer (optional — skip if DB is slow)
            try:
                checkpointer = _get_checkpointer(client)
            except Exception as e:
                logger.warning("Checkpointer unavailable: %s — running without memory", e)
                checkpointer = None

            # Try to connect MongoDB MCP Server for direct DB access
            mcp_tools = await _enter_mcp_client(stack)

            agent, tools = _build_agent(coll, req.portfolio, req.generators, mcp_tools, checkpointer=checkpointer)

            from langchain_core.messages import HumanMessage

            # With checkpointer + thread_id, only send the new message.
            # The checkpointer automatically restores previous conversation state.
            config = {"configurable": {"thread_id": session_id}, "recursion_limit": 8}
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


# ── Streaming endpoint ────────────────────────────────────

@router.post("/advisor/stream")
async def advisor_chat_stream(req: AdvisorRequest, client=Depends(get_db)):
    """SSE streaming advisor — emits tool_start/tool_end events then streams tokens in real-time."""
    if not _llm_configured():
        async def _no_llm():
            yield f"data: {json.dumps({'type': 'error', 'message': 'No LLM configured. Set ANTHROPIC_API_KEY or AZURE_FOUNDRY_* in deploy/.env.'})}\n\n"
        return StreamingResponse(_no_llm(), media_type="text/event-stream")

    session_id = req.session_id or str(uuid.uuid4())
    db = client[DB_NAME]
    coll = db[COLLECTION]

    async def generate():
        async with AsyncExitStack() as stack:
            try:
                checkpointer = _get_checkpointer(client)
            except Exception as e:
                logger.warning("Checkpointer unavailable: %s", e)
                checkpointer = None

            mcp_tools = await _enter_mcp_client(stack)
            agent, _ = _build_agent(coll, req.portfolio, req.generators, mcp_tools, checkpointer=checkpointer)

            from langchain_core.messages import HumanMessage

            config = {"configurable": {"thread_id": session_id}, "recursion_limit": 8}
            messages = [HumanMessage(content=req.message)]
            tool_calls_used: list[str] = []
            full_answer = ""
            tools_ever_started = False

            try:
                async for event in agent.astream_events({"messages": messages}, config, version="v2"):
                    etype = event["event"]

                    if etype == "on_tool_start":
                        name = event.get("name", "")
                        if name and not name.startswith("__"):
                            tools_ever_started = True
                            tool_calls_used.append(name)
                            yield f"data: {json.dumps({'type': 'tool_start', 'name': name})}\n\n"

                    elif etype == "on_tool_end":
                        name = event.get("name", "")
                        if name and not name.startswith("__"):
                            yield f"data: {json.dumps({'type': 'tool_end', 'name': name})}\n\n"

                    elif etype == "on_chat_model_stream":
                        chunk = event["data"].get("chunk")
                        if chunk:
                            content = getattr(chunk, "content", "")
                            if isinstance(content, str) and content:
                                if not tools_ever_started:
                                    yield f"data: {json.dumps({'type': 'reasoning', 'text': content})}\n\n"
                                else:
                                    full_answer += content
                                    yield f"data: {json.dumps({'type': 'token', 'text': content})}\n\n"
                            elif isinstance(content, list):
                                for part in content:
                                    if isinstance(part, dict) and part.get("type") == "text":
                                        text = part.get("text", "")
                                        if text:
                                            if not tools_ever_started:
                                                yield f"data: {json.dumps({'type': 'reasoning', 'text': text})}\n\n"
                                            else:
                                                full_answer += text
                                                yield f"data: {json.dumps({'type': 'token', 'text': text})}\n\n"

                yield f"data: {json.dumps({'type': 'done', 'session_id': session_id, 'tool_calls': tool_calls_used})}\n\n"

                # Save interaction so RAGAS evals can pick up real user queries
                if full_answer and req.message:
                    try:
                        from datetime import datetime, timezone
                        db["advisor_interactions"].insert_one({
                            "timestamp": datetime.now(timezone.utc),
                            "question": req.message[:600],
                            "answer": full_answer[:1500],
                            "tool_calls": list(dict.fromkeys(tool_calls_used)),  # deduplicated
                            "session_id": session_id,
                        })
                    except Exception as save_err:
                        logger.warning("Failed to save advisor interaction: %s", save_err)

            except Exception as e:
                logger.exception("Streaming advisor error")
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
