"""
A methods section, written from what a project actually contains.

Given a project's saved records and alignments, this produces paste-ready
prose (which databases, which releases, when; which algorithms, with what
parameters; which software build), the references it cites, and a records
table for supplementary material.

Rules it holds to, because a methods section is a factual claim:

- It states only what was recorded. A release appears in the prose only if
  the provenance captured it; records without one get their access date,
  and a warning says which.
- Parameters are stated in full, including the gap-scoring convention,
  since "gap open 10, extend 0.5" means different scores in different tools.
- Nothing is cited that wasn't used: references are collected from the
  sentences that were actually written.
"""

from collections import OrderedDict
from datetime import date, datetime
from typing import Dict, List, Optional, Tuple

import citations
import provenance as prov
from version import REPOSITORY_URL, helix_build, library_versions

# How each source's records are described in prose.
_NOUNS = {
    "UniProtKB": ("Protein entry", "Protein entries"),
    "NCBI Gene": ("Gene record", "Gene records"),
    "RCSB PDB": ("Structure entry", "Structure entries"),
    "KEGG": ("Pathway record", "Pathway records"),
    "PubMed": ("Literature record", "Literature records"),
    "AlphaFold DB": ("Predicted structure model", "Predicted structure models"),
}

# Sources with formal, citable releases. The others publish builds or update
# dates that are recorded in the records table but would mislead in prose
# ("NCBI Gene release Build261009-2210m.1" is not how anyone cites NCBI).
_RELEASED = {"UniProtKB"}

MAX_LISTED = 10


def _num(x) -> str:
    """10.0 -> '10', 0.5 -> '0.5'."""
    x = float(x)
    return str(int(x)) if x.is_integer() else f"{x:g}"


def _minus(x) -> str:
    s = _num(x)
    return s.replace("-", "−")


def _date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def _fmt_day(d: date) -> str:
    return f"{d.day} {d.strftime('%B')} {d.year}"


def _date_clause(dates: List[date]) -> str:
    if not dates:
        return ""
    lo, hi = min(dates), max(dates)
    if lo == hi:
        return f"on {_fmt_day(lo)}"
    if (lo.year, lo.month) == (hi.year, hi.month):
        return f"between {lo.day} and {hi.day} {hi.strftime('%B')} {hi.year}"
    if lo.year == hi.year:
        return f"between {lo.day} {lo.strftime('%B')} and {_fmt_day(hi)}"
    return f"between {_fmt_day(lo)} and {_fmt_day(hi)}"


def _join(words: List[str]) -> str:
    if len(words) <= 1:
        return "".join(words)
    return ", ".join(words[:-1]) + " and " + words[-1]


def _listing(ids: List[str]) -> str:
    if len(ids) <= MAX_LISTED:
        return _join(ids)
    shown = ids[:MAX_LISTED]
    return ", ".join(shown) + f" and {len(ids) - MAX_LISTED} others (see the records table)"


class _Refs:
    """Collects references in order of first citation."""

    def __init__(self):
        self.keys: List[str] = []

    def cite(self, keys: List[str]) -> str:
        return f"({self.inner(keys)})"

    def inner(self, keys: List[str]) -> str:
        """Citation text without parentheses, to merge into an existing aside."""
        for k in keys:
            if k not in self.keys:
                self.keys.append(k)
        return "; ".join(citations.in_text(k) for k in keys)


def _item_provenance(item: Dict) -> Dict:
    return item.get("provenance") or {}


def _records_sentences(items: List[Dict], refs: _Refs, warnings: List[str]) -> List[str]:
    groups: "OrderedDict[str, List[Dict]]" = OrderedDict()
    for item in items:
        groups.setdefault(prov.canonical(item.get("database", "")), []).append(item)

    sentences = []
    for source, group in groups.items():
        singular, plural = _NOUNS.get(source, ("Record", "Records"))
        noun = singular if len(group) == 1 else plural
        ids = [i.get("external_id") for i in group if i.get("external_id")]
        dates = [d for d in (_date(i.get("retrieved_at")) for i in group) if d]

        cite = refs.cite(citations.SOURCE_CITATIONS[source]) if source in citations.SOURCE_CITATIONS else ""
        where = f"{source} {cite}".strip()

        partial = ""
        if source in _RELEASED:
            releases = sorted({_item_provenance(i).get("release") for i in group} - {None})
            known = sum(1 for i in group if _item_provenance(i).get("release"))
            if releases and known == len(group):
                label = "release" if len(releases) == 1 else "releases"
                where = f"{source} {label} {_join(releases)} {cite}".strip()
            elif releases:
                # Stated as its own sentence so it can't be read as covering
                # every entry.
                label = "Release" if len(releases) == 1 else "Releases"
                partial = (
                    f" {label} {_join(releases)} {'was' if len(releases) == 1 else 'were'} "
                    f"recorded for {known} of these {len(group)} {plural.split()[-1].lower()}."
                )
            if known < len(group):
                warnings.append(
                    f"{len(group) - known} {source} record(s) were saved before release tracking "
                    "and are reported by access date only."
                )

        when = _date_clause(dates)
        sentence = f"{noun} {_listing(ids)} {'was' if len(group) == 1 else 'were'} retrieved from {where}"
        sentences.append(f"{sentence} {when}.".replace(" .", ".") + partial)
    return sentences


def _alignment_key(a: Dict) -> Tuple:
    p = a.get("params") or {}
    seq_type = p.get("sequence_type", "protein")
    scoring = (
        (p.get("matrix", "BLOSUM62"),) if seq_type == "protein"
        else (p.get("match_score", 5.0), p.get("mismatch_score", -4.0))
    )
    return (
        a.get("algorithm"),
        seq_type,
        scoring,
        p.get("gap_open", -10.0),
        p.get("gap_extend", -0.5),
    )


def _alignment_sentences(alignments: List[Dict], refs: _Refs) -> List[str]:
    groups: "OrderedDict[Tuple, List[Dict]]" = OrderedDict()
    for a in alignments:
        groups.setdefault(_alignment_key(a), []).append(a)

    sentences = []
    for (algorithm, seq_type, scoring, gap_open, gap_extend), group in groups.items():
        local = algorithm == "smith-waterman"
        kind = "local" if local else "global"
        method = (
            f"the Smith–Waterman algorithm {refs.cite(['smith1981'])}" if local
            else f"the Needleman–Wunsch algorithm {refs.cite(['needleman1970'])}"
        )
        pairs = [f"{a.get('label1', 'Sequence 1')} vs {a.get('label2', 'Sequence 2')}" for a in group]
        what = (
            f"A pairwise {kind} alignment ({pairs[0]}) was" if len(group) == 1
            else f"Pairwise {kind} alignments of {len(group)} sequence pairs ({'; '.join(pairs[:5])}"
            + ("; …" if len(pairs) > 5 else "") + ") were"
        )

        if seq_type == "protein":
            matrix = scoring[0]
            matrix_ref = citations.MATRIX_CITATIONS.get(matrix)
            scoring_text = f"the {matrix} substitution matrix" + (
                f" {refs.cite([matrix_ref])}" if matrix_ref else ""
            )
        else:
            match, mismatch = scoring
            scoring_text = f"a match score of {_minus(match)} and a mismatch score of {_minus(mismatch)}"

        open_pen, ext_pen = -float(gap_open), -float(gap_extend)
        # The convention is stated, not just the two numbers: tools differ on
        # whether the opening penalty includes the first gap position.
        gaps = (
            f"affine gap penalties ({refs.inner(['gotoh1982'])}; gap opening {_num(open_pen)}, "
            f"gap extension {_num(ext_pen)}, so that a gap of length L scored "
            f"−{_num(open_pen)} − {_num(ext_pen)}(L − 1))"
        )
        sentences.append(f"{what} computed using {method} with {scoring_text}, and {gaps}.")
    return sentences


def _software_sentence(items: List[Dict], alignments: List[Dict], refs: _Refs, warnings: List[str]) -> str:
    builds = []
    for p in [_item_provenance(i) for i in items] + [a.get("provenance") or {} for a in alignments]:
        h = p.get("helix") or {}
        if h.get("version"):
            builds.append((h["version"], h.get("commit")))
    unique = sorted(set(builds), key=lambda b: (b[0], b[1] or ""))

    if not unique:
        current = helix_build()
        unique = [(current["version"], current["commit"])]
        warnings.append(
            "The Helix build was not recorded for these results; the currently running build is "
            "cited instead."
        )

    versions = sorted({v for v, _ in unique})
    commits = sorted({c for _, c in unique if c})
    label = "version" if len(versions) == 1 else "versions"
    aside = []
    if commits:
        aside.append(f"commit{'s' if len(commits) > 1 else ''} {_join(commits)}")
    aside += [refs.inner(["helix"]), REPOSITORY_URL]

    work = (
        "Retrieval and analyses were performed" if items and alignments
        else "Records were retrieved" if items
        else "Analyses were performed"
    )
    sentence = f"{work} with Helix {label} {_join(versions)} ({'; '.join(aside)})"

    protein_alignments = [
        a for a in alignments if (a.get("params") or {}).get("sequence_type", "protein") == "protein"
    ]
    if protein_alignments:
        bio = sorted({
            ((a.get("provenance") or {}).get("libraries") or {}).get("biopython")
            for a in protein_alignments
        } - {None})
        if not bio and library_versions().get("biopython"):
            bio = [library_versions()["biopython"]]
            warnings.append(
                "The Biopython version was not recorded for these alignments; the version "
                "currently installed is cited instead."
            )
        if bio:
            sentence += (
                f", using substitution matrices from Biopython {_join(bio)} {refs.cite(['cock2009'])}"
            )
    return sentence + "."


def _records_table(items: List[Dict], alignments: List[Dict]) -> List[Dict]:
    rows = []
    for i in items:
        p = _item_provenance(i)
        helix = p.get("helix") or {}
        rows.append({
            "kind": "record",
            "identifier": i.get("external_id"),
            "name": i.get("name"),
            "database": prov.canonical(i.get("database", "")),
            "release": p.get("release"),
            "release_date": p.get("release_date"),
            "record_version": p.get("record_version"),
            "sequence_version": p.get("sequence_version"),
            "checksum": p.get("checksum"),
            "retrieved_at": i.get("retrieved_at"),
            "helix_version": helix.get("version"),
            "helix_commit": helix.get("commit"),
            "captured": p.get("captured") or "not recorded",
        })
    for a in alignments:
        p = a.get("provenance") or {}
        helix = p.get("helix") or {}
        params = a.get("params") or {}
        rows.append({
            "kind": "alignment",
            "identifier": f"{a.get('label1')} vs {a.get('label2')}",
            "name": "Smith–Waterman (local)" if a.get("algorithm") == "smith-waterman" else "Needleman–Wunsch (global)",
            "database": None,
            "release": None,
            "release_date": None,
            "record_version": None,
            "sequence_version": None,
            "checksum": " / ".join(c for c in (a.get("checksums") or {}).values() if c) or None,
            "retrieved_at": a.get("created_at"),
            "helix_version": helix.get("version"),
            "helix_commit": helix.get("commit"),
            "captured": p.get("captured") or "not recorded",
            "parameters": params,
            "score": a.get("score"),
        })
    return rows


def build(project: Dict) -> Dict:
    items = project.get("items") or []
    alignments = project.get("alignments") or []
    refs = _Refs()
    warnings: List[str] = []

    paragraphs = []
    if items:
        paragraphs.append(" ".join(_records_sentences(items, refs, warnings)))
    if alignments:
        paragraphs.append(" ".join(_alignment_sentences(alignments, refs)))
    if items or alignments:
        paragraphs.append(_software_sentence(items, alignments, refs, warnings))

    return {
        "project": {"id": project.get("id"), "name": project.get("name")},
        "text": "\n\n".join(paragraphs),
        "paragraphs": paragraphs,
        "references": [citations.reference_entry(k) for k in refs.keys],
        "records": _records_table(items, alignments),
        "warnings": warnings,
        "generated_at": datetime.now().astimezone().isoformat(),
        "generated_by": helix_build(),
    }
