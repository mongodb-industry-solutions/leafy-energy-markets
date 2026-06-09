"""LLM-powered compliance audit analysis using LangChain ReAct agent + MCP."""

import asyncio
import os
import json
import logging
from contextlib import AsyncExitStack

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.infrastructure.db import get_db
from app.infrastructure.search import search_docs
from app.api.advisor import _get_llm, _llm_configured, _enter_mcp_client, _get_checkpointer

logger = logging.getLogger(__name__)

router = APIRouter()

from app.infrastructure.db import DB_NAME
COLLECTION = "documents"


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


# ── LangChain agent builder ──────────────────────────────

def _build_audit_agent(coll, events: list[EventInput], regulation: str, mcp_tools: list | None = None, checkpointer=None):
    """Build a LangChain ReAct agent for compliance audit analysis."""
    from langchain_core.tools import tool
    from langgraph.prebuilt import create_react_agent

    @tool
    def search_policies(query: str) -> str:
        """Search IEA energy policies and EU regulations. Use this to find relevant regulatory context for the compliance analysis."""
        docs = search_docs(coll, query, limit=5, type_filter="Policy")
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

    domain_tools = [search_policies, reconstruct_state, get_event_timeline, web_search]
    all_tools = domain_tools + (mcp_tools or [])

    mcp_section = ""
    if mcp_tools:
        mcp_section = """

You also have direct access to the MongoDB Atlas database via MCP (Model Context Protocol).
Use MCP MongoDB tools to query the events collection or explore the database schema when needed for deeper analysis."""

    system_prompt = f"""You are a senior compliance counsel AI specializing in European energy market regulation for Independent Power Producers (IPPs). You produce executive-level regulatory opinions for compliance officers and legal teams preparing for ACER or national regulator review.

Your analysis must follow this exact structure — no deviations:

## Executive Summary
One concise paragraph: compliance verdict (compliant / non-compliant / requires remediation), the critical facts, and the headline regulatory exposure. Written for a C-suite reader.

## Applicable Regulatory Framework
The specific articles and provisions of {regulation} that govern this scenario. Include any directly relevant ACER guidelines, ENTSO-E network codes, or national transpositions. Cite by article number where possible.

## Compliance Assessment
For each material obligation under the regulation: state the requirement, whether the IPP met it, and the evidence from the event stream. Be direct — flag gaps without re-narrating every event.

## Financial & Operational Exposure
Quantify the risk: potential penalties, clawback amounts, imbalance charges, capacity derating, or access restrictions. Reference the penalty regime in the regulation where applicable.

## Mandatory Regulatory Reporting
What the IPP must file, to which authority (ACER, national NRA, TSO), and by when. Include REMIT transaction reporting obligations, settlement notifications, RRM submissions, or any other mandatory disclosures triggered by this scenario.

## Required Actions & Remediation Timeline
Concrete, numbered action items the IPP compliance team must take. Include responsible parties, deadlines, and any required regulator communication.

## Audit Trail Integrity Assessment
Whether the immutable event log (CQRS event sourcing, append-only store, versioned stream) provides sufficient evidence for regulatory defence. Note any gaps, missing events, or metadata issues that could weaken the audit position.

Rules:
- Do NOT reproduce a verbose event-by-event reconstruction. Use tools to gather facts, then synthesize.
- Use get_event_timeline to understand the sequence of facts — do not repeat it verbatim in the output.
- Use reconstruct_state only to verify specific numerical values or state at a critical moment.
- Search for regulatory documents to ground your legal analysis.
- Write for a compliance professional: precise, direct, actionable.
{mcp_section}"""

    llm = _get_llm()

    agent = create_react_agent(
        llm,
        all_tools,
        prompt=system_prompt,
        checkpointer=checkpointer,
    )

    return agent, all_tools


# ── Endpoint ─────────────────────────────────────────────

@router.post("/audit/analyze", response_model=AuditResponse)
async def analyze_audit_scenario(req: AuditRequest, client=Depends(get_db)):
    """AI-powered compliance audit analysis using LangChain ReAct agent with MCP."""
    if not _llm_configured():
        return AuditResponse(
            analysis="No LLM configured. Set ANTHROPIC_API_KEY (direct) or AZURE_FOUNDRY_API_KEY + AZURE_FOUNDRY_ENDPOINT (Azure) in deploy/.env to enable AI audit analysis.",
            sources=[],
            tool_calls=[],
        )

    db = client[DB_NAME]
    coll = db[COLLECTION]

    # Use scenario_id as thread_id for audit session memory
    thread_id = f"audit-{req.scenario_id}-v{req.current_version}"

    try:
        async with AsyncExitStack() as stack:
            checkpointer = _get_checkpointer(client)
            mcp_tools = await _enter_mcp_client(stack)

            agent, tools = _build_audit_agent(coll, req.events, req.regulation, mcp_tools, checkpointer=checkpointer)

            from langchain_core.messages import HumanMessage

            prompt = f"""Produce a compliance report for the following scenario:

**Scenario:** {req.scenario_title}
**Regulation:** {req.regulation}
**Description:** {req.description}
**Event stream:** {len(req.events)} events (current inspection point: version {req.current_version})

Steps:
1. Call get_event_timeline to understand the sequence of facts.
2. Call search_policies to retrieve the applicable regulatory provisions.
3. Call reconstruct_state only where a specific numerical or state value is needed to assess a compliance obligation.
4. Produce the structured IPP compliance report per your instructions — executive summary first, then obligations, exposure, reporting, actions, and audit trail assessment."""

            config = {"configurable": {"thread_id": thread_id}}
            result = await agent.ainvoke({"messages": [HumanMessage(content=prompt)]}, config)

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
                docs = search_docs(coll, f"{req.regulation} {req.scenario_title}", limit=3)
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


# ── Streaming audit endpoint ──────────────────────────────

@router.post("/audit/analyze/stream")
async def analyze_audit_stream(req: AuditRequest, client=Depends(get_db)):
    """SSE streaming compliance audit — emits tool events then streams tokens."""
    if not _llm_configured():
        async def _no_llm():
            yield f"data: {json.dumps({'type': 'error', 'message': 'No LLM configured.'})}\n\n"
        return StreamingResponse(_no_llm(), media_type="text/event-stream")

    db = client[DB_NAME]
    coll = db[COLLECTION]
    thread_id = f"audit-{req.scenario_id}-v{req.current_version}"

    PING_INTERVAL = 5.0
    HARD_TIMEOUT  = 300.0

    async def generate():
        async with AsyncExitStack() as stack:
            try:
                checkpointer = _get_checkpointer(client)
            except Exception:
                checkpointer = None

            try:
                mcp_tools = await _enter_mcp_client(stack)
            except Exception:
                mcp_tools = []

            agent, _ = _build_audit_agent(coll, req.events, req.regulation, mcp_tools, checkpointer=checkpointer)

            from langchain_core.messages import HumanMessage

            prompt = f"""Produce a compliance report for the following scenario:

**Scenario:** {req.scenario_title}
**Regulation:** {req.regulation}
**Description:** {req.description}
**Event stream:** {len(req.events)} events (current inspection point: version {req.current_version})

Steps:
1. Call get_event_timeline to understand the sequence of facts.
2. Call search_policies to retrieve the applicable regulatory provisions.
3. Call reconstruct_state only where a specific numerical or state value is needed to assess a compliance obligation.
4. Produce the structured IPP compliance report per your instructions — executive summary first, then obligations, exposure, reporting, actions, and audit trail assessment."""

            config = {"configurable": {"thread_id": thread_id}}
            tool_calls_used: list[str] = []

            try:
                agent_iter = agent.astream_events(
                    {"messages": [HumanMessage(content=prompt)]}, config, version="v2"
                )
                deadline = asyncio.get_event_loop().time() + HARD_TIMEOUT

                while True:
                    if asyncio.get_event_loop().time() > deadline:
                        logger.warning("Audit agent exceeded %ss hard timeout", HARD_TIMEOUT)
                        yield f"data: {json.dumps({'type': 'error', 'message': 'Analysis timed out.'})}\n\n"
                        break

                    try:
                        event = await asyncio.wait_for(
                            agent_iter.__anext__(),
                            timeout=PING_INTERVAL,
                        )
                    except asyncio.TimeoutError:
                        yield f"data: {json.dumps({'type': 'ping'})}\n\n"
                        continue
                    except StopAsyncIteration:
                        break

                    etype = event["event"]

                    if etype == "on_tool_start":
                        name = event.get("name", "")
                        if name and not name.startswith("__"):
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
                                yield f"data: {json.dumps({'type': 'token', 'text': content})}\n\n"
                            elif isinstance(content, list):
                                for part in content:
                                    if isinstance(part, dict) and part.get("type") == "text":
                                        text = part.get("text", "")
                                        if text:
                                            yield f"data: {json.dumps({'type': 'token', 'text': text})}\n\n"

                yield f"data: {json.dumps({'type': 'done', 'tool_calls': tool_calls_used})}\n\n"

            except Exception as e:
                logger.exception("Streaming audit error")
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
