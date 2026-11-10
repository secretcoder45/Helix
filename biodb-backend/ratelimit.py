"""
Per-client rate limits.

Two jobs. Sign-in throttling (see auth.py) stops password guessing. Endpoint
limits stop one client — usually a script — from using up a shared, free
backend: a batch lookup is 200 upstream requests, a 30-sequence tree is 435
alignments, and NCBI blocks the server's whole address if it is hit too hard,
which would break lookups for everyone. The limits sit well above what a
person working in the browser does.

In-memory and per-process, which is right for the single instance this runs
on; with more than one instance they would move to the shared cache.
"""

import threading
import time
from collections import deque
from typing import Optional

from fastapi import HTTPException, Request

_REGISTRY = []


class Throttle:
    """At most `limit` events per key in a sliding window of `window` seconds."""

    def __init__(self, limit: int, window: float):
        self.limit, self.window = limit, window
        self._events = {}
        self._lock = threading.Lock()
        _REGISTRY.append(self)

    def _recent(self, key: str) -> deque:
        q = self._events.setdefault(key, deque())
        cutoff = time.monotonic() - self.window
        while q and q[0] < cutoff:
            q.popleft()
        if not q:
            # Keep memory bounded by active clients, not every client ever seen.
            self._events.pop(key, None)
            q = self._events.setdefault(key, deque())
        return q

    def blocked(self, key: str) -> Optional[int]:
        """Seconds until `key` may try again, or None if it may now."""
        with self._lock:
            q = self._recent(key)
            if len(q) < self.limit:
                return None
            return max(1, int(q[0] + self.window - time.monotonic()) + 1)

    def hit(self, key: str) -> None:
        with self._lock:
            self._recent(key).append(time.monotonic())

    def take(self, key: str) -> Optional[int]:
        """Record an event if allowed; otherwise the seconds to wait. Atomic."""
        with self._lock:
            q = self._recent(key)
            if len(q) >= self.limit:
                return max(1, int(q[0] + self.window - time.monotonic()) + 1)
            q.append(time.monotonic())
            return None

    def clear(self, key: Optional[str] = None) -> None:
        with self._lock:
            if key is None:
                self._events.clear()
            else:
                self._events.pop(key, None)


def clear_all() -> None:
    """Reset every limiter. For tests."""
    for t in _REGISTRY:
        t.clear()


def client_address(request: Request) -> str:
    # Behind Render's proxy the socket address is the proxy's. The right-most
    # X-Forwarded-For entry is the one the proxy itself appended, so unlike
    # the left-most it can't be chosen by the client.
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def too_many(seconds: int, what: str = "requests") -> HTTPException:
    if seconds < 90:
        wait = f"{seconds} second{'s' if seconds != 1 else ''}"
    else:
        minutes = round(seconds / 60)
        wait = f"{minutes} minute{'s' if minutes != 1 else ''}"
    return HTTPException(
        status_code=429,
        detail=f"Too many {what}. Try again in {wait}.",
        headers={"Retry-After": str(seconds)},
    )


def limit(throttle: Throttle):
    """FastAPI dependency: count this request against `throttle`, per client."""

    def dependency(request: Request) -> None:
        wait = throttle.take(client_address(request))
        if wait:
            raise too_many(wait)

    return dependency


# Endpoint budgets, per client address. Sized from real use: one gene lookup
# in the browser makes 3 requests (record, papers, AlphaFold), and typing in
# a search box makes a few more.
LOOKUPS = Throttle(limit=120, window=60)      # /entity, /search, /literature, ...
COMPUTE = Throttle(limit=60, window=60)       # alignment, trees, DNA, primers, ...
BATCHES = Throttle(limit=10, window=10 * 60)  # each is up to 200 lookups
BLAST = Throttle(limit=10, window=60 * 60)    # NCBI asks for restraint; searches run minutes
CLIENT_ERRORS = Throttle(limit=20, window=60 * 60)
