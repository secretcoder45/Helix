"""
Correctness tests for Needleman-Wunsch.

The scoring engine (alignment_service.needleman_wunsch) is hand-rolled
deliberately — see that module's docstring — which means it can't just be
tested against itself. Every case here is cross-checked against
Bio.Align.PairwiseAligner, an independently implemented, widely-used
reference, configured with matching parameters (verified experimentally:
both use "open_gap_score covers the first gap position, extend_gap_score
covers the rest").

A wrong alignment score is the most dangerous kind of bug this module can
have — it looks completely normal and would be trusted at face value.
"""

import pytest
from Bio.Align import PairwiseAligner, substitution_matrices

from alignment_service import needleman_wunsch, AlignmentError, MAX_SEQUENCE_LENGTH


def _biopython_score(seq1, seq2, matrix_name="BLOSUM62", gap_open=-10.0, gap_extend=-0.5):
    aligner = PairwiseAligner()
    aligner.mode = "global"
    aligner.substitution_matrix = substitution_matrices.load(matrix_name)
    aligner.open_gap_score = gap_open
    aligner.extend_gap_score = gap_extend
    return aligner.align(seq1, seq2).score


def _biopython_dna_score(seq1, seq2, match=5.0, mismatch=-4.0, gap_open=-10.0, gap_extend=-0.5):
    aligner = PairwiseAligner()
    aligner.mode = "global"
    aligner.match_score = match
    aligner.mismatch_score = mismatch
    aligner.open_gap_score = gap_open
    aligner.extend_gap_score = gap_extend
    return aligner.align(seq1, seq2).score


PROTEIN_PAIRS = [
    ("MKTAYIAK", "MKTAAK"),
    ("MALWMRLLPLLALLALWGPDPAAA", "MALWTRLLPLLALLALWAPAPTLA"),  # insulin-like signal peptides, real-ish
    ("HEAGAWGHEE", "PAWHEAE"),  # classic textbook local-alignment example, used globally here
    ("GATTACA".replace("T", "L").replace("C", "C"), "GATCACA".replace("T", "L")),  # degenerate/short
    ("A", "A"),
    ("ACDEFGHIKLMNPQRSTVWY", "ACDEFGHIKLMNPQRSTVWY"),  # every standard residue, identical
    ("ACDEFGHIKLMNPQRSTVWY", "YWVTSRQPNMLKIHGFEDCA"),  # every standard residue, reversed
]

DNA_PAIRS = [
    ("GATTACA", "GCATGCU".replace("U", "T")),
    ("ACGTACGTACGT", "ACGTACGTACGT"),
    ("ACGTACGTACGT", "ACGT"),
    ("AAAA", "AAA"),
]


@pytest.mark.parametrize("seq1,seq2", PROTEIN_PAIRS)
def test_protein_score_matches_biopython(seq1, seq2):
    mine = needleman_wunsch(seq1, seq2, sequence_type="protein")["score"]
    reference = _biopython_score(seq1, seq2)
    assert mine == pytest.approx(reference, abs=0.01)


@pytest.mark.parametrize("matrix", ["BLOSUM45", "BLOSUM80", "PAM250"])
def test_protein_score_matches_biopython_across_matrices(matrix):
    seq1, seq2 = "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQ", "MKTAYIAKKQVSFVKSHFSRQKEEELGFIEVQ"
    mine = needleman_wunsch(seq1, seq2, sequence_type="protein", matrix=matrix)["score"]
    reference = _biopython_score(seq1, seq2, matrix_name=matrix)
    assert mine == pytest.approx(reference, abs=0.01)


@pytest.mark.parametrize("gap_open,gap_extend", [(-10, -0.5), (-1, -1), (-8, -2), (-5, -0.1)])
def test_protein_score_matches_biopython_across_gap_penalties(gap_open, gap_extend):
    seq1, seq2 = "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQ", "MKTAYIAKKQVSFVKSHFSRQKEEELGFIEVQ"
    mine = needleman_wunsch(seq1, seq2, sequence_type="protein", gap_open=gap_open, gap_extend=gap_extend)["score"]
    reference = _biopython_score(seq1, seq2, gap_open=gap_open, gap_extend=gap_extend)
    assert mine == pytest.approx(reference, abs=0.01)


@pytest.mark.parametrize("seq1,seq2", DNA_PAIRS)
def test_dna_score_matches_biopython(seq1, seq2):
    mine = needleman_wunsch(seq1, seq2, sequence_type="dna")["score"]
    reference = _biopython_dna_score(seq1, seq2)
    assert mine == pytest.approx(reference, abs=0.01)


def test_identical_sequences_score_all_matches():
    seq = "ACDEFGHIKLMNPQRSTVWY"
    r = needleman_wunsch(seq, seq, sequence_type="protein")
    assert r["identity_pct"] == 100.0
    assert r["gaps"] == 0
    assert r["aligned_seq1"] == seq
    assert r["aligned_seq2"] == seq


def test_alignment_reconstructs_to_original_sequences_minus_gaps():
    # Regardless of where gaps land, removing them must reproduce the inputs
    # exactly — this is what would break if the traceback took a wrong step.
    seq1, seq2 = "MALWMRLLPLLALLALWGPDPAAA", "MALWTRLLPLLALLALWAPAPTLA"
    r = needleman_wunsch(seq1, seq2, sequence_type="protein")
    assert r["aligned_seq1"].replace("-", "") == seq1
    assert r["aligned_seq2"].replace("-", "") == seq2
    assert len(r["aligned_seq1"]) == len(r["aligned_seq2"]) == r["length"]


def test_rejects_positive_gap_penalty():
    with pytest.raises(AlignmentError):
        needleman_wunsch("ACDE", "ACDE", gap_open=5)


def test_rejects_empty_sequence():
    with pytest.raises(AlignmentError):
        needleman_wunsch("", "ACDE")


def test_rejects_oversized_sequence():
    with pytest.raises(AlignmentError):
        needleman_wunsch("A" * (MAX_SEQUENCE_LENGTH + 1), "ACDE")


def test_rejects_unknown_matrix():
    with pytest.raises(AlignmentError):
        needleman_wunsch("ACDE", "ACDE", matrix="NOT_A_REAL_MATRIX")
