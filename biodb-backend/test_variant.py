"""
Tests for missense variant analysis.

The critical behaviour is the reference-residue check. If someone gives a
position numbered against a different isoform, every downstream statement —
the domain it falls in, the BLOSUM score, the known variants — is about the
wrong residue while looking completely normal. That must be surfaced, never
silently ignored.
"""

import pytest

import variant_service as vs


@pytest.mark.parametrize(
    "notation",
    ["p.Arg1699Trp", "Arg1699Trp", "p.R1699W", "R1699W", "  p.R1699W  "],
)
def test_parses_every_common_notation(notation):
    # All four forms turn up in papers and clinical reports.
    assert vs.parse_variant(notation) == {"ref": "R", "position": 1699, "alt": "W"}


@pytest.mark.parametrize("bad", ["", "1699", "Xyz1699Trp", "R1699", "hello", "RW1699"])
def test_rejects_unparseable_notation(bad):
    with pytest.raises(vs.VariantError):
        vs.parse_variant(bad)


def test_chemistry_of_a_substitution():
    v = vs.parse_variant("R1699W")
    assert v["ref"] == "R" and v["alt"] == "W"
    # Arg is positively charged, Trp is hydrophobic
    assert vs.CHARGE.get("R") == 1 and "W" not in vs.CHARGE
    assert vs.HYDROPATHY_CLASS["R"] == "charged"
    assert vs.HYDROPATHY_CLASS["W"] == "hydrophobic"
    assert float(vs.BLOSUM62["R"]["W"]) < 0  # non-conservative


@pytest.mark.network
def test_known_pathogenic_brca1_variant(client):
    """
    BRCA1 p.Arg1699Trp is a well-characterised pathogenic variant in the BRCT
    domain. Everything the tool claims about it should line up.
    """
    r = vs.analyse("BRCA1", "p.Arg1699Trp")

    assert r["accession"] == "P38398"
    assert r["reference_matches"] is True, "R1699 must match the canonical sequence"
    assert r["blosum62"] < 0 and r["conservative"] is False
    assert r["charge_change"] == -1
    assert r["class_change"] == ("charged", "hydrophobic")

    # Falls inside the BRCT domain
    domains = [f for f in r["features"] if f["type"] == "Domain"]
    assert any(f["start"] <= 1699 <= f["end"] for f in domains)

    # UniProt records this position as a known variant
    assert r["known_variants"], "expected annotated variants at position 1699"
    assert any("pathogenic" in k["description"].lower() for k in r["known_variants"])


@pytest.mark.network
def test_reference_mismatch_is_reported_not_swallowed():
    """
    The dangerous case: a position numbered against a different isoform. The
    tool must say the reference doesn't match rather than analysing the wrong
    residue silently.
    """
    r = vs.analyse("BRCA1", "p.Ala1699Trp")  # 1699 is Arg, not Ala
    assert r["reference_matches"] is False
    assert r["actual_residue"] == "R"


@pytest.mark.network
def test_position_past_the_end_is_rejected():
    with pytest.raises(vs.VariantError) as e:
        vs.analyse("INS", "p.Arg9999Trp")
    assert "past the end" in str(e.value)


@pytest.mark.network
def test_unknown_gene_is_rejected():
    with pytest.raises(vs.VariantError):
        vs.analyse("notarealgene12345", "R10W")


@pytest.mark.network
def test_variant_endpoint(client):
    res = client.post("/variant", json={"gene": "BRCA1", "variant": "p.Arg1699Trp"}).json()
    assert res["accession"] == "P38398"
    assert res["reference_matches"] is True
    assert client.post("/variant", json={"gene": "BRCA1", "variant": "nonsense"}).status_code == 400
