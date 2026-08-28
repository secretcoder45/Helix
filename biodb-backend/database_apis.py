import os
import threading
import time
import requests
from datetime import datetime, timezone
from typing import List, Dict

from cache import cached


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
                "term": f"{gene_name}[Gene Name] AND human[Organism]",
                "retmode": "json",
                "retmax": 5,
            }
            if api_key:
                params["api_key"] = api_key

            _NCBI_LIMITER.acquire()
            response = requests.get(url, params=params, timeout=8)
            if response.status_code != 200:
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
            if summary_response.status_code != 200:
                return []

            summary_data = summary_response.json()
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
                        "retrieved_at": _now_iso(),
                    }
                )

            return results

        except Exception as e:
            print(f"NCBI search error: {e}")
            return []

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
            if response.status_code != 200:
                return []

            data = response.json()
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
                        "retrieved_at": _now_iso(),
                    }
                )

            return results

        except Exception as e:
            print(f"UniProt search error: {e}")
            return []

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
            if response.status_code != 200:
                return []

            data = response.json()
            results = []

            for result in data.get("result_set", [])[:5]:
                identifier = result.get("identifier")
                results.append(
                    {
                        "id": identifier,
                        "name": f"PDB {identifier}",
                        "description": protein_name,
                        "link": f"https://www.rcsb.org/structure/{identifier}",
                        "retrieved_at": _now_iso(),
                    }
                )

            return results

        except Exception as e:
            print(f"PDB search error: {e}")
            return []

    @staticmethod
    @cached("kegg")
    def search_kegg_pathway(pathway_name: str) -> List[Dict]:
        """Search KEGG pathways"""
        try:
            url = f"https://rest.kegg.jp/find/pathway/{pathway_name}"
            response = requests.get(url, timeout=8)

            if response.status_code != 200 or not response.text.strip():
                return []

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
                            "retrieved_at": _now_iso(),
                        }
                    )
            return results
        except Exception as e:
            print(f"KEGG search error: {e}")
            return []

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
            if search_response.status_code != 200:
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
            if summary_response.status_code != 200:
                return []

            result = summary_response.json().get("result", {})
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
                        "retrieved_at": _now_iso(),
                    }
                )

            return papers

        except Exception as e:
            print(f"PubMed search error: {e}")
            return []

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
                params={"fields": "accession,id,protein_name,organism_name,sequence"},
                timeout=10,
            )
            # UniProt answers 400 (not 404) for an accession that doesn't
            # exist, so treat any non-200 as "not found" rather than checking
            # for a specific status.
            if response.status_code != 200:
                return {}

            entry = response.json()
            sequence = entry.get("sequence", {})
            if not sequence.get("value"):
                return {}

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
                "retrieved_at": _now_iso(),
            }
        except Exception as e:
            print(f"Sequence fetch error: {e}")
            return {}

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
                "cc_function,sequence,xref_pdb,xref_kegg"
            )

            entry = None
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
                if response.status_code != 200:
                    continue
                results = response.json().get("results", [])
                if results:
                    entry = max(results, key=score)
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
                "links": {
                    "uniprot": f"https://www.uniprot.org/uniprotkb/{accession}",
                },
                "retrieved_at": _now_iso(),
            }

        except Exception as e:
            print(f"Entity resolution error: {e}")
            return {}


# Singleton instance
db_connector = DatabaseConnector()
