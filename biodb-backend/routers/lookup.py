"""
Looking things up in the source databases: the cross-referenced entity,
side-by-side search, batch lookup, and the lazily loaded extras (papers,
AlphaFold model, raw sequence).
"""

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import ratelimit
from database_apis import SourceUnavailable, db_connector
from ratelimit import limit

router = APIRouter(tags=["Look up"])


class SearchQuery(BaseModel):
    query: str
    database: str  # "all", "genomics", "proteins", "pathways"
    limit: int = 10


class BatchRequest(BaseModel):
    # A list of strings rather than one blob so the client can send either a
    # parsed list or a single pasted chunk — both are split server-side.
    identifiers: List[str]
    include_gene: bool = False


@router.get("/databases")
def list_databases():
    """
    The database categories /search can query.

    Only categories with a working search are listed, and `apis` names only
    sources that are actually queried — the list is shown to users as
    "what this searches", so it must not promise more.
    """
    return {
        "all": {
            "name": "All databases",
            "description": "One query, every source side by side",
            "apis": ["UniProt", "RCSB PDB", "NCBI Gene", "KEGG"],
        },
        "genomics": {
            "name": "Genes",
            "description": "Human gene records: symbol, name and summary",
            "apis": ["NCBI Gene"],
        },
        "proteins": {
            "name": "Proteins",
            "description": "Protein entries and experimental structures",
            "apis": ["UniProt", "RCSB PDB"],
        },
        "pathways": {
            "name": "Pathways",
            "description": "Biological pathway maps",
            "apis": ["KEGG"],
        },
    }


# Which sources each category searches: (label shown on results, fetch function).
SEARCH_SOURCES = {
    "proteins": [("UniProt", "search_uniprot_protein"), ("PDB", "search_pdb_protein")],
    "genomics": [("NCBI Gene", "search_ncbi_gene")],
    "pathways": [("KEGG", "search_kegg_pathway")],
}
# Everything at once, shown as one column per source.
SEARCH_SOURCES["all"] = [
    *SEARCH_SOURCES["proteins"],
    *SEARCH_SOURCES["genomics"],
    *SEARCH_SOURCES["pathways"],
]


def run_search(database: str, query: str):
    """
    Search one database category. Shared by /search and the Assistant.

    Returns (results, unavailable). Each source is tried on its own, so one
    being down costs only its own results — and is named, rather than its
    absence passing silently as "no matches".
    """
    sources = SEARCH_SOURCES.get(database, [])

    def fetch_one(source):
        label, fetch = source
        try:
            return label, getattr(db_connector, fetch)(query), None
        except SourceUnavailable as e:
            return label, [], e.source

    # In parallel: four sources take as long as the slowest, not the sum.
    # NCBI's own rate limiter still applies inside the connector.
    with ThreadPoolExecutor(max_workers=max(1, len(sources))) as pool:
        answers = list(pool.map(fetch_one, sources))

    results, unavailable = [], []
    for label, rows, failed in answers:  # map() keeps source order
        if failed:
            unavailable.append(failed)
            continue
        results.extend(
            {
                "id": r["id"],
                "name": r["name"],
                "database": label,
                "description": r["description"],
                # Short source-specific facts, e.g. "X-ray · 2.2 Å · 1999" for PDB.
                "meta": r.get("meta"),
                "link": r["link"],
                "retrieved_at": r.get("retrieved_at"),
                "provenance": r.get("provenance"),
            }
            for r in rows
        )
    return results, unavailable


@router.post("/search", dependencies=[Depends(limit(ratelimit.LOOKUPS))])
def search_databases(query: SearchQuery):
    """Search across live bioinformatics databases."""
    if query.database not in SEARCH_SOURCES:
        raise HTTPException(status_code=404, detail=f"Unknown database '{query.database}'")
    results, unavailable = run_search(query.database, query.query)
    if unavailable and not results:
        # Nothing answered: an error, not an empty result.
        raise SourceUnavailable(", ".join(unavailable))

    # The limit applies per source, so a source with many hits can't crowd
    # another out of its column.
    kept, per_source = [], {}
    for r in results:
        n = per_source.get(r["database"], 0)
        if n < query.limit:
            kept.append(r)
            per_source[r["database"]] = n + 1

    return {
        "query": query.query,
        "database": query.database,
        # Every source searched, in display order — including ones that found
        # nothing, so the interface can say "no matches in PDB" in its column.
        "sources": [label for label, _ in SEARCH_SOURCES[query.database]],
        "results": kept,
        # Sources that failed: their results are missing, not absent.
        "unavailable": unavailable,
    }


@router.get("/entity/{query}", dependencies=[Depends(limit(ratelimit.LOOKUPS))])
def get_entity(query: str):
    """
    One lookup, cross-referenced across databases.

    Instead of making a researcher search four databases separately and manually
    match identifiers, this resolves a gene/protein name to its canonical
    UniProt entry and returns the linked gene record, structures, and pathways
    together.
    """
    entity = db_connector.resolve_entity(query)  # UniProt down -> 503 (handler in main.py)
    if not entity:
        raise HTTPException(status_code=404, detail=f"No entity found for '{query}'")
    # A copy: the cached entry must not collect per-request fields.
    entity = dict(entity, unavailable=[])

    # Attach the NCBI Gene record for the resolved gene symbol. Uses the
    # symbol UniProt gives us rather than the raw user query, so a search
    # for a protein name still finds the right gene. NCBI being down costs
    # only this section, and is reported rather than shown as "no gene".
    gene_symbol = entity["genes"][0] if entity.get("genes") else query
    try:
        gene_hits = db_connector.search_ncbi_gene(gene_symbol)
    except SourceUnavailable as e:
        gene_hits = []
        entity["unavailable"].append(e.source)
    entity["genes_detail"] = [
        {
            "id": g["id"],
            "name": g["name"],
            "database": "NCBI Gene",
            "description": g["description"],
            "link": g["link"],
            "provenance": g.get("provenance"),
        }
        for g in gene_hits[:3]
    ]

    return entity


@router.get("/alphafold/{accession}", dependencies=[Depends(limit(ratelimit.LOOKUPS))])
def get_alphafold(accession: str):
    """
    AlphaFold model for an accession, fetched separately from /entity.

    Kept lazy for the same reason as literature: it's another round trip, and
    the cross-reference should render as soon as the core record is back
    rather than waiting on a structure the reader may not scroll to.
    """
    model = db_connector.fetch_alphafold(accession)
    if not model:
        raise HTTPException(status_code=404, detail=f"No AlphaFold model for '{accession}'")
    return model


@router.get("/literature/{gene_symbol}", dependencies=[Depends(limit(ratelimit.LOOKUPS))])
def get_literature(gene_symbol: str, limit: int = 5):
    """
    Related PubMed papers for a gene symbol.

    Separate from /entity: PubMed adds a second NCBI round trip on top of the
    gene lookup /entity already does, and researchers don't always want it —
    keeping it lazy means the entity page renders as soon as the core
    cross-reference is back, with literature filling in a beat later.
    """
    papers = db_connector.search_pubmed(gene_symbol, limit=limit)
    return {"gene_symbol": gene_symbol, "papers": papers}


@router.get("/sequence/{accession}", dependencies=[Depends(limit(ratelimit.LOOKUPS))])
def get_sequence(accession: str):
    """
    Fetch a single sequence by UniProt accession.

    Exists so sequences can travel between tools: a BLAST hit or a saved
    project item carries an accession but not the sequence itself, and
    without this the only way to align one would be to copy it out of
    UniProt by hand — which is exactly the manual step this app removes.
    """
    seq = db_connector.fetch_sequence(accession)
    if not seq:
        raise HTTPException(status_code=404, detail=f"No sequence found for '{accession}'")
    return seq


# ---- Batch lookup ----
# The single biggest time saver here: annotating a gene list one entry at a
# time is a routine hours-long chore, and it's pure mechanical lookup.

MAX_BATCH = 200
_BATCH_WORKERS = 8


def parse_identifiers(raw: List[str]) -> List[str]:
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


def batch_row(query: str, include_gene: bool) -> Dict:
    """Resolve one identifier into a flat row suitable for a table or CSV."""
    entity = db_connector.resolve_entity(query)
    if not entity:
        return {"query": query, "resolved": False}

    row: Dict[str, Optional[object]] = {
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
        "provenance": entity.get("provenance"),
    }

    # Off by default: NCBI is the rate-limited source, so enriching a 200-row
    # batch adds real wall-clock time. Opt in when the gene IDs are needed.
    if include_gene:
        symbol = entity["genes"][0] if entity.get("genes") else query
        hits = db_connector.search_ncbi_gene(symbol)
        row["gene_id"] = hits[0]["id"] if hits else None
        row["gene_link"] = hits[0]["link"] if hits else None

    return row


@router.post("/batch", dependencies=[Depends(limit(ratelimit.BATCHES))])
def batch_lookup(payload: BatchRequest):
    """
    Resolve many identifiers at once.

    Runs the lookups concurrently over a bounded pool — serial resolution of a
    100-gene list would take minutes. Failures are reported per row rather than
    failing the batch, since one unrecognised symbol in a list of 80 shouldn't
    cost the researcher the other 79.
    """
    identifiers = parse_identifiers(payload.identifiers)
    if not identifiers:
        raise HTTPException(status_code=400, detail="No identifiers provided")

    truncated = len(identifiers) > MAX_BATCH
    identifiers = identifiers[:MAX_BATCH]

    rows: Dict[str, Dict] = {}
    with ThreadPoolExecutor(max_workers=_BATCH_WORKERS) as pool:
        futures = {
            pool.submit(batch_row, ident, payload.include_gene): ident
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
