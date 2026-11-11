"""
The real Helix API, for the browser tests, with the source databases
replaced by recordings of their real answers (sources.json, from capture.py).

Everything else is real: accounts, projects, provenance, the methods export,
alignment — against a throwaway SQLite database created fresh on each start.
Anything not recorded answers as a source would when nothing matches, and
outbound HTTP is switched off entirely, so a test can't quietly depend on
the network.

    python e2e/backend/server.py        # from biodb-frontend/, port 8765
"""

import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(HERE, "..", "..", "..", "biodb-backend")
sys.path.insert(0, BACKEND)

PORT = int(os.getenv("E2E_API_PORT", "8765"))
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(tempfile.mkdtemp(), 'e2e.sqlite3')}"
os.environ.setdefault("ALLOWED_ORIGINS", os.getenv("E2E_ORIGIN", "http://localhost:4174"))
os.environ.setdefault("LOG_LEVEL", "WARNING")

import uvicorn  # noqa: E402

import main  # noqa: E402
import ratelimit  # noqa: E402
import upstream  # noqa: E402
from database_apis import db_connector  # noqa: E402

with open(os.path.join(HERE, "sources.json")) as f:
    RECORDED = json.load(f)

# What a source returns when nothing matches, per method.
NOTHING = {
    "resolve_entity": {},
    "fetch_alphafold": {},
    "fetch_sequence": {},
    "source_release": {},
    "fetch_variants": [],
}


def replay(method):
    def answer(arg, *args, **kwargs):
        return RECORDED.get(method, {}).get(str(arg).upper(), NOTHING.get(method, []))

    return answer


for method in [*RECORDED, "fetch_variants"]:
    setattr(db_connector, method, replay(method))


def no_network(method, url, **kwargs):
    raise AssertionError(f"e2e backend tried to reach {url}: record it in capture.py instead")


upstream.request = no_network

# Generous budgets: every test signs up from 127.0.0.1.
for throttle in ratelimit._REGISTRY:
    throttle.limit = 10_000

if __name__ == "__main__":
    uvicorn.run(main.app, host="127.0.0.1", port=PORT, log_level="warning")
