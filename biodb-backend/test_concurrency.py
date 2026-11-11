"""
One slow request must not hold up the others.

Routes do blocking work (HTTP to UniProt/NCBI, database queries, password
hashing). Declared `async def`, that work ran on the event loop and stalled
every concurrent request — measured: a health check waited 3.3 s behind one
gene lookup. Plain `def` routes run in a thread pool instead.
"""

import ast
import glob
import os
import threading
import time

from conftest import ROOT, api_client
from database_apis import db_connector

SLOW = 1.5


def test_a_slow_lookup_does_not_block_other_requests(monkeypatch):
    def slow_resolve(query):
        time.sleep(SLOW)
        return {}

    monkeypatch.setattr(db_connector, "resolve_entity", slow_resolve)

    with api_client() as c:
        worker = threading.Thread(target=lambda: c.get("/entity/BRCA1"))
        worker.start()
        time.sleep(0.2)  # let the slow request get going

        started = time.monotonic()
        assert c.get(f"{ROOT}/health").status_code == 200
        waited = time.monotonic() - started
        worker.join()

    assert waited < SLOW / 3, f"/health waited {waited:.2f}s behind a slow lookup"


def test_no_route_is_async():
    """
    Static backstop for the test above, which exercises one route: no route
    handler may be `async def` unless it actually awaits something.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    paths = [os.path.join(here, "main.py"), *glob.glob(os.path.join(here, "routers", "*.py"))]
    assert len(paths) > 2, "routers/ not found: this check would pass vacuously"
    offenders = []
    for path in paths:
        offenders += _async_routes_that_never_await(path)
    assert not offenders, f"async routes that never await (they block the event loop): {offenders}"


def _async_routes_that_never_await(path):
    tree = ast.parse(open(path).read())
    offenders = []
    for node in tree.body:
        if not isinstance(node, ast.AsyncFunctionDef):
            continue
        is_route = any(
            isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and d.func.attr in {"get", "post", "put", "delete", "patch"}
            for d in node.decorator_list
        )
        awaits = any(isinstance(n, (ast.Await, ast.AsyncFor, ast.AsyncWith)) for n in ast.walk(node))
        if is_route and not awaits:
            offenders.append(f"{os.path.basename(path)}:{node.name}")
    return offenders
