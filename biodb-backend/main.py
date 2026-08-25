from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import os
from dotenv import load_dotenv

import re

from database_apis import db_connector
from llm_service import llm

# Stripped from natural-language chat questions before hitting database search
# APIs, which expect keyword-like queries (e.g. "insulin"), not full sentences
# (e.g. "what does insulin do in the human body?" returns zero UniProt hits).
_STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "do", "does", "did",
    "what", "how", "why", "when", "where", "who", "which", "whom",
    "in", "of", "to", "for", "on", "at", "by", "and", "or", "about",
    "tell", "me", "please", "can", "you", "explain", "describe",
    "it", "its", "this", "that", "these", "those",
}


def _extract_search_terms(query: str) -> str:
    """Reduce a natural-language question to keyword-like terms for search APIs."""
    words = re.findall(r"[a-zA-Z0-9-]+", query.lower())
    keywords = [w for w in words if w not in _STOPWORDS]
    return " ".join(keywords[:5]) if keywords else query

load_dotenv()

app = FastAPI(title="Unified Bioinformatics Database")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Data models ----
class SearchQuery(BaseModel):
    query: str
    database: str  # "genomics", "proteins", "pathways", etc.
    limit: int = 10


class SearchResult(BaseModel):
    id: str
    name: str
    database: str
    description: str
    link: str


class ChatMessage(BaseModel):
    query: str
    context: str = "general"


# ---- Routes ----
@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/databases")
async def list_databases():
    """List available databases"""
    databases = {
        "genomics": {
            "name": "Genomics",
            "description": "Gene sequences, variants, mutations",
            "apis": ["NCBI Gene", "dbSNP"],
        },
        "proteins": {
            "name": "Proteins",
            "description": "Protein structures, annotations, interactions",
            "apis": ["PDB", "UniProt"],
        },
        "pathways": {
            "name": "Pathways",
            "description": "Biological pathways and networks",
            "apis": ["KEGG", "Reactome"],
        },
        "sequences": {
            "name": "Sequences",
            "description": "DNA/RNA/Protein sequences",
            "apis": ["NCBI", "Ensembl"],
        },
        "drugs": {
            "name": "Drugs & Compounds",
            "description": "Drug information and compounds",
            "apis": ["ChEMBL", "DrugBank"],
        },
    }
    return databases


def _run_search(database: str, query: str) -> List[Dict]:
    """Search one database category. Shared by /search and /chat."""
    results = []

    if database == "proteins":
        results = [
            {
                "id": r["id"],
                "name": r["name"],
                "database": "UniProt",
                "description": r["description"],
                "link": r["link"],
            }
            for r in db_connector.search_uniprot_protein(query)
        ]
        results.extend(
            {
                "id": r["id"],
                "name": r["name"],
                "database": "PDB",
                "description": r["description"],
                "link": r["link"],
            }
            for r in db_connector.search_pdb_protein(query)
        )

    elif database == "genomics":
        results = [
            {
                "id": r["id"],
                "name": r["name"],
                "database": "NCBI Gene",
                "description": r["description"],
                "link": r["link"],
            }
            for r in db_connector.search_ncbi_gene(query)
        ]

    elif database == "pathways":
        results = [
            {
                "id": r["id"],
                "name": r["name"],
                "database": "KEGG",
                "description": r["description"],
                "link": r["link"],
            }
            for r in db_connector.search_kegg_pathway(query)
        ]

    return results


@app.post("/search")
async def search_databases(query: SearchQuery):
    """Search across live bioinformatics databases"""
    try:
        results = _run_search(query.database, query.query)
        return {
            "query": query.query,
            "database": query.database,
            "results": results[: query.limit],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
async def chat(message: ChatMessage):
    """Chat with the LLM about bioinformatics, grounded in live database results."""
    try:
        # Pull a few results from each category so the LLM has real data to
        # ground its answer in, regardless of what kind of question it is.
        search_terms = _extract_search_terms(message.query)
        search_results = []
        for database in ("proteins", "genomics", "pathways"):
            search_results.extend(_run_search(database, search_terms)[:3])

        response = llm.answer_query(message.query, search_results)

        return {
            "query": message.query,
            "response": response,
            "sources": [r["link"] for r in search_results[:5]],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
