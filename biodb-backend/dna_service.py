"""
Nucleotide sequence analysis.

The genetic code, melting-temperature models and GC calculation come from
Biopython rather than being written out here — same reasoning as BLOSUM62 and
ProtParam. A codon table is 64 published entries and a single wrong one would
mistranslate silently.

What is implemented here is the ORF search across all six reading frames,
because that's a decision procedure rather than a constant table: which
codons count as starts, whether an ORF must be stop-terminated, and how the
minimum length is applied all change the answer, and those choices should be
visible rather than buried in a library default.
"""

from typing import Dict, List

from Bio.Seq import Seq
from Bio.SeqUtils import gc_fraction, MeltingTemp as mt

MAX_LENGTH = 50_000
VALID = set("ACGTUN")

# Standard genetic code (NCBI table 1). ATG only as a start: the alternative
# starts TTG/CTG are real in bacteria but produce a flood of spurious ORFs in
# eukaryotic sequence, which is what people paste here.
START_CODON = "ATG"
STOP_CODONS = {"TAA", "TAG", "TGA"}


class DnaError(Exception):
    pass


def _clean(sequence: str) -> str:
    lines = [ln for ln in (sequence or "").strip().splitlines() if not ln.startswith(">")]
    return "".join(lines).replace(" ", "").upper().replace("U", "T")


def find_orfs(seq: str, min_aa: int = 30) -> List[Dict]:
    """
    Open reading frames in all six frames.

    An ORF here is ATG -> in-frame stop, at least `min_aa` codons long. Only
    the outermost ATG of a nested run is reported: every downstream in-frame
    ATG before the same stop technically opens an ORF too, and reporting all
    of them buries the real signal under near-duplicates.

    Coordinates are 1-based inclusive on the FORWARD strand for both strands,
    so an ORF's position means the same thing regardless of which strand it
    came from — otherwise reverse-strand hits can't be compared against
    forward ones on a shared axis.
    """
    n = len(seq)
    rev = str(Seq(seq).reverse_complement())
    orfs = []

    for strand, s in (("+", seq), ("-", rev)):
        for frame in range(3):
            i = frame
            while i < len(s) - 2:
                if s[i : i + 3] != START_CODON:
                    i += 3
                    continue
                # Walk to the first in-frame stop.
                j = i + 3
                stop = None
                while j < len(s) - 2:
                    if s[j : j + 3] in STOP_CODONS:
                        stop = j
                        break
                    j += 3
                if stop is None:
                    # Runs off the end — not a complete ORF.
                    i += 3
                    continue

                aa_len = (stop - i) // 3
                if aa_len >= min_aa:
                    protein = str(Seq(s[i:stop]).translate())
                    if strand == "+":
                        start, end = i + 1, stop + 3
                    else:
                        # Map back onto forward-strand coordinates.
                        start, end = n - (stop + 3) + 1, n - i
                    orfs.append(
                        {
                            "strand": strand,
                            "frame": frame + 1 if strand == "+" else -(frame + 1),
                            "start": start,
                            "end": end,
                            "length_nt": stop + 3 - i,
                            "length_aa": aa_len,
                            "protein": protein,
                        }
                    )
                # Skip past this ORF rather than restarting inside it.
                i = stop + 3

    orfs.sort(key=lambda o: (-o["length_aa"], o["start"]))
    return orfs


def gc_profile(seq: str, window: int = 50) -> List[float]:
    """Sliding-window GC fraction — reveals GC islands a single number hides."""
    if len(seq) < window:
        return [gc_fraction(seq) * 100] if seq else []
    half = window // 2
    out = []
    for i in range(len(seq)):
        lo = max(0, i - half)
        hi = min(len(seq), i + half + 1)
        chunk = seq[lo:hi]
        gc = sum(1 for c in chunk if c in "GC")
        out.append(100 * gc / len(chunk))
    return out


def analyse(sequence: str, min_orf_aa: int = 30, gc_window: int = 50) -> Dict:
    seq = _clean(sequence)

    if len(seq) < 6:
        raise DnaError("Sequence too short to analyse (minimum 6 bases)")
    if len(seq) > MAX_LENGTH:
        raise DnaError(f"Sequence must be {MAX_LENGTH} bases or shorter")

    unknown = sorted(set(seq) - VALID)
    if unknown:
        raise DnaError(
            f"Not a nucleotide sequence — unexpected characters: {', '.join(unknown)}"
        )

    bio = Seq(seq)
    counts = {b: seq.count(b) for b in "ACGT"}

    # Tm: Wallace is the rule-of-thumb primers are usually quoted with;
    # nearest-neighbour is the accurate model. Both, because they disagree
    # substantially and which one someone wants depends on their protocol.
    tm = {}
    if 8 <= len(seq) <= 200 and "N" not in seq:
        tm = {
            "wallace": round(mt.Tm_Wallace(bio), 1),
            "nearest_neighbour": round(mt.Tm_NN(bio), 1),
        }

    # Trim each frame to a whole number of codons before translating —
    # Biopython warns on a trailing partial codon, and silently dropping it is
    # the intended behaviour here, so say so explicitly.
    def _translate_frame(s: str, offset: int) -> str:
        body = s[offset:]
        return str(Seq(body[: len(body) - len(body) % 3]).translate())

    rc = str(bio.reverse_complement())
    frames = {}
    for f in range(3):
        frames[f"+{f + 1}"] = _translate_frame(seq, f)
        frames[f"-{f + 1}"] = _translate_frame(rc, f)

    return {
        "length": len(seq),
        "sequence": seq,
        "reverse_complement": rc,
        "rna": str(bio.transcribe()),
        "gc_content": round(gc_fraction(bio) * 100, 2),
        "base_counts": counts,
        "melting_temperature": tm,
        "gc_profile": [round(v, 2) for v in gc_profile(seq, gc_window)],
        "gc_window": gc_window,
        "frames": frames,
        "orfs": find_orfs(seq, min_orf_aa),
        "min_orf_aa": min_orf_aa,
    }
