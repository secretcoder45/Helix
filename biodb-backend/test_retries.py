"""
Passing failures at a source are retried; lasting ones are reported.

The rule from test_resilience.py still holds — a source that is down is
reported as down, never as "no results" — but a single dropped connection
or 502 no longer gets that far: it is retried first (upstream.py).
"""

import secrets

import pytest
import requests

import database_apis
import upstream
from conftest import ROOT
from database_apis import SourceUnavailable, db_connector


class FakeResponse:
    def __init__(self, status=200, payload=None, text="", headers=None):
        self.status_code = status
        self._payload = payload if payload is not None else {"results": []}
        self.text = text
        self.headers = headers or {}
        self.url = "https://rest.uniprot.org/test"

    def json(self):
        return self._payload


def unique(prefix="q"):
    return f"{prefix}{secrets.token_hex(4)}"  # source calls are cached by argument


@pytest.fixture
def replies(monkeypatch):
    """
    Answer the connector's outbound requests from a script: each entry is a
    response to return or an exception to raise, in order. Returns the list
    of calls made.
    """
    calls = []
    script = []

    def fake(url, *args, **kwargs):
        calls.append(url)
        step = script.pop(0) if len(script) > 1 else script[0]
        if isinstance(step, Exception):
            raise step
        return step

    monkeypatch.setattr(requests, "get", fake)
    monkeypatch.setattr(requests, "post", fake)

    def play(*steps):
        script[:] = steps
        return calls

    return play


@pytest.fixture
def sleeps(monkeypatch):
    waited = []
    monkeypatch.setattr(upstream, "_sleep", waited.append)
    return waited


@pytest.mark.parametrize("hiccup", [
    FakeResponse(503),
    FakeResponse(502),
    FakeResponse(500),
    FakeResponse(429),
    requests.ConnectionError("connection reset by peer"),
    requests.ConnectTimeout("connect timed out"),
])
def test_one_hiccup_is_retried_and_the_lookup_succeeds(replies, hiccup):
    calls = replies(hiccup, FakeResponse(200))
    assert db_connector.search_uniprot_protein(unique()) == []
    assert len(calls) == 2
    assert upstream.stats()["rest.uniprot.org"] == {"retried": 1, "recovered": 1}


def test_a_source_that_stays_down_is_reported_after_three_tries(replies, sleeps):
    calls = replies(FakeResponse(503))
    with pytest.raises(SourceUnavailable) as e:
        db_connector.search_uniprot_protein(unique())
    assert e.value.source == "UniProt"
    assert len(calls) == upstream.ATTEMPTS == 3
    # Backing off, and backing off further the second time.
    assert len(sleeps) == 2 and 0 < sleeps[0] < sleeps[1]
    assert upstream.stats()["rest.uniprot.org"] == {"retried": 2, "gave_up": 1}


def test_a_connection_that_keeps_failing_is_reported(replies):
    calls = replies(requests.ConnectionError("refused"))
    with pytest.raises(SourceUnavailable):
        db_connector.search_kegg_pathway(unique())
    assert len(calls) == 3


def test_a_slow_source_is_not_asked_again(replies):
    # A read timeout means the source is up but slow; retrying doubles the wait.
    calls = replies(requests.ReadTimeout("read timed out"), FakeResponse(200))
    with pytest.raises(SourceUnavailable):
        db_connector.search_uniprot_protein(unique())
    assert len(calls) == 1


@pytest.mark.parametrize("status", [400, 404])
def test_an_answer_is_never_retried(replies, status):
    # "No such accession" is an answer, not a failure.
    calls = replies(FakeResponse(status))
    assert db_connector.fetch_sequence(unique("P")) == {}
    assert len(calls) == 1


def test_a_long_retry_after_is_reported_as_busy_rather_than_waited_out(replies, sleeps):
    calls = replies(FakeResponse(429, headers={"Retry-After": "120"}), FakeResponse(200))
    with pytest.raises(SourceUnavailable):
        db_connector.search_uniprot_protein(unique())
    assert len(calls) == 1 and sleeps == []


def test_a_short_retry_after_is_honoured(replies, sleeps):
    calls = replies(FakeResponse(429, headers={"Retry-After": "2"}), FakeResponse(200))
    assert db_connector.search_uniprot_protein(unique()) == []
    assert len(calls) == 2 and sleeps[0] >= 2


def test_retries_stop_at_the_deadline(replies, sleeps, monkeypatch):
    clock = iter([0.0, upstream.DEADLINE + 1])
    monkeypatch.setattr(upstream, "_clock", lambda: next(clock))
    calls = replies(FakeResponse(503), FakeResponse(200))
    with pytest.raises(SourceUnavailable):
        db_connector.search_uniprot_protein(unique())
    assert len(calls) == 1 and sleeps == []


def test_ncbi_retries_wait_their_turn_at_the_rate_limiter(replies, monkeypatch):
    # NCBI blocks clients that exceed 3 requests a second; a retry is a request.
    turns = []
    monkeypatch.setattr(database_apis._NCBI_LIMITER, "acquire", lambda: turns.append(1))
    calls = replies(FakeResponse(503), FakeResponse(200, {"esearchresult": {"idlist": []}}))
    assert db_connector.search_ncbi_gene(unique("GENE")) == []
    assert len(calls) == 2 and len(turns) == 2


def test_the_api_reports_retry_counts(anon_client, replies):
    replies(FakeResponse(502), FakeResponse(200))
    db_connector.search_uniprot_protein(unique())
    stats = anon_client.get("/upstream/stats").json()
    assert stats["rest.uniprot.org"]["recovered"] == 1


def test_a_lookup_survives_a_hiccup_end_to_end(anon_client, replies):
    replies(requests.ConnectionError("reset"), FakeResponse(200, {"results": []}))
    res = anon_client.post("/search", json={"query": unique(), "database": "proteins"})
    assert res.status_code == 200
    assert res.json()["unavailable"] == []
    assert anon_client.get(f"{ROOT}/health").status_code == 200
