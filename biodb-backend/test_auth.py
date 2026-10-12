"""
Accounts, ownership and share links.

The isolation tests walk every project route as a second user, because an
authorisation bug is one missing check on one route — testing only the
obvious ones would miss exactly the case that matters.
"""

import hashlib
import os
from datetime import datetime, timedelta, timezone

import pytest
import sqlalchemy as sa

import auth
import db as db_module
import models
from conftest import TEST_PASSWORD, register


def h(token):
    return {"Authorization": f"Bearer {token}"}


# ---- Passwords ----


def test_password_hash_is_salted_scrypt_and_verifies():
    a, b = auth.hash_password("correct horse battery"), auth.hash_password("correct horse battery")
    assert a.startswith("scrypt$16384$8$5$") and a != b  # parameters recorded; salt differs
    assert auth.verify_password("correct horse battery", a)
    assert not auth.verify_password("correct horse batterY", a)
    assert not auth.verify_password("anything", "not-a-hash")
    assert not auth.verify_password("anything", a.replace("scrypt", "md5"))


@pytest.mark.parametrize("username,password,fragment", [
    ("ab", TEST_PASSWORD, "3–32 characters"),
    ("has space", TEST_PASSWORD, "3–32 characters"),
    ("-leading", TEST_PASSWORD, "3–32 characters"),
    ("someone", "short", "at least 8"),
    ("someone", "password123", "most commonly used"),
    ("someone", "someone-2026!", "can't contain your username"),
])
def test_registration_rejects_bad_credentials(anon_client, username, password, fragment):
    res = anon_client.post("/auth/register", json={"username": username, "password": password})
    assert res.status_code == 400 and fragment in res.json()["detail"]


# ---- Register / sign in / sign out ----


def test_register_signs_in_and_usernames_are_case_insensitive(anon_client):
    res = anon_client.post("/auth/register", json={"username": "Ada.Lovelace", "password": TEST_PASSWORD})
    assert res.status_code == 201
    body = res.json()
    assert body["user"]["username"] == "ada.lovelace"
    assert anon_client.get("/auth/me", headers=h(body["token"])).json()["username"] == "ada.lovelace"

    dup = anon_client.post("/auth/register", json={"username": "ADA.LOVELACE", "password": TEST_PASSWORD})
    assert dup.status_code == 409


def test_sign_in_and_out(anon_client):
    username, _ = register(anon_client)
    res = anon_client.post("/auth/login", json={"username": username.upper(), "password": TEST_PASSWORD})
    assert res.status_code == 200
    token = res.json()["token"]
    assert anon_client.get("/auth/me", headers=h(token)).status_code == 200

    anon_client.post("/auth/logout", headers=h(token))
    assert anon_client.get("/auth/me", headers=h(token)).status_code == 401


def test_wrong_password_and_unknown_user_get_the_same_answer(anon_client):
    username, _ = register(anon_client)
    wrong = anon_client.post("/auth/login", json={"username": username, "password": "not the password"})
    unknown = anon_client.post("/auth/login", json={"username": "nobody-here", "password": "not the password"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_failed_sign_ins_are_throttled_per_username(anon_client):
    username, _ = register(anon_client)
    for _ in range(5):
        anon_client.post("/auth/login", json={"username": username, "password": "wrong guess"})
    # Locked even with the right password, so guessing can't continue.
    locked = anon_client.post("/auth/login", json={"username": username, "password": TEST_PASSWORD})
    assert locked.status_code == 429 and "Retry-After" in locked.headers

    other, _ = register(anon_client)
    assert anon_client.post("/auth/login", json={"username": other, "password": TEST_PASSWORD}).status_code == 200


def test_successful_sign_in_resets_the_failure_count(anon_client):
    username, _ = register(anon_client)
    for _ in range(4):
        anon_client.post("/auth/login", json={"username": username, "password": "wrong guess"})
    assert anon_client.post("/auth/login", json={"username": username, "password": TEST_PASSWORD}).status_code == 200
    for _ in range(4):
        anon_client.post("/auth/login", json={"username": username, "password": "wrong guess"})
    assert anon_client.post("/auth/login", json={"username": username, "password": TEST_PASSWORD}).status_code == 200


def test_sign_ups_are_throttled_per_address(anon_client):
    here = {"X-Forwarded-For": "203.0.113.7"}
    for i in range(10):
        ok = anon_client.post("/auth/register", headers=here, json={"username": f"bulk-{i}-x", "password": TEST_PASSWORD})
        assert ok.status_code == 201
    blocked = anon_client.post("/auth/register", headers=here, json={"username": "bulk-11-x", "password": TEST_PASSWORD})
    assert blocked.status_code == 429
    elsewhere = {"X-Forwarded-For": "203.0.113.8"}
    assert anon_client.post("/auth/register", headers=elsewhere, json={"username": "bulk-12-x", "password": TEST_PASSWORD}).status_code == 201


def test_client_address_uses_the_proxy_appended_entry():
    class Req:
        headers = {"X-Forwarded-For": "1.2.3.4, 198.51.100.9"}
        client = None
    # The left entry can be forged by the client; the right one was added by the proxy.
    assert auth.client_address(Req()) == "198.51.100.9"


# ---- Sessions ----


def test_only_a_hash_of_the_session_token_is_stored(anon_client):
    _, token = register(anon_client)
    with db_module.SessionLocal() as s:
        ids = [row.id for row in s.query(models.AuthSession).all()]
    assert token not in ids
    assert hashlib.sha256(token.encode()).hexdigest() in ids


def test_expired_sessions_are_rejected(anon_client):
    _, token = register(anon_client)
    with db_module.SessionLocal() as s:
        row = s.get(models.AuthSession, hashlib.sha256(token.encode()).hexdigest())
        row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        s.commit()
    assert anon_client.get("/auth/me", headers=h(token)).status_code == 401


def test_bad_or_missing_tokens_are_401(anon_client):
    assert anon_client.get("/auth/me").status_code == 401
    assert anon_client.get("/auth/me", headers=h("forged-token")).status_code == 401
    assert anon_client.get("/auth/me", headers={"Authorization": "Basic abc"}).status_code == 401


def test_changing_password_signs_out_other_sessions(anon_client):
    username, here = register(anon_client)
    there = anon_client.post("/auth/login", json={"username": username, "password": TEST_PASSWORD}).json()["token"]

    bad = anon_client.post("/auth/password", headers=h(here), json={"current_password": "wrong", "new_password": "a new long passphrase"})
    assert bad.status_code == 400

    ok = anon_client.post("/auth/password", headers=h(here), json={"current_password": TEST_PASSWORD, "new_password": "a new long passphrase"})
    assert ok.status_code == 200
    assert anon_client.get("/auth/me", headers=h(here)).status_code == 200
    assert anon_client.get("/auth/me", headers=h(there)).status_code == 401
    assert anon_client.post("/auth/login", json={"username": username, "password": TEST_PASSWORD}).status_code == 401
    assert anon_client.post("/auth/login", json={"username": username, "password": "a new long passphrase"}).status_code == 200


# ---- Ownership ----


@pytest.fixture
def two_users(anon_client):
    _, alice = register(anon_client)
    _, bob = register(anon_client)
    pid = anon_client.post("/projects", headers=h(alice), json={"name": "Alice's project"}).json()["id"]
    item = anon_client.post(f"/projects/{pid}/items", headers=h(alice), json={
        "external_id": "P01308", "name": "INS_HUMAN", "database": "UniProt",
    }).json()
    aln = anon_client.post(f"/projects/{pid}/alignments", headers=h(alice), json={
        "algorithm": "needleman-wunsch", "seq1": "AC", "seq2": "AC",
        "aligned_seq1": "AC", "aligned_seq2": "AC", "score": 1,
    }).json()
    return alice, bob, pid, item["id"], aln["id"]


def test_projects_require_sign_in(anon_client, two_users):
    _, _, pid, _, _ = two_users
    assert anon_client.get("/projects").status_code == 401
    assert anon_client.post("/projects", json={"name": "x"}).status_code == 401
    assert anon_client.get(f"/projects/{pid}").status_code == 401


def test_another_users_project_is_invisible_on_every_route(anon_client, two_users):
    alice, bob, pid, item_id, aln_id = two_users
    assert pid not in [p["id"] for p in anon_client.get("/projects", headers=h(bob)).json()]

    item = {"external_id": "X", "name": "X", "database": "UniProt"}
    aln = {"algorithm": "needleman-wunsch", "seq1": "A", "seq2": "A", "aligned_seq1": "A", "aligned_seq2": "A", "score": 1}
    attempts = [
        ("get", f"/projects/{pid}", None),
        ("get", f"/projects/{pid}/methods", None),
        ("delete", f"/projects/{pid}", None),
        ("post", f"/projects/{pid}/items", item),
        ("post", f"/projects/{pid}/items/bulk", {"items": [item]}),
        ("delete", f"/projects/{pid}/items/{item_id}", None),
        ("post", f"/projects/{pid}/alignments", aln),
        ("delete", f"/projects/{pid}/alignments/{aln_id}", None),
        ("post", f"/projects/{pid}/share", None),
        ("delete", f"/projects/{pid}/share", None),
    ]
    for method, url, body in attempts:
        kwargs = {"headers": h(bob)} | ({"json": body} if body is not None else {})
        res = getattr(anon_client, method)(url, **kwargs)
        # 404, not 403: a 403 would confirm the project exists.
        assert res.status_code == 404, (method, url, res.status_code)

    # And none of it touched Alice's data.
    mine = anon_client.get(f"/projects/{pid}", headers=h(alice)).json()
    assert len(mine["items"]) == 1 and len(mine["alignments"]) == 1
    assert mine["share_token"] is None


# ---- Share links ----


def test_share_link_is_read_only_and_revocable(anon_client, two_users):
    alice, bob, pid, _, _ = two_users
    token = anon_client.post(f"/projects/{pid}/share", headers=h(alice)).json()["share_token"]
    assert len(token) >= 24
    # Sharing again returns the same link rather than silently breaking the old one.
    assert anon_client.post(f"/projects/{pid}/share", headers=h(alice)).json()["share_token"] == token

    shared = anon_client.get(f"/shared/{token}").json()
    assert shared["read_only"] is True and shared["name"] == "Alice's project"
    assert len(shared["items"]) == 1 and "share_token" not in shared
    assert anon_client.get(f"/shared/{token}/methods").status_code == 200

    # Holding the link grants no write access, signed in or not.
    assert anon_client.delete(f"/projects/{pid}").status_code == 401
    assert anon_client.delete(f"/projects/{pid}", headers=h(bob)).status_code == 404

    anon_client.delete(f"/projects/{pid}/share", headers=h(alice))
    assert anon_client.get(f"/shared/{token}").status_code == 404
    new = anon_client.post(f"/projects/{pid}/share", headers=h(alice)).json()["share_token"]
    assert new != token and anon_client.get(f"/shared/{token}").status_code == 404


def test_unknown_share_token_is_404(anon_client):
    assert anon_client.get("/shared/not-a-real-token").status_code == 404
    assert anon_client.get("/shared/not-a-real-token/methods").status_code == 404


# ---- Migration of pre-account data ----


def test_projects_from_before_accounts_get_no_owner(tmp_path):
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'pre-accounts.sqlite3'}")
    from alembic import command
    from alembic.config import Config

    here = os.path.dirname(os.path.abspath(__file__))
    cfg = Config(os.path.join(here, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(here, "migrations"))
    with engine.begin() as c:
        cfg.attributes["connection"] = c
        command.upgrade(cfg, "0002_provenance")
        c.execute(sa.text("INSERT INTO projects (id, name) VALUES ('old', 'Made before accounts')"))

    db_module.init_db(bind=engine)

    with engine.connect() as c:
        assert c.execute(sa.text("SELECT owner_id FROM projects WHERE id = 'old'")).scalar() is None
        assert {"users", "auth_sessions"} <= set(sa.inspect(engine).get_table_names())
