"""
Provenance, migrations and the methods export.

The methods tests check wording on purpose. The export is a factual claim
pasted into manuscripts, so "says release 2026_03 only when it was recorded"
and "states the gap convention" are the behaviours that matter, not
incidental formatting.
"""

import json
import os
import re

import pytest
import sqlalchemy as sa

import citations
import db as db_module
import methods_service
import provenance as prov
from version import HELIX_VERSION

INSULIN = (
    "MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAEDLQVGQ"
    "VELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN"
)

# ---- Provenance primitives ----


def test_checksum_matches_uniprots_own_crc64():
    # UniProt publishes CRC64 C2C3B23B85E520E5 for P01308; matching it means a
    # reader can verify a saved sequence against UniProt without trusting us.
    assert prov.sequence_checksum(INSULIN) == "CRC64:C2C3B23B85E520E5"
    assert prov.sequence_checksum(INSULIN.lower()) == "CRC64:C2C3B23B85E520E5"
    assert prov.sequence_checksum("") is None


def test_uniprot_release_from_headers():
    headers = {"X-UniProt-Release": "2026_03", "X-UniProt-Release-Date": "02-September-2026"}
    assert prov.uniprot_release(headers) == {"release": "2026_03", "release_date": "2026-09-02"}
    assert prov.uniprot_release({}) == {"release": None, "release_date": None}


def test_ncbi_and_kegg_release_parsing():
    einfo = {"einforesult": {"dbinfo": [{"dbbuild": "Build261009-2210m.1", "lastupdate": "2026/10/10 08:08"}]}}
    assert prov.ncbi_release(einfo) == {"release": "Build261009-2210m.1", "release_date": "2026-10-10"}
    assert prov.ncbi_release({"unexpected": True}) == {}

    kegg = "pathway\tKEGG pathway maps\npath\t587 entries\n\tLast update 2026/10/09\n"
    assert prov.kegg_release(kegg) == {"release": None, "release_date": "2026-10-09"}
    assert prov.kegg_release("") == {}


def test_record_never_invents_missing_facts():
    r = prov.record("PDB", record_id="1BOM")
    assert r["database"] == "RCSB PDB"
    assert r["release"] is None and r["release_date"] is None and r["checksum"] is None
    assert r["helix"]["version"] == HELIX_VERSION


def test_oversized_or_malformed_provenance_is_refused():
    assert prov.accept({"a": "x" * (prov.MAX_PROVENANCE_BYTES + 1)}) is None
    assert prov.accept("not a dict") is None
    assert prov.accept({}) is None
    assert prov.accept({"release": "2026_03"}) == {"release": "2026_03"}


# ---- Saving keeps provenance ----


def _project(client, name="Provenance test"):
    return client.post("/projects", json={"name": name}).json()["id"]


def test_saved_item_keeps_the_provenance_captured_at_retrieval(client):
    pid = _project(client)
    captured = prov.record(
        "UniProtKB", record_id="P01308", release="2026_03", release_date="2026-09-02",
        record_version=284, sequence_version=1, checksum="CRC64:C2C3B23B85E520E5",
        retrieved_at="2026-10-01T09:00:00+00:00",
    )
    client.post(f"/projects/{pid}/items", json={
        "external_id": "P01308", "name": "INS_HUMAN", "database": "UniProt",
        "retrieved_at": "2026-10-01T09:00:00+00:00", "provenance": captured,
    })
    item = client.get(f"/projects/{pid}").json()["items"][0]
    assert item["provenance"] == captured
    assert item["provenance"]["captured"] == "retrieval"


def test_item_saved_without_provenance_is_marked_as_recorded_at_save(client):
    pid = _project(client)
    client.post(f"/projects/{pid}/items", json={
        "external_id": "672", "name": "BRCA1", "database": "NCBI Gene",
    })
    p = client.get(f"/projects/{pid}").json()["items"][0]["provenance"]
    assert p["captured"] == "save"
    assert p["database"] == "NCBI Gene" and p["release"] is None


def test_alignment_results_and_saves_carry_provenance(client):
    result = client.post("/align/needleman-wunsch", json={"seq1": "HEAGAWGHEE", "seq2": "PAWHEAE"}).json()
    assert result["provenance"]["helix"]["version"] == HELIX_VERSION
    assert result["provenance"]["libraries"]["biopython"]

    pid = _project(client)
    client.post(f"/projects/{pid}/alignments", json={
        "algorithm": "needleman-wunsch", "seq1": INSULIN, "seq2": "PAWHEAE",
        "aligned_seq1": result["aligned_seq1"], "aligned_seq2": result["aligned_seq2"],
        "score": result["score"], "params": {"sequence_type": "protein", "matrix": "BLOSUM62"},
        "provenance": result["provenance"],
    })
    saved = client.get(f"/projects/{pid}").json()["alignments"][0]
    assert saved["provenance"] == result["provenance"]
    assert saved["checksums"]["seq1"] == "CRC64:C2C3B23B85E520E5"


# ---- Migrations ----

_LEGACY_DDL = [
    "CREATE TABLE projects (id VARCHAR PRIMARY KEY, name VARCHAR NOT NULL, description TEXT, created_at DATETIME)",
    """CREATE TABLE saved_items (id VARCHAR PRIMARY KEY, project_id VARCHAR NOT NULL REFERENCES projects(id),
        external_id VARCHAR NOT NULL, name VARCHAR NOT NULL, database VARCHAR NOT NULL, description TEXT,
        link VARCHAR, notes TEXT, retrieved_at DATETIME, saved_at DATETIME)""",
    """CREATE TABLE saved_alignments (id VARCHAR PRIMARY KEY, project_id VARCHAR NOT NULL REFERENCES projects(id),
        algorithm VARCHAR NOT NULL, label1 VARCHAR, label2 VARCHAR, seq1 TEXT NOT NULL, seq2 TEXT NOT NULL,
        aligned_seq1 TEXT NOT NULL, aligned_seq2 TEXT NOT NULL, score FLOAT NOT NULL, identity_pct FLOAT,
        similarity_pct FLOAT, gaps INTEGER, length INTEGER, params TEXT, notes TEXT, created_at DATETIME)""",
]


def _alembic_head():
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    here = os.path.dirname(os.path.abspath(__file__))
    cfg = Config(os.path.join(here, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(here, "migrations"))
    return ScriptDirectory.from_config(cfg).get_current_head()


def _columns(engine, table):
    return {c["name"] for c in sa.inspect(engine).get_columns(table)}


def test_database_from_before_migrations_is_upgraded_in_place(tmp_path):
    """
    Production's tables were created by create_all before Alembic existed.
    The upgrade must add the new columns without touching existing rows, and
    running it again (every startup does) must change nothing.
    """
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'legacy.sqlite3'}")
    with engine.begin() as c:
        for ddl in _LEGACY_DDL:
            c.execute(sa.text(ddl))
        c.execute(sa.text("INSERT INTO projects (id, name) VALUES ('p1', 'Old project')"))
        c.execute(sa.text(
            "INSERT INTO saved_items (id, project_id, external_id, name, database) "
            "VALUES ('i1', 'p1', 'P38398', 'BRCA1_HUMAN', 'UniProt')"
        ))

    db_module.init_db(bind=engine)
    db_module.init_db(bind=engine)

    assert "provenance" in _columns(engine, "saved_items")
    assert "provenance" in _columns(engine, "saved_alignments")
    with engine.connect() as c:
        assert c.execute(sa.text("SELECT external_id, provenance FROM saved_items")).all() == [("P38398", None)]
        assert c.execute(sa.text("SELECT version_num FROM alembic_version")).scalar() == _alembic_head()


def test_migrations_produce_exactly_the_schema_the_models_describe(tmp_path):
    """Catches a model change committed without its migration."""
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'fresh.sqlite3'}")
    db_module.init_db(bind=engine)
    for table in db_module.Base.metadata.sorted_tables:
        assert _columns(engine, table.name) == {c.name for c in table.columns}, table.name


# ---- Methods export ----

def _item(acc, db="UniProt", when="2026-10-12T10:00:00+00:00", release="2026_03", **extra):
    p = None
    if release is not False:
        p = prov.record(db, record_id=acc, release=release, retrieved_at=when, **extra)
    return {"external_id": acc, "name": acc, "database": db, "retrieved_at": when, "provenance": p}


def _alignment(algorithm="needleman-wunsch", **params):
    base = {"sequence_type": "protein", "matrix": "BLOSUM62", "gap_open": -10.0, "gap_extend": -0.5}
    base.update(params)
    return {
        "algorithm": algorithm, "label1": "INS", "label2": "IGF1", "params": base,
        "provenance": prov.computation(), "checksums": {}, "created_at": "2026-10-12T10:00:00+00:00",
    }


def test_methods_states_release_and_access_date():
    out = methods_service.build({"items": [_item("P38398"), _item("P01308")]})
    assert (
        "Protein entries P38398 and P01308 were retrieved from UniProtKB release 2026_03 "
        "(The UniProt Consortium, 2025) on 12 October 2026."
    ) in out["text"]
    assert out["warnings"] == []


def test_methods_never_claims_a_release_that_was_not_recorded():
    out = methods_service.build({"items": [_item("P38398", release=False)]})
    assert "release" not in out["paragraphs"][0]
    assert "on 12 October 2026" in out["paragraphs"][0]
    assert any("before release tracking" in w for w in out["warnings"])


def test_partial_release_is_stated_as_partial():
    out = methods_service.build({"items": [_item("P38398"), _item("P01308", release=False)]})
    assert "Release 2026_03 was recorded for 1 of these 2 entries." in out["text"]
    assert "UniProtKB release 2026_03" not in out["text"]


def test_date_ranges():
    items = [_item("P1", when="2026-10-03T10:00:00+00:00"), _item("P2", when="2026-10-12T10:00:00+00:00")]
    assert "between 3 and 12 October 2026" in methods_service.build({"items": items})["text"]
    items = [_item("P1", when="2026-09-28T10:00:00+00:00"), _item("P2", when="2026-10-12T10:00:00+00:00")]
    assert "between 28 September and 12 October 2026" in methods_service.build({"items": items})["text"]


def test_methods_states_alignment_parameters_and_gap_convention():
    text = methods_service.build({"alignments": [_alignment()]})["text"]
    assert "A pairwise global alignment (INS vs IGF1) was computed" in text
    assert "the Needleman–Wunsch algorithm (Needleman and Wunsch, 1970)" in text
    assert "the BLOSUM62 substitution matrix (Henikoff and Henikoff, 1992)" in text
    assert "gap opening 10, gap extension 0.5" in text
    assert "a gap of length L scored −10 − 0.5(L − 1)" in text
    assert "Biopython" in text


def test_dna_alignment_states_match_and_mismatch_not_a_matrix():
    a = _alignment("smith-waterman", sequence_type="dna", match_score=5.0, mismatch_score=-4.0)
    text = methods_service.build({"alignments": [a]})["text"]
    assert "Smith–Waterman algorithm (Smith and Waterman, 1981)" in text
    assert "a match score of 5 and a mismatch score of −4" in text
    assert "substitution matrix" not in text and "Biopython" not in text


def test_pam250_cites_dayhoff_not_henikoff():
    out = methods_service.build({"alignments": [_alignment(matrix="PAM250")]})
    keys = [r["key"] for r in out["references"]]
    assert "dayhoff1978" in keys and "henikoff1992" not in keys


def test_references_are_exactly_those_cited():
    out = methods_service.build({"items": [_item("P38398"), _item("672", db="NCBI Gene", release="Build1")]})
    keys = [r["key"] for r in out["references"]]
    assert keys == ["uniprot2025", "brown2015", "sayers2025", "helix"]

    # Every in-text label in the prose resolves to a listed reference.
    cited = {label.strip() for group in re.findall(r"\(([^()]*\d{4}[^()]*)\)", out["text"]) for label in group.split(";")}
    labels = {r["in_text"] for r in out["references"]}
    assert {c for c in cited if re.search(r", \d{4}$", c)} <= labels


def test_ncbi_build_is_kept_out_of_prose_but_in_the_records_table():
    out = methods_service.build({"items": [_item("672", db="NCBI Gene", release="Build261009-2210m.1")]})
    assert "Build261009" not in out["text"]
    assert out["records"][0]["release"] == "Build261009-2210m.1"


def test_methods_endpoint(client):
    pid = _project(client)
    client.post(f"/projects/{pid}/items", json={
        "external_id": "P01308", "name": "INS_HUMAN", "database": "UniProt",
        "retrieved_at": "2026-10-12T09:00:00+00:00",
        "provenance": prov.record("UniProtKB", record_id="P01308", release="2026_03"),
    })
    out = client.get(f"/projects/{pid}/methods").json()
    assert "UniProtKB release 2026_03" in out["text"]
    assert out["records"][0]["identifier"] == "P01308"
    assert client.get("/projects/does-not-exist/methods").status_code == 404


# ---- Citations ----


def test_in_text_labels():
    assert citations.in_text("gotoh1982") == "Gotoh, 1982"
    assert citations.in_text("needleman1970") == "Needleman and Wunsch, 1970"
    assert citations.in_text("sayers2025") == "Sayers et al., 2025"
    assert citations.in_text("uniprot2025") == "The UniProt Consortium, 2025"


def test_every_reference_is_resolvable_and_well_formed():
    for key, ref in citations.REFERENCES.items():
        entry = citations.reference_entry(key)
        assert ref.get("doi") or ref.get("book") or ref.get("software"), key
        bib = entry["bibtex"]
        assert bib.count("{") == bib.count("}"), key
        assert bib.startswith("@") and f"{{{key}," in bib
    for keys in citations.SOURCE_CITATIONS.values():
        assert all(k in citations.REFERENCES for k in keys)


# ---- Release metadata stays in step ----


def test_version_matches_citation_file_and_frontend():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cff = os.path.join(root, "CITATION.cff")
    pkg = os.path.join(root, "biodb-frontend", "package.json")
    if not (os.path.exists(cff) and os.path.exists(pkg)):
        pytest.skip("not running from a full checkout")
    cff_version = re.search(r"^version:\s*['\"]?([^'\"\n]+)", open(cff).read(), re.M).group(1)
    assert cff_version == HELIX_VERSION
    assert json.load(open(pkg))["version"] == HELIX_VERSION


# ---- Live ----


@pytest.mark.network
def test_live_entity_carries_its_uniprot_release(client):
    p = client.get("/entity/INS").json()["provenance"]
    assert re.fullmatch(r"\d{4}_\d{2}", p["release"]), p
    assert p["record"] == "P01308" and p["record_version"].isdigit()
    assert p["checksum"] == "CRC64:C2C3B23B85E520E5"
