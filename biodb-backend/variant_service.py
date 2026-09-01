"""
Missense variant analysis.

Nothing here calls a prediction service. The point is to assemble what is
already known about a position from sources this app already talks to, and
show the reasoning rather than a single opaque verdict:

  - does the substitution land inside an annotated domain or on a catalytic
    or binding residue (UniProt features)
  - is it a known variant, and what clinical significance is recorded
  - how chemically drastic is the swap (BLOSUM62, the same matrix the
    aligner uses)
  - do the two residues differ in charge or hydropathy class

A deliberately un-scored output. Combining these into one number would imply
a calibrated predictor, which this is not — and a confident wrong number
about a clinical variant is worse than no number.
"""

import re
from typing import Dict, List, Optional

from Bio.Align import substitution_matrices

from database_apis import db_connector

BLOSUM62 = substitution_matrices.load("BLOSUM62")

THREE_TO_ONE = {
    "Ala": "A", "Arg": "R", "Asn": "N", "Asp": "D", "Cys": "C",
    "Gln": "Q", "Glu": "E", "Gly": "G", "His": "H", "Ile": "I",
    "Leu": "L", "Lys": "K", "Met": "M", "Phe": "F", "Pro": "P",
    "Ser": "S", "Thr": "T", "Trp": "W", "Tyr": "Y", "Val": "V",
}

HYDROPATHY_CLASS = {
    **{r: "hydrophobic" for r in "AVLIMFWC"},
    **{r: "polar" for r in "STNQY"},
    **{r: "charged" for r in "DEKRH"},
    **{r: "special" for r in "GP"},
}

CHARGE = {"D": -1, "E": -1, "K": 1, "R": 1, "H": 1}

# Features where a substitution is mechanistically significant rather than
# merely located somewhere annotated.
CRITICAL_TYPES = {"Active site", "Binding site", "Site", "Disulfide bond"}


class VariantError(Exception):
    pass


def parse_variant(notation: str) -> Dict:
    """
    Parse HGVS-ish protein notation.

    Accepts p.Arg1699Trp, Arg1699Trp, p.R1699W and R1699W — all four turn up
    in papers and clinical reports, and rejecting three of them would just
    make the tool annoying.
    """
    text = (notation or "").strip()
    text = re.sub(r"^p\.", "", text, flags=re.IGNORECASE)

    m = re.fullmatch(r"([A-Za-z]{3})(\d+)([A-Za-z]{3})", text)
    if m:
        ref, pos, alt = m.group(1).capitalize(), int(m.group(2)), m.group(3).capitalize()
        if ref not in THREE_TO_ONE or alt not in THREE_TO_ONE:
            raise VariantError(f"Unknown amino acid in '{notation}'")
        return {"ref": THREE_TO_ONE[ref], "position": pos, "alt": THREE_TO_ONE[alt]}

    m = re.fullmatch(r"([A-Za-z])(\d+)([A-Za-z])", text)
    if m:
        ref, pos, alt = m.group(1).upper(), int(m.group(2)), m.group(3).upper()
        if ref not in THREE_TO_ONE.values() or alt not in THREE_TO_ONE.values():
            raise VariantError(f"Unknown amino acid in '{notation}'")
        return {"ref": ref, "position": pos, "alt": alt}

    raise VariantError(
        f"Could not parse '{notation}'. Use a form like p.Arg1699Trp or R1699W."
    )


def analyse(gene_or_accession: str, notation: str) -> Dict:
    variant = parse_variant(notation)
    entity = db_connector.resolve_entity(gene_or_accession)
    if not entity:
        raise VariantError(f"No protein found for '{gene_or_accession}'")

    sequence = entity.get("sequence", {}).get("value", "")
    pos, ref, alt = variant["position"], variant["ref"], variant["alt"]

    if pos > len(sequence):
        raise VariantError(
            f"Position {pos} is past the end of {entity['name']} ({len(sequence)} residues)"
        )

    # The single most important check: does the stated reference residue
    # actually match the sequence? A mismatch usually means the numbering is
    # against a different isoform, and every downstream conclusion would be
    # about the wrong residue.
    actual = sequence[pos - 1]
    ref_matches = actual == ref

    score = None
    try:
        score = float(BLOSUM62[ref][alt])
    except KeyError:
        pass

    overlapping = [
        f
        for f in entity.get("features", [])
        if f["start"] <= pos <= f["end"]
    ]
    critical = [f for f in overlapping if f["type"] in CRITICAL_TYPES]

    known = db_connector.fetch_variants(entity["accession"], pos)

    return {
        "gene": entity.get("genes", [gene_or_accession])[0],
        "accession": entity["accession"],
        "protein_name": entity.get("protein_name"),
        "notation": notation,
        "position": pos,
        "ref": ref,
        "alt": alt,
        "sequence_length": len(sequence),
        "reference_matches": ref_matches,
        "actual_residue": actual,
        "context": sequence[max(0, pos - 11) : pos + 10],
        "context_offset": max(0, pos - 11) + 1,
        "blosum62": score,
        "conservative": score is not None and score >= 0,
        "charge_change": CHARGE.get(alt, 0) - CHARGE.get(ref, 0),
        "class_change": (HYDROPATHY_CLASS.get(ref), HYDROPATHY_CLASS.get(alt)),
        "features": overlapping,
        "critical_features": critical,
        "known_variants": known,
        "retrieved_at": entity.get("retrieved_at"),
    }
