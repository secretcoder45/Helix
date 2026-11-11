"""
Outbound HTTP to the source databases, with retries for passing failures.

UniProt, NCBI, RCSB and KEGG all have moments where a request fails and the
identical request a second later succeeds: a dropped connection, a 502 from
a load balancer mid-deploy, a 429 because the previous second was busy.
Before this, each of those reached the researcher as "UniProt isn't
responding". Now they are retried a couple of times, quickly, and only a
failure that persists is reported.

What is retried, and what isn't:

- Connection failures (refused, reset, DNS, connect timeout): the request
  never got an answer, so asking again is the right move.
- HTTP 429 and 5xx: the source said "not now". A Retry-After longer than
  MAX_RETRY_AFTER is respected by *not* retrying — making the user wait
  that long is worse than saying the source is busy.
- Read timeouts are not retried. The source is up but slow, and asking
  again would double an already long wait for, usually, the same result.
- 4xx other than 429 is an answer ("no such accession"), never retried.

Everything goes through `requests.get` / `requests.post`, looked up at call
time, so tests that replace those functions still see every attempt.
"""

import logging
import random
import threading
import time
from collections import Counter
from typing import Callable, Optional
from urllib.parse import urlsplit

import requests

log = logging.getLogger("helix.upstream")

RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})
ATTEMPTS = 3            # the first try plus two retries
BACKOFF = 0.4           # seconds before the first retry; doubles each time
MAX_RETRY_AFTER = 3.0   # a source asking us to wait longer gets a "busy" instead
DEADLINE = 15.0         # no retry starts once a call has taken this long

# Replaced in tests so retries don't slow the suite down (or, for the
# clock, so the deadline can be reached without waiting for it).
_sleep = time.sleep
_clock = time.monotonic

_counts: Counter = Counter()
_counts_lock = threading.Lock()


def _count(host: str, outcome: str) -> None:
    with _counts_lock:
        _counts[(host, outcome)] += 1


def stats() -> dict:
    """Retries since startup, per host: how many were needed, and how they ended."""
    with _counts_lock:
        out: dict = {}
        for (host, outcome), n in sorted(_counts.items()):
            out.setdefault(host, {})[outcome] = n
        return out


def reset_stats() -> None:
    with _counts_lock:
        _counts.clear()


def _retryable_error(error: Exception) -> bool:
    if isinstance(error, requests.ReadTimeout):
        return False
    return isinstance(error, (requests.ConnectionError, requests.Timeout))


def _retry_after(response) -> Optional[float]:
    value = (getattr(response, "headers", None) or {}).get("Retry-After")
    if value is None:
        return None
    try:
        return max(0.0, float(value))
    except (TypeError, ValueError):
        return None  # an HTTP date: rare from these sources; use our own backoff


def _backoff(attempt: int) -> float:
    # Jitter so that a batch of 200 lookups hitting the same hiccup doesn't
    # retry in lockstep and cause a second one.
    return BACKOFF * (2 ** (attempt - 1)) * random.uniform(0.75, 1.25)


def request(method: str, url: str, *, before: Optional[Callable[[], None]] = None,
            attempts: int = ATTEMPTS, **kwargs):
    """
    Send a request, retrying passing failures. Returns the final response
    (which may still be a 5xx: the caller decides what that means), or
    raises the final exception.

    `before` runs ahead of every attempt — NCBI's rate limiter goes there,
    so a retry counts against the limit like any other request.
    """
    send = getattr(requests, method.lower())
    host = urlsplit(url).hostname or url
    started = _clock()
    attempt = 0

    while True:
        attempt += 1
        if before:
            before()

        error = None
        try:
            response = send(url, **kwargs)
        except requests.RequestException as e:
            error, response = e, None

        if error is None and response.status_code not in RETRY_STATUSES:
            if attempt > 1:
                _count(host, "recovered")
                log.info("%s answered on attempt %d", host, attempt)
            return response

        # A failure. Retry, or hand it back?
        if error is not None:
            reason = type(error).__name__
            retry = _retryable_error(error)
            delay = _backoff(attempt)
        else:
            reason = f"HTTP {response.status_code}"
            asked = _retry_after(response)
            retry = asked is None or asked <= MAX_RETRY_AFTER
            delay = max(_backoff(attempt), asked or 0.0)

        out_of_time = _clock() - started + delay > DEADLINE
        if not retry or attempt >= attempts or out_of_time:
            if attempt > 1:
                _count(host, "gave_up")
            if error is not None:
                raise error
            return response

        _count(host, "retried")
        log.info("%s: %s; retrying in %.1fs (attempt %d of %d)", host, reason, delay, attempt + 1, attempts)
        _sleep(delay)


def get(url: str, **kwargs):
    return request("GET", url, **kwargs)


def post(url: str, **kwargs):
    """For POSTs that only read — searches and GraphQL queries — which are safe to repeat."""
    return request("POST", url, **kwargs)
