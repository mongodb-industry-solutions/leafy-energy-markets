"""Custom promptfoo assertion helpers for EnerLeafy AI agent evaluations."""


def get_assert(output: str, context: dict) -> dict | bool:
    """Dispatch to the named assertion in context["test"]["options"]["config"]["type"]."""
    config = context.get("test", {}).get("options", {}).get("config", {})
    assertion_type = config.get("type", "")

    if assertion_type == "uses_tools":
        return _uses_tools(output, context)
    elif assertion_type == "has_structure":
        return _has_structure(output, context)
    elif assertion_type == "cites_regulation":
        return _cites_regulation(output, context)

    return {"pass": False, "reason": f"Unknown assertion type: {assertion_type}"}


def _uses_tools(output: str, context: dict) -> dict:
    """Check that the agent called the expected tools."""
    config = context.get("test", {}).get("options", {}).get("config", {})
    expected = config.get("expected", [])
    if not expected:
        return {"pass": True, "reason": "No expected tools specified"}

    metadata = context.get("providerResponse", {}).get("metadata", {})
    tool_calls = metadata.get("tool_calls", [])

    missing = [t for t in expected if t not in tool_calls]
    if missing:
        return {
            "pass": False,
            "reason": f"Missing tool calls: {missing}. Got: {tool_calls}",
        }
    return {"pass": True, "reason": f"All expected tools called: {expected}"}


def _has_structure(output: str, context: dict) -> dict:
    """Validate response has markdown headers and is non-trivial (> 100 chars)."""
    if len(output) < 100:
        return {
            "pass": False,
            "reason": f"Response too short ({len(output)} chars, need > 100)",
        }

    has_headers = "#" in output
    if not has_headers:
        return {"pass": False, "reason": "Response missing markdown headers"}

    return {"pass": True, "reason": "Response has structure and sufficient length"}


def _cites_regulation(output: str, context: dict) -> dict:
    """Check that the response references regulation names from vars."""
    regulation = context.get("vars", {}).get("regulation", "")
    if not regulation:
        return {"pass": True, "reason": "No regulation specified in vars"}

    output_lower = output.lower()
    # Check for the regulation name or key terms from it
    reg_terms = [t.strip().lower() for t in regulation.replace("/", " ").split() if len(t.strip()) > 3]

    matched = [t for t in reg_terms if t in output_lower]
    if not matched:
        return {
            "pass": False,
            "reason": f"Response does not cite regulation '{regulation}'. "
                       f"Searched for terms: {reg_terms}",
        }
    return {
        "pass": True,
        "reason": f"Response cites regulation (matched terms: {matched})",
    }
