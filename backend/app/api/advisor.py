"""Agentic Leafy AI advisor with LangChain ReAct agent + MongoDB MCP Server + conversation memory."""

import asyncio
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
        model = os.getenv("AZURE_FOUNDRY_MODEL", "claude-haiku-4-5")
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
            max_tokens=1024,
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
        logger.info("LLM: Anthropic direct (claude-haiku-4-5)")
        return ChatAnthropic(
            model="claude-haiku-4-5",
            api_key=anthropic_key,
            temperature=0.3,
            max_tokens=1024,
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

from app.infrastructure.db import DB_NAME
COLLECTION = "documents"


# ── Conversation Memory (MongoDB-backed) ─────────────────

_checkpointer_instance = None


def _get_checkpointer(mongo_client):
    """Return a MongoDBSaver checkpointer, or None if MongoDB is unavailable."""
    global _checkpointer_instance
    if _checkpointer_instance is None:
        try:
            from langgraph.checkpoint.mongodb import MongoDBSaver
            _checkpointer_instance = MongoDBSaver(mongo_client, db_name=DB_NAME)
            logger.info("MongoDBSaver checkpointer initialized (db=%s)", DB_NAME)
        except Exception as exc:
            logger.warning("MongoDBSaver unavailable — running without memory: %s", exc)
            return None
    return _checkpointer_instance


# ── Request / Response models ─────────────────────────────

class PositionInput(BaseModel):
    """Legacy format — kept for backwards compatibility."""
    id: str = ""
    instrument: str = ""
    type: str = ""
    quantity: float = 0
    avgPrice: float = 0
    currentPrice: float = 0
    unrealizedPnl: float = 0


class GeneratorInput(BaseModel):
    """Legacy format — kept for backwards compatibility."""
    id: str = ""
    name: str = ""
    region: str = ""
    fuel: str = ""
    capacity_mw: float = 0
    status: str = ""


class ChatHistoryItem(BaseModel):
    role: str
    content: str


class AdvisorRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    portfolio: list[dict] = Field(default_factory=list)  # Fleet assets or legacy positions
    generators: list[dict] = Field(default_factory=list)  # Context objects or legacy generators
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
    """Try to connect MongoDB MCP Server via stdio. Returns tools or [] on failure.

    Guards against hanging in Docker environments without npx:
    1. shutil.which() — fast check before spawning the subprocess at all.
    2. asyncio.wait_for(..., timeout=5) — kills the await if npx is present
       but the MCP server doesn't initialise in time.
    """
    import shutil

    if not shutil.which("npx"):
        logger.info("npx not found — skipping MCP server (built-in tools only)")
        return []

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
                        "--database",
                        "leafy-energy-markets",
                    ],
                    "transport": "stdio",
                }
            }
        )
        client = await asyncio.wait_for(stack.enter_async_context(mcp), timeout=5.0)
        tools = client.get_tools()
        logger.info("MCP server connected — %d tools available", len(tools))
        return tools
    except asyncio.TimeoutError:
        logger.info("MCP server timed out — using built-in tools only")
        return []
    except Exception as e:
        logger.info("MCP server unavailable: %s — using built-in tools only", e)
        return []


# ── LangChain agent builder ──────────────────────────────

def _build_agent(coll, portfolio: list[dict], generators: list[dict], mcp_tools: list | None = None, checkpointer=None):
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
        """Analyze the trader's fleet assets, live market context, and portfolio state. Returns fleet output by type, position gap, P&L, and market prices."""
        if not portfolio and not generators:
            return "No fleet or portfolio data available. Start the simulation to see live data."

        lines = []

        # Fleet assets (sent as portfolio from frontend)
        if portfolio:
            total_output = sum(a.get("currentOutputMw", 0) for a in portfolio)
            total_forecast = sum(a.get("forecastOutputMw", 0) for a in portfolio)
            total_capacity = sum(a.get("capacityMw", 0) for a in portfolio)

            by_type: dict[str, dict] = {}
            for a in portfolio:
                t = a.get("type", "unknown")
                if t not in by_type:
                    by_type[t] = {"count": 0, "outputMw": 0, "forecastMw": 0, "capacityMw": 0}
                by_type[t]["count"] += 1
                by_type[t]["outputMw"] += a.get("currentOutputMw", 0)
                by_type[t]["forecastMw"] += a.get("forecastOutputMw", 0)
                by_type[t]["capacityMw"] += a.get("capacityMw", 0)

            lines.append("## Fleet Status")
            lines.append(f"Total assets: {len(portfolio)}")
            lines.append(f"Total output: {total_output:,.0f} MW (forecast: {total_forecast:,.0f} MW)")
            lines.append(f"Total capacity: {total_capacity:,.0f} MW (utilisation: {total_output / total_capacity * 100:.0f}%)" if total_capacity else "")
            lines.append("")
            lines.append("By asset type:")
            for t, data in sorted(by_type.items(), key=lambda x: -x[1]["outputMw"]):
                variance = data["outputMw"] - data["forecastMw"]
                lines.append(f"  {t}: {data['count']} assets, {data['outputMw']:.0f} MW output "
                             f"(forecast {data['forecastMw']:.0f} MW, variance {variance:+.0f} MW, "
                             f"capacity {data['capacityMw']:.0f} MW)")

        # Context objects (prices, portfolio state, weather events)
        for ctx in generators:
            ctx_type = ctx.get("context", "")
            if ctx_type == "live_market_prices":
                lines.append("")
                lines.append("## Live Market Prices")
                for key in ("dayAhead", "intraday", "flexibility"):
                    val = ctx.get(key)
                    if val is not None:
                        lines.append(f"  {key}: EUR {val:.2f}/MWh")
                best = ctx.get("bestChannel", "")
                if best:
                    lines.append(f"  Best channel (highest price): {best}")

            elif ctx_type == "portfolio_state":
                lines.append("")
                lines.append("## Portfolio Position")
                committed = ctx.get("committedMwh", 0)
                forecast = ctx.get("forecastMwh", 0)
                gap = ctx.get("netGapMwh", 0)
                gap_type = ctx.get("gapType", "balanced")
                realised = ctx.get("realisedPnlEur", 0)
                unrealised = ctx.get("unrealisedPnlEur", 0)
                target = ctx.get("dailyTargetEur", 0)
                lines.append(f"  Committed: {committed:,.0f} MWh | Forecast: {forecast:,.0f} MWh")
                lines.append(f"  Net gap: {gap:+,.0f} MWh ({gap_type})")
                lines.append(f"  Realised P&L: EUR {realised:,.0f} (target EUR {target:,.0f}, {realised / target * 100:.0f}%)" if target else f"  Realised P&L: EUR {realised:,.0f}")
                lines.append(f"  Unrealised P&L: EUR {unrealised:,.0f}")

                allocs = ctx.get("allocationsByType", {})
                if allocs:
                    lines.append("  Allocations by type:")
                    for atype, alloc in allocs.items():
                        target_mwh = alloc.get("targetMwh", 0) if isinstance(alloc, dict) else 0
                        channel = alloc.get("marketChannel", "—") if isinstance(alloc, dict) else "—"
                        if target_mwh > 0:
                            lines.append(f"    {atype}: {target_mwh:.0f} MWh on {channel}")

            elif ctx_type == "weather_and_performance_events":
                events = ctx.get("events", [])
                if events:
                    lines.append("")
                    lines.append("## Recent Weather & Performance Events")
                    for ev in events[:8]:
                        etype = ev.get("eventType", "")
                        payload = ev.get("payload", {})
                        if etype == "WindForecastUpdated":
                            lines.append(f"  Wind: {payload.get('region', '?')} forecast {payload.get('forecastDeltaPct', 0):+.1f}% (wind {payload.get('windSpeedMs', 0)} m/s)")
                        elif etype == "SolarIrradianceForecastUpdated":
                            lines.append(f"  Solar: {payload.get('region', '?')} forecast {payload.get('forecastDeltaPct', 0):+.1f}% (irradiance {payload.get('irradianceWm2', 0)} W/m²)")
                        elif etype == "WeatherAlertIssued":
                            lines.append(f"  ALERT: {payload.get('region', '?')} — {payload.get('severity', '?')} ({payload.get('description', '')})")
                        elif etype == "PerformanceVarianceDetected":
                            lines.append(f"  Variance: {payload.get('assetName', '?')} ({payload.get('assetType', '?')}) {payload.get('variancePct', 0):+.1f}%")

        return "\n".join(lines) if lines else "No portfolio data available."

    @tool
    def get_generator_status() -> str:
        """Get current fleet asset status: per-asset output, forecast, variance, and utilisation for all renewable energy assets."""
        if not portfolio:
            return "No fleet data available. Start the simulation to see live asset data."

        online = [a for a in portfolio if a.get("status") == "online"]
        total_capacity = sum(a.get("capacityMw", 0) for a in portfolio)
        total_output = sum(a.get("currentOutputMw", 0) for a in online)

        lines = [
            f"Fleet assets: {len(portfolio)} ({len(online)} online)",
            f"Total capacity: {total_capacity:,.0f} MW",
            f"Current output: {total_output:,.0f} MW",
            "",
            "Per-asset breakdown:",
        ]
        for a in sorted(portfolio, key=lambda x: -x.get("currentOutputMw", 0)):
            name = a.get("name", a.get("id", "?"))
            region = a.get("region", "?")
            output = a.get("currentOutputMw", 0)
            forecast = a.get("forecastOutputMw", 0)
            capacity = a.get("capacityMw", 0)
            status = a.get("status", "unknown")
            util = a.get("utilizationPct", 0)
            lines.append(f"  - {name} ({region}): {output:.0f} MW output, "
                         f"forecast {forecast:.0f} MW, capacity {capacity:.0f} MW, "
                         f"util {util:.0f}%, status: {status}")

        return "\n".join(lines)


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

    domain_tools = [search_policies, search_market_intel, analyze_portfolio, get_generator_status, get_energy_news, web_search]
    all_tools = domain_tools + (mcp_tools or [])

    mcp_section = ""
    if mcp_tools:
        mcp_section = """

You also have direct access to the MongoDB Atlas database via MCP (Model Context Protocol).
Use the specialized search tools (search_policies, search_market_intel) for semantic document search — they handle embeddings automatically.
Use MCP MongoDB tools (find, aggregate) when you need to run custom queries, explore data schema, or access collections beyond the document store.
Key collections: documents (market intel + IEA policies), telemetry_events (generator time-series metrics), events (CQRS event store)."""

    system_prompt = f"""You are EnerLeafy, an AI energy market advisor at a European renewable energy IPP. You have access to live fleet data (8 EU assets: wind, solar, hydro, gas, battery, biomass), real-time market prices (Day-Ahead, Intraday, Flexibility), portfolio position (committed vs forecast MWh, P&L), weather events, EU/IEA policy documents, and web search.

## TOOL USAGE
Call ALL needed tools SIMULTANEOUSLY in your first action. Never repeat a tool call.
- ALWAYS call: `analyze_portfolio` (live fleet, prices, position)
- ONLY if asked: `search_policies`, `get_energy_news`, `web_search`, `get_generator_status`, `search_market_intel`

## RESPONSE FORMAT
Use clean markdown only — no JSON markers, no embedded code blocks.

### Market Assessment
2-3 sentences. State key prices (EUR/MWh) and market direction inline.

### Portfolio Impact
Key metrics as a short table or bullet list: output, committed, gap, P&L vs target.

### Recommended Actions
2-4 numbered actions. For each: **Action** — rationale — risk — priority.

### Pending Decisions
`**DECISION N** — [question]? → YES / NO`

Be direct. Quantify everything (EUR, %, MW). Reference EU regulations by name/article. No filler text.{mcp_section}"""

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
            config = {"configurable": {"thread_id": session_id}, "recursion_limit": 4}
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
        # Yield immediately so HTTP 200 + SSE headers flush before any async
        # setup. Without this, Istio's 15 s idle timeout kills the connection
        # producing a 503 before the first real event.
        yield f"data: {json.dumps({'type': 'thinking'})}\n\n"

        async with AsyncExitStack() as stack:
            try:
                checkpointer = _get_checkpointer(client)
            except Exception as e:
                logger.warning("Checkpointer unavailable: %s", e)
                checkpointer = None

            mcp_tools = await _enter_mcp_client(stack)
            try:
                agent, _ = _build_agent(coll, req.portfolio, req.generators, mcp_tools, checkpointer=checkpointer)
            except Exception as build_exc:
                logger.exception("Failed to build advisor agent")
                yield f"data: {json.dumps({'type': 'error', 'message': f'Agent setup failed: {build_exc}'})}\n\n"
                return

            from langchain_core.messages import HumanMessage

            config = {"configurable": {"thread_id": session_id}, "recursion_limit": 4}
            messages = [HumanMessage(content=req.message)]
            tool_calls_used: list[str] = []
            full_answer = ""
            tools_ever_started = False

            # Run astream_events in a background task and drain via a queue.
            # This lets us send SSE keepalive pings every PING_INTERVAL seconds
            # while the LLM is inferring — prevents Istio from closing the idle
            # connection during long model calls (which can take 30–60 s).
            PING_INTERVAL = 5.0   # seconds between keepalive pings
            HARD_TIMEOUT  = 300.0 # 5-minute wall-clock cap for the whole call

            q: asyncio.Queue[dict | None] = asyncio.Queue()

            async def _run_agent() -> None:
                try:
                    async for ev in agent.astream_events({"messages": messages}, config, version="v2"):
                        await q.put(ev)
                except Exception as exc:
                    await q.put({"__error__": str(exc)})
                finally:
                    await q.put(None)  # sentinel — always signal completion

            agent_task = asyncio.create_task(_run_agent())
            try:
                deadline = asyncio.get_event_loop().time() + HARD_TIMEOUT
                error_yielded = False

                while True:
                    remaining = deadline - asyncio.get_event_loop().time()
                    if remaining <= 0:
                        logger.warning("Advisor agent exceeded %ss hard timeout", HARD_TIMEOUT)
                        yield f"data: {json.dumps({'type': 'error', 'message': 'Agent timed out — please try again'})}\n\n"
                        error_yielded = True
                        break

                    try:
                        event = await asyncio.wait_for(q.get(), timeout=min(PING_INTERVAL, remaining))
                    except asyncio.TimeoutError:
                        # No event in PING_INTERVAL — send keepalive so Istio doesn't close the stream
                        yield f"data: {json.dumps({'type': 'ping'})}\n\n"
                        continue

                    if event is None:
                        break  # sentinel — agent finished cleanly

                    if "__error__" in event:
                        logger.error("Streaming advisor error: %s", event["__error__"])
                        yield f"data: {json.dumps({'type': 'error', 'message': event['__error__']})}\n\n"
                        error_yielded = True
                        break

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

                if not error_yielded:
                    yield f"data: {json.dumps({'type': 'done', 'session_id': session_id, 'tool_calls': tool_calls_used})}\n\n"

                    if full_answer and req.message:
                        try:
                            from datetime import datetime, timezone
                            doc = {
                                "timestamp": datetime.now(timezone.utc),
                                "question": req.message[:600],
                                "answer": full_answer[:1500],
                                "tool_calls": list(dict.fromkeys(tool_calls_used)),
                                "session_id": session_id,
                            }
                            await asyncio.to_thread(db["advisor_interactions"].insert_one, doc)
                        except Exception as save_err:
                            logger.warning("Failed to save advisor interaction: %s", save_err)

            finally:
                agent_task.cancel()
                try:
                    await agent_task
                except (asyncio.CancelledError, Exception):
                    pass

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
