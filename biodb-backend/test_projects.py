"""
Tests for persistence + caching. These run against a throwaway SQLite file so
they never touch the real biodb.sqlite3. The `client` fixture lives in
conftest.py so it's shared with test_blast.py.
"""

import pytest
import main


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


def test_bulk_save_preserves_provenance_for_every_item(client):
    project = client.post("/projects", json={"name": "Bulk"}).json()
    fetched_at = "2020-06-15T12:00:00+00:00"

    res = client.post(
        f"/projects/{project['id']}/items/bulk",
        json={
            "items": [
                {"external_id": "A1", "name": "A", "database": "UniProt", "retrieved_at": fetched_at},
                {"external_id": "A2", "name": "B", "database": "UniProt", "retrieved_at": fetched_at},
                {"external_id": "A3", "name": "C", "database": "UniProt", "retrieved_at": fetched_at},
            ]
        },
    ).json()

    assert res["saved"] == 3
    assert all(i["retrieved_at"].startswith("2020-06-15") for i in res["items"])

    fetched = client.get(f"/projects/{project['id']}").json()
    assert fetched["item_count"] == 3


def test_bulk_save_rejects_empty_list(client):
    project = client.post("/projects", json={"name": "Empty bulk"}).json()
    res = client.post(f"/projects/{project['id']}/items/bulk", json={"items": []})
    assert res.status_code == 400


def test_bulk_save_404s_for_missing_project(client):
    res = client.post(
        "/projects/does-not-exist/items/bulk",
        json={"items": [{"external_id": "X", "name": "X", "database": "UniProt"}]},
    )
    assert res.status_code == 404


@pytest.mark.network
def test_literature_returns_relevant_papers_with_links(client):
    res = client.get("/literature/BRCA1").json()
    papers = res["papers"]
    assert len(papers) > 0
    first = papers[0]
    assert first["pmid"].isdigit()
    assert first["link"] == f"https://pubmed.ncbi.nlm.nih.gov/{first['pmid']}/"
    assert "brca1" in first["title"].lower() or "brca" in first["title"].lower()


def test_literature_empty_for_nonsense_gene(client):
    res = client.get("/literature/notarealgene12345xyz")
    assert res.status_code == 200
    assert res.json()["papers"] == []


def test_alignment_saves_into_project_with_reproducible_params(client):
    project = client.post("/projects", json={"name": "With alignment"}).json()
    params = {"matrix": "BLOSUM62", "gap_open": -10, "gap_extend": -0.5}

    saved = client.post(
        f"/projects/{project['id']}/alignments",
        json={
            "algorithm": "smith-waterman",
            "label1": "INS_HUMAN",
            "label2": "INS_PIG",
            "seq1": "HEAGAWGHEE",
            "seq2": "PAWHEAE",
            "aligned_seq1": "AWGHE",
            "aligned_seq2": "AW-HE",
            "score": 18.0,
            "identity_pct": 100.0,
            "gaps": 1,
            "length": 5,
            "params": params,
        },
    ).json()

    assert saved["algorithm"] == "smith-waterman"
    # Params must survive the JSON round trip — without them the score isn't
    # reproducible or comparable against another alignment.
    assert saved["params"] == params

    fetched = client.get(f"/projects/{project['id']}").json()
    assert fetched["alignment_count"] == 1
    assert fetched["alignments"][0]["params"] == params

    # Deleting the project cascades to its alignments
    client.delete(f"/projects/{project['id']}")
    assert client.get(f"/projects/{project['id']}").status_code == 404


def test_projects_report_both_items_and_alignments(client):
    project = client.post("/projects", json={"name": "Mixed"}).json()
    client.post(
        f"/projects/{project['id']}/items",
        json={"external_id": "P01308", "name": "INS_HUMAN", "database": "UniProt"},
    )
    client.post(
        f"/projects/{project['id']}/alignments",
        json={
            "algorithm": "needleman-wunsch",
            "seq1": "AAAA",
            "seq2": "AAA",
            "aligned_seq1": "AAAA",
            "aligned_seq2": "AAA-",
            "score": 2.0,
        },
    )
    fetched = client.get(f"/projects/{project['id']}").json()
    assert fetched["item_count"] == 1
    assert fetched["alignment_count"] == 1


def test_alignment_404s_for_missing_project(client):
    res = client.post(
        "/projects/nope/alignments",
        json={
            "algorithm": "needleman-wunsch",
            "seq1": "A",
            "seq2": "A",
            "aligned_seq1": "A",
            "aligned_seq2": "A",
            "score": 4.0,
        },
    )
    assert res.status_code == 404


@pytest.mark.network
def test_entity_returns_grouped_features(client):
    """
    Features ride along on the UniProt request /entity already makes, so this
    also guards against the fields list being trimmed later: EGFR should carry
    its signal peptide, kinase domain and active site.
    """
    entity = client.get("/entity/EGFR").json()
    features = entity["features"]
    assert len(features) > 20

    groups = {f["group"] for f in features}
    assert {"topology", "domain", "site", "modification"} <= groups

    types = {f["type"] for f in features}
    assert {"Signal", "Domain", "Active site", "Transmembrane"} <= types

    for f in features:
        assert f["start"] <= f["end"]
        assert f["end"] <= entity["sequence"]["length"]


@pytest.mark.network
def test_alphafold_model_with_per_residue_confidence(client):
    model = client.get("/alphafold/P01308").json()
    assert model["entry_id"] == "AF-P01308-F1"
    assert model["pdb_url"].endswith(".pdb")

    # One pLDDT score per residue, on the published 0-100 scale
    plddt = model["plddt"]
    assert len(plddt) == 110
    assert all(0 <= v <= 100 for v in plddt)
    assert model["mean_plddt"] == pytest.approx(sum(plddt) / len(plddt), abs=0.1)


@pytest.mark.network
def test_alphafold_404s_for_unknown_accession(client):
    assert client.get("/alphafold/NOTAREALACCESSION").status_code == 404
