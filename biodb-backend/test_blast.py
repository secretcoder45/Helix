"""
Tests for the BLAST integration.

XML parsing is tested offline against a fixture matching NCBI's documented
schema — a live end-to-end test would need to wait on NCBI's queue, which
during testing was estimating ~5 hours per search. A test suite nobody can
run in under a workday isn't a test suite. Submission and status-check
against the live API were verified manually instead (see blast_service.py's
docstring / commit message for what was actually exercised live).
"""

import os

import pytest

import blast_service

FIXTURE_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "blast_result.xml")


def test_parses_hits_from_ncbi_xml_schema():
    with open(FIXTURE_PATH) as f:
        xml = f.read()

    hits = blast_service._parse_xml(xml, max_hits=25)

    assert len(hits) == 2

    first = hits[0]
    assert first["accession"] == "P01308"
    assert "Insulin" in first["definition"]
    assert first["length"] == 110
    assert first["evalue"] == pytest.approx(3.2e-79)
    assert first["identity_pct"] == 100.0
    assert first["align_length"] == 110

    second = hits[1]
    assert second["accession"] == "P01315"
    # 94 identical / 108 aligned, per the fixture
    assert second["identity_pct"] == pytest.approx(87.0, abs=0.1)


def test_max_hits_caps_results():
    with open(FIXTURE_PATH) as f:
        xml = f.read()

    hits = blast_service._parse_xml(xml, max_hits=1)
    assert len(hits) == 1
    assert hits[0]["accession"] == "P01308"


def test_clean_sequence_strips_fasta_header():
    import main

    raw = ">sp|P01308|INS_HUMAN Insulin\nMALWMR\nLLPLL"
    assert main._clean_sequence(raw) == "MALWMRLLPLL"


def test_clean_sequence_passes_through_bare_sequence():
    import main

    assert main._clean_sequence("MALWMRLLPLL") == "MALWMRLLPLL"


def test_submit_rejects_short_sequence(client):
    res = client.post("/blast/submit", json={"sequence": "MAL"})
    assert res.status_code == 400
    assert "short" in res.json()["detail"].lower()


def test_submit_rejects_invalid_program(client):
    res = client.post(
        "/blast/submit",
        json={"sequence": "MALWMRLLPLLALLALWGPDPAAA", "program": "not-a-program"},
    )
    assert res.status_code == 400


def test_submit_rejects_non_sequence_characters(client):
    res = client.post("/blast/submit", json={"sequence": "MALW123!!!not-a-sequence-at-all"})
    assert res.status_code == 400


def test_submit_rejects_oversized_sequence(client):
    huge = "M" * 10_001
    res = client.post("/blast/submit", json={"sequence": huge})
    assert res.status_code == 400
    assert "long" in res.json()["detail"].lower()


def test_submit_surfaces_ncbi_errors_as_502(client, monkeypatch):
    def boom(*a, **k):
        raise blast_service.BlastError("simulated NCBI outage")

    monkeypatch.setattr(blast_service, "submit_search", boom)
    res = client.post(
        "/blast/submit", json={"sequence": "MALWMRLLPLLALLALWGPDPAAAFVNQHLCG"}
    )
    assert res.status_code == 502
