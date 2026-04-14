"""RAGAS evaluation runner for the Leafy Energy Markets RAG pipeline.

Evaluates seven metrics per test question:
  - faithfulness        : RAGAS — is the answer grounded in retrieved contexts?
  - answer_relevancy    : LLM judge — is the answer relevant to the question?
  - context_relevance   : LLM judge — are the retrieved contexts relevant?
  - topic_adherence     : RAGAS / LLM judge — does the agent stay on the expected topic?
  - tool_call_accuracy  : RAGAS / computed — are the right tools called?
  - tool_call_f1        : computed — precision/recall F1 on tool usage vs expected
  - agent_goal_accuracy : RAGAS / LLM judge — did the agent achieve the stated goal?
"""

import asyncio
import logging
import re
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# ── Test dataset ──────────────────────────────────────────────────────────────

TEST_CASES = [
    {
        "id": "tc-01",
        "question": "What is the impact of EU carbon market regulations on energy trading portfolios?",
        "category": "Policy",
        "search_type": "Policy",
        "reference": "EU ETS regulations raise compliance costs, increase carbon price risk exposure, and require traders to hold allowances matching their emissions. Portfolios must account for carbon price volatility and hedging costs.",
        "expected_tools": ["search_policies", "analyze_portfolio"],
        "topics": ["EU carbon market", "ETS", "energy trading", "compliance"],
    },
    {
        "id": "tc-02",
        "question": "How does REMIT regulation affect market manipulation detection in energy trading?",
        "category": "Compliance",
        "search_type": "Policy",
        "reference": "REMIT (EU 1227/2011) prohibits insider trading and market manipulation in wholesale energy markets. It requires traders to report suspicious transactions to ACER and national regulators.",
        "expected_tools": ["search_policies"],
        "topics": ["REMIT", "market manipulation", "ACER", "EU energy regulation"],
    },
    {
        "id": "tc-03",
        "question": "What are the key drivers of European natural gas price volatility?",
        "category": "Market Intelligence",
        "search_type": None,
        "reference": "Key drivers include LNG supply disruptions, Russian pipeline flows, storage levels, weather demand, and TTF spot market dynamics. Geopolitical events and seasonal demand are major volatility sources.",
        "expected_tools": ["search_market_intel", "web_search"],
        "topics": ["natural gas", "TTF", "energy prices", "European gas market"],
    },
    {
        "id": "tc-04",
        "question": "How does REPowerEU policy affect renewable energy investment strategies?",
        "category": "Policy",
        "search_type": "Policy",
        "reference": "REPowerEU accelerates renewable deployment targets, increases permitting speed, and provides funding mechanisms. It shifts investment toward solar, wind, and green hydrogen, reducing dependence on fossil fuel imports.",
        "expected_tools": ["search_policies", "search_market_intel"],
        "topics": ["REPowerEU", "renewable energy", "EU energy policy", "investment"],
    },
    {
        "id": "tc-05",
        "question": "What is the EU ETS carbon price outlook and its impact on power generation costs?",
        "category": "Market Intelligence",
        "search_type": None,
        "reference": "EU ETS carbon prices directly affect generation cost merit order. Higher carbon prices increase gas and coal plant costs, boosting renewable competitiveness. Price forecasts depend on supply caps and free allowance phase-out.",
        "expected_tools": ["search_policies", "web_search", "analyze_portfolio"],
        "topics": ["EU ETS", "carbon price", "power generation", "merit order"],
    },
    {
        "id": "tc-06",
        "question": "What are the compliance requirements for cross-border electricity trading in the EU?",
        "category": "Compliance",
        "search_type": "Policy",
        "reference": "Cross-border trading requires compliance with CACM regulation, capacity allocation through market coupling, REMIT reporting obligations, and adherence to ENTSO-E operational security standards.",
        "expected_tools": ["search_policies"],
        "topics": ["cross-border trading", "CACM", "market coupling", "ENTSO-E", "EU electricity"],
    },
]

# ── LLM judge helpers ─────────────────────────────────────────────────────────


async def _llm_judge_score(llm, prompt: str) -> float:
    """Ask LLM to return a 0.0–1.0 score. Returns 0.5 on failure."""
    from langchain_core.messages import HumanMessage

    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        text = response.content if hasattr(response, "content") else str(response)
        # Extract first decimal number in [0,1] range
        match = re.search(r"\b(0(?:\.\d+)?|1(?:\.0+)?)\b", text.strip())
        return round(float(match.group(1)), 3) if match else 0.5
    except Exception as exc:
        logger.warning("LLM judge call failed: %s", exc)
        return 0.5


async def _score_answer_relevancy(llm, question: str, answer: str) -> float:
    prompt = (
        "You are a strict evaluator for a RAG pipeline.\n"
        "Rate how relevant and complete this answer is for the given question.\n\n"
        f"Question: {question}\n\n"
        f"Answer: {answer}\n\n"
        "Return ONLY a decimal number between 0.0 (completely irrelevant) "
        "and 1.0 (perfectly relevant and complete). No other text."
    )
    return await _llm_judge_score(llm, prompt)


async def _score_context_relevance(llm, question: str, contexts: list[str]) -> float:
    if not contexts:
        return 0.0
    ctx_block = "\n".join(f"- {c[:250]}" for c in contexts[:5])
    prompt = (
        "You are a strict evaluator for a RAG pipeline.\n"
        "Rate how well the retrieved documents below help answer the question.\n\n"
        f"Question: {question}\n\n"
        f"Retrieved contexts:\n{ctx_block}\n\n"
        "Return ONLY a decimal number between 0.0 (contexts completely irrelevant) "
        "and 1.0 (contexts highly relevant and sufficient). No other text."
    )
    return await _llm_judge_score(llm, prompt)


def _compute_tool_call_f1(called: list[str], expected: list[str]) -> tuple[float, float, float]:
    """Precision, recall, F1 on tool name sets (order-independent, no LLM needed)."""
    called_set = set(called)
    expected_set = set(expected)
    if not expected_set and not called_set:
        return 1.0, 1.0, 1.0
    if not expected_set:
        return 0.0, 1.0, 0.0
    if not called_set:
        return 1.0, 0.0, 0.0
    precision = len(called_set & expected_set) / len(called_set)
    recall = len(called_set & expected_set) / len(expected_set)
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    return round(precision, 3), round(recall, 3), round(f1, 3)


def _build_ragas_llm():
    """Build a RAGAS-native llm_factory LLM from the same Azure/Anthropic env vars.

    For Azure we suppress the Anthropic SDK's `x-api-key` auth_headers so only
    the `api-key` subscription key reaches the Azure APIM gateway.
    """
    import os
    from anthropic import Anthropic, AsyncAnthropic
    from ragas.llms import llm_factory

    azure_key = os.getenv("AZURE_FOUNDRY_API_KEY")
    azure_endpoint = os.getenv("AZURE_FOUNDRY_ENDPOINT", "").rstrip("/")
    model = os.getenv("AZURE_FOUNDRY_MODEL", "claude-opus-4-6")

    if azure_key and azure_endpoint:
        class _AzureSync(Anthropic):
            @property
            def auth_headers(self) -> dict:  # type: ignore[override]
                return {}

            def _validate_headers(self, *_: object) -> None:  # type: ignore[override]
                return  # Azure APIM uses `api-key`; SDK's X-Api-Key check not applicable

        client = _AzureSync(
            api_key=azure_key,
            base_url=azure_endpoint,
            default_headers={"api-key": azure_key},
        )
        return llm_factory(model, provider="anthropic", client=client)

    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    if anthropic_key.startswith("sk-ant-"):
        return llm_factory("claude-opus-4-6", provider="anthropic", client=Anthropic(api_key=anthropic_key))

    raise ValueError("No LLM configured for RAGAS agent metrics.")


# ── Core runner ───────────────────────────────────────────────────────────────


async def run_ragas_evaluation(db, run_tag: str = "default") -> dict:
    """Evaluate the RAG pipeline over the test dataset and persist results."""
    from app.api.advisor import _get_llm
    from app.infrastructure.search import search_docs
    from langchain_core.messages import HumanMessage

    # Optional RAGAS — faithfulness + agent metrics
    ragas_available = False
    ragas_agent_available = False
    ragas_llm = None
    try:
        from ragas import EvaluationDataset, SingleTurnSample, MultiTurnSample, evaluate  # noqa: F401
        from ragas.metrics.collections import (  # noqa: F401
            Faithfulness, ToolCallAccuracy, TopicAdherence, AgentGoalAccuracy,
        )
        from ragas.messages import (  # noqa: F401
            HumanMessage as RHMsg, AIMessage as RAIMsg, ToolCall as RToolCall,
        )
        ragas_available = True
        try:
            ragas_llm = _build_ragas_llm()
            ragas_agent_available = True
            logger.info("RAGAS agent metrics enabled (ToolCallAccuracy, TopicAdherence, AgentGoalAccuracy)")
        except Exception as e:
            logger.warning("RAGAS agent LLM unavailable: %s — agent metrics via LLM judge", e)
        logger.info("RAGAS available — faithfulness + agent metrics active")
    except ImportError:
        logger.warning("RAGAS not installed — falling back to LLM judge for all metrics")

    llm = _get_llm()
    coll = db["documents"]

    # ── Pull recent advisor interactions from MongoDB ─────────────────────────
    advisor_cases = []
    try:
        recent = list(
            db["advisor_interactions"]
            .find({}, {"question": 1, "answer": 1, "tool_calls": 1, "_id": 0})
            .sort("timestamp", -1)
            .limit(6)
        )
        for i, doc in enumerate(recent):
            q = doc.get("question", "").strip()
            if q and len(q) > 10:
                advisor_cases.append({
                    "id": f"user-{i+1:02d}",
                    "question": q,
                    "category": "User Query",
                    "search_type": None,
                    "advisor_answer": doc.get("answer", ""),
                    "advisor_tool_calls": doc.get("tool_calls", []),
                })
    except Exception as exc:
        logger.warning("Could not fetch advisor interactions: %s", exc)

    # Merge: put advisor interactions first, then hardcoded fallbacks to fill up to 6 total
    combined_cases = advisor_cases[:6]
    if len(combined_cases) < 6:
        needed = 6 - len(combined_cases)
        combined_cases += [
            {**tc, "advisor_answer": "", "advisor_tool_calls": []}
            for tc in TEST_CASES[:needed]
        ]

    # ── Step 1: retrieve contexts + generate RAG answers ─────────────────────
    samples_data = []
    for case in combined_cases:
        question = case["question"]
        type_filter = case.get("search_type")

        docs = await asyncio.to_thread(search_docs, coll, question, 5, type_filter)
        contexts = [
            f"{d.get('title', '')}: {d.get('snippet', '')}"
            for d in docs
            if d.get("snippet")
        ]
        if not contexts:
            # Retry without type filter
            docs = await asyncio.to_thread(search_docs, coll, question, 5)
            contexts = [
                f"{d.get('title', '')}: {d.get('snippet', '')}"
                for d in docs
                if d.get("snippet")
            ]

        ctx_block = "\n".join(f"- {c}" for c in contexts) if contexts else "No context found."
        rag_prompt = (
            "Based only on the following context documents, provide a concise factual answer.\n\n"
            f"Context:\n{ctx_block}\n\n"
            f"Question: {question}\n\nAnswer:"
        )

        try:
            resp = await llm.ainvoke([HumanMessage(content=rag_prompt)])
            answer = resp.content if hasattr(resp, "content") else str(resp)
        except Exception as exc:
            logger.error("LLM call failed for '%s': %s", question, exc)
            answer = "Unable to generate answer."

        samples_data.append(
            {
                "id": case["id"],
                "question": question,
                "category": case["category"],
                "answer": answer,
                "contexts": contexts,
                "advisor_tool_calls": case.get("advisor_tool_calls", []),
            }
        )

    # Build lookup: id → reference data from test cases / advisor interactions
    ref_lookup: dict[str, dict] = {}
    for case in combined_cases:
        ref_lookup[case["id"]] = {
            "reference": case.get("reference", ""),
            "expected_tools": case.get("expected_tools", []),
            "topics": case.get("topics", []),
        }

    # ── Step 2: RAGAS faithfulness (if available) ─────────────────────────────
    faithfulness_scores: dict[str, float] = {}
    if ragas_available and samples_data:
        try:
            from ragas import EvaluationDataset, SingleTurnSample, evaluate
            from ragas.metrics.collections import Faithfulness
            from ragas.llms import LangchainLLMWrapper

            evaluator_llm = LangchainLLMWrapper(llm)
            ragas_samples = [
                SingleTurnSample(
                    user_input=s["question"],
                    response=s["answer"],
                    retrieved_contexts=s["contexts"],
                )
                for s in samples_data
                if s["contexts"]
            ]
            valid_ids = [s["id"] for s in samples_data if s["contexts"]]

            dataset = EvaluationDataset(samples=ragas_samples)
            metric = Faithfulness(llm=evaluator_llm)
            result_df = await asyncio.to_thread(
                lambda: evaluate(
                    dataset=dataset,
                    metrics=[metric],
                    show_progress=False,
                ).to_pandas()
            )
            for idx, sid in enumerate(valid_ids):
                if idx < len(result_df):
                    raw = result_df.iloc[idx].get("faithfulness", None)
                    if raw is not None:
                        faithfulness_scores[sid] = round(float(raw), 3)
        except Exception as exc:
            logger.error("RAGAS faithfulness evaluation failed: %s", exc)
            ragas_available = False

    # ── Step 3a: Native RAGAS agent metrics (batch) ───────────────────────────
    # Build MultiTurnSamples for all questions that have reference data
    agent_scores: dict[str, dict] = {}  # id → {tool_call_accuracy, topic_adherence, agent_goal_accuracy}

    if ragas_available:
        try:
            from ragas import EvaluationDataset, MultiTurnSample, evaluate
            from ragas.metrics.collections import ToolCallAccuracy, TopicAdherence, AgentGoalAccuracy
            from ragas.messages import (
                HumanMessage as RHMsg, AIMessage as RAIMsg, ToolCall as RToolCall,
            )

            mt_samples = []
            mt_ids = []
            for s in samples_data:
                ref = ref_lookup.get(s["id"], {})
                expected_tools = ref.get("expected_tools", [])
                called_tools = s.get("advisor_tool_calls", [])
                reference = ref.get("reference", "")
                topics = ref.get("topics", [])

                mt_samples.append(MultiTurnSample(
                    user_input=[
                        RHMsg(content=s["question"]),
                        RAIMsg(
                            content=s["answer"],
                            tool_calls=[RToolCall(name=t, args={}) for t in called_tools],
                        ),
                    ],
                    reference=reference or s["question"],
                    reference_tool_calls=[RToolCall(name=t, args={}) for t in expected_tools],
                    reference_topics=topics if topics else None,
                ))
                mt_ids.append(s["id"])

            dataset = EvaluationDataset(samples=mt_samples)

            # ToolCallAccuracy is rule-based — always run it
            metrics_to_run = [ToolCallAccuracy()]
            if ragas_agent_available:
                metrics_to_run += [TopicAdherence(llm=ragas_llm), AgentGoalAccuracy(llm=ragas_llm)]

            result_df = await asyncio.to_thread(
                lambda: evaluate(dataset=dataset, metrics=metrics_to_run, show_progress=False).to_pandas()
            )

            for idx, sid in enumerate(mt_ids):
                if idx < len(result_df):
                    row = result_df.iloc[idx]
                    agent_scores[sid] = {
                        "tool_call_accuracy": round(float(row.get("tool_call_accuracy", 0.0)), 3)
                            if row.get("tool_call_accuracy") is not None else None,
                        "topic_adherence": round(float(row.get("topic_adherence", 0.0)), 3)
                            if ragas_agent_available and row.get("topic_adherence") is not None else None,
                        "agent_goal_accuracy": round(float(row.get("agent_goal_accuracy", 0.0)), 3)
                            if ragas_agent_available and row.get("agent_goal_accuracy") is not None else None,
                    }

            logger.info("RAGAS agent metrics computed for %d samples", len(mt_ids))
        except Exception as exc:
            logger.error("RAGAS agent metrics batch failed: %s — using computed fallbacks", exc)

    # ── Step 3b: Score RAG metrics per question + fill agent metric fallbacks ──
    scored_questions = []
    for s in samples_data:
        ref = ref_lookup.get(s["id"], {})
        called_tools: list[str] = s.get("advisor_tool_calls", [])
        expected_tools: list[str] = ref.get("expected_tools", [])
        reference: str = ref.get("reference", "")
        topics: list[str] = ref.get("topics", [])
        ag = agent_scores.get(s["id"], {})

        # Faithfulness
        faithfulness = faithfulness_scores.get(s["id"])
        if faithfulness is None:
            faithfulness = await _llm_judge_score(
                llm,
                (
                    "You are a strict evaluator. Score whether this answer contains ONLY information "
                    "that can be directly inferred from the provided context (faithfulness).\n\n"
                    f"Context:\n" + "\n".join(f"- {c[:200]}" for c in s["contexts"]) + "\n\n"
                    f"Answer: {s['answer']}\n\n"
                    "Return ONLY a decimal between 0.0 (answer hallucinated) and 1.0 (fully faithful). No other text."
                ),
            )

        answer_rel = await _score_answer_relevancy(llm, s["question"], s["answer"])
        ctx_rel = await _score_context_relevance(llm, s["question"], s["contexts"])

        # Agent metrics — prefer native RAGAS, fall back to computed F1
        _, _, tool_f1 = _compute_tool_call_f1(called_tools, expected_tools)
        tool_acc = ag.get("tool_call_accuracy")
        if tool_acc is None:
            tool_acc = (
                len(set(called_tools) & set(expected_tools)) / len(expected_tools)
                if expected_tools else (1.0 if not called_tools else 0.5)
            )
        topic_adh = ag.get("topic_adherence")
        if topic_adh is None:
            # LLM judge fallback
            topic_adh = await _llm_judge_score(
                llm,
                "Rate how well this answer stays on topic.\n"
                f"Expected topics: {', '.join(topics) or s['question']}\n"
                f"Answer: {s['answer'][:500]}\n"
                "Return ONLY a decimal 0.0–1.0.",
            )
        goal_acc = ag.get("agent_goal_accuracy")
        if goal_acc is None and reference:
            goal_acc = await _llm_judge_score(
                llm,
                f"Did the agent achieve this goal?\nGoal: {reference}\nAnswer: {s['answer'][:500]}\n"
                "Return ONLY a decimal 0.0–1.0.",
            )

        scored_questions.append(
            {
                "id": s["id"],
                "question": s["question"],
                "category": s["category"],
                "answer_preview": s["answer"][:300],
                "context_count": len(s["contexts"]),
                "tool_calls": called_tools,
                "expected_tools": expected_tools,
                "source": "user" if s["id"].startswith("user-") else "test",
                "scores": {
                    "faithfulness": faithfulness,
                    "answer_relevancy": answer_rel,
                    "context_relevance": ctx_rel,
                    "topic_adherence": round(topic_adh, 3),
                    "tool_call_accuracy": round(tool_acc, 3),
                    "tool_call_f1": round(tool_f1, 3),
                    "agent_goal_accuracy": round(goal_acc, 3) if goal_acc is not None else None,
                },
            }
        )

    # ── Step 4: aggregate + persist ───────────────────────────────────────────
    def _avg(key: str) -> float | None:
        vals = [q["scores"].get(key) for q in scored_questions if q["scores"].get(key) is not None]
        return round(sum(vals) / len(vals), 3) if vals else None

    run_doc = {
        "run_tag": run_tag,
        "timestamp": datetime.now(timezone.utc),
        "metrics": {
            "faithfulness": _avg("faithfulness"),
            "answer_relevancy": _avg("answer_relevancy"),
            "context_relevance": _avg("context_relevance"),
            "topic_adherence": _avg("topic_adherence"),
            "tool_call_accuracy": _avg("tool_call_accuracy"),
            "tool_call_f1": _avg("tool_call_f1"),
            "agent_goal_accuracy": _avg("agent_goal_accuracy"),
        },
        "questions": scored_questions,
        "sample_count": len(scored_questions),
        "ragas_faithfulness": ragas_available and bool(faithfulness_scores),
        "status": "completed",
    }

    db["rag_evals"].insert_one(run_doc)
    run_doc["_id"] = str(run_doc["_id"])
    run_doc["timestamp"] = run_doc["timestamp"].isoformat()
    return run_doc
