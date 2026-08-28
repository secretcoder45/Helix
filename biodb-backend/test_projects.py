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
