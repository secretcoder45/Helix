"""
Analysis computed here rather than by an external service: alignment,
protein properties, DNA, trees, restriction maps, variants, primers.

CPU-bound local work, so nothing to cache or retry — only rate-limited, since
a long alignment is real work for a small server.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import alignment_service
import dna_service
import phylo_service
import primer_service
import protein_properties
import provenance as prov
import ratelimit
import restriction_service
import variant_service
from ratelimit import limit

router = APIRouter(tags=["Analyse"], dependencies=[Depends(limit(ratelimit.COMPUTE))])


class AlignRequest(BaseModel):
    seq1: str
    seq2: str
    sequence_type: str = "protein"
    matrix: str = "BLOSUM62"
    gap_open: float = -10.0
    gap_extend: float = -0.5
    match_score: float = 5.0
    mismatch_score: float = -4.0


class PropertiesRequest(BaseModel):
    sequence: str


class PhyloSequence(BaseModel):
    label: str = ""
    sequence: str


class PhyloRequest(BaseModel):
    sequences: List[PhyloSequence]
    method: str = "nj"
    sequence_type: str = "protein"
    matrix: str = "BLOSUM62"
    gap_open: float = -10.0
    gap_extend: float = -0.5


class RestrictionRequest(BaseModel):
    sequence: str
    enzymes: Optional[List[str]] = None
    circular: bool = False


class VariantRequest(BaseModel):
    gene: str
    variant: str


class PrimerRequest(BaseModel):
    template: str
    target_start: Optional[int] = None
    target_end: Optional[int] = None
    min_len: Optional[int] = None
    max_len: Optional[int] = None
    min_tm: Optional[float] = None
    max_tm: Optional[float] = None
    min_gc: Optional[float] = None
    max_gc: Optional[float] = None


class DnaRequest(BaseModel):
    sequence: str
    min_orf_aa: int = 30
    gc_window: int = 50


_VALID_SEQ_TYPES = {"protein", "dna"}


def _align(algorithm, payload: AlignRequest):
    if payload.sequence_type not in _VALID_SEQ_TYPES:
        raise HTTPException(
            status_code=400, detail=f"sequence_type must be one of {sorted(_VALID_SEQ_TYPES)}"
        )
    try:
        result = algorithm(
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
    result["provenance"] = prov.computation()
    return result


@router.post("/align/needleman-wunsch")
def align_needleman_wunsch(payload: AlignRequest):
    """Global alignment."""
    return _align(alignment_service.needleman_wunsch, payload)


@router.post("/align/smith-waterman")
def align_smith_waterman(payload: AlignRequest):
    """Local alignment."""
    return _align(alignment_service.smith_waterman, payload)


@router.post("/properties")
def protein_props(payload: PropertiesRequest):
    """Physicochemical properties plus the titration curve."""
    try:
        return protein_properties.analyse(payload.sequence)
    except protein_properties.PropertyError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/dna")
def dna_analyse(payload: DnaRequest):
    """Nucleotide analysis: composition, GC profile, six-frame translation, ORFs."""
    try:
        return dna_service.analyse(
            payload.sequence,
            min_orf_aa=max(1, payload.min_orf_aa),
            gc_window=max(5, payload.gc_window),
        )
    except dna_service.DnaError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/phylo")
def phylo_build(payload: PhyloRequest):
    """Pairwise distance matrix and a tree, from this app's own aligner."""
    try:
        return phylo_service.build(
            [s.model_dump() for s in payload.sequences],
            method=payload.method,
            sequence_type=payload.sequence_type,
            matrix=payload.matrix,
            gap_open=payload.gap_open,
            gap_extend=payload.gap_extend,
        )
    except (phylo_service.PhyloError, alignment_service.AlignmentError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/restriction")
def restriction_map(payload: RestrictionRequest):
    """Restriction sites, fragments and a predicted digest."""
    try:
        return restriction_service.analyse(
            payload.sequence, enzymes=payload.enzymes, circular=payload.circular
        )
    except restriction_service.RestrictionError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/variant")
def variant_analyse(payload: VariantRequest):
    """Assemble what is known about a missense substitution at one position."""
    try:
        return variant_service.analyse(payload.gene, payload.variant)
    except variant_service.VariantError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/primers")
def design_primers(payload: PrimerRequest):
    """PCR primer pairs for a template, with nearest-neighbour Tm."""
    try:
        return primer_service.design(
            payload.template,
            target_start=payload.target_start,
            target_end=payload.target_end,
            min_len=payload.min_len,
            max_len=payload.max_len,
            min_tm=payload.min_tm,
            max_tm=payload.max_tm,
            min_gc=payload.min_gc,
            max_gc=payload.max_gc,
        )
    except primer_service.PrimerError as e:
        raise HTTPException(status_code=400, detail=str(e))
