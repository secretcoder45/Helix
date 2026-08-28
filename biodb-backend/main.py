from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
import os
from dotenv import load_dotenv

import json
import re

from database_apis import db_connector
from llm_service import llm
import xml.etree.ElementTree as ET
import blast_service
import alignment_service
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
# Origins come from the environment so the deployed frontend isn't blocked.
# ALLOWED_ORIGINS is a comma-separated list (set it to the Vercel URL in
# production); the localhost defaults keep local development working with no
# configuration.
_DEFAULT_ORIGINS = "http://localhost:5173,http://localhost:3000"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in (os.getenv("ALLOWED_ORIGINS") or _DEFAULT_ORIGINS).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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


class BatchRequest(BaseModel):
    # A list of strings rather than one blob so the client can send either a
    # parsed list or a single pasted chunk — both are split server-side.
    identifiers: List[str]
    include_gene: bool = False


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


class BulkSavedItemsCreate(BaseModel):
    items: List[SavedItemCreate]


class BlastSubmit(BaseModel):
    sequence: str
    program: str = "blastp"
    database: str = "swissprot"


class AlignRequest(BaseModel):
    seq1: str
    seq2: str
    sequence_type: str = "protein"
    matrix: str = "BLOSUM62"
    gap_open: float = -10.0
    gap_extend: float = -0.5
    match_score: float = 5.0
    mismatch_score: float = -4.0


class SavedAlignmentCreate(BaseModel):
    algorithm: str
    label1: str = "Sequence 1"
    label2: str = "Sequence 2"
    seq1: str
    seq2: str
    aligned_seq1: str
    aligned_seq2: str
    score: float
    identity_pct: float = 0.0
    similarity_pct: float = 0.0
    gaps: int = 0
    length: int = 0
    params: Dict = {}
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


@app.get("/literature/{gene_symbol}")
async def get_literature(gene_symbol: str, limit: int = 5):
    """
    Related PubMed papers for a gene symbol.

    Separate endpoint rather than folded into /entity: PubMed adds a second
    NCBI round trip on top of the gene lookup /entity already does, and
    researchers don't always want it — keeping it lazy means the entity page
    renders as soon as the core cross-reference is back, with literature
    filling in a beat later instead of blocking on it.
    """
    try:
        papers = db_connector.search_pubmed(gene_symbol, limit=limit)
        return {"gene_symbol": gene_symbol, "papers": papers}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---- Batch lookup ----
# The single biggest time saver here: annotating a gene list one entry at a
# time is a routine hours-long chore, and it's pure mechanical lookup.

MAX_BATCH = 200
_BATCH_WORKERS = 8


def _parse_identifiers(raw: List[str]) -> List[str]:
    """
    Normalise a pasted gene list.

    Real lists arrive from spreadsheets and papers, so they come separated by
    newlines, commas, tabs, or spaces, often with blank lines and duplicates.
    Order is preserved (researchers expect their input order back) while
    duplicates are dropped case-insensitively.
    """
    tokens: List[str] = []
    for chunk in raw:
        tokens.extend(re.split(r"[\s,;]+", chunk or ""))

    seen = set()
    out = []
    for token in tokens:
        cleaned = token.strip()
        if not cleaned:
            continue
        key = cleaned.upper()
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
    return out


def _batch_row(query: str, include_gene: bool) -> Dict:
    """Resolve one identifier into a flat row suitable for a table or CSV."""
    entity = db_connector.resolve_entity(query)
    if not entity:
        return {"query": query, "resolved": False}

    row = {
        "query": query,
        "resolved": True,
        "accession": entity.get("accession"),
        "name": entity.get("name"),
        "protein_name": entity.get("protein_name"),
        "organism": entity.get("organism"),
        "genes": entity.get("genes", []),
        "length": entity.get("sequence", {}).get("length"),
        "molecular_weight": entity.get("sequence", {}).get("molecular_weight"),
        # Included so a batch can be exported straight to FASTA — bulk sequence
        # retrieval is otherwise its own manual chore.
        "sequence": entity.get("sequence", {}).get("value", ""),
        "structure_count": len(entity.get("structures", [])),
        "structures": [s["id"] for s in entity.get("structures", [])[:5]],
        "pathways": [p["id"] for p in entity.get("pathways", [])],
        "function": entity.get("function", ""),
        "link": entity.get("links", {}).get("uniprot"),
        "retrieved_at": entity.get("retrieved_at"),
    }

    # Off by default: NCBI is the rate-limited source, so enriching a 200-row
    # batch adds real wall-clock time. Opt in when the gene IDs are needed.
    if include_gene:
        symbol = entity["genes"][0] if entity.get("genes") else query
        hits = db_connector.search_ncbi_gene(symbol)
        row["gene_id"] = hits[0]["id"] if hits else None
        row["gene_link"] = hits[0]["link"] if hits else None

    return row


@app.post("/batch")
def batch_lookup(payload: BatchRequest):
    """
    Resolve many identifiers at once.

    Runs the lookups concurrently over a bounded pool — serial resolution of a
    100-gene list would take minutes. Failures are reported per row rather than
    failing the batch, since one unrecognised symbol in a list of 80 shouldn't
    cost the researcher the other 79.

    Declared `def` rather than `async def` so FastAPI runs it in its worker
    threadpool; the connector underneath is blocking `requests`.
    """
    identifiers = _parse_identifiers(payload.identifiers)
    if not identifiers:
        raise HTTPException(status_code=400, detail="No identifiers provided")

    truncated = len(identifiers) > MAX_BATCH
    identifiers = identifiers[:MAX_BATCH]

    rows: Dict[str, Dict] = {}
    with ThreadPoolExecutor(max_workers=_BATCH_WORKERS) as pool:
        futures = {
            pool.submit(_batch_row, ident, payload.include_gene): ident
            for ident in identifiers
        }
        for future in as_completed(futures):
            ident = futures[future]
            try:
                rows[ident] = future.result()
            except Exception as e:
                # A single lookup blowing up shouldn't take the batch with it.
                rows[ident] = {"query": ident, "resolved": False, "error": str(e)}

    # Restore the caller's input order, which as_completed does not preserve.
    ordered = [rows[i] for i in identifiers]
    resolved = [r for r in ordered if r.get("resolved")]

    return {
        "rows": ordered,
        "stats": {
            "requested": len(identifiers),
            "resolved": len(resolved),
            "unresolved": len(ordered) - len(resolved),
            "truncated": truncated,
            "max_batch": MAX_BATCH,
        },
    }


# ---- Alignment ----
# Computed locally rather than via an external API — see alignment_service.py
# for why. No rate limiting or caching needed here: this is CPU-bound local
# work, not a call to something else's infrastructure.

_VALID_SEQ_TYPES = {"protein", "dna"}


@app.post("/align/needleman-wunsch")
def align_needleman_wunsch(payload: AlignRequest):
    if payload.sequence_type not in _VALID_SEQ_TYPES:
        raise HTTPException(
            status_code=400, detail=f"sequence_type must be one of {sorted(_VALID_SEQ_TYPES)}"
        )
    try:
        result = alignment_service.needleman_wunsch(
            payload.seq1,
            payload.seq2,
            sequence_type=payload.sequence_type,
            matrix=payload.matrix,
            gap_open=payload.gap_open,
            gap_extend=payload.gap_extend,
            match_score=payload.match_score,
            mismatch_score=payload.mismatch_score,
        )
    except alignment_service.AlignmentError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return result


@app.post("/align/smith-waterman")
def align_smith_waterman(payload: AlignRequest):
    if payload.sequence_type not in _VALID_SEQ_TYPES:
        raise HTTPException(
            status_code=400, detail=f"sequence_type must be one of {sorted(_VALID_SEQ_TYPES)}"
        )
    try:
        result = alignment_service.smith_waterman(
            payload.seq1,
            payload.seq2,
            sequence_type=payload.sequence_type,
            matrix=payload.matrix,
            gap_open=payload.gap_open,
            gap_extend=payload.gap_extend,
            match_score=payload.match_score,
            mismatch_score=payload.mismatch_score,
        )
    except alignment_service.AlignmentError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return result


@app.get("/sequence/{accession}")
def get_sequence(accession: str):
    """
    Fetch a single sequence by UniProt accession.

    Exists so sequences can travel between tools: a BLAST hit or a saved
    project item carries an accession but not the sequence itself, and
    without this the only way to align one would be to copy it out of
    UniProt by hand — which is exactly the manual step this app is supposed
    to remove.
    """
    seq = db_connector.fetch_sequence(accession)
    if not seq:
        raise HTTPException(status_code=404, detail=f"No sequence found for '{accession}'")
    return seq


# ---- BLAST ----
# Sequence similarity search against NCBI's real, live databases. Async by
# nature (NCBI takes real time to search nr/swissprot), so this is three
# endpoints rather than one: submit, poll, fetch — mirroring how the NCBI
# API itself works instead of hiding the wait behind a single blocking call.

_VALID_PROGRAMS = {"blastp", "blastn", "blastx"}
_VALID_DATABASES = {"swissprot", "nr", "nt"}
_PROTEIN_RE = re.compile(r"^[A-Za-z\*\-\s]+$")
_MAX_SEQUENCE_LENGTH = 10_000


def _clean_sequence(raw: str) -> str:
    """Strip a FASTA header line and whitespace, if present, so pasting a
    header-and-all FASTA record works the same as pasting a bare sequence."""
    lines = [ln for ln in raw.strip().splitlines() if not ln.startswith(">")]
    return "".join(ln.strip() for ln in lines)


@app.post("/blast/submit")
def blast_submit(payload: BlastSubmit):
    if payload.program not in _VALID_PROGRAMS:
        raise HTTPException(status_code=400, detail=f"program must be one of {sorted(_VALID_PROGRAMS)}")
    if payload.database not in _VALID_DATABASES:
        raise HTTPException(status_code=400, detail=f"database must be one of {sorted(_VALID_DATABASES)}")

    sequence = _clean_sequence(payload.sequence)
    if len(sequence) < 10:
        raise HTTPException(status_code=400, detail="Sequence too short to search (minimum 10 residues)")
    if len(sequence) > _MAX_SEQUENCE_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Sequence too long ({len(sequence)} chars, max {_MAX_SEQUENCE_LENGTH})",
        )
    if not _PROTEIN_RE.match(sequence):
        raise HTTPException(status_code=400, detail="Sequence contains characters outside the standard alphabet")

    try:
        result = blast_service.submit_search(sequence, payload.program, payload.database)
    except blast_service.BlastError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return result


@app.get("/blast/status/{rid}")
def blast_status(rid: str):
    try:
        status = blast_service.check_status(rid)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"rid": rid, "status": status}


@app.get("/blast/results/{rid}")
def blast_results(rid: str):
    try:
        hits = blast_service.fetch_results(rid)
    except blast_service.BlastError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except ET.ParseError:
        raise HTTPException(status_code=502, detail="NCBI returned a result that could not be parsed")
    return {"rid": rid, "hits": hits}


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


def _parse_retrieved_at(value: Optional[str]):
    # retrieved_at must reflect when the data was fetched from the source
    # database, not when the user clicked save — otherwise a result found
    # yesterday and saved today carries a citation date that's simply wrong.
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None  # unparseable: fall back to the column default


def _build_saved_item(project_id: str, payload: SavedItemCreate) -> models.SavedItem:
    retrieved_at = _parse_retrieved_at(payload.retrieved_at)
    return models.SavedItem(
        project_id=project_id,
        external_id=payload.external_id,
        name=payload.name,
        database=payload.database,
        description=payload.description,
        link=payload.link,
        notes=payload.notes,
        **({"retrieved_at": retrieved_at} if retrieved_at else {}),
    )


@app.post("/projects/{project_id}/items")
async def add_item(
    project_id: str, payload: SavedItemCreate, session: Session = Depends(db_module.get_db)
):
    project = session.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    item = _build_saved_item(project_id, payload)
    session.add(item)
    session.commit()
    session.refresh(item)
    return _serialize_item(item)


@app.post("/projects/{project_id}/items/bulk")
async def add_items_bulk(
    project_id: str, payload: BulkSavedItemsCreate, session: Session = Depends(db_module.get_db)
):
    """
    Save many results into a project in one round trip.

    Exists for batch lookup: saving results one row at a time from a
    100-gene batch would mean 100 sequential requests against a free-tier
    backend that can be cold-starting. One request, one commit.
    """
    project = session.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not payload.items:
        raise HTTPException(status_code=400, detail="No items provided")

    items = [_build_saved_item(project_id, item) for item in payload.items]
    session.add_all(items)
    session.commit()
    for item in items:
        session.refresh(item)

    return {"saved": len(items), "items": [_serialize_item(i) for i in items]}


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


@app.post("/projects/{project_id}/alignments")
async def add_alignment(
    project_id: str,
    payload: SavedAlignmentCreate,
    session: Session = Depends(db_module.get_db),
):
    """Save an alignment result into a project."""
    project = session.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    alignment = models.SavedAlignment(
        project_id=project_id,
        algorithm=payload.algorithm,
        label1=payload.label1,
        label2=payload.label2,
        seq1=payload.seq1,
        seq2=payload.seq2,
        aligned_seq1=payload.aligned_seq1,
        aligned_seq2=payload.aligned_seq2,
        score=payload.score,
        identity_pct=payload.identity_pct,
        similarity_pct=payload.similarity_pct,
        gaps=payload.gaps,
        length=payload.length,
        params=json.dumps(payload.params),
        notes=payload.notes,
    )
    session.add(alignment)
    session.commit()
    session.refresh(alignment)
    return _serialize_alignment(alignment)


@app.delete("/projects/{project_id}/alignments/{alignment_id}")
async def remove_alignment(
    project_id: str, alignment_id: str, session: Session = Depends(db_module.get_db)
):
    alignment = (
        session.query(models.SavedAlignment)
        .filter(
            models.SavedAlignment.id == alignment_id,
            models.SavedAlignment.project_id == project_id,
        )
        .first()
    )
    if not alignment:
        raise HTTPException(status_code=404, detail="Alignment not found")
    session.delete(alignment)
    session.commit()
    return {"deleted": alignment_id}


def _serialize_alignment(a: models.SavedAlignment) -> dict:
    try:
        params = json.loads(a.params or "{}")
    except ValueError:
        params = {}
    return {
        "id": a.id,
        "algorithm": a.algorithm,
        "label1": a.label1,
        "label2": a.label2,
        "seq1": a.seq1,
        "seq2": a.seq2,
        "aligned_seq1": a.aligned_seq1,
        "aligned_seq2": a.aligned_seq2,
        "score": a.score,
        "identity_pct": a.identity_pct,
        "similarity_pct": a.similarity_pct,
        "gaps": a.gaps,
        "length": a.length,
        "params": params,
        "notes": a.notes,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


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
        "alignment_count": len(project.alignments),
    }
    if include_items:
        data["items"] = [_serialize_item(i) for i in project.items]
        data["alignments"] = [_serialize_alignment(a) for a in project.alignments]
    return data


if __name__ == "__main__":
    import uvicorn

    # Railway (and most PaaS) inject the port to bind as $PORT.
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
