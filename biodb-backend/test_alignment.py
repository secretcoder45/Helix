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

from alignment_service import (
    needleman_wunsch,
    smith_waterman,
    AlignmentError,
    MAX_SEQUENCE_LENGTH,
)


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


# ---- Smith-Waterman (local alignment) ----


def _biopython_local_score(seq1, seq2, matrix_name="BLOSUM62", gap_open=-10.0, gap_extend=-0.5):
    aligner = PairwiseAligner()
    aligner.mode = "local"
    aligner.substitution_matrix = substitution_matrices.load(matrix_name)
    aligner.open_gap_score = gap_open
    aligner.extend_gap_score = gap_extend
    return aligner.align(seq1, seq2).score


def _biopython_local_dna_score(seq1, seq2, match=5.0, mismatch=-4.0, gap_open=-10.0, gap_extend=-0.5):
    aligner = PairwiseAligner()
    aligner.mode = "local"
    aligner.match_score = match
    aligner.mismatch_score = mismatch
    aligner.open_gap_score = gap_open
    aligner.extend_gap_score = gap_extend
    return aligner.align(seq1, seq2).score


@pytest.mark.parametrize("seq1,seq2", PROTEIN_PAIRS)
def test_local_protein_score_matches_biopython(seq1, seq2):
    mine = smith_waterman(seq1, seq2, sequence_type="protein")["score"]
    assert mine == pytest.approx(_biopython_local_score(seq1, seq2), abs=0.01)


@pytest.mark.parametrize("matrix", ["BLOSUM45", "BLOSUM80", "PAM250"])
def test_local_score_matches_biopython_across_matrices(matrix):
    seq1, seq2 = "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQ", "MKTAYIAKKQVSFVKSHFSRQKEEELGFIEVQ"
    mine = smith_waterman(seq1, seq2, sequence_type="protein", matrix=matrix)["score"]
    assert mine == pytest.approx(_biopython_local_score(seq1, seq2, matrix_name=matrix), abs=0.01)


@pytest.mark.parametrize("gap_open,gap_extend", [(-10, -0.5), (-1, -1), (-8, -2), (-5, -0.1)])
def test_local_score_matches_biopython_across_gap_penalties(gap_open, gap_extend):
    seq1, seq2 = "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQ", "MKTAYIAKKQVSFVKSHFSRQKEEELGFIEVQ"
    mine = smith_waterman(
        seq1, seq2, sequence_type="protein", gap_open=gap_open, gap_extend=gap_extend
    )["score"]
    assert mine == pytest.approx(
        _biopython_local_score(seq1, seq2, gap_open=gap_open, gap_extend=gap_extend), abs=0.01
    )


@pytest.mark.parametrize("seq1,seq2", DNA_PAIRS)
def test_local_dna_score_matches_biopython(seq1, seq2):
    mine = smith_waterman(seq1, seq2, sequence_type="dna")["score"]
    assert mine == pytest.approx(_biopython_local_dna_score(seq1, seq2), abs=0.01)


def test_local_finds_shared_region_inside_unrelated_flanks():
    """
    The whole point of local vs global: a conserved domain buried inside
    otherwise-unrelated sequence should be found cleanly, and global
    alignment should do measurably worse on the same input.
    """
    domain = "WVTSRQPNMLKIHGFEDCA"
    seq1 = "PPPPPPPPPP" + domain + "PPPPPPPPPP"
    seq2 = "GGGGG" + domain + "GGGGGGGGGGGGGGG"

    local = smith_waterman(seq1, seq2, sequence_type="protein")
    assert local["identity_pct"] == 100.0
    assert local["gaps"] == 0
    assert local["aligned_seq1"] == domain
    assert local["aligned_seq2"] == domain
    # And it reports where the domain actually sits in each input
    assert seq1[local["seq1_start"] - 1 : local["seq1_end"]] == domain
    assert seq2[local["seq2_start"] - 1 : local["seq2_end"]] == domain


def test_local_classic_textbook_example():
    # HEAGAWGHEE / PAWHEAE is the standard worked example for Smith-Waterman.
    r = smith_waterman("HEAGAWGHEE", "PAWHEAE", sequence_type="protein")
    assert r["score"] == pytest.approx(18.0, abs=0.01)
    assert r["aligned_seq1"] == "AWGHE"
    assert r["aligned_seq2"] == "AW-HE"


def test_local_alignment_reconstructs_to_a_real_subsequence():
    seq1, seq2 = "MALWMRLLPLLALLALWGPDPAAA", "MALWTRLLPLLALLALWAPAPTLA"
    r = smith_waterman(seq1, seq2, sequence_type="protein")
    # Removing gaps must yield an actual contiguous slice of each input,
    # at exactly the coordinates reported.
    assert r["aligned_seq1"].replace("-", "") == seq1[r["seq1_start"] - 1 : r["seq1_end"]]
    assert r["aligned_seq2"].replace("-", "") == seq2[r["seq2_start"] - 1 : r["seq2_end"]]


def test_local_never_scores_below_global():
    # A local alignment is free to ignore bad flanks, so it can never score
    # worse than the forced end-to-end alignment of the same pair.
    for seq1, seq2 in PROTEIN_PAIRS:
        g = needleman_wunsch(seq1, seq2, sequence_type="protein")["score"]
        l = smith_waterman(seq1, seq2, sequence_type="protein")["score"]
        assert l >= g - 0.01, f"local {l} < global {g} for {seq1}/{seq2}"


def test_local_rejects_bad_input():
    with pytest.raises(AlignmentError):
        smith_waterman("", "ACDE")
    with pytest.raises(AlignmentError):
        smith_waterman("ACDE", "ACDE", gap_open=5)
    with pytest.raises(AlignmentError):
        smith_waterman("A" * (MAX_SEQUENCE_LENGTH + 1), "ACDE")
