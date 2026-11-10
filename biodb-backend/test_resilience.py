"""
Behaviour when things go wrong: a source database down, an unexpected
crash, a client sending too much.

The rule under test: a failure is reported as a failure. Before, every
source function caught every error and returned an empty list, so "UniProt
is down" reached the researcher as "no results" — a wrong answer that looks
like a right one.
"""

import secrets

import pytest
import requests
from fastapi.testclient import TestClient

import database_apis
import main
import ratelimit
from database_apis import SourceUnavailable, db_connector


class FakeResponse:
    def __init__(self, status=200, payload=None, text="", headers=None):
        self.status_code = status
        self._payload = payload if payload is not None else {}
        self.text = text
        self.headers = headers or {}
        self.url = "https://example.test/"

    def json(self):
        return self._payload


def unique(prefix="q"):
    # The source functions are cached by argument; every test needs fresh ones.
    return f"{prefix}{secrets.token_hex(4)}"


@pytest.fixture
def http(monkeypatch):
    """Route the connector's outbound HTTP to a function the test supplies."""
    holder = {}

    def fake(url, *args, **kwargs):
        return holder["handler"](url, kwargs)

    monkeypatch.setattr(database_apis.requests, "get", fake)
    monkeypatch.setattr(database_apis.requests, "post", fake)

    def set_handler(fn):
        holder["handler"] = fn

    return set_handler


# ---- The source layer ----


@pytest.mark.parametrize("failure", [
    lambda: FakeResponse(503),
    lambda: FakeResponse(500),
    lambda: FakeResponse(429),
])
def test_server_errors_raise_rather_than_returning_nothing(http, failure):
    http(lambda url, kw: failure())
    with pytest.raises(SourceUnavailable) as e:
        db_connector.search_uniprot_protein(unique())
    assert e.value.source == "UniProt"


def test_network_errors_raise(http):
    def boom(url, kw):
        raise requests.ConnectionError("connection refused")

    http(boom)
    with pytest.raises(SourceUnavailable) as e:
        db_connector.search_kegg_pathway(unique())
    assert e.value.source == "KEGG"


def test_a_real_no_match_is_still_an_empty_result(http):
    http(lambda url, kw: FakeResponse(200, {"results": []}))
    assert db_connector.search_uniprot_protein(unique()) == []
    # UniProt answers 400 for an accession that doesn't exist: "not found".
    http(lambda url, kw: FakeResponse(400))
    assert db_connector.fetch_sequence(unique("P")) == {}


def test_failures_are_not_cached(http):
    query = unique()
    http(lambda url, kw: FakeResponse(503))
    with pytest.raises(SourceUnavailable):
        db_connector.search_uniprot_protein(query)
    # Recovered: the next identical query must reach the source again.
    http(lambda url, kw: FakeResponse(200, {"results": []}, headers={}))
    assert db_connector.search_uniprot_protein(query) == []


# ---- What the API says ----


def test_lookup_reports_the_source_that_is_down(anon_client, http):
    http(lambda url, kw: FakeResponse(503))
    res = anon_client.get(f"/entity/{unique('GENE')}")
    assert res.status_code == 503
    assert res.json()["source"] == "UniProt"
    assert "isn't responding" in res.json()["detail"]


def test_lookup_survives_ncbi_being_down(anon_client, monkeypatch):
    monkeypatch.setattr(db_connector, "resolve_entity", lambda q: {"accession": "P01308", "genes": ["INS"]})

    def ncbi_down(symbol):
        raise SourceUnavailable("NCBI Gene")

    monkeypatch.setattr(db_connector, "search_ncbi_gene", ncbi_down)
    res = anon_client.get("/entity/INS")
    assert res.status_code == 200
    assert res.json()["genes_detail"] == [] and res.json()["unavailable"] == ["NCBI Gene"]


def test_search_returns_what_answered_and_names_what_did_not(anon_client, monkeypatch):
    row = {"id": "P01308", "name": "INS_HUMAN", "description": "Insulin", "link": "l"}
    monkeypatch.setattr(db_connector, "search_uniprot_protein", lambda q: [row])

    def pdb_down(q):
        raise SourceUnavailable("RCSB PDB")

    monkeypatch.setattr(db_connector, "search_pdb_protein", pdb_down)
    body = anon_client.post("/search", json={"query": "insulin", "database": "proteins"}).json()
    assert [r["id"] for r in body["results"]] == ["P01308"]
    assert body["unavailable"] == ["RCSB PDB"]

    # Nothing answered: that's an error, not "no results".
    monkeypatch.setattr(db_connector, "search_uniprot_protein", pdb_down)
    assert anon_client.post("/search", json={"query": "insulin", "database": "proteins"}).status_code == 503


def test_an_unexpected_crash_is_a_clean_500_with_a_reference(monkeypatch):
    def crash(*a, **k):
        raise RuntimeError("bug")

    monkeypatch.setattr(db_connector, "resolve_entity", crash)
    with TestClient(main.app, raise_server_exceptions=False) as c:
        res = c.get("/entity/INS", headers={"Origin": "http://localhost:5173"})
    assert res.status_code == 500
    body = res.json()
    assert body["request_id"] in body["detail"] and "bug" not in body["detail"]
    assert res.headers["X-Request-ID"] == body["request_id"]
    # CORS headers present, or the browser would report a CORS error instead.
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"


# ---- Rate limits ----


def test_compute_endpoints_are_rate_limited_per_client(anon_client):
    here = {"X-Forwarded-For": "198.51.100.20"}
    body = {"seq1": "ACGT", "seq2": "ACGT", "sequence_type": "dna"}
    for _ in range(ratelimit.COMPUTE.limit):
        assert anon_client.post("/align/needleman-wunsch", json=body, headers=here).status_code == 200
    blocked = anon_client.post("/align/needleman-wunsch", json=body, headers=here)
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0 and "Too many requests" in blocked.json()["detail"]

    elsewhere = {"X-Forwarded-For": "198.51.100.21"}
    assert anon_client.post("/align/needleman-wunsch", json=body, headers=elsewhere).status_code == 200


def test_batch_has_its_own_tighter_budget(anon_client, monkeypatch):
    monkeypatch.setattr(main, "_batch_row", lambda ident, include_gene: {"query": ident, "resolved": False})
    here = {"X-Forwarded-For": "198.51.100.30"}
    for _ in range(ratelimit.BATCHES.limit):
        assert anon_client.post("/batch", json={"identifiers": ["INS"]}, headers=here).status_code == 200
    assert anon_client.post("/batch", json={"identifiers": ["INS"]}, headers=here).status_code == 429
    # Lookups draw on a different budget, so they still work.
    monkeypatch.setattr(db_connector, "search_kegg_pathway", lambda q: [])
    assert anon_client.post("/search", json={"query": "x", "database": "pathways"}, headers=here).status_code == 200


def test_browser_errors_are_logged(anon_client, caplog):
    with caplog.at_level("ERROR", logger="helix"):
        res = anon_client.post("/client-errors", json={"message": "TypeError: x is undefined", "page": "/align"})
    assert res.status_code == 204
    assert any("TypeError: x is undefined" in r.getMessage() for r in caplog.records)
