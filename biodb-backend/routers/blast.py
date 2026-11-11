"""
BLAST: sequence similarity search against NCBI's live databases.

Three endpoints rather than one — submit, poll, fetch — mirroring how the
NCBI API itself works, since a search takes real time (30 s to minutes),
instead of hiding the wait behind a single blocking call.
"""

import re
import xml.etree.ElementTree as ET

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import blast_service
import ratelimit
from ratelimit import limit

router = APIRouter(prefix="/blast", tags=["Look up"])

_VALID_PROGRAMS = {"blastp", "blastn", "blastx"}
_VALID_DATABASES = {"swissprot", "nr", "nt"}
_SEQUENCE_RE = re.compile(r"^[A-Za-z\*\-\s]+$")
_MAX_SEQUENCE_LENGTH = 10_000


class BlastSubmit(BaseModel):
    sequence: str
    program: str = "blastp"
    database: str = "swissprot"


def clean_sequence(raw: str) -> str:
    """Strip a FASTA header line and whitespace, if present, so pasting a
    header-and-all FASTA record works the same as pasting a bare sequence."""
    lines = [ln for ln in raw.strip().splitlines() if not ln.startswith(">")]
    return "".join(ln.strip() for ln in lines)


@router.post("/submit", dependencies=[Depends(limit(ratelimit.BLAST))])
def blast_submit(payload: BlastSubmit):
    if payload.program not in _VALID_PROGRAMS:
        raise HTTPException(status_code=400, detail=f"program must be one of {sorted(_VALID_PROGRAMS)}")
    if payload.database not in _VALID_DATABASES:
        raise HTTPException(status_code=400, detail=f"database must be one of {sorted(_VALID_DATABASES)}")

    sequence = clean_sequence(payload.sequence)
    if len(sequence) < 10:
        raise HTTPException(status_code=400, detail="Sequence too short to search (minimum 10 residues)")
    if len(sequence) > _MAX_SEQUENCE_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Sequence too long ({len(sequence)} chars, max {_MAX_SEQUENCE_LENGTH})",
        )
    if not _SEQUENCE_RE.match(sequence):
        raise HTTPException(status_code=400, detail="Sequence contains characters outside the standard alphabet")

    try:
        return blast_service.submit_search(sequence, payload.program, payload.database)
    except blast_service.BlastError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/status/{rid}")
def blast_status(rid: str):
    try:
        status = blast_service.check_status(rid)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"rid": rid, "status": status}


@router.get("/results/{rid}")
def blast_results(rid: str):
    try:
        hits = blast_service.fetch_results(rid)
    except blast_service.BlastError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except ET.ParseError:
        raise HTTPException(status_code=502, detail="NCBI returned a result that could not be parsed")
    return {"rid": rid, "hits": hits}
