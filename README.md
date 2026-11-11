# Helix

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.24134621.svg)](https://doi.org/10.5281/zenodo.24134621)
[![tests](https://github.com/secretcoder45/Helix/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/secretcoder45/Helix/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**One lookup. Every database.** Type a gene or protein and Helix resolves it
across UniProtKB, NCBI Gene, RCSB PDB, KEGG and AlphaFold DB, finds the papers,
and hands the sequence on to alignment, phylogeny and primer design — without
copying identifiers between browser tabs.

**Use it:** [get-helix.vercel.app](https://get-helix.vercel.app) — free, and
every tool works without an account.

## What it does

| | |
|---|---|
| **Look up** | Cross-reference a gene or protein across five databases · batch lookup of up to 200 identifiers · BLAST via NCBI · search UniProt, PDB, NCBI Gene and KEGG side by side |
| **Compare** | Needleman–Wunsch and Smith–Waterman alignment (BLOSUM45/62/80, PAM250, affine gaps) · dot plots · neighbour-joining and UPGMA trees |
| **Characterise** | Protein properties with titration curve · six-frame ORF map and GC landscape · variant analysis in domain context |
| **Design** | PCR primer pairs, with reasons when none qualify · restriction maps with the predicted gel |
| **Keep** | Projects that record the database release, entry version and checksum of every result, and export a methods section with references · read-only share links |

How each result is checked — against Biopython, against known biology, or
against invariants — is listed on the
[validation page](https://get-helix.vercel.app/validation), with the test
behind every claim.

## Citing Helix

If you use Helix in published work, please cite it, and cite the source
databases your results came from. A project's **Methods & references** export
writes both for you, from what the project actually recorded.

> secretcoder45 (2026). Helix: a unified bioinformatics workspace.
> https://doi.org/10.5281/zenodo.24134621

```bibtex
@software{helix,
  author = {{secretcoder45}},
  title = {{Helix: a unified bioinformatics workspace}},
  year = {2026},
  doi = {10.5281/zenodo.24134621},
  url = {https://github.com/secretcoder45/Helix}
}
```

The DOI above always resolves to the latest release; each release also has its
own DOI on [Zenodo](https://doi.org/10.5281/zenodo.24134621). GitHub's
**Cite this repository** button reads [`CITATION.cff`](CITATION.cff).

## Running it locally

Backend (Python 3.13):

```bash
cd biodb-backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload            # http://localhost:8000, API docs at /docs
```

Frontend (Node 22):

```bash
cd biodb-frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env
npm run dev                          # http://localhost:5173
```

The backend uses a local SQLite file by default and applies its database
migrations on startup. Tests:

```bash
cd biodb-backend
python -m pytest -m "not network"    # offline suite, as run on every push
python -m pytest -m network          # checks against the live databases

cd ../biodb-frontend
npm run test:e2e                     # the interface in a real browser
```

The API is versioned: every path is under `/v1` (for example
`GET /v1/entity/BRCA1`), documented at `/docs`. The older unversioned paths
still answer, with a `Deprecation` header naming the `/v1` replacement.

## Layout

```
biodb-backend/    FastAPI app. main.py sets it up; routers/ holds the routes
                  (one module per area); database clients, analysis services,
                  accounts, projects, provenance, migrations alongside
biodb-frontend/   React + Vite workspace and landing page; e2e/ browser tests
DEPLOY.md         How the hosted version is deployed and configured
```

## Licence

[MIT](LICENSE). Data retrieved through Helix belongs to, and should be cited
from, its source databases. Helix is for research use, not for diagnostic or
clinical decisions.
