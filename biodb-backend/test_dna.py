"""
Tests for nucleotide analysis.

The risky part here is not the genetic code (Biopython's) but the ORF search's
coordinate arithmetic: reverse-strand hits are found on the reverse complement
and then mapped back onto forward-strand coordinates, and an off-by-one there
would produce ORFs that look entirely plausible and point at the wrong bases.
So the central test doesn't check the numbers against expected values — it
checks the invariant: slicing the forward sequence at the reported coordinates
(reverse-complementing for minus-strand hits) must reproduce the reported
protein exactly.
"""

import pytest
from Bio.Seq import Seq

import dna_service as ds

# Human insulin coding sequence (INS, NM_000207 CDS).
INSULIN_CDS = (
    "ATGGCCCTGTGGATGCGCCTCCTGCCCCTGCTGGCGCTGCTGGCCCTCTGGGGACCTGACCCAGCCGCAGCC"
    "TTTGTGAACCAACACCTGTGCGGCTCACACCTGGTGGAAGCTCTCTACCTAGTGTGCGGGGAACGAGGCTTC"
    "TTCTACACACCCAAGACCCGCCGGGAGGCAGAGGACCTGCAGGTGGGGCAGGTGGAGCTGGGCGGGGGCCCT"
    "GGTGCAGGCAGCCTGCAGCCCTTGGCCCTGGAGGGGTCCCTGCAGAAGCGTGGCATTGTGGAACAATGCTGT"
    "ACCAGCATCTGCTCCCTCTACCAGCTGGAGAACTACTGCAACTAG"
)

INSULIN_PROTEIN = (
    "MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAEDLQVGQ"
    "VELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN"
)


def test_finds_the_real_insulin_orf():
    r = ds.analyse(INSULIN_CDS)
    top = r["orfs"][0]
    assert top["strand"] == "+"
    assert top["frame"] == 1
    assert (top["start"], top["end"]) == (1, len(INSULIN_CDS))
    assert top["length_aa"] == 110
    assert top["protein"] == INSULIN_PROTEIN


def test_orf_coordinates_round_trip_to_the_reported_protein():
    """The invariant that makes reverse-strand coordinates trustworthy."""
    r = ds.analyse(INSULIN_CDS, min_orf_aa=20)
    assert any(o["strand"] == "-" for o in r["orfs"]), "expected a reverse-strand ORF to test"

    for o in r["orfs"]:
        sub = INSULIN_CDS[o["start"] - 1 : o["end"]]
        if o["strand"] == "-":
            sub = str(Seq(sub).reverse_complement())
        assert str(Seq(sub).translate()).rstrip("*") == o["protein"], (
            f"frame {o['frame']} {o['start']}-{o['end']} does not translate to its protein"
        )
        assert o["end"] - o["start"] + 1 == o["length_nt"]


def test_orfs_respect_the_minimum_length():
    lenient = ds.analyse(INSULIN_CDS, min_orf_aa=10)
    strict = ds.analyse(INSULIN_CDS, min_orf_aa=100)
    assert len(strict["orfs"]) < len(lenient["orfs"])
    assert all(o["length_aa"] >= 100 for o in strict["orfs"])


def test_orfs_are_stop_terminated():
    r = ds.analyse(INSULIN_CDS, min_orf_aa=10)
    for o in r["orfs"]:
        sub = INSULIN_CDS[o["start"] - 1 : o["end"]]
        if o["strand"] == "-":
            sub = str(Seq(sub).reverse_complement())
        assert sub[:3] == "ATG"
        assert sub[-3:] in ds.STOP_CODONS
        # The reported protein must not include the stop itself
        assert "*" not in o["protein"]


def test_reverse_complement_and_transcription():
    r = ds.analyse("ATGCGT")
    assert r["reverse_complement"] == "ACGCAT"
    assert r["rna"] == "AUGCGU"


def test_gc_content_and_profile():
    r = ds.analyse("GGGGCCCCAAAATTTT", gc_window=4)
    assert r["gc_content"] == pytest.approx(50.0, abs=0.01)
    # One profile point per base, and GC-rich start / AT-rich end
    assert len(r["gc_profile"]) == 16
    assert r["gc_profile"][2] > r["gc_profile"][13]


def test_rna_input_is_accepted():
    # U is folded to T so RNA pasted in still analyses
    assert ds.analyse("AUGCGU")["sequence"] == "ATGCGT"


def test_rejects_protein_sequence():
    with pytest.raises(ds.DnaError) as e:
        ds.analyse("MALWMRLLPLLALLALW")
    assert "nucleotide" in str(e.value).lower()


def test_rejects_too_short():
    with pytest.raises(ds.DnaError):
        ds.analyse("ATG")


def test_melting_temperature_only_for_primer_length():
    short = ds.analyse("ATGCGTACGTAGCTAGCTAGCT")
    assert "wallace" in short["melting_temperature"]
    # Too long to be a primer — no Tm rather than a meaningless one
    assert ds.analyse("ATGC" * 100)["melting_temperature"] == {}


def test_six_frames_are_all_translated():
    r = ds.analyse(INSULIN_CDS)
    assert set(r["frames"]) == {"+1", "+2", "+3", "-1", "-2", "-3"}
    assert r["frames"]["+1"].startswith("MALWMRLL")


def test_dna_endpoint(client):
    res = client.post("/dna", json={"sequence": INSULIN_CDS}).json()
    assert res["orfs"][0]["length_aa"] == 110
    assert client.post("/dna", json={"sequence": "MALWMR"}).status_code == 400
