"""
Shared pytest fixtures. DATABASE_URL must be set to a throwaway file before
anything imports main/db (which read it at import time), so this has to run
before any test module's imports — conftest.py is collected first by pytest,
which is the whole reason this lives here instead of in each test file.
"""

import os
import secrets
import tempfile

_tmp_db = os.path.join(tempfile.mkdtemp(), "test.sqlite3")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp_db}"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import auth  # noqa: E402
import main  # noqa: E402

TEST_PASSWORD = "a long test passphrase"


def register(client, username=None, password=TEST_PASSWORD):
    """Create an account; returns (username, token)."""
    username = username or f"user-{secrets.token_hex(4)}"
    res = client.post("/auth/register", json={"username": username, "password": password})
    assert res.status_code == 201, res.text
    return username, res.json()["token"]


@pytest.fixture(autouse=True)
def _reset_throttles():
    # Throttles are process-wide; one test's failed sign-ins must not lock
    # out the next test's user.
    auth.LOGIN_FAILURES.clear()
    auth.SIGNUPS.clear()
    yield


@pytest.fixture(scope="module")
def anon_client():
    # The context-manager form runs the app's lifespan handler, which creates
    # the tables. A bare TestClient(app) would skip it and every query would
    # fail with "no such table".
    with TestClient(main.app) as c:
        yield c


@pytest.fixture(scope="module")
def client():
    """Signed in as a fresh user for the module — projects need an owner."""
    with TestClient(main.app) as c:
        auth.SIGNUPS.clear()
        _, token = register(c)
        c.headers.update({"Authorization": f"Bearer {token}"})
        yield c
