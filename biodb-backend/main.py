from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
import os
from dotenv import load_dotenv

import re

from database_apis import db_connector
from llm_service import llm
from cache import cache_stats
import db as db_module
import models

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    db_module.init_db()
    yield


app = FastAPI(title="Unified Bioinformatics Database", lifespan=lifespan)

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
    retrieved_at: Optional[str] = None


class ChatMessage(BaseModel):
    query: str
    context: str = "general"


class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class SavedItemCreate(BaseModel):
    external_id: str
    name: str
    database: str
    description: str = ""
    link: str = ""
    retrieved_at: Optional[str] = None
    notes: str = ""


# ---- Routes ----
@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/cache/stats")
async def cache_statistics():
    """Visibility into the in-memory API response cache."""
    return cache_stats()


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
                "retrieved_at": r.get("retrieved_at"),
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
                "retrieved_at": r.get("retrieved_at"),
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
                "retrieved_at": r.get("retrieved_at"),
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
                "retrieved_at": r.get("retrieved_at"),
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


@app.get("/entity/{query}")
async def get_entity(query: str):
    """
    One lookup, cross-referenced across databases.

    Instead of making a researcher search four databases separately and manually
    match identifiers, this resolves a gene/protein name to its canonical
    UniProt entry and returns the linked gene record, structures, and pathways
    together.
    """
    try:
        entity = db_connector.resolve_entity(query)
        if not entity:
            raise HTTPException(status_code=404, detail=f"No entity found for '{query}'")

        # Attach the NCBI Gene record for the resolved gene symbol. Uses the
        # symbol UniProt gives us rather than the raw user query, so a search
        # for a protein name still finds the right gene.
        gene_symbol = entity["genes"][0] if entity.get("genes") else query
        gene_hits = db_connector.search_ncbi_gene(gene_symbol)
        entity["genes_detail"] = [
            {
                "id": g["id"],
                "name": g["name"],
                "database": "NCBI Gene",
                "description": g["description"],
                "link": g["link"],
            }
            for g in gene_hits[:3]
        ]

        return entity

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---- Projects (saved workspaces) ----
# Lets a researcher save results across searches instead of losing them the
# moment they navigate away — the foundation for batch review, export, and
# citation later.


@app.post("/projects")
async def create_project(payload: ProjectCreate, session: Session = Depends(db_module.get_db)):
    project = models.Project(name=payload.name, description=payload.description)
    session.add(project)
    session.commit()
    session.refresh(project)
    return _serialize_project(project)


@app.get("/projects")
async def list_projects(session: Session = Depends(db_module.get_db)):
    projects = session.query(models.Project).order_by(models.Project.created_at.desc()).all()
    return [_serialize_project(p) for p in projects]


@app.get("/projects/{project_id}")
async def get_project(project_id: str, session: Session = Depends(db_module.get_db)):
    project = session.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return _serialize_project(project, include_items=True)


@app.delete("/projects/{project_id}")
async def delete_project(project_id: str, session: Session = Depends(db_module.get_db)):
    project = session.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    session.delete(project)
    session.commit()
    return {"deleted": project_id}


@app.post("/projects/{project_id}/items")
async def add_item(
    project_id: str, payload: SavedItemCreate, session: Session = Depends(db_module.get_db)
):
    project = session.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # retrieved_at must reflect when the data was fetched from the source
    # database, not when the user clicked save — otherwise a result found
    # yesterday and saved today carries a citation date that's simply wrong.
    retrieved_at = None
    if payload.retrieved_at:
        try:
            retrieved_at = datetime.fromisoformat(payload.retrieved_at.replace("Z", "+00:00"))
        except ValueError:
            retrieved_at = None  # unparseable: fall back to the column default

    item = models.SavedItem(
        project_id=project_id,
        external_id=payload.external_id,
        name=payload.name,
        database=payload.database,
        description=payload.description,
        link=payload.link,
        notes=payload.notes,
        **({"retrieved_at": retrieved_at} if retrieved_at else {}),
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return _serialize_item(item)


@app.delete("/projects/{project_id}/items/{item_id}")
async def remove_item(project_id: str, item_id: str, session: Session = Depends(db_module.get_db)):
    item = (
        session.query(models.SavedItem)
        .filter(models.SavedItem.id == item_id, models.SavedItem.project_id == project_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    session.delete(item)
    session.commit()
    return {"deleted": item_id}


def _serialize_item(item: models.SavedItem) -> dict:
    return {
        "id": item.id,
        "external_id": item.external_id,
        "name": item.name,
        "database": item.database,
        "description": item.description,
        "link": item.link,
        "notes": item.notes,
        "retrieved_at": item.retrieved_at.isoformat() if item.retrieved_at else None,
        "saved_at": item.saved_at.isoformat() if item.saved_at else None,
    }


def _serialize_project(project: models.Project, include_items: bool = False) -> dict:
    data = {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "item_count": len(project.items),
    }
    if include_items:
        data["items"] = [_serialize_item(i) for i in project.items]
    return data


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
