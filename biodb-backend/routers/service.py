"""Service-level routes: browser error reports, provenance, cache and retry stats."""

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel

import ratelimit
import upstream
from cache import cache_stats
from database_apis import db_connector
from ratelimit import limit
from version import helix_build, library_versions

log = logging.getLogger("helix")
router = APIRouter(tags=["Service"])


class ClientError(BaseModel):
    message: str
    page: str = ""
    stack: str = ""


@router.post("/client-errors", status_code=204, dependencies=[Depends(limit(ratelimit.CLIENT_ERRORS))])
def report_client_error(payload: ClientError):
    """
    A crash in the browser, reported by the page's error boundary.

    Logged at ERROR, so it lands in the server log next to backend errors
    (and in Sentry, when configured) without the frontend shipping a tracking
    SDK of its own. Truncated: this is a public endpoint.
    """
    log.error(
        "Browser error on %s: %s\n%s",
        payload.page[:200],
        payload.message[:500],
        payload.stack[:2000],
    )


@router.get("/provenance")
def current_provenance():
    """
    The build answering this request and the current release of each source.

    What a reader needs to judge whether a result produced now would match one
    produced earlier: same Helix commit, same Biopython, same source releases.
    """
    return {
        "helix": helix_build(),
        "libraries": library_versions(),
        "sources": {
            name: db_connector.source_release(name)
            for name in ("UniProtKB", "NCBI Gene", "PubMed", "KEGG")
        },
    }


@router.get("/cache/stats")
def cache_statistics():
    """Visibility into the API response cache."""
    return cache_stats()


@router.get("/upstream/stats")
def upstream_statistics():
    """
    Retries against the source databases since this server started, per host:
    `retried` attempts made, and whether the call then `recovered` or the
    source stayed down (`gave_up`). Lots of `gave_up` for one host means it is
    having a bad day; lots of `recovered` means the retries are earning their keep.
    """
    return upstream.stats()
