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


async def _score_topic_adherence(llm, question: str, answer: str, topics: list[str]) -> float:
    """RAGAS TopicAdherence: does the agent stay on the expected topic?"""
    topics_str = ", ".join(topics) if topics else question
    prompt = (
        "You are a strict evaluator assessing topic adherence for an AI agent.\n"
        "Evaluate whether the answer stays on the expected topics and does not drift "
        "into irrelevant areas.\n\n"
        f"Expected topics: {topics_str}\n\n"
        f"Question: {question}\n\n"
        f"Answer: {answer[:600]}\n\n"
        "Return ONLY a decimal between 0.0 (completely off-topic) and 1.0 (fully on-topic). No other text."
    )
    return await _llm_judge_score(llm, prompt)


def _compute_tool_call_f1(called: list[str], expected: list[str]) -> tuple[float, float, float]:
    """Compute precision, recall, F1 for tool call sets (order-independent)."""
    called_set = set(called)
    expected_set = set(expected)
    if not expected_set and not called_set:
        return 1.0, 1.0, 1.0
    if not expected_set:
        return 0.0, 1.0, 0.0  # called things when nothing expected
    if not called_set:
        return 1.0, 0.0, 0.0  # nothing called, all expected missed
    precision = len(called_set & expected_set) / len(called_set)
    recall = len(called_set & expected_set) / len(expected_set)
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    return round(precision, 3), round(recall, 3), round(f1, 3)


async def _score_agent_goal_accuracy(llm, question: str, answer: str, reference: str) -> float:
    """RAGAS AgentGoalAccuracy: did the agent achieve the expected goal/outcome?"""
    prompt = (
        "You are a strict evaluator assessing whether an AI agent achieved its intended goal.\n"
        "Compare the agent's answer to the expected reference outcome.\n\n"
        f"Question / Goal: {question}\n\n"
        f"Expected outcome: {reference}\n\n"
        f"Agent's answer: {answer[:600]}\n\n"
        "Return ONLY a decimal between 0.0 (goal not achieved) and 1.0 (goal fully achieved). No other text."
    )
    return await _llm_judge_score(llm, prompt)


# ── Core runner ───────────────────────────────────────────────────────────────


async def run_ragas_evaluation(db, run_tag: str = "default") -> dict:
    """Evaluate the RAG pipeline over the test dataset and persist results."""
    from app.api.advisor import _get_llm
    from app.infrastructure.search import search_docs
    from langchain_core.messages import HumanMessage

    # Optional RAGAS faithfulness
    ragas_available = False
    try:
        from ragas import EvaluationDataset, SingleTurnSample, evaluate  # noqa: F401
        from ragas.metrics.collections import Faithfulness  # noqa: F401
        from ragas.llms import LangchainLLMWrapper  # noqa: F401

        ragas_available = True
        logger.info("RAGAS available — faithfulness will use RAGAS metric")
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

    # ── Step 3: Score all metrics per question ────────────────────────────────
    scored_questions = []
    for s in samples_data:
        ref = ref_lookup.get(s["id"], {})
        called_tools: list[str] = s.get("advisor_tool_calls", [])
        expected_tools: list[str] = ref.get("expected_tools", [])
        reference: str = ref.get("reference", "")
        topics: list[str] = ref.get("topics", [])

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

        # Agent / tool metrics
        topic_adh = await _score_topic_adherence(llm, s["question"], s["answer"], topics)
        goal_acc = await _score_agent_goal_accuracy(llm, s["question"], s["answer"], reference) if reference else None
        _, _, tool_f1 = _compute_tool_call_f1(called_tools, expected_tools)
        # Tool call accuracy: fraction of expected tools that were actually called
        tool_acc = (
            len(set(called_tools) & set(expected_tools)) / len(expected_tools)
            if expected_tools else (1.0 if not called_tools else 0.5)
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
