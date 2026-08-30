"""
Tests for restriction mapping.

Enzyme sites come from Biopython's REBASE tables and are not re-verified here.
What is verified is the fragment arithmetic, because that's what's written
locally and where a mistake is invisible: a wrong fragment set still looks
like a plausible gel. The circular/linear distinction is the sharpest case —
a plasmid cut once is linearised into ONE full-length fragment, while a linear
molecule cut once gives TWO.
"""

import pytest

import restriction_service as rs

# Polylinker with EcoRI, KpnI, BamHI, XbaI, SalI, PstI, SphI, HindIII sites
POLYLINKER = "GAATTCGAGCTCGGTACCCGGGGATCCTCTAGAGTCGACCTGCAGGCATGCAAGCTT"
FILLER = "ACGT" * 250
SEQ = POLYLINKER + FILLER


def test_fragments_sum_to_sequence_length_linear():
    r = rs.analyse(SEQ, enzymes=["EcoRI", "BamHI", "HindIII"])
    for c in r["cutters"]:
        assert sum(c["fragments"]) == r["length"], c["enzyme"]


def test_fragments_sum_to_sequence_length_circular():
    r = rs.analyse(SEQ, enzymes=["EcoRI", "BamHI", "HindIII"], circular=True)
    for c in r["cutters"]:
        assert sum(c["fragments"]) == r["length"], c["enzyme"]


def test_single_cut_linearises_a_circle_but_splits_a_line():
    """The distinction that makes every predicted gel right or wrong."""
    linear = rs.analyse(SEQ, enzymes=["EcoRI"], circular=False)
    circular = rs.analyse(SEQ, enzymes=["EcoRI"], circular=True)

    assert linear["cutters"][0]["n_cuts"] == 1
    assert len(linear["cutters"][0]["fragments"]) == 2

    assert circular["cutters"][0]["n_cuts"] == 1
    assert circular["cutters"][0]["fragments"] == [len(SEQ)]


def test_n_cuts_and_fragment_count_agree():
    r = rs.analyse(SEQ, enzymes=["EcoRI", "BamHI", "HindIII"], circular=False)
    for c in r["cutters"]:
        # A linear molecule cut n times yields n+1 fragments
        assert len(c["fragments"]) == c["n_cuts"] + 1
    rc = rs.analyse(SEQ, enzymes=["EcoRI", "BamHI", "HindIII"], circular=True)
    for c in rc["cutters"]:
        # A circle cut n times yields n fragments
        assert len(c["fragments"]) == c["n_cuts"]


def test_finds_expected_polylinker_enzymes():
    r = rs.analyse(SEQ, enzymes=["EcoRI", "BamHI", "HindIII", "SalI", "PstI"])
    found = {c["enzyme"] for c in r["cutters"]}
    assert {"EcoRI", "BamHI", "HindIII", "SalI", "PstI"} <= found


def test_unique_cutters_cut_exactly_once():
    r = rs.analyse(SEQ)
    assert r["unique_cutters"], "expected some single-cut enzymes"
    for u in r["unique_cutters"]:
        assert u["n_cuts"] == 1


def test_non_cutters_do_not_appear_among_cutters():
    r = rs.analyse(SEQ)
    cutting = {c["enzyme"] for c in r["cutters"]}
    assert not (set(r["non_cutters"]) & cutting)
    assert len(r["cutters"]) + len(r["non_cutters"]) == r["enzymes_screened"]


def test_fragments_are_sorted_largest_first():
    r = rs.analyse(SEQ, enzymes=["EcoRI", "BamHI", "HindIII"])
    for c in r["cutters"]:
        assert c["fragments"] == sorted(c["fragments"], reverse=True)


def test_rejects_protein_and_short_input():
    with pytest.raises(rs.RestrictionError):
        rs.analyse("MALWMRLLPLLALLALW")
    with pytest.raises(rs.RestrictionError):
        rs.analyse("ACGT")


def test_rejects_unknown_enzyme():
    with pytest.raises(rs.RestrictionError) as e:
        rs.analyse(SEQ, enzymes=["NotARealEnzyme"])
    assert "NotARealEnzyme" in str(e.value)


def test_restriction_endpoint(client):
    res = client.post("/restriction", json={"sequence": SEQ, "enzymes": ["EcoRI"]}).json()
    assert res["cutters"][0]["enzyme"] == "EcoRI"
    assert client.post("/restriction", json={"sequence": "MALW"}).status_code == 400
