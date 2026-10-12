"""
The shared-cache backend. Redis is replaced by a small fake implementing
the three calls the backend makes, so these run without a server.
"""

import json

import pytest

import cache


class FakeRedis:
    def __init__(self, broken=False):
        self.store, self.ttls, self.broken = {}, {}, broken

    def _check(self):
        if self.broken:
            raise ConnectionError("redis is down")

    def get(self, key):
        self._check()
        return self.store.get(key)

    def setex(self, key, ttl, value):
        self._check()
        self.store[key], self.ttls[key] = value, ttl

    def scan_iter(self, pattern, count=None):
        self._check()
        return iter([k for k in self.store if k.startswith(pattern.rstrip("*"))])


@pytest.fixture
def redis_backend(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(cache, "_backend", cache._RedisBackend(fake))
    return fake


def _counted(prefix, result):
    calls = {"n": 0}

    @cache.cached(prefix)
    def fn(term):
        calls["n"] += 1
        return result(term) if callable(result) else result

    return fn, calls


def test_redis_backend_serves_repeat_calls_from_the_cache(redis_backend):
    fn, calls = _counted("t1", lambda term: [{"id": term, "score": 1.5}])
    assert fn("insulin") == fn("insulin") == [{"id": "insulin", "score": 1.5}]
    assert calls["n"] == 1

    # Stored as JSON with the cache's TTL — never pickle, which would let
    # anyone able to write to a shared Redis run code in the app.
    (key, raw), = redis_backend.store.items()
    assert key.startswith("helix:cache:") and json.loads(raw) == [{"id": "insulin", "score": 1.5}]
    assert redis_backend.ttls[key] == cache.TTL_SECONDS
    assert cache.cache_stats()["backend"] == "redis"


def test_a_dead_redis_degrades_to_no_cache_not_to_errors(monkeypatch):
    monkeypatch.setattr(cache, "_backend", cache._RedisBackend(FakeRedis(broken=True)))
    fn, calls = _counted("t2", {"ok": True})
    assert fn("x") == {"ok": True} and fn("x") == {"ok": True}
    assert calls["n"] == 2  # every call went to the source; none failed
    assert cache.cache_stats()["size"] is None


def test_unserialisable_results_are_returned_but_not_cached(redis_backend):
    fn, calls = _counted("t3", lambda term: {"when": object()})
    fn("x")
    fn("x")
    assert calls["n"] == 2 and redis_backend.store == {}


def test_memory_backend_is_the_default_without_redis_url(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    assert cache._make_backend().name == "memory"
