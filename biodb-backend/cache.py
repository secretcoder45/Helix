"""
TTL cache in front of the external bioinformatics APIs.

Why this matters beyond speed: NCBI rate-limits unauthenticated requests to
3/sec (10/sec with an API key — see NCBI_API_KEY in .env). A researcher
re-running or refining a search hits the same queries repeatedly; caching
those responses keeps the app fast and avoids tripping rate limits under
real usage.

Two backends behind the one @cached decorator:

- In-process (default). Right for a single instance.
- Redis, when REDIS_URL is set. Needed once the backend runs as more than one
  instance: with per-process caches each replica fetches everything itself,
  multiplying load on NCBI and UniProt by the replica count.

The cache is an optimisation, never a dependency. If Redis is unreachable or
errors, the call goes straight to the source and the request still succeeds;
the failure is logged once rather than per request.
"""

import functools
import hashlib
import json
import logging
import os

from cachetools import TTLCache

log = logging.getLogger("helix.cache")

# 10 minutes: a research session's worth of repeat lookups hit cache, while
# results stay recent enough that the recorded source release is current.
TTL_SECONDS = 600
_MAXSIZE = 500
_PREFIX = "helix:cache:"


class _MemoryBackend:
    name = "memory"

    def __init__(self):
        self._cache = TTLCache(maxsize=_MAXSIZE, ttl=TTL_SECONDS)

    def get(self, key):
        return self._cache.get(key, _MISS)

    def set(self, key, value):
        self._cache[key] = value

    def stats(self):
        return {"size": len(self._cache), "maxsize": self._cache.maxsize}


class _RedisBackend:
    name = "redis"

    def __init__(self, client):
        self._client = client
        self._warned = False

    def _failed(self, e):
        if not self._warned:
            log.warning("Redis cache unavailable, calling sources directly: %s", e)
            self._warned = True

    def get(self, key):
        try:
            raw = self._client.get(_PREFIX + key)
        except Exception as e:  # any Redis/network error is a cache miss
            self._failed(e)
            return _MISS
        self._warned = False
        return _MISS if raw is None else json.loads(raw)

    def set(self, key, value):
        try:
            # JSON, not pickle: a shared cache must never be able to make the
            # app execute code, whoever else can write to it.
            self._client.setex(_PREFIX + key, TTL_SECONDS, json.dumps(value))
        except (TypeError, ValueError):
            pass  # not JSON-serialisable: just don't cache it
        except Exception as e:
            self._failed(e)

    def stats(self):
        try:
            return {"size": sum(1 for _ in self._client.scan_iter(_PREFIX + "*", count=500))}
        except Exception as e:
            self._failed(e)
            return {"size": None}


_MISS = object()


def _make_backend():
    url = os.getenv("REDIS_URL")
    if not url:
        return _MemoryBackend()
    import redis

    return _RedisBackend(
        redis.Redis.from_url(url, socket_timeout=1.0, socket_connect_timeout=1.0)
    )


_backend = _make_backend()


def _key(prefix: str, args, kwargs) -> str:
    raw = json.dumps([prefix, args, kwargs], sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def cached(prefix: str):
    """Decorator: cache a function's return value by its arguments."""

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            key = _key(prefix, args, kwargs)
            hit = _backend.get(key)
            if hit is not _MISS:
                return hit
            result = fn(*args, **kwargs)
            _backend.set(key, result)
            return result

        return wrapper

    return decorator


def cache_stats() -> dict:
    return {"backend": _backend.name, "ttl_seconds": TTL_SECONDS, **_backend.stats()}
