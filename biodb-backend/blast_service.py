"""
NCBI BLAST integration via their URL API.

Deliberately calls NCBI live rather than bundling a local BLAST+ binary and
database. The real alternative to "search takes 30s-several minutes" isn't
"instant" — it's "instant against a small, stale slice of Swiss-Prot we'd
have to bundle and re-index ourselves." A slower answer against the real,
current database is worth more to a researcher than a fast one against a
subset — the same tradeoff already made for every other integration here
(live UniProt/PDB/NCBI/KEGG calls, no cached mirrors).

This module is a thin, stateless proxy: NCBI's RID *is* the job state, so
nothing needs to be persisted locally between submit and results.
"""

import os
import re
import time
import threading
import xml.etree.ElementTree as ET
from typing import Dict, List, Literal, Optional

import requests

from cache import cached

BASE_URL = "https://blast.ncbi.nlm.nih.gov/Blast.cgi"

Program = Literal["blastp", "blastn", "blastx"]
Database = Literal["swissprot", "nr", "nt"]

# NCBI's usage guidelines ask for no more than 1 request every 10 seconds
# against this API — this is a much stricter limit than the E-utilities one,
# and worth its own limiter rather than reusing the NCBI Gene one.
_BLAST_LIMITER_LOCK = threading.Lock()
_last_request = 0.0


def _throttle():
    global _last_request
    with _BLAST_LIMITER_LOCK:
        wait = _last_request + 10.0 - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last_request = time.monotonic()


class BlastError(Exception):
    pass


def submit_search(sequence: str, program: Program = "blastp", database: Database = "swissprot") -> Dict:
    """Submit a search. Returns {rid, estimated_seconds}."""
    _throttle()
    response = requests.post(
        BASE_URL,
        data={
            "CMD": "Put",
            "PROGRAM": program,
            "DATABASE": database,
            "QUERY": sequence,
        },
        timeout=30,
    )
    if response.status_code != 200:
        raise BlastError(f"NCBI submission failed with HTTP {response.status_code}")

    rid_match = re.search(r"RID = (\S+)", response.text)
    rtoe_match = re.search(r"RTOE = (\S+)", response.text)
    if not rid_match:
        # NCBI returns 200 with an HTML error page for malformed input rather
        # than a non-200 status, so "no RID found" is the real failure signal.
        raise BlastError("NCBI did not return a request ID — check the sequence is valid")

    return {
        "rid": rid_match.group(1),
        "estimated_seconds": int(rtoe_match.group(1)) if rtoe_match else None,
    }


def check_status(rid: str) -> str:
    """Returns 'WAITING' | 'READY' | 'FAILED' | 'UNKNOWN'."""
    _throttle()
    response = requests.get(
        BASE_URL,
        params={"CMD": "Get", "FORMAT_OBJECT": "SearchInfo", "RID": rid},
        timeout=30,
    )
    match = re.search(r"Status=(\w+)", response.text)
    return match.group(1) if match else "UNKNOWN"


@cached("blast_results")
def fetch_results(rid: str, max_hits: int = 25) -> List[Dict]:
    """Fetch and parse results for a completed search. Cached by RID — a
    finished search's results never change, so repeat views (or a user
    reopening the same result) don't re-hit NCBI."""
    _throttle()
    response = requests.get(
        BASE_URL,
        params={"CMD": "Get", "FORMAT_TYPE": "XML", "RID": rid},
        timeout=60,
    )
    if response.status_code != 200:
        raise BlastError(f"Fetching results failed with HTTP {response.status_code}")

    return _parse_xml(response.text, max_hits)


def _parse_xml(xml_text: str, max_hits: int) -> List[Dict]:
    root = ET.fromstring(xml_text)
    hits = []

    for hit in root.iter("Hit"):
        hsp = hit.find("./Hit_hsps/Hsp")
        if hsp is None:
            continue

        def text(tag, default=""):
            el = hit.find(tag)
            return el.text if el is not None and el.text else default

        def hsp_text(tag, default=""):
            el = hsp.find(tag)
            return el.text if el is not None and el.text else default

        identity = int(hsp_text("Hsp_identity", 0))
        align_len = int(hsp_text("Hsp_align-len", 1))

        hits.append(
            {
                "accession": text("Hit_accession"),
                "definition": text("Hit_def"),
                "length": int(text("Hit_len", 0)),
                "evalue": float(hsp_text("Hsp_evalue", 0)),
                "bit_score": float(hsp_text("Hsp_bit-score", 0)),
                "identity_pct": round(100 * identity / align_len, 1) if align_len else 0,
                "align_length": align_len,
                "query_from": int(hsp_text("Hsp_query-from", 0)),
                "query_to": int(hsp_text("Hsp_query-to", 0)),
            }
        )
        if len(hits) >= max_hits:
            break

    return hits
