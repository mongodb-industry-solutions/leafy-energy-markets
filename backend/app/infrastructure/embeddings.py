"""VoyageAI embedding client for vector search.

Falls back to deterministic hash-based embeddings when the API key
is missing or invalid, so the demo works without a live VoyageAI account.
"""

import hashlib
import os
import struct

import httpx

VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings"
VOYAGE_MODEL = "voyage-finance-2"
FALLBACK_DIM = 1024  # voyage-finance-2 output dimension


def _get_api_key() -> str:
    return os.getenv("VOYAGE_API_KEY", "")


def _hash_embedding(text: str) -> list[float]:
    """Generate a deterministic unit-length embedding from text via SHA-512.

    This is NOT a real semantic embedding — it only guarantees exact-match
    consistency so that $vectorSearch pipelines can execute without error.
    """
    digest = hashlib.sha512(text.encode()).digest()
    # Repeat the digest to fill FALLBACK_DIM floats (each float = 4 bytes)
    raw = (digest * ((FALLBACK_DIM * 4 // len(digest)) + 1))[: FALLBACK_DIM * 4]
    floats = list(struct.unpack(f"{FALLBACK_DIM}f", raw))
    # Normalise to unit length
    norm = max(sum(x * x for x in floats) ** 0.5, 1e-9)
    return [x / norm for x in floats]


def embed_texts(texts: list[str], input_type: str = "document") -> list[list[float]]:
    """Embed a batch of texts using VoyageAI, with hash fallback."""
    key = _get_api_key()
    if key:
        try:
            resp = httpx.post(
                VOYAGE_API_URL,
                json={"model": VOYAGE_MODEL, "input": texts, "input_type": input_type},
                headers={"Authorization": f"Bearer {key}"},
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return [item["embedding"] for item in data["data"]]
        except Exception as exc:
            print(f"[embeddings] VoyageAI call failed ({exc}), using hash fallback.")

    return [_hash_embedding(t) for t in texts]


def embed_query(text: str) -> list[float]:
    """Embed a single search query."""
    return embed_texts([text], input_type="query")[0]


def embed_documents(texts: list[str]) -> list[list[float]]:
    """Embed a batch of documents for indexing."""
    return embed_texts(texts, input_type="document")
