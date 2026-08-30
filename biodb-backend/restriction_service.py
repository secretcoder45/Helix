"""
Restriction mapping and virtual digest.

Enzyme recognition sites and cut offsets come from Biopython's REBASE-derived
tables — 600+ commercially available enzymes, each with its own site,
cut position and overhang. Typing even a handful of those by hand invites the
kind of error that produces a confident, wrong map.

What's built here is the analysis researchers actually want from that data:
which enzymes cut exactly once (the ones usable for linearising or directional
cloning), which don't cut at all (safe to use elsewhere in a construct), and
what a digest would look like on a gel.
"""

from typing import Dict, List, Optional

from Bio.Seq import Seq
from Bio.Restriction import RestrictionBatch, CommOnly, AllEnzymes

MAX_LENGTH = 100_000

# Reference ladders. Which one is appropriate depends on the fragment sizes:
# running 300 bp fragments against a 1 kb ladder is useless in practice
# because every ladder band sits above the sample, so the ladder is chosen to
# bracket the digest rather than being fixed.
LADDER_1KB = [10000, 8000, 6000, 5000, 4000, 3000, 2000, 1500, 1000, 500]
LADDER_100BP = [1500, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100]


def _pick_ladder(max_fragment: int) -> List[int]:
    return LADDER_100BP if max_fragment <= 1500 else LADDER_1KB


class RestrictionError(Exception):
    pass


def _clean(sequence: str) -> str:
    lines = [ln for ln in (sequence or "").strip().splitlines() if not ln.startswith(">")]
    return "".join(lines).replace(" ", "").upper().replace("U", "T")


def _fragments(cuts: List[int], length: int, circular: bool) -> List[int]:
    """
    Fragment lengths from a sorted list of cut positions.

    Circular topology is not a detail: a plasmid cut once is linearised into a
    single full-length fragment, while a linear molecule cut once gives two.
    Getting this wrong makes every predicted gel wrong.
    """
    if not cuts:
        return [length]
    ordered = sorted(cuts)
    if circular:
        out = []
        for i in range(len(ordered)):
            a = ordered[i]
            b = ordered[(i + 1) % len(ordered)]
            out.append((b - a) % length or length)
        return sorted(out, reverse=True)
    bounds = [0] + ordered + [length]
    return sorted((bounds[i + 1] - bounds[i] for i in range(len(bounds) - 1)), reverse=True)


def analyse(
    sequence: str,
    enzymes: Optional[List[str]] = None,
    circular: bool = False,
    commercial_only: bool = True,
) -> Dict:
    seq = _clean(sequence)

    if len(seq) < 10:
        raise RestrictionError("Sequence too short to map (minimum 10 bases)")
    if len(seq) > MAX_LENGTH:
        raise RestrictionError(f"Sequence must be {MAX_LENGTH} bases or shorter")

    unknown = sorted(set(seq) - set("ACGTN"))
    if unknown:
        raise RestrictionError(
            f"Not a nucleotide sequence — unexpected characters: {', '.join(unknown)}"
        )

    if enzymes:
        pool = AllEnzymes if not commercial_only else CommOnly
        by_name = {str(e): e for e in pool}
        missing = [n for n in enzymes if n not in by_name]
        if missing:
            raise RestrictionError(f"Unknown enzyme(s): {', '.join(missing)}")
        batch = RestrictionBatch([by_name[n] for n in enzymes])
    else:
        batch = RestrictionBatch(list(CommOnly))

    bio = Seq(seq)
    hits = batch.search(bio, linear=not circular)

    results = []
    for enzyme, sites in hits.items():
        if not sites:
            continue
        results.append(
            {
                "enzyme": str(enzyme),
                "site": str(enzyme.site),
                "cuts": sorted(sites),
                "n_cuts": len(sites),
                "fragments": _fragments(sites, len(seq), circular),
                # Overhang matters for whether two digests can be ligated.
                "overhang": (
                    "blunt" if enzyme.is_blunt() else "5'" if enzyme.is_5overhang() else "3'"
                ),
            }
        )

    results.sort(key=lambda r: (r["n_cuts"], r["enzyme"]))

    non_cutters = sorted(str(e) for e, s in hits.items() if not s)

    return {
        "length": len(seq),
        "circular": circular,
        "enzymes_screened": len(hits),
        "cutters": results,
        "unique_cutters": [r for r in results if r["n_cuts"] == 1],
        "non_cutters": non_cutters,
        "ladder": _pick_ladder(max((max(r["fragments"]) for r in results), default=len(seq))),
    }
