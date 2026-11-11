"""
The API lives under /v1, and the old unversioned paths keep working.

The unversioned paths are what every client used before /v1 existed —
including a frontend bundle already open in someone's browser when a deploy
lands — so they must not disappear, but they should say they are old.
"""

import re

from fastapi.routing import APIRoute
from starlette.routing import Match

import main
from conftest import ROOT


def _declared():
    """(path, method) for every route the routers declare, before mounting."""
    return {
        (route.path, method)
        for router in main.ROUTERS
        for route in router.routes
        if isinstance(route, APIRoute)
        for method in route.methods
    }


def _served(path, method):
    """Would the app route this request to a handler (rather than 404/405)?"""
    concrete = re.sub(r"\{[^}]+\}", "x", path)
    scope = {"type": "http", "path": concrete, "method": method, "root_path": "", "headers": []}
    return any(r.matches(scope)[0] == Match.FULL for r in main.app.routes)


def test_every_route_is_served_under_v1_and_at_its_old_path():
    declared = _declared()
    assert len(declared) > 30
    missing = [
        f"{method} {prefix}{path}"
        for path, method in declared
        for prefix in ("/v1", "")
        if not _served(f"{prefix}{path}", method)
    ]
    assert not missing, missing


def test_nothing_is_served_under_another_version():
    assert not _served("/v2/databases", "GET")


def test_the_docs_describe_only_the_versioned_api():
    paths = set(main.app.openapi()["paths"])
    assert "/health" in paths
    assert all(p.startswith("/v1/") for p in paths - {"/health"}), sorted(paths)
    assert "/v1/entity/{query}" in paths and "/entity/{query}" not in paths


def test_an_unversioned_path_still_works_and_names_its_replacement(anon_client):
    old = anon_client.get(f"{ROOT}/databases")
    new = anon_client.get("/databases")
    assert old.status_code == new.status_code == 200
    assert old.json() == new.json()
    assert old.headers["Deprecation"] == "true"
    assert old.headers["Link"] == '</v1/databases>; rel="successor-version"'
    assert "Deprecation" not in new.headers


def test_an_unversioned_path_shares_the_versioned_rate_limit(anon_client):
    # Two mounts of one route must not mean two budgets.
    import ratelimit

    for _ in range(ratelimit.LOOKUPS.limit):
        anon_client.post("/search", json={"query": "x", "database": "nope"})
    assert anon_client.post(f"{ROOT}/search", json={"query": "x", "database": "nope"}).status_code == 429


def test_health_stays_at_the_root(anon_client):
    res = anon_client.get(f"{ROOT}/health")
    assert res.status_code == 200 and res.json()["api"] == "v1"
    assert "Deprecation" not in res.headers


def test_cors_lets_the_browser_read_the_deprecation_and_download_headers():
    middleware = next(m for m in main.app.user_middleware if m.cls.__name__ == "CORSMiddleware")
    exposed = set(middleware.kwargs["expose_headers"])
    assert {"Deprecation", "Link", "Content-Disposition", "X-Request-ID"} <= exposed
