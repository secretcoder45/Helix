"""
The Assistant: an LLM answer grounded in live database results.

It spends a paid Anthropic API key on every question, and anyone with the
URL could call it. Hidden in the interface for now, and switched off here
too — hiding a button doesn't stop a direct request. Set
ASSISTANT_ENABLED=true to turn it back on.
"""

import os
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from llm_service import llm
from routers.lookup import run_search

router = APIRouter(tags=["Assistant"])

# Stripped from natural-language questions before hitting database search
# APIs, which expect keyword-like queries (e.g. "insulin"), not full sentences
# (e.g. "what does insulin do in the human body?" returns zero UniProt hits).
_STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "do", "does", "did",
    "what", "how", "why", "when", "where", "who", "which", "whom",
    "in", "of", "to", "for", "on", "at", "by", "and", "or", "about",
    "tell", "me", "please", "can", "you", "explain", "describe",
    "it", "its", "this", "that", "these", "those",
}


def extract_search_terms(query: str) -> str:
    """Reduce a natural-language question to keyword-like terms for search APIs."""
    words = re.findall(r"[a-zA-Z0-9-]+", query.lower())
    keywords = [w for w in words if w not in _STOPWORDS]
    return " ".join(keywords[:5]) if keywords else query


def assistant_enabled() -> bool:
    return os.getenv("ASSISTANT_ENABLED", "").strip().lower() in {"1", "true", "yes"}


class ChatMessage(BaseModel):
    query: str
    context: str = "general"


@router.post("/chat")
def chat(message: ChatMessage):
    """Answer a question, grounded in live database results."""
    if not assistant_enabled():
        raise HTTPException(status_code=404, detail="The Assistant is not available.")
    try:
        # Pull a few results from each category so the LLM has real data to
        # ground its answer in, regardless of what kind of question it is.
        search_terms = extract_search_terms(message.query)
        search_results = []
        for database in ("proteins", "genomics", "pathways"):
            search_results.extend(run_search(database, search_terms)[0][:3])

        response = llm.answer_query(message.query, search_results)

        return {
            "query": message.query,
            "response": response,
            "sources": [r["link"] for r in search_results[:5]],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
