"""RAGAS evaluation runner for the Leafy Energy Markets RAG pipeline.

Evaluates three metrics per test question:
  - faithfulness      : RAGAS — is the answer grounded in retrieved contexts?
  - answer_relevancy  : LLM judge — is the answer relevant to the question?
  - context_relevance : LLM judge — are the retrieved contexts relevant?
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
    },
    {
        "id": "tc-02",
        "question": "How does REMIT regulation affect market manipulation detection in energy trading?",
        "category": "Compliance",
        "search_type": "Policy",
    },
    {
        "id": "tc-03",
        "question": "What are the key drivers of European natural gas price volatility?",
        "category": "Market Intelligence",
        "search_type": None,
    },
    {
        "id": "tc-04",
        "question": "How does REPowerEU policy affect renewable energy investment strategies?",
        "category": "Policy",
        "search_type": "Policy",
    },
    {
        "id": "tc-05",
        "question": "What is the EU ETS carbon price outlook and its impact on power generation costs?",
        "category": "Market Intelligence",
        "search_type": None,
    },
    {
        "id": "tc-06",
        "question": "What are the compliance requirements for cross-border electricity trading in the EU?",
        "category": "Compliance",
        "search_type": "Policy",
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

    # ── Step 3: LLM judge for answer_relevancy + context_relevance ───────────
    scored_questions = []
    for s in samples_data:
        faithfulness = faithfulness_scores.get(s["id"])
        if faithfulness is None:
            # Fallback to LLM judge when RAGAS unavailable
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

        scored_questions.append(
            {
                "id": s["id"],
                "question": s["question"],
                "category": s["category"],
                "answer_preview": s["answer"][:300],
                "context_count": len(s["contexts"]),
                "tool_calls": s.get("advisor_tool_calls", []),
                "source": "user" if s["id"].startswith("user-") else "test",
                "scores": {
                    "faithfulness": faithfulness,
                    "answer_relevancy": answer_rel,
                    "context_relevance": ctx_rel,
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
