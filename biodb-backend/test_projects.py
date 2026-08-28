"""
Tests for persistence + caching. These run against a throwaway SQLite file so
they never touch the real biodb.sqlite3.
"""

import os
import tempfile

# Point the app at a temp DB before importing anything that reads DATABASE_URL.
_tmp_db = os.path.join(tempfile.mkdtemp(), "test.sqlite3")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp_db}"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


@pytest.fixture(scope="module")
def client():
    # The context-manager form runs the app's lifespan handler, which creates
    # the tables. A bare TestClient(app) would skip it and every query would
    # fail with "no such table".
    with TestClient(main.app) as c:
        yield c


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_project_lifecycle(client):
    created = client.post("/projects", json={"name": "Test project"}).json()
    project_id = created["id"]
    assert created["name"] == "Test project"
    assert created["item_count"] == 0

    # Saved item round-trips with provenance intact
    item = client.post(
        f"/projects/{project_id}/items",
        json={
            "external_id": "P38398",
            "name": "BRCA1_HUMAN",
            "database": "UniProt",
            "description": "Breast cancer type 1 susceptibility protein",
            "link": "https://www.uniprot.org/uniprotkb/P38398",
        },
    ).json()
    assert item["external_id"] == "P38398"
    assert item["retrieved_at"] is not None

    fetched = client.get(f"/projects/{project_id}").json()
    assert fetched["item_count"] == 1
    assert fetched["items"][0]["name"] == "BRCA1_HUMAN"

    # Removing the item leaves the project intact
    client.delete(f"/projects/{project_id}/items/{item['id']}")
    assert client.get(f"/projects/{project_id}").json()["item_count"] == 0

    client.delete(f"/projects/{project_id}")
    assert client.get(f"/projects/{project_id}").status_code == 404


def test_saved_item_preserves_source_retrieval_time(client):
    # Provenance regression: retrieved_at must record when the data was fetched
    # from the source database, not when the user clicked save. Otherwise a
    # result found yesterday and saved today gets a wrong citation date.
    project = client.post("/projects", json={"name": "Provenance"}).json()
    fetched_at = "2020-01-02T03:04:05+00:00"

    item = client.post(
        f"/projects/{project['id']}/items",
        json={
            "external_id": "P01308",
            "name": "INS_HUMAN",
            "database": "UniProt",
            "retrieved_at": fetched_at,
        },
    ).json()

    assert item["retrieved_at"].startswith("2020-01-02T03:04:05")
    # saved_at is separate and should be "now", not the retrieval time
    assert not item["saved_at"].startswith("2020-01-02")


def test_saved_item_without_retrieved_at_defaults_to_now(client):
    project = client.post("/projects", json={"name": "Default ts"}).json()
    item = client.post(
        f"/projects/{project['id']}/items",
        json={"external_id": "X", "name": "X", "database": "UniProt"},
    ).json()
    assert item["retrieved_at"] is not None


def test_missing_project_404s(client):
    assert client.get("/projects/does-not-exist").status_code == 404
    assert (
        client.post(
            "/projects/does-not-exist/items",
            json={"external_id": "X", "name": "X", "database": "UniProt"},
        ).status_code
        == 404
    )


def test_extract_search_terms_strips_question_words():
    # The bug this guards: full sentences returned zero hits from UniProt,
    # because its search API expects keywords, not natural language.
    assert main._extract_search_terms("What does insulin do in the human body?") == "insulin human body"
    assert main._extract_search_terms("Tell me about the BRCA1 gene") == "brca1 gene"
    # A query that is already keywords passes through unchanged
    assert main._extract_search_terms("insulin") == "insulin"


@pytest.mark.network
def test_entity_cross_references_agree(client):
    """
    The value of entity linking is that identifiers from different databases
    line up. BRCA1's KEGG xref (hsa:672) should match the NCBI Gene ID (672) —
    if those diverge, we're stitching together records for different genes.

    Hits live APIs; deselect with `-m "not network"`.
    """
    entity = client.get("/entity/BRCA1").json()

    assert entity["accession"] == "P38398"
    assert "BRCA1" in entity["genes"]
    assert entity["organism"] == "Homo sapiens"
    assert entity["sequence"]["length"] == 1863
    assert len(entity["structures"]) > 10

    kegg_gene_id = entity["pathways"][0]["id"].split(":")[-1]
    ncbi_gene_ids = [g["id"] for g in entity["genes_detail"]]
    assert kegg_gene_id in ncbi_gene_ids, "KEGG and NCBI identifiers disagree"


@pytest.mark.network
def test_entity_404s_for_nonsense(client):
    assert client.get("/entity/notarealgene12345").status_code == 404


def test_cache_returns_same_object_without_refetching(monkeypatch):
    import cache
    from database_apis import DatabaseConnector

    calls = {"n": 0}

    @cache.cached("test_prefix")
    def fake_search(term):
        calls["n"] += 1
        return [{"id": term}]

    fake_search("insulin")
    fake_search("insulin")
    assert calls["n"] == 1, "second identical call should hit the cache"

    fake_search("kinase")
    assert calls["n"] == 2, "a different argument should miss the cache"


@pytest.mark.network
def test_exact_gene_symbol_beats_substring_match(client):
    """
    Regression: `gene:INS` also matches the INS-IGF2 readthrough gene, and
    UniProt's ranking is not stable across page sizes — the resolver returned
    F8WCM5 (200 aa readthrough) instead of P01308 (110 aa insulin) for the
    exact official symbol "INS". Silent wrong-protein results are the most
    dangerous failure mode this tool has.
    """
    entity = client.get("/entity/INS").json()
    assert entity["accession"] == "P01308"
    assert entity["genes"] == ["INS"]
    assert entity["sequence"]["length"] == 110


@pytest.mark.network
@pytest.mark.parametrize(
    "symbol,accession,length",
    [
        ("BRCA1", "P38398", 1863),
        ("TP53", "P04637", 393),
        ("EGFR", "P00533", 1210),
        ("CFTR", "P13569", 1480),
    ],
)
def test_canonical_symbols_resolve_to_reviewed_human_entries(
    client, symbol, accession, length
):
    entity = client.get(f"/entity/{symbol}").json()
    assert entity["accession"] == accession
    assert entity["organism"] == "Homo sapiens"
    assert entity["sequence"]["length"] == length


def test_batch_parses_mixed_delimiters_and_dedupes(client, monkeypatch):
    # Parsing and ordering are pure logic; stub the network so this stays a
    # fast offline test.
    import main

    monkeypatch.setattr(
        main.db_connector,
        "resolve_entity",
        lambda q: {
            "accession": f"ACC-{q}",
            "name": q,
            "genes": [q],
            "sequence": {"length": 1, "molecular_weight": 1},
            "structures": [],
            "pathways": [],
            "links": {"uniprot": "u"},
        },
    )

    res = client.post(
        "/batch",
        json={"identifiers": ["BRCA1, TP53\nINS\tEGFR", " brca1 ", ""]},
    ).json()

    # Mixed delimiters split, blanks dropped, "brca1" deduped against "BRCA1"
    assert [r["query"] for r in res["rows"]] == ["BRCA1", "TP53", "INS", "EGFR"]
    assert res["stats"] == {
        "requested": 4,
        "resolved": 4,
        "unresolved": 0,
        "truncated": False,
        "max_batch": main.MAX_BATCH,
    }


def test_batch_reports_failures_per_row_without_failing_the_batch(client, monkeypatch):
    import main

    def flaky(q):
        if q == "BOOM":
            raise RuntimeError("upstream exploded")
        if q == "MISSING":
            return {}
        return {
            "accession": f"ACC-{q}",
            "name": q,
            "genes": [],
            "sequence": {},
            "structures": [],
            "pathways": [],
            "links": {},
        }

    monkeypatch.setattr(main.db_connector, "resolve_entity", flaky)

    res = client.post("/batch", json={"identifiers": ["OK1", "BOOM", "MISSING"]}).json()
    by_query = {r["query"]: r for r in res["rows"]}

    assert by_query["OK1"]["resolved"] is True
    assert by_query["BOOM"]["resolved"] is False
    assert "upstream exploded" in by_query["BOOM"]["error"]
    assert by_query["MISSING"]["resolved"] is False
    assert res["stats"]["resolved"] == 1


def test_batch_rejects_empty_input(client):
    assert client.post("/batch", json={"identifiers": ["   ", ""]}).status_code == 400
