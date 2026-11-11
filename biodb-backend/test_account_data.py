"""
A person's data is theirs: they can download all of it, and delete the
account with everything in it.
"""

import json

import pytest

import auth
import db as db_module
import models
from conftest import TEST_PASSWORD, api_client, register

ITEM = {
    "external_id": "P01308",
    "name": "INS_HUMAN",
    "database": "UniProt",
    "description": "Insulin",
    "link": "https://www.uniprot.org/uniprotkb/P01308",
    "notes": "check the signal peptide",
}
ALIGNMENT = {
    "algorithm": "needleman-wunsch",
    "seq1": "MALWMR",
    "seq2": "MALWTR",
    "aligned_seq1": "MALWMR",
    "aligned_seq2": "MALWTR",
    "score": 21.0,
    "identity_pct": 83.3,
}


@pytest.fixture
def account():
    """A fresh signed-in account holding one project with a record, an alignment and a share link."""
    with api_client() as c:
        username, token = register(c)
        c.headers["Authorization"] = f"Bearer {token}"
        project = c.post("/projects", json={"name": "Insulin", "description": "signal peptides"}).json()
        c.post(f"/projects/{project['id']}/items", json=ITEM).raise_for_status()
        c.post(f"/projects/{project['id']}/alignments", json=ALIGNMENT).raise_for_status()
        share = c.post(f"/projects/{project['id']}/share").json()["share_token"]
        yield c, username, project["id"], share


def test_export_holds_everything_the_account_saved(account):
    c, username, project_id, share = account
    res = c.get("/auth/export")
    assert res.status_code == 200
    assert res.headers["Content-Disposition"].startswith(f'attachment; filename="helix-{username}-')

    data = res.json()
    assert data["format"] == "helix-account-export" and data["format_version"] == 1
    assert data["account"]["username"] == username
    assert data["helix"]["version"]
    [project] = data["projects"]
    assert project["id"] == project_id and project["description"] == "signal peptides"
    assert project["share_token"] == share
    [item] = project["items"]
    assert item["external_id"] == "P01308" and item["notes"] == "check the signal peptide"
    assert item["provenance"]["database"] == "UniProtKB"
    [alignment] = project["alignments"]
    assert alignment["aligned_seq2"] == "MALWTR"


def test_export_leaves_out_credentials(account):
    c, *_ = account
    text = c.get("/auth/export").text
    assert "password" not in text and "scrypt" not in text
    assert c.headers["Authorization"].removeprefix("Bearer ") not in text


def test_export_holds_only_this_accounts_projects(account):
    c, *_ = account
    with api_client() as other:
        _, token = register(other)
        other.headers["Authorization"] = f"Bearer {token}"
        other.post("/projects", json={"name": "someone else's"})
    names = [p["name"] for p in c.get("/auth/export").json()["projects"]]
    assert names == ["Insulin"]


def test_export_needs_a_session(anon_client):
    assert anon_client.get("/auth/export").status_code == 401


def test_deleting_needs_the_password(account):
    c, username, project_id, _ = account
    res = c.request("DELETE", "/auth/account", json={"password": "not the password"})
    assert res.status_code == 400 and res.json()["detail"] == "Password is incorrect."
    assert c.get("/auth/me").json()["username"] == username
    assert c.get(f"/projects/{project_id}").status_code == 200


def test_deleting_removes_the_account_and_everything_in_it(account):
    c, username, project_id, share = account
    token = c.headers["Authorization"].removeprefix("Bearer ")

    res = c.request("DELETE", "/auth/account", json={"password": TEST_PASSWORD})
    assert res.status_code == 200
    assert res.json() == {"deleted": True, "removed": {"projects": 1, "items": 1, "alignments": 1}}

    # Signed out everywhere, and the account can't be signed into.
    assert c.get("/auth/me").status_code == 401
    with api_client() as fresh:
        assert fresh.post("/auth/login", json={"username": username, "password": TEST_PASSWORD}).status_code == 401
        # The share link died with the project.
        assert fresh.get(f"/shared/{share}").status_code == 404

    # Nothing left behind in the database.
    session = db_module.SessionLocal()
    try:
        assert session.query(models.User).filter_by(username=username).count() == 0
        assert session.query(models.Project).filter_by(id=project_id).count() == 0
        assert session.query(models.SavedItem).filter_by(project_id=project_id).count() == 0
        assert session.query(models.SavedAlignment).filter_by(project_id=project_id).count() == 0
        assert session.query(models.AuthSession).filter_by(id=auth._token_hash(token)).count() == 0
    finally:
        session.close()


def test_a_deleted_username_can_be_registered_again(account):
    c, username, *_ = account
    c.request("DELETE", "/auth/account", json={"password": TEST_PASSWORD}).raise_for_status()
    with api_client() as fresh:
        register(fresh, username=username)
        fresh.headers["Authorization"] = f"Bearer {fresh.post('/auth/login', json={'username': username, 'password': TEST_PASSWORD}).json()['token']}"
        # A new account under the old name inherits nothing.
        assert fresh.get("/projects").json() == []


def test_deleting_leaves_other_accounts_alone(account):
    c, *_ = account
    with api_client() as other:
        _, token = register(other)
        other.headers["Authorization"] = f"Bearer {token}"
        kept = other.post("/projects", json={"name": "keep me"}).json()["id"]
        c.request("DELETE", "/auth/account", json={"password": TEST_PASSWORD}).raise_for_status()
        assert other.get(f"/projects/{kept}").status_code == 200


def test_password_guesses_through_delete_are_throttled_like_sign_in(account):
    # A stolen session token must not become a way to guess the password.
    c, *_ = account
    for _ in range(auth.LOGIN_FAILURES.limit):
        assert c.request("DELETE", "/auth/account", json={"password": "guess"}).status_code == 400
    blocked = c.request("DELETE", "/auth/account", json={"password": TEST_PASSWORD})
    assert blocked.status_code == 429 and "Retry-After" in blocked.headers
    assert c.get("/auth/me").status_code == 200


def test_deleting_needs_a_session(anon_client):
    assert anon_client.request("DELETE", "/auth/account", json={"password": "x"}).status_code == 401


def test_export_round_trips_as_json(account):
    c, *_ = account
    data = c.get("/auth/export").json()
    assert json.loads(json.dumps(data)) == data
