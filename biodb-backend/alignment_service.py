"""
Sequence alignment, computed locally rather than via an external API.

Needleman-Wunsch (global alignment) is implemented here directly — not
delegated to a library — because the point of this tool is transparency
into the algorithm and zero dependency on any external service's uptime or
queue (see BLAST's queue problems for the alternative). What IS taken from
a library is the BLOSUM62 substitution matrix itself: hand-transcribing a
24x24 matrix from memory risks a silent transcription error, which is a far
worse failure mode than "boring, reuses a well-known data source." Biopython
ships the real NCBI matrix; this module owns the algorithm, Biopython owns
the data.

Correctness matters more here than almost anywhere else in the app — a
wrong alignment score looks completely normal and would be trusted at face
value. See test_alignment.py: every hand-rolled result here is cross-checked
against Bio.Align.PairwiseAligner, an independent implementation, not just
asserted against itself.

Uses Gotoh's algorithm (three DP matrices) for affine gap penalties rather
than the textbook single-matrix version. The single-matrix version charges
every gap position equally, which biologically prefers many short gaps over
one long one — backwards from how insertions/deletions actually happen in
real sequences. Affine penalties (an expensive gap-open, a cheap
gap-extend) fix that.
"""

from typing import Dict, List, Literal, Optional

from Bio.Align import substitution_matrices

NEG_INF = float("-inf")

SequenceType = Literal["protein", "dna"]

_PROTEIN_MATRICES = {name: substitution_matrices.load(name) for name in ("BLOSUM62", "BLOSUM45", "BLOSUM80", "PAM250")}

MAX_SEQUENCE_LENGTH = 1000  # O(n*m) memory: three matrices at 1000x1000 is a few tens of MB, safe on a free-tier instance


class AlignmentError(Exception):
    pass


def _dna_score_fn(match: float, mismatch: float):
    def score(a: str, b: str) -> float:
        return match if a == b else mismatch

    return score


def _protein_score_fn(matrix_name: str):
    if matrix_name not in _PROTEIN_MATRICES:
        raise AlignmentError(f"Unknown matrix '{matrix_name}'. Choose one of {list(_PROTEIN_MATRICES)}")
    matrix = _PROTEIN_MATRICES[matrix_name]

    def score(a: str, b: str) -> float:
        try:
            return matrix[a][b]
        except KeyError:
            # Ambiguity codes / non-standard residues the matrix doesn't cover.
            return matrix["X"]["X"] if "X" in matrix.alphabet else -1.0

    return score


def needleman_wunsch(
    seq1: str,
    seq2: str,
    sequence_type: SequenceType = "protein",
    matrix: str = "BLOSUM62",
    gap_open: float = -10.0,
    gap_extend: float = -0.5,
    match_score: float = 5.0,
    mismatch_score: float = -4.0,
) -> Dict:
    """
    Global alignment via Gotoh's algorithm.

    gap_open is the cost of starting a gap; gap_extend is the (cheaper) cost
    of each additional position in an already-open gap. Both should be
    negative. Returns the alignment, its score, and identity/similarity
    stats over the aligned length.
    """
    seq1, seq2 = seq1.upper().strip(), seq2.upper().strip()

    if not seq1 or not seq2:
        raise AlignmentError("Both sequences must be non-empty")
    if len(seq1) > MAX_SEQUENCE_LENGTH or len(seq2) > MAX_SEQUENCE_LENGTH:
        raise AlignmentError(f"Sequences must be {MAX_SEQUENCE_LENGTH} residues or shorter")
    if gap_open > 0 or gap_extend > 0:
        raise AlignmentError("Gap penalties must be negative (or zero)")

    score_fn = (
        _dna_score_fn(match_score, mismatch_score)
        if sequence_type == "dna"
        else _protein_score_fn(matrix)
    )

    n, m = len(seq1), len(seq2)

    # Three matrices, per Gotoh (1982):
    #   M[i][j]  = best score ending in a match/mismatch at (i, j)
    #   Ix[i][j] = best score ending in a gap in seq2 (a "deletion" — seq1 consumed, seq2 not)
    #   Iy[i][j] = best score ending in a gap in seq1 (an "insertion")
    M = [[0.0] * (m + 1) for _ in range(n + 1)]
    Ix = [[0.0] * (m + 1) for _ in range(n + 1)]
    Iy = [[0.0] * (m + 1) for _ in range(n + 1)]

    for i in range(1, n + 1):
        M[i][0] = NEG_INF
        Ix[i][0] = gap_open + (i - 1) * gap_extend
        Iy[i][0] = NEG_INF
    for j in range(1, m + 1):
        M[0][j] = NEG_INF
        Ix[0][j] = NEG_INF
        Iy[0][j] = gap_open + (j - 1) * gap_extend

    for i in range(1, n + 1):
        a = seq1[i - 1]
        row_M, row_Ix, row_Iy = M[i], Ix[i], Iy[i]
        prev_M, prev_Ix, prev_Iy = M[i - 1], Ix[i - 1], Iy[i - 1]
        for j in range(1, m + 1):
            b = seq2[j - 1]
            s = score_fn(a, b)
            row_M[j] = max(prev_M[j - 1], prev_Ix[j - 1], prev_Iy[j - 1]) + s
            row_Ix[j] = max(M[i - 1][j] + gap_open, Ix[i - 1][j] + gap_extend)
            row_Iy[j] = max(row_M[j - 1] + gap_open, row_Iy[j - 1] + gap_extend)

    final_scores = {"M": M[n][m], "Ix": Ix[n][m], "Iy": Iy[n][m]}
    best_matrix = max(final_scores, key=final_scores.get)
    score = final_scores[best_matrix]

    aligned1, aligned2 = [], []
    i, j, state = n, m, best_matrix

    while i > 0 or j > 0:
        if state == "M":
            aligned1.append(seq1[i - 1])
            aligned2.append(seq2[j - 1])
            s = score_fn(seq1[i - 1], seq2[j - 1])
            candidates = {"M": M[i - 1][j - 1], "Ix": Ix[i - 1][j - 1], "Iy": Iy[i - 1][j - 1]}
            i, j = i - 1, j - 1
            state = max(candidates, key=lambda k: candidates[k] + s) if i > 0 or j > 0 else "M"
        elif state == "Ix":
            aligned1.append(seq1[i - 1])
            aligned2.append("-")
            # Did this gap just open, or does it extend one below it?
            opened = M[i - 1][j] + gap_open
            extended = Ix[i - 1][j] + gap_extend
            state = "M" if opened >= extended else "Ix"
            i -= 1
        else:  # Iy
            aligned1.append("-")
            aligned2.append(seq2[j - 1])
            opened = M[i][j - 1] + gap_open
            extended = Iy[i][j - 1] + gap_extend
            state = "M" if opened >= extended else "Iy"
            j -= 1

    aligned1.reverse()
    aligned2.reverse()
    a1, a2 = "".join(aligned1), "".join(aligned2)

    matches = sum(1 for x, y in zip(a1, a2) if x == y and x != "-")
    aligned_positions = sum(1 for x, y in zip(a1, a2) if x != "-" and y != "-")
    similar = matches
    if sequence_type == "protein":
        sf = _protein_score_fn(matrix)
        similar = sum(1 for x, y in zip(a1, a2) if x != "-" and y != "-" and sf(x, y) > 0)

    return {
        "aligned_seq1": a1,
        "aligned_seq2": a2,
        "score": round(score, 2),
        "length": len(a1),
        "identity": matches,
        "identity_pct": round(100 * matches / aligned_positions, 1) if aligned_positions else 0.0,
        "similarity_pct": round(100 * similar / aligned_positions, 1) if aligned_positions else 0.0,
        "gaps": a1.count("-") + a2.count("-"),
    }
