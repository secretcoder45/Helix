"""
Tests for primer design.

Two things matter. First, every primer returned must actually satisfy every
criterion it was filtered on — a design tool that emits primers violating its
own stated constraints is worse than none. Second, the reverse primer's
coordinates must genuinely correspond to the reverse complement of the
template there; an off-by-one produces a primer that looks fine and binds
nothing.
"""

import random

import pytest
from Bio.Seq import Seq
from Bio.SeqUtils import gc_fraction, MeltingTemp as mt

import primer_service as ps


@pytest.fixture(scope="module")
def template():
    random.seed(7)  # ~50% GC, which is what the defaults are tuned for
    return "".join(random.choice("ACGT") for _ in range(400))


def test_produces_pairs_on_a_balanced_template(template):
    r = ps.design(template)
    assert r["pairs"], "expected primer pairs on a 50% GC template"


def test_every_primer_satisfies_the_stated_criteria(template):
    r = ps.design(template)
    o = r["criteria"]
    for pair in r["pairs"]:
        for p in (pair["forward"], pair["reverse"]):
            assert o["min_len"] <= p["length"] <= o["max_len"]
            assert o["min_tm"] <= p["tm"] <= o["max_tm"]
            assert o["min_gc"] <= p["gc"] <= o["max_gc"]
            assert p["max_homopolymer"] <= 4
            assert p["self_complementarity"] < 6
            assert p["sequence"][-1] in "GC", "3' GC clamp missing"
            # Reported stats must match the sequence, not drift from it
            assert p["length"] == len(p["sequence"])
            assert p["gc"] == pytest.approx(gc_fraction(p["sequence"]) * 100, abs=0.1)
            assert p["tm"] == pytest.approx(float(mt.Tm_NN(Seq(p["sequence"]))), abs=0.1)


def test_reverse_primer_matches_the_template_at_its_coordinates(template):
    """The off-by-one that yields a plausible primer binding nothing."""
    r = ps.design(template)
    for pair in r["pairs"]:
        rev = pair["reverse"]
        region = template[rev["start"] - 1 : rev["end"]]
        assert rev["sequence"] == str(Seq(region).reverse_complement())


def test_forward_primer_matches_the_template_at_its_coordinates(template):
    r = ps.design(template)
    for pair in r["pairs"]:
        f = pair["forward"]
        assert f["sequence"] == template[f["start"] - 1 : f["end"]]


def test_pair_tm_difference_within_tolerance(template):
    r = ps.design(template)
    for pair in r["pairs"]:
        assert pair["tm_diff"] <= r["criteria"]["max_tm_diff"]
        assert pair["tm_diff"] == pytest.approx(
            abs(pair["forward"]["tm"] - pair["reverse"]["tm"]), abs=0.1
        )


def test_product_size_matches_the_coordinates(template):
    r = ps.design(template)
    for pair in r["pairs"]:
        expected = pair["reverse"]["end"] - pair["forward"]["start"] + 1
        assert pair["product_size"] == expected
        assert pair["reverse"]["end"] > pair["forward"]["start"]


def test_gc_rich_template_reports_why_it_failed():
    """
    A GC-rich region genuinely cannot be primed under the default criteria.
    Saying "no primers found" would look like a broken tool; naming the
    dominant rejection tells the user which constraint to relax.
    """
    gc_rich = "GCGGCCGCGGCCGCGGCCGC" * 20
    r = ps.design(gc_rich)
    assert r["pairs"] == []
    assert r["rejected"], "expected rejection reasons to be reported"
    assert next(iter(r["rejected"])) == "GC content"
    assert r["region_gc"] > 60


def test_widening_criteria_recovers_primers():
    gc_rich = (
        "ATGGCCCTGTGGATGCGCCTCCTGCCCCTGCTGGCGCTGCTGGCCCTCTGGGGACCTGACCCAGCCGCAGCC"
        "TTTGTGAACCAACACCTGTGCGGCTCACACCTGGTGGAAGCTCTCTACCTAGTGTGCGGGGAACGAGGCTTC"
        "TTCTACACACCCAAGACCCGCCGGGAGGCAGAGGACCTGCAGGTGGGGCAGGTGGAGCTGGGCGGGGGCCCT"
    )
    strict = ps.design(gc_rich)
    relaxed = ps.design(gc_rich, max_gc=80.0, max_tm=75.0)
    assert not strict["pairs"]
    assert relaxed["forward_candidates"] > strict["forward_candidates"]


def test_rejects_bad_input():
    with pytest.raises(ps.PrimerError):
        ps.design("ACGT" * 5)  # too short
    with pytest.raises(ps.PrimerError):
        ps.design("MALWMRLLPLLALLALW" * 10)  # protein


def test_primer_endpoint(client):
    random.seed(7)
    tmpl = "".join(random.choice("ACGT") for _ in range(400))
    res = client.post("/primers", json={"template": tmpl}).json()
    assert "pairs" in res and "criteria" in res
    assert client.post("/primers", json={"template": "ACGT"}).status_code == 400
