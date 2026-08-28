"""
Shared pytest fixtures. DATABASE_URL must be set to a throwaway file before
anything imports main/db (which read it at import time), so this has to run
before any test module's imports — conftest.py is collected first by pytest,
which is the whole reason this lives here instead of in each test file.
"""

import os
import tempfile

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
