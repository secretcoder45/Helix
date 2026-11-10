import logging
import os
import threading
import time
import requests
from datetime import datetime, timezone
from typing import List, Dict

from cache import cached
import provenance as prov


log = logging.getLogger("helix.sources")


class SourceUnavailable(Exception):
    """
    A source database failed to answer — down, overloaded, rate-limiting us,
    or returning something we couldn't parse.

    Deliberately distinct from an empty result. These functions used to catch
    every error and return [], so "NCBI is down" reached the researcher as
    "no results for your gene" — a wrong answer that looks like a right one.
    Raised, it propagates (and is never cached), and the API reports it as a
    503 naming the source.
    """

    def __init__(self, source: str):
        self.source = source
        super().__init__(f"{source} isn't responding right now. Try again in a minute.")


def _ok(response, source: str) -> bool:
    """
    True for a 200. A 4xx is the source saying "no such record" (UniProt
    answers 400 for an unknown accession), so False. Server errors and rate
    limiting mean the source couldn't answer at all.
    """
    if response.status_code == 429 or response.status_code >= 500:
        log.warning("%s returned HTTP %s for %s", source, response.status_code, response.url)
        raise SourceUnavailable(source)
    return response.status_code == 200


def _failed(source: str, error: Exception) -> SourceUnavailable:
    if isinstance(error, SourceUnavailable):
        return error
    if isinstance(error, requests.RequestException):
        log.warning("%s request failed: %s", source, error)
    else:  # a response we couldn't parse: possibly our bug, so keep the traceback
        log.exception("%s returned something unexpected", source)
    return SourceUnavailable(source)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uniprot_provenance(entry: Dict, release: Dict, retrieved_at: str) -> Dict:
    """Provenance for one UniProtKB entry: release, entry/sequence version, CRC64."""
    audit = entry.get("entryAudit") or {}
    sequence = entry.get("sequence") or {}
    # Prefer UniProt's own checksum; compute the identical CRC64 if absent.
    checksum = (
        f"CRC64:{sequence['crc64']}" if sequence.get("crc64")
        else prov.sequence_checksum(sequence.get("value", ""))
    )
    return prov.record(
        "UniProtKB",
        record_id=entry.get("primaryAccession"),
        record_version=audit.get("entryVersion"),
        sequence_version=audit.get("sequenceVersion"),
        checksum=checksum,
        retrieved_at=retrieved_at,
        **release,
    )


class _RateLimiter:
    """
    Minimum-interval limiter, shared across threads.

    NCBI caps E-utilities at 3 requests/sec without an API key and 10/sec with
    one, and enforces it with 429s and temporary IP blocks. Single lookups
    never came close, but batch resolution fans out across a thread pool and
    would trip it immediately — so the throttle lives at the call site rather
    than being left to callers to remember.
    """

    def __init__(self, per_second: float):
        self._min_interval = 1.0 / per_second
        self._lock = threading.Lock()
        self._last = 0.0

    def acquire(self) -> None:
        with self._lock:
            now = time.monotonic()
            wait = self._last + self._min_interval - now
            if wait > 0:
                time.sleep(wait)
                now = time.monotonic()
            self._last = now


# Built once at import: the key is read from the environment at startup, and
# the limit depends on whether we have one.
_NCBI_LIMITER = _RateLimiter(10.0 if os.getenv("NCBI_API_KEY") else 3.0)


class DatabaseConnector:
    """Connect to various bioinformatics databases"""

    BASE_URLS = {
        "ncbi": "https://eutils.ncbi.nlm.nih.gov/entrez/eutils",
        "uniprot": "https://rest.uniprot.org/uniprotkb/search",
        "pdb": "https://data.rcsb.org/rest/v1/core/structure",
        "kegg": "https://rest.kegg.jp",
    }

    @staticmethod
    @cached("release")
    def source_release(database: str) -> Dict:
        """
        The current release (or nearest equivalent) of a source database.

        Used for records whose own response doesn't say which release it came
        from. UniProt does say, in a response header, so its records take the
        release from the exact response that produced them and only fall back
        to this. Cached like everything else here, which is ample: the
        fastest-moving of these sources changes daily, UniProt every ~8 weeks.
        """
        name = prov.canonical(database)
        try:
            if name == "UniProtKB":
                r = requests.get(
                    DatabaseConnector.BASE_URLS["uniprot"],
                    params={"query": "accession:P38398", "fields": "accession", "size": 1, "format": "json"},
                    timeout=8,
                )
                return prov.uniprot_release(r.headers) if r.status_code == 200 else {}
            if name in ("NCBI Gene", "PubMed"):
                params = {"db": "gene" if name == "NCBI Gene" else "pubmed", "retmode": "json"}
                if os.getenv("NCBI_API_KEY"):
                    params["api_key"] = os.getenv("NCBI_API_KEY")
                _NCBI_LIMITER.acquire()
                r = requests.get(f"{DatabaseConnector.BASE_URLS['ncbi']}/einfo.fcgi", params=params, timeout=8)
                return prov.ncbi_release(r.json()) if r.status_code == 200 else {}
            if name == "KEGG":
                r = requests.get(f"{DatabaseConnector.BASE_URLS['kegg']}/info/pathway", timeout=8)
                return prov.kegg_release(r.text) if r.status_code == 200 else {}
        except Exception as e:
            # Metadata, not the result itself: a lookup shouldn't fail because
            # the release couldn't be read. The record simply has no release.
            log.warning("Release lookup failed for %s: %s", name, e)
        # RCSB PDB updates weekly with no release identifier in its APIs;
        # the retrieval date is the honest record there.
        return {}

    @staticmethod
    @cached("ncbi_gene")
    def search_ncbi_gene(gene_name: str) -> List[Dict]:
        """Search NCBI Gene database"""
        try:
            # Free NCBI API key raises the rate limit from 3/sec to 10/sec —
            # get one at https://www.ncbi.nlm.nih.gov/account/settings/
            api_key = os.getenv("NCBI_API_KEY")

            url = f"{DatabaseConnector.BASE_URLS['ncbi']}/esearch.fcgi"
            params = {
                "db": "gene",
                # Symbol or full name: "INS" and "insulin" both find INS. Gene
                # Name alone matched only symbols, so searching "insulin"
                # reported no human gene. alive[prop] drops discontinued
                # records. (NCBI Gene has no [Description] field — it is
                # silently ignored, which returns unrelated popular genes.)
                "term": f"({gene_name}[Gene Name] OR {gene_name}[Gene Full Name]) "
                "AND human[Organism] AND alive[prop]",
                "retmode": "json",
                "retmax": 5,
            }
            if api_key:
                params["api_key"] = api_key

            _NCBI_LIMITER.acquire()
            response = requests.get(url, params=params, timeout=8)
            if not _ok(response, "NCBI Gene"):
                return []

            data = response.json()
            gene_ids = data.get("esearchresult", {}).get("idlist", [])
            if not gene_ids:
                return []

            # Batch fetch summaries in one call
            summary_url = f"{DatabaseConnector.BASE_URLS['ncbi']}/esummary.fcgi"
            summary_params = {
                "db": "gene",
                "id": ",".join(gene_ids),
                "retmode": "json",
            }
            if api_key:
                summary_params["api_key"] = api_key

            _NCBI_LIMITER.acquire()
            summary_response = requests.get(summary_url, params=summary_params, timeout=8)
            if not _ok(summary_response, "NCBI Gene"):
                return []

            summary_data = summary_response.json()
            release = DatabaseConnector.source_release("NCBI Gene")
            now = _now_iso()
            results = []
            for gene_id in gene_ids:
                gene_info = summary_data.get("result", {}).get(gene_id, {})
                if not gene_info:
                    continue
                results.append(
                    {
                        "id": gene_id,
                        "name": gene_info.get("name", gene_name),
                        "description": gene_info.get("description", "Gene"),
                        "type": gene_info.get("type", "protein-coding"),
                        "link": f"https://www.ncbi.nlm.nih.gov/gene/{gene_id}",
                        "retrieved_at": now,
                        "provenance": prov.record(
                            "NCBI Gene", record_id=gene_id, retrieved_at=now, **release
                        ),
                    }
                )

            return results

        except Exception as e:
            raise _failed("NCBI Gene", e) from e

    @staticmethod
    @cached("uniprot")
    def search_uniprot_protein(protein_name: str) -> List[Dict]:
        """Search UniProt for proteins"""
        try:
            url = DatabaseConnector.BASE_URLS["uniprot"]
            params = {
                "query": protein_name,
                "format": "json",
                "size": 5,
            }

            response = requests.get(url, params=params, timeout=8)
            if not _ok(response, "UniProt"):
                return []

            data = response.json()
            release = prov.uniprot_release(response.headers)
            now = _now_iso()
            results = []

            for entry in data.get("results", [])[:5]:
                accession = entry.get("primaryAccession")
                results.append(
                    {
                        "id": accession,
                        "name": entry.get("uniProtkbId", protein_name),
                        "description": entry.get("proteinDescription", {})
                        .get("recommendedName", {})
                        .get("fullName", {})
                        .get("value", "Protein"),
                        "organism": entry.get("organism", {}).get(
                            "scientificName", "Unknown"
                        ),
                        "link": f"https://www.uniprot.org/uniprotkb/{accession}",
                        "retrieved_at": now,
                        "provenance": _uniprot_provenance(entry, release, now),
                    }
                )

            return results

        except Exception as e:
            raise _failed("UniProt", e) from e

    _PDB_METHODS = {
        "X-RAY DIFFRACTION": "X-ray",
        "SOLUTION NMR": "NMR",
        "SOLID-STATE NMR": "Solid-state NMR",
        "ELECTRON MICROSCOPY": "Cryo-EM",
        "NEUTRON DIFFRACTION": "Neutron",
    }

    @staticmethod
    def _pdb_details(identifiers: List[str]) -> Dict[str, Dict]:
        """
        Title, method, resolution and release year for PDB entries, in one
        GraphQL request. The search API returns bare IDs, which on their own
        tell a researcher nothing about which structure to open.

        An enhancement, not the result: if it fails, the search still returns
        its IDs and this returns {}.
        """
        if not identifiers:
            return {}
        query = (
            "query($ids: [String!]!) { entries(entry_ids: $ids) { rcsb_id struct { title } "
            "exptl { method } rcsb_entry_info { resolution_combined } "
            "rcsb_accession_info { initial_release_date } } }"
        )
        try:
            r = requests.post(
                "https://data.rcsb.org/graphql",
                json={"query": query, "variables": {"ids": identifiers}},
                timeout=8,
            )
            if r.status_code != 200:
                return {}
            out = {}
            for e in (r.json().get("data") or {}).get("entries") or []:
                method = ((e.get("exptl") or [{}])[0] or {}).get("method", "")
                resolution = ((e.get("rcsb_entry_info") or {}).get("resolution_combined") or [None])[0]
                released = ((e.get("rcsb_accession_info") or {}).get("initial_release_date") or "")[:4]
                parts = [
                    DatabaseConnector._PDB_METHODS.get(method, method.capitalize()) if method else None,
                    f"{resolution:.2g} Å" if isinstance(resolution, (int, float)) else None,
                    released or None,
                ]
                out[e.get("rcsb_id")] = {
                    "title": ((e.get("struct") or {}).get("title") or "").strip() or None,
                    "meta": " · ".join(p for p in parts if p) or None,
                }
            return out
        except Exception as e:
            log.warning("PDB details lookup failed: %s", e)
            return {}

    @staticmethod
    @cached("pdb")
    def search_pdb_protein(protein_name: str) -> List[Dict]:
        """Search PDB for protein structures"""
        try:
            url = "https://search.rcsb.org/rcsbsearch/v2/query"

            query_json = {
                "query": {
                    "type": "terminal",
                    "service": "full_text",
                    "parameters": {"value": protein_name},
                },
                "request_options": {
                    "paginate": {"start": 0, "rows": 5},
                    "results_content_type": ["experimental"],
                },
                "return_type": "entry",
            }

            response = requests.post(url, json=query_json, timeout=8)
            if not _ok(response, "RCSB PDB"):
                return []

            data = response.json()
            now = _now_iso()
            identifiers = [r.get("identifier") for r in data.get("result_set", [])[:5]]
            details = DatabaseConnector._pdb_details(identifiers)
            results = []

            for identifier in identifiers:
                info = details.get(identifier, {})
                results.append(
                    {
                        "id": identifier,
                        "name": f"PDB {identifier}",
                        # The structure's own title; the search term only if
                        # the titles couldn't be fetched.
                        "description": info.get("title") or protein_name,
                        "meta": info.get("meta"),
                        "link": f"https://www.rcsb.org/structure/{identifier}",
                        "retrieved_at": now,
                        "provenance": prov.record(
                            "RCSB PDB", record_id=identifier, retrieved_at=now
                        ),
                    }
                )

            return results

        except Exception as e:
            raise _failed("RCSB PDB", e) from e

    @staticmethod
    @cached("kegg")
    def search_kegg_pathway(pathway_name: str) -> List[Dict]:
        """Search KEGG pathways"""
        try:
            url = f"https://rest.kegg.jp/find/pathway/{pathway_name}"
            response = requests.get(url, timeout=8)

            if not _ok(response, "KEGG") or not response.text.strip():
                return []

            release = DatabaseConnector.source_release("KEGG")
            now = _now_iso()
            results = []
            for line in response.text.strip().split("\n")[:5]:
                parts = line.split("\t")
                if len(parts) >= 2:
                    pathway_id = parts[0]
                    name = parts[1]
                    results.append(
                        {
                            "id": pathway_id,
                            "name": name,
                            "description": "KEGG Pathway",
                            "link": f"https://www.kegg.jp/pathway/{pathway_id.split(':')[-1]}",
                            "retrieved_at": now,
                            "provenance": prov.record(
                                "KEGG", record_id=pathway_id, retrieved_at=now, **release
                            ),
                        }
                    )
            return results
        except Exception as e:
            raise _failed("KEGG", e) from e

    @staticmethod
    @cached("pubmed")
    def search_pubmed(gene_symbol: str, limit: int = 5) -> List[Dict]:
        """
        Related literature for a gene, via PubMed E-utilities.

        Uses the same esearch -> esummary two-step as search_ncbi_gene, and
        shares its rate limiter — this is the same NCBI API family with the
        same 3/sec (10/sec with a key) limit.
        """
        try:
            api_key = os.getenv("NCBI_API_KEY")

            search_url = f"{DatabaseConnector.BASE_URLS['ncbi']}/esearch.fcgi"
            search_params = {
                "db": "pubmed",
                "term": f"{gene_symbol}[Gene Name] AND human[Organism]",
                "retmode": "json",
                "retmax": limit,
                "sort": "relevance",
            }
            if api_key:
                search_params["api_key"] = api_key

            _NCBI_LIMITER.acquire()
            search_response = requests.get(search_url, params=search_params, timeout=10)
            if not _ok(search_response, "PubMed"):
                return []

            pmids = search_response.json().get("esearchresult", {}).get("idlist", [])
            if not pmids:
                return []

            summary_url = f"{DatabaseConnector.BASE_URLS['ncbi']}/esummary.fcgi"
            summary_params = {"db": "pubmed", "id": ",".join(pmids), "retmode": "json"}
            if api_key:
                summary_params["api_key"] = api_key

            _NCBI_LIMITER.acquire()
            summary_response = requests.get(summary_url, params=summary_params, timeout=10)
            if not _ok(summary_response, "PubMed"):
                return []

            result = summary_response.json().get("result", {})
            release = DatabaseConnector.source_release("PubMed")
            now = _now_iso()
            papers = []
            for pmid in result.get("uids", []):
                article = result.get(pmid, {})
                if not article:
                    continue

                authors = article.get("authors", [])
                author_line = authors[0]["name"] if authors else "Unknown"
                if len(authors) > 1:
                    author_line += " et al."

                doi = next(
                    (a["value"] for a in article.get("articleids", []) if a.get("idtype") == "doi"),
                    None,
                )

                papers.append(
                    {
                        "pmid": pmid,
                        "title": article.get("title", "").rstrip("."),
                        "authors": author_line,
                        "journal": article.get("source", ""),
                        "year": (article.get("pubdate") or "")[:4],
                        "doi": doi,
                        "link": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                        "retrieved_at": now,
                        "provenance": prov.record(
                            "PubMed", record_id=pmid, retrieved_at=now, **release
                        ),
                    }
                )

            return papers

        except Exception as e:
            raise _failed("PubMed", e) from e

    @staticmethod
    @cached("variants")
    def fetch_variants(accession: str, position: int = None) -> List[Dict]:
        """
        Curated natural variants for an accession, optionally at one position.

        UniProt's variant annotations carry clinical significance and dbSNP
        identifiers where they exist — BRCA1 alone has 170 — which is what
        makes "is this position already known?" answerable rather than a
        guess.
        """
        try:
            r = requests.get(
                f"https://rest.uniprot.org/uniprotkb/{accession}.json",
                params={"fields": "ft_variant"},
                timeout=12,
            )
            if not _ok(r, "UniProt"):
                return []

            out = []
            for f in r.json().get("features", []):
                if f.get("type") != "Natural variant":
                    continue
                start = (f.get("location", {}).get("start") or {}).get("value")
                if start is None:
                    continue
                if position is not None and start != position:
                    continue
                xrefs = [
                    x.get("id")
                    for x in (f.get("featureCrossReferences") or [])
                    if x.get("database") == "dbSNP"
                ]
                out.append(
                    {
                        "position": start,
                        "description": f.get("description", ""),
                        "alternative": (f.get("alternativeSequence") or {}).get(
                            "alternativeSequences", [None]
                        )[0],
                        "original": (f.get("alternativeSequence") or {}).get("originalSequence"),
                        "dbsnp": xrefs[0] if xrefs else None,
                    }
                )
            return out
        except Exception as e:
            raise _failed("UniProt", e) from e

    @staticmethod
    @cached("alphafold")
    def fetch_alphafold(accession: str) -> Dict:
        """
        AlphaFold predicted structure for an accession.

        Matters because only a minority of proteins have an experimental PDB
        entry — for everything else the structures panel would otherwise be
        empty. The model URL can't be constructed by hand: it carries a
        version that changes, so the API has to be asked.

        pLDDT is the model's own per-residue confidence, and it is not
        decoration — low-confidence regions are frequently genuinely
        disordered rather than badly predicted, so the score has to travel
        with the model rather than being dropped.
        """
        try:
            r = requests.get(
                f"https://alphafold.ebi.ac.uk/api/prediction/{accession}", timeout=12
            )
            if not _ok(r, "AlphaFold DB"):
                return {}
            data = r.json()
            if not data:
                return {}
            m = data[0]

            # Per-residue confidence, fetched as well as the model URLs.
            # Deliberately not a 3D embed: Mol*'s public viewer was verified
            # not to load an arbitrary model URL (only `pdb`/`emdb` ids
            # trigger a fetch), so an embed would have rendered an empty box.
            # This is the more useful half of the prediction anyway — it says
            # WHICH regions to trust, which the 3D view does not make obvious.
            plddt = []
            try:
                doc = m.get("plddtDocUrl")
                if doc:
                    cr = requests.get(doc, timeout=12)
                    if cr.status_code == 200:
                        plddt = cr.json().get("confidenceScore", []) or []
            except Exception:
                plddt = []

            mean_plddt = round(sum(plddt) / len(plddt), 1) if plddt else None
            now = _now_iso()

            return {
                "accession": accession,
                "entry_id": m.get("entryId"),
                "version": m.get("latestVersion"),
                "pdb_url": m.get("pdbUrl"),
                "cif_url": m.get("cifUrl"),
                "pae_url": m.get("paeImageUrl"),
                "viewer_url": f"https://alphafold.ebi.ac.uk/entry/{accession}",
                "plddt": plddt,
                "mean_plddt": mean_plddt,
                "retrieved_at": now,
                # The model version is AlphaFold DB's unit of change: a v4
                # and a v6 model of the same protein are different predictions.
                "provenance": prov.record(
                    "AlphaFold DB",
                    record_id=m.get("entryId"),
                    record_version=m.get("latestVersion"),
                    release_date=(m.get("modelCreatedDate") or "")[:10] or None,
                    retrieved_at=now,
                ),
            }
        except Exception as e:
            raise _failed("AlphaFold DB", e) from e

    @staticmethod
    @cached("sequence")
    def fetch_sequence(accession: str) -> Dict:
        """
        Fetch one sequence directly by UniProt accession.

        Distinct from resolve_entity, which *searches*. Here the identifier is
        already known (it came from a BLAST hit or a saved project item), so
        this hits the accession endpoint directly — one small request instead
        of a search plus ranking.
        """
        try:
            response = requests.get(
                f"https://rest.uniprot.org/uniprotkb/{accession}.json",
                params={
                    "fields": "accession,id,protein_name,organism_name,sequence,version,sequence_version"
                },
                timeout=10,
            )
            # UniProt answers 400 (not 404) for an accession that doesn't
            # exist, so treat any non-200 as "not found" rather than checking
            # for a specific status.
            if not _ok(response, "UniProt"):
                return {}

            entry = response.json()
            sequence = entry.get("sequence", {})
            if not sequence.get("value"):
                return {}
            now = _now_iso()

            return {
                "accession": entry.get("primaryAccession", accession),
                "name": entry.get("uniProtkbId", accession),
                "protein_name": entry.get("proteinDescription", {})
                .get("recommendedName", {})
                .get("fullName", {})
                .get("value", ""),
                "organism": entry.get("organism", {}).get("scientificName", ""),
                "sequence": sequence.get("value", ""),
                "length": sequence.get("length"),
                "retrieved_at": now,
                "provenance": _uniprot_provenance(
                    entry, prov.uniprot_release(response.headers), now
                ),
            }
        except Exception as e:
            raise _failed("UniProt", e) from e

    @staticmethod
    @cached("entity")
    def resolve_entity(query: str) -> Dict:
        """
        Cross-reference a gene/protein across databases in one lookup.

        UniProt is the hub: a single reviewed entry carries the gene name, every
        solved PDB structure, the KEGG identifier, the sequence, and a curated
        function description. That turns what would otherwise be four separate
        searches (and four chances to mismatch identifiers) into one call whose
        cross-references are curator-verified.

        Selection is deliberately not "whatever the API ranked first". Two
        reasons, both found in testing:

        - `gene:INS` also matches the INS-IGF2 readthrough gene, so a substring
          match can silently return the wrong protein (200 aa readthrough
          instead of 110 aa insulin) for an exact official symbol.
        - UniProt's ordering is not stable across page sizes — the same query
          returned P01308 first at size=3 and F8WCM5 first at size=1.

        So we query exact-symbol first, ask for several candidates, and pick
        deterministically: exact gene symbol beats partial, human beats other
        organisms, reviewed beats unreviewed.
        """
        try:
            url = DatabaseConnector.BASE_URLS["uniprot"]
            wanted = query.strip().upper()

            # Progressively looser. gene_exact avoids the substring trap above.
            attempts = [
                f"gene_exact:{query} AND organism_id:9606 AND reviewed:true",
                f"gene_exact:{query} AND reviewed:true",
                f"(gene:{query} OR protein_name:{query}) AND organism_id:9606 AND reviewed:true",
                f"(gene:{query} OR protein_name:{query}) AND reviewed:true",
                f"{query} AND reviewed:true",
                query,
            ]

            def score(candidate: Dict) -> tuple:
                symbols = {
                    (g.get("geneName") or {}).get("value", "").upper()
                    for g in candidate.get("genes", [])
                }
                return (
                    wanted in symbols,
                    candidate.get("organism", {}).get("taxonId") == 9606,
                    candidate.get("entryType", "").startswith("UniProtKB reviewed"),
                )

            # Request only the fields we parse. A full UniProt entry is ~270 KB
            # (BRCA1 carries hundreds of cross-references and publications);
            # trimmed it is ~11 KB. Irrelevant for one lookup, but a 200-row
            # batch is the difference between ~54 MB and ~2 MB of transfer and
            # parsing.
            fields = (
                "accession,id,protein_name,organism_name,gene_names,"
                "cc_function,sequence,xref_pdb,xref_kegg,"
                # Feature annotations ride along on the request already being
                # made — domains, sites and modifications cost nothing extra
                # here and are what turn a sequence into an annotated map.
                "ft_signal,ft_chain,ft_peptide,ft_transmem,ft_domain,ft_region,"
                "ft_zn_fing,ft_motif,ft_act_site,ft_binding,ft_site,"
                "ft_mod_res,ft_carbohyd,ft_disulfid,"
                # Entry and sequence versions: what makes the record citable.
                "version,sequence_version"
            )

            entry = None
            release = {}
            for term in attempts:
                response = requests.get(
                    url,
                    # Several candidates, not one: picking from a set is what
                    # makes the choice stable and lets the scoring apply.
                    params={
                        "query": term,
                        "format": "json",
                        "size": 10,
                        "fields": fields,
                    },
                    timeout=15,
                )
                if not _ok(response, "UniProt"):
                    continue
                results = response.json().get("results", [])
                if results:
                    entry = max(results, key=score)
                    # The release that produced THIS entry, from this response.
                    release = prov.uniprot_release(response.headers)
                    break

            if not entry:
                return {}

            accession = entry.get("primaryAccession")

            # Gene symbols
            genes = [
                g.get("geneName", {}).get("value")
                for g in entry.get("genes", [])
                if g.get("geneName")
            ]

            # Curated function description
            function = ""
            for comment in entry.get("comments", []):
                if comment.get("commentType") == "FUNCTION" and comment.get("texts"):
                    function = comment["texts"][0].get("value", "")
                    break

            # Cross-references, grouped by target database
            xrefs = entry.get("uniProtKBCrossReferences", [])
            pdb_ids, kegg_ids = [], []
            for x in xrefs:
                if x.get("database") == "PDB":
                    pdb_ids.append(x.get("id"))
                elif x.get("database") == "KEGG":
                    kegg_ids.append(x.get("id"))

            sequence = entry.get("sequence", {})

            # Group features into the four bands the viewer draws. Grouping
            # rather than passing 14 raw types through keeps the colour
            # encoding to four categories, which is what the palette
            # validates all-pairs.
            feature_group = {
                "Signal": "topology", "Transmembrane": "topology",
                "Chain": "topology", "Peptide": "topology",
                "Domain": "domain", "Region": "domain",
                "Zinc finger": "domain", "Motif": "domain",
                "Active site": "site", "Binding site": "site", "Site": "site",
                "Modified residue": "modification", "Glycosylation": "modification",
                "Disulfide bond": "modification",
            }

            features = []
            for f in entry.get("features", []):
                loc = f.get("location", {})
                start = (loc.get("start") or {}).get("value")
                end = (loc.get("end") or {}).get("value")
                if start is None or end is None:
                    continue
                ftype = f.get("type", "")
                features.append(
                    {
                        "type": ftype,
                        "group": feature_group.get(ftype, "domain"),
                        "start": start,
                        "end": end,
                        "description": f.get("description", ""),
                    }
                )
            features.sort(key=lambda x: (x["start"], x["end"]))
            now = _now_iso()

            return {
                "query": query,
                "accession": accession,
                "name": entry.get("uniProtkbId"),
                "protein_name": entry.get("proteinDescription", {})
                .get("recommendedName", {})
                .get("fullName", {})
                .get("value", ""),
                "organism": entry.get("organism", {}).get("scientificName", ""),
                "genes": genes,
                "function": function,
                "sequence": {
                    "length": sequence.get("length"),
                    "molecular_weight": sequence.get("molWeight"),
                    "value": sequence.get("value", ""),
                },
                "structures": [
                    {
                        "id": pdb_id,
                        "database": "PDB",
                        "link": f"https://www.rcsb.org/structure/{pdb_id}",
                    }
                    for pdb_id in pdb_ids
                ],
                "pathways": [
                    {
                        "id": kegg_id,
                        "database": "KEGG",
                        "link": f"https://www.kegg.jp/entry/{kegg_id}",
                    }
                    for kegg_id in kegg_ids
                ],
                "features": features,
                "links": {
                    "uniprot": f"https://www.uniprot.org/uniprotkb/{accession}",
                },
                "retrieved_at": now,
                "provenance": _uniprot_provenance(entry, release, now),
            }

        except Exception as e:
            raise _failed("UniProt", e) from e


# Singleton instance
db_connector = DatabaseConnector()
