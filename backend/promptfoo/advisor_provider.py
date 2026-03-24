"""Promptfoo Python provider for the EnerLeafy advisor agent.

Usage in promptfooconfig.yaml:
  providers:
    - python:promptfoo/advisor_provider.py
"""

import asyncio
import os
import sys

# Ensure the backend package is importable
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# Load env the same way main.py does (backend/ -> project root)
from dotenv import load_dotenv

_PROJECT_ROOT = os.path.abspath(os.path.join(_BACKEND_DIR, ".."))
load_dotenv(os.path.join(_PROJECT_ROOT, "deploy", ".env"), override=True)
load_dotenv(os.path.join(_BACKEND_DIR, ".env"), override=True)

# Clear shell-level vars that hijack LLM routing (same as main.py)
for _var in ("ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL"):
    os.environ.pop(_var, None)

from app.infrastructure.db import get_client
from app.api.advisor import _build_agent, PositionInput, GeneratorInput

DB_NAME = os.getenv("MONGO_DB_NAME", "leafy-energy-markets")
COLLECTION = "documents"


def call_api(prompt: str, options: dict, context: dict) -> dict:
    """Promptfoo entry point. Runs the advisor agent and returns output + metadata."""
    return asyncio.run(_call(prompt, options, context))


async def _call(prompt: str, options: dict, context: dict) -> dict:
    vars_ = context.get("vars", {})

    # Build portfolio from vars if provided, otherwise empty
    portfolio = []
    if vars_.get("portfolio"):
        for p in vars_["portfolio"]:
            portfolio.append(PositionInput(**p))

    generators = []
    if vars_.get("generators"):
        for g in vars_["generators"]:
            generators.append(GeneratorInput(**g))

    # Get MongoDB collection for search tools
    client = get_client()
    db = client[DB_NAME]
    coll = db[COLLECTION]

    # Build agent without checkpointer or MCP (eval doesn't need memory/DB access)
    agent, tools = _build_agent(coll, portfolio, generators, mcp_tools=None, checkpointer=None)

    from langchain_core.messages import HumanMessage

    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=prompt)]},
        {"configurable": {"thread_id": "promptfoo-eval"}},
    )

    # Extract response text and tool calls
    response_text = ""
    tool_calls_used = []

    for msg in result["messages"]:
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                tool_calls_used.append(tc.get("name", "unknown"))
        if hasattr(msg, "content") and isinstance(msg.content, str):
            response_text = msg.content  # Last AI message wins

    return {
        "output": response_text,
        "metadata": {"tool_calls": tool_calls_used},
    }
