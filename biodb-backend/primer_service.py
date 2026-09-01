"""
PCR primer design.

Thermodynamics come from Biopython's nearest-neighbour melting-temperature
model (SantaLucia parameters) rather than the Wallace 2*(A+T)+4*(G+C) rule,
which is a rough approximation that disagrees with reality by several degrees
on anything but short, balanced primers — and a few degrees is the difference
between a clean band and nothing.

The selection criteria are the standard ones and are stated explicitly rather
than hidden in a score, because which ones matter depends on the protocol:
length, Tm window, GC fraction, a GC clamp at the 3' end, no long single-base
runs, and no self-complementarity that would let a primer fold back on itself
or dimerise.
"""

from typing import Dict, List, Optional

from Bio.Seq import Seq
from Bio.SeqUtils import gc_fraction, MeltingTemp as mt

MAX_TEMPLATE = 50_000

DEFAULTS = {
    "min_len": 18,
    "max_len": 25,
    "min_tm": 55.0,
    "max_tm": 65.0,
    "min_gc": 40.0,
    "max_gc": 60.0,
    "max_tm_diff": 3.0,  # forward/reverse pairs should anneal at the same temperature
}

COMPLEMENT = {"A": "T", "T": "A", "G": "C", "C": "G", "N": "N"}


class PrimerError(Exception):
    pass


def _clean(seq: str) -> str:
    lines = [ln for ln in (seq or "").strip().splitlines() if not ln.startswith(">")]
    return "".join(lines).replace(" ", "").upper().replace("U", "T")


def _max_homopolymer(seq: str) -> int:
    best = run = 1
    for i in range(1, len(seq)):
        run = run + 1 if seq[i] == seq[i - 1] else 1
        best = max(best, run)
    return best


def _self_complementarity(seq: str) -> int:
    """
    Longest self-complementary stretch — the crude proxy for hairpins and
    self-dimers. A primer that can pair with itself competes with binding the
    template, so this is a rejection criterion, not a nicety.
    """
    rc = "".join(COMPLEMENT.get(b, "N") for b in reversed(seq))
    best = 0
    for size in range(4, len(seq) // 2 + 1):
        for i in range(len(seq) - size + 1):
            if seq[i : i + size] in rc:
                best = max(best, size)
    return best


def _three_prime_clamp(seq: str) -> bool:
    """A G or C in the last two bases — stabilises the 3' end where extension
    starts. More than three raises mispriming risk, so that's rejected too."""
    last5 = seq[-5:]
    gc_last5 = sum(1 for b in last5 if b in "GC")
    return seq[-1] in "GC" and gc_last5 <= 3


def _evaluate(seq: str, opts: Dict, rejected: Dict = None) -> Optional[Dict]:
    """
    Returns the primer's stats, or None with the failing criterion recorded.

    Tracking *why* candidates fail is the difference between "no primers
    found" and "all 316 candidates failed the GC filter — this region is 72%
    GC". The first looks like a broken tool; the second is a real finding
    about the template, and tells the user which knob to turn.
    """
    def fail(reason):
        if rejected is not None:
            rejected[reason] = rejected.get(reason, 0) + 1
        return None

    if len(seq) < opts["min_len"] or len(seq) > opts["max_len"]:
        return fail("length")
    if "N" in seq:
        return fail("ambiguous base")

    gc = gc_fraction(seq) * 100
    if not (opts["min_gc"] <= gc <= opts["max_gc"]):
        return fail("GC content")

    tm = float(mt.Tm_NN(Seq(seq)))
    if not (opts["min_tm"] <= tm <= opts["max_tm"]):
        return fail("melting temperature")

    if _max_homopolymer(seq) > 4:
        return fail("homopolymer run")
    if not _three_prime_clamp(seq):
        return fail("3' GC clamp")

    self_comp = _self_complementarity(seq)
    if self_comp >= 6:
        return fail("self-complementarity")

    return {
        "sequence": seq,
        "length": len(seq),
        "tm": round(tm, 1),
        "gc": round(gc, 1),
        "self_complementarity": self_comp,
        "max_homopolymer": _max_homopolymer(seq),
    }


def design(
    template: str,
    target_start: Optional[int] = None,
    target_end: Optional[int] = None,
    **overrides,
) -> Dict:
    seq = _clean(template)
    opts = {**DEFAULTS, **{k: v for k, v in overrides.items() if v is not None}}

    if len(seq) < 60:
        raise PrimerError("Template too short to design primers (minimum 60 bases)")
    if len(seq) > MAX_TEMPLATE:
        raise PrimerError(f"Template must be {MAX_TEMPLATE} bases or shorter")
    unknown = sorted(set(seq) - set("ACGTN"))
    if unknown:
        raise PrimerError(f"Not a nucleotide sequence — unexpected: {', '.join(unknown)}")

    start = 1 if target_start is None else max(1, target_start)
    end = len(seq) if target_end is None else min(len(seq), target_end)
    if end - start + 1 < 50:
        raise PrimerError("Target region must be at least 50 bases")

    # Search windows: forward primers anneal at or before the target start,
    # reverse primers at or after the target end, so the product spans the
    # whole region of interest.
    window = 60
    fwd_zone = seq[max(0, start - 1 - window) : start - 1 + window]
    fwd_offset = max(0, start - 1 - window)
    rev_zone = seq[max(0, end - window) : min(len(seq), end + window)]
    rev_offset = max(0, end - window)

    rejected = {}
    forwards = []
    for i in range(len(fwd_zone)):
        for L in range(opts["min_len"], opts["max_len"] + 1):
            if i + L > len(fwd_zone):
                break
            cand = _evaluate(fwd_zone[i : i + L], opts, rejected)
            if cand:
                cand["start"] = fwd_offset + i + 1
                cand["end"] = fwd_offset + i + L
                cand["strand"] = "+"
                forwards.append(cand)

    reverses = []
    for i in range(len(rev_zone)):
        for L in range(opts["min_len"], opts["max_len"] + 1):
            if i + L > len(rev_zone):
                break
            sub = rev_zone[i : i + L]
            primer = str(Seq(sub).reverse_complement())
            cand = _evaluate(primer, opts, rejected)
            if cand:
                cand["start"] = rev_offset + i + 1
                cand["end"] = rev_offset + i + L
                cand["strand"] = "-"
                reverses.append(cand)

    # Pair them: matched Tm first, then a product spanning the target.
    pairs = []
    for f in forwards:
        for r in reverses:
            if r["end"] <= f["start"]:
                continue
            tm_diff = abs(f["tm"] - r["tm"])
            if tm_diff > opts["max_tm_diff"]:
                continue
            product = r["end"] - f["start"] + 1
            if product < 70:
                continue
            pairs.append(
                {
                    "forward": f,
                    "reverse": r,
                    "tm_diff": round(tm_diff, 1),
                    "product_size": product,
                    "spans_target": f["start"] <= start and r["end"] >= end,
                }
            )

    # Rank: covering the target beats not covering it, then matched Tm, then
    # a shorter product.
    pairs.sort(key=lambda p: (not p["spans_target"], p["tm_diff"], p["product_size"]))

    return {
        "template_length": len(seq),
        "target": {"start": start, "end": end},
        "criteria": opts,
        "pairs": pairs[:10],
        "forward_candidates": len(forwards),
        "reverse_candidates": len(reverses),
        # Sorted so the dominant reason leads — that's the constraint to relax.
        "rejected": dict(sorted(rejected.items(), key=lambda kv: -kv[1])),
        "region_gc": round(gc_fraction(seq[start - 1 : end]) * 100, 1),
    }
