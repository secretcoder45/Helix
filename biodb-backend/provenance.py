"""
Provenance: which release of which database a result came from, which
version of the record, and which build of Helix produced it.

A retrieval date alone does not make a result reproducible. UniProt
re-annotates entries between releases and occasionally revises sequences, so
"BRCA1, retrieved 12 Oct" does not identify a sequence — "P38398, entry
version 285, sequence version 2, CRC64 89C6D83FF56312AF, UniProtKB 2026_03"
does. The checksum is UniProt's own (CRC64), so anyone can compare it against
the entry without trusting Helix.

Captured at retrieval, not at save: a record looked up today and saved next
week came from today's release. Records that reach a project without it
(saved by an older client) are marked `captured: "save"` so nothing pretends
to more precision than it has.

Pure functions only. The network lookups that feed these live in
database_apis.py, next to the rate limiter they need.
"""

import json
from datetime import datetime
from typing import Dict, Optional

from Bio.SeqUtils.CheckSum import crc64

from version import helix_build, library_versions

# Saved items carry short labels ("UniProt"); methods text and citations need
# the resource's proper name.
CANONICAL_NAMES = {
    "UniProt": "UniProtKB",
    "UniProtKB": "UniProtKB",
    "NCBI Gene": "NCBI Gene",
    "PubMed": "PubMed",
    "PDB": "RCSB PDB",
    "RCSB PDB": "RCSB PDB",
    "KEGG": "KEGG",
    "AlphaFold": "AlphaFold DB",
    "AlphaFold DB": "AlphaFold DB",
}

# Client-supplied provenance is stored as-is (it is the user's own record),
# but bounded so a project row can't be used as arbitrary blob storage.
MAX_PROVENANCE_BYTES = 8_000


def canonical(database: str) -> str:
    return CANONICAL_NAMES.get(database, database)


def sequence_checksum(sequence: str) -> Optional[str]:
    """UniProt-compatible CRC64 of a sequence, e.g. 'CRC64:89C6D83FF56312AF'."""
    if not sequence:
        return None
    return "CRC64:" + crc64(sequence.upper()).removeprefix("CRC-")


def _parse_date(value: Optional[str], formats) -> Optional[str]:
    if not value:
        return None
    for fmt in formats:
        try:
            return datetime.strptime(value.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


def uniprot_release(headers) -> Dict:
    """Release from UniProt's response headers: X-UniProt-Release(-Date)."""
    release = headers.get("X-UniProt-Release")
    return {
        "release": release or None,
        "release_date": _parse_date(headers.get("X-UniProt-Release-Date"), ("%d-%B-%Y",)),
    }


def ncbi_release(einfo_json: Dict) -> Dict:
    """NCBI has no numbered releases; the database build is the closest identifier."""
    try:
        info = einfo_json["einforesult"]["dbinfo"][0]
    except (KeyError, IndexError, TypeError):
        return {}
    return {
        "release": info.get("dbbuild") or None,
        "release_date": _parse_date((info.get("lastupdate") or "").split(" ")[0], ("%Y/%m/%d",)),
    }


def kegg_release(info_text: str) -> Dict:
    """
    KEGG's REST API no longer publishes a release number, only each
    database's last-update date — so that is all that is recorded.
    """
    for line in (info_text or "").splitlines():
        if "Last update" in line:
            return {
                "release": None,
                "release_date": _parse_date(line.split("Last update", 1)[1], ("%Y/%m/%d",)),
            }
    return {}


def record(
    database: str,
    *,
    record_id: Optional[str] = None,
    release: Optional[str] = None,
    release_date: Optional[str] = None,
    record_version: Optional[str] = None,
    sequence_version: Optional[str] = None,
    checksum: Optional[str] = None,
    retrieved_at: Optional[str] = None,
    captured: str = "retrieval",
) -> Dict:
    """One provenance record. Absent facts stay None — never filled in."""
    return {
        "database": canonical(database),
        "record": record_id,
        "release": release,
        "release_date": release_date,
        "record_version": None if record_version is None else str(record_version),
        "sequence_version": None if sequence_version is None else str(sequence_version),
        "checksum": checksum,
        "retrieved_at": retrieved_at,
        "helix": helix_build(),
        "captured": captured,
    }


def computation() -> Dict:
    """Provenance for a result Helix computed itself (e.g. an alignment)."""
    return {
        "helix": helix_build(),
        "libraries": library_versions(),
        "computed_at": datetime.now().astimezone().isoformat(),
        "captured": "computation",
    }


def accept(value) -> Optional[Dict]:
    """Validate client-supplied provenance before storing it."""
    if not isinstance(value, dict) or not value:
        return None
    try:
        encoded = json.dumps(value)
    except (TypeError, ValueError):
        return None
    if len(encoded) > MAX_PROVENANCE_BYTES:
        return None
    return value


def dumps(value: Optional[Dict]) -> Optional[str]:
    return json.dumps(value) if value else None


def loads(value: Optional[str]) -> Optional[Dict]:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None
