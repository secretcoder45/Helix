"""
Record real answers from the source databases for the browser tests.

The browser tests run the real backend, but with the source databases
replaced by these recordings (see server.py), so a test never fails because
NCBI was slow — and the recordings are real responses, so the interface is
tested against the shape the sources actually return.

Re-run when a source changes its format:  python e2e/backend/capture.py
(from biodb-frontend/, with the backend's virtualenv active).
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "biodb-backend"))
os.environ.setdefault("DATABASE_URL", "sqlite://")

from database_apis import db_connector  # noqa: E402

CALLS = {
    "resolve_entity": ["INS"],
    "search_ncbi_gene": ["INS", "insulin"],
    "search_uniprot_protein": ["insulin"],
    "search_pdb_protein": ["insulin"],
    "search_kegg_pathway": ["insulin"],
    "search_pubmed": ["INS"],
    "fetch_alphafold": ["P01308"],
    "fetch_sequence": ["P01308"],
    "source_release": ["UniProtKB", "NCBI Gene", "PubMed", "KEGG"],
}


def main():
    out = {}
    for method, args in CALLS.items():
        out[method] = {}
        for arg in args:
            result = getattr(db_connector, method)(arg)
            out[method][arg.upper()] = result
            size = len(result) if isinstance(result, (list, dict)) else result
            print(f"{method}({arg!r}): {size}")
    path = os.path.join(HERE, "sources.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1, sort_keys=True, ensure_ascii=False)
        f.write("\n")
    print(f"wrote {os.path.relpath(path)} ({os.path.getsize(path) // 1024} KB)")


if __name__ == "__main__":
    main()
