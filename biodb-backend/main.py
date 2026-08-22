from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import os
from dotenv import load_dotenv

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


@app.post("/search")
async def search_databases(query: SearchQuery):
    """Search across databases (stub results for Week 1 — real APIs land in Week 2)"""
    try:
        results = []

        if query.database == "proteins":
            results = [
                {
                    "id": "1abc",
                    "name": "Insulin",
                    "database": "PDB",
                    "description": "Human insulin protein structure",
                    "link": "https://www.rcsb.org/structure/1abc",
                }
            ]
        elif query.database == "genomics":
            results = [
                {
                    "id": "BRCA1",
                    "name": "BRCA1 Gene",
                    "database": "NCBI",
                    "description": "Breast cancer susceptibility protein 1",
                    "link": "https://www.ncbi.nlm.nih.gov/gene/",
                }
            ]

        return {"query": query.query, "database": query.database, "results": results}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
async def chat(message: ChatMessage):
    """Chat with LLM about bioinformatics data (LLM wiring lands in Week 3)"""
    return {
        "query": message.query,
        "response": "LLM integration coming soon",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
