"""
Helix's own version, and the exact build that is running.

A version number alone is not enough to reproduce a result: two deploys can
share a version and differ in code. So every provenance record carries the
commit as well. Render exposes it as RENDER_GIT_COMMIT; locally it is read
from git; anywhere else it is honestly reported as unknown rather than
guessed.

Keep HELIX_VERSION in step with CITATION.cff and the frontend's
package.json — test_provenance.py fails if they drift.
"""

import functools
import os
import subprocess
from importlib.metadata import PackageNotFoundError, version as _pkg_version

HELIX_VERSION = "0.1.0"
REPOSITORY_URL = "https://github.com/secretcoder45/Helix"

# Set once a DOI is minted for a release (Zenodo), so exports can cite it.
HELIX_DOI = os.getenv("HELIX_DOI") or None


@functools.lru_cache(maxsize=1)
def _commit():
    env = os.getenv("RENDER_GIT_COMMIT") or os.getenv("HELIX_COMMIT")
    if env:
        return env[:7]
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short=7", "HEAD"],
            cwd=os.path.dirname(os.path.abspath(__file__)),
            capture_output=True,
            text=True,
            timeout=2,
        )
        if out.returncode != 0:
            return None
        return out.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def helix_build() -> dict:
    return {"name": "Helix", "version": HELIX_VERSION, "commit": _commit()}


def library_versions() -> dict:
    """Versions of the libraries whose data or algorithms results depend on."""
    out = {}
    for name in ("biopython",):
        try:
            out[name] = _pkg_version(name)
        except PackageNotFoundError:
            out[name] = None
    return out
