"""
Physicochemical properties of a protein sequence.

Computed with Biopython's ProtParam rather than hand-rolled, for the same
reason BLOSUM62 is loaded rather than typed: these are published algorithms
carrying large constant tables (the instability index alone is a 400-entry
dipeptide matrix), and a silent transcription error there would produce
plausible-looking numbers that are simply wrong. ProtParam mirrors ExPASy
ProtParam, which is the reference researchers actually compare against.

The titration curve is the one thing assembled here rather than taken whole:
Biopython exposes charge at a single pH, so the curve is that sampled across
the pH range. Its defining property — net charge crosses zero exactly at the
isoelectric point — is asserted in the tests, which is what makes the curve
and the reported pI verifiably the same model rather than two guesses.
"""

from typing import Dict, List

from Bio.SeqUtils.ProtParam import ProteinAnalysis
from Bio.SeqUtils.IsoelectricPoint import IsoelectricPoint

STANDARD_RESIDUES = set("ACDEFGHIKLMNPQRSTVWY")

MAX_LENGTH = 10_000


class PropertyError(Exception):
    pass


def _clean(sequence: str) -> str:
    """Strip FASTA headers and whitespace; uppercase."""
    lines = [ln for ln in (sequence or "").strip().splitlines() if not ln.startswith(">")]
    return "".join(lines).replace(" ", "").upper()


def analyse(sequence: str, ph_step: float = 0.1) -> Dict:
    seq = _clean(sequence)

    if len(seq) < 3:
        raise PropertyError("Sequence too short to analyse (minimum 3 residues)")
    if len(seq) > MAX_LENGTH:
        raise PropertyError(f"Sequence must be {MAX_LENGTH} residues or shorter")

    unknown = sorted(set(seq) - STANDARD_RESIDUES)
    if unknown:
        # ProtParam raises on non-standard residues rather than skipping them,
        # so say which ones rather than surfacing a KeyError.
        raise PropertyError(
            f"Sequence contains non-standard residues: {', '.join(unknown)}. "
            "Only the 20 standard amino acids are supported."
        )

    pa = ProteinAnalysis(seq)
    ip = IsoelectricPoint(seq)
    pi = ip.pi()

    reduced, oxidised = pa.molar_extinction_coefficient()
    helix, turn, sheet = pa.secondary_structure_fraction()

    # Net charge across the pH range — the titration curve.
    curve: List[Dict] = []
    ph = 0.0
    while ph <= 14.0001:
        curve.append({"ph": round(ph, 2), "charge": round(ip.charge_at_pH(ph), 4)})
        ph += ph_step

    instability = pa.instability_index()

    return {
        "length": len(seq),
        "molecular_weight": round(pa.molecular_weight(), 2),
        "isoelectric_point": round(pi, 2),
        "gravy": round(pa.gravy(), 4),
        "instability_index": round(instability, 2),
        # Guinard et al.'s threshold: above 40 the protein is predicted unstable.
        "stable": instability <= 40,
        "aromaticity": round(pa.aromaticity(), 4),
        "extinction_coefficient": {"reduced": reduced, "cystines": oxidised},
        "secondary_structure": {
            "helix": round(helix, 4),
            "turn": round(turn, 4),
            "sheet": round(sheet, 4),
        },
        "charge_at_ph7": round(ip.charge_at_pH(7.0), 3),
        "titration_curve": curve,
        "sequence": seq,
    }
