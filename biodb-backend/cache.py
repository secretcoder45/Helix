"""
In-memory TTL cache in front of the external bioinformatics APIs.

Why this matters beyond speed: NCBI rate-limits unauthenticated requests to
3/sec (10/sec with an API key — see NCBI_API_KEY in .env). A researcher
re-running or refining a search hits the same queries repeatedly; caching
those responses keeps the app fast and avoids tripping rate limits under
real usage.

This is a single-process cache — fine for one Railway/uvicorn worker. If the
app ever scales to multiple workers, swap TTLCache for Redis without
changing any call sites (the @cached decorator is the only thing to touch).
"""

import functools
import hashlib
import json
from cachetools import TTLCache

# 500 entries, 10 minutes each — generous enough that a research session's
# worth of repeat lookups all hit cache, small enough to not matter memory-wise.
_cache = TTLCache(maxsize=500, ttl=600)


def _key(prefix: str, args, kwargs) -> str:
    raw = json.dumps([prefix, args, kwargs], sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def cached(prefix: str):
    """Decorator: cache a function's return value by its arguments."""

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            key = _key(prefix, args, kwargs)
            if key in _cache:
                return _cache[key]
            result = fn(*args, **kwargs)
            _cache[key] = result
            return result

        return wrapper

    return decorator


def cache_stats() -> dict:
    return {"size": len(_cache), "maxsize": _cache.maxsize, "ttl_seconds": _cache.ttl}
