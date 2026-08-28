import os
import requests
from datetime import datetime, timezone
from typing import List, Dict

from cache import cached


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    @cached("entity")
    def resolve_entity(query: str) -> Dict:
        """
        Cross-reference a gene/protein across databases in one lookup.

        UniProt is the hub: a single reviewed entry carries the gene name, every
        solved PDB structure, the KEGG identifier, the sequence, and a curated
        function description. That turns what would otherwise be four separate
        searches (and four chances to mismatch identifiers) into one call whose
        cross-references are curator-verified.

        Prefers reviewed (Swiss-Prot) human entries, then any reviewed entry,
        then whatever matches — so "BRCA1" lands on the canonical human protein
        rather than an unreviewed fragment from another organism.
        """
        try:
            url = DatabaseConnector.BASE_URLS["uniprot"]

            # Try progressively looser queries rather than a single broad one.
            attempts = [
                f"(gene:{query} OR protein_name:{query}) AND organism_id:9606 AND reviewed:true",
                f"(gene:{query} OR protein_name:{query}) AND reviewed:true",
                f"{query} AND reviewed:true",
                query,
            ]

            entry = None
            for term in attempts:
                response = requests.get(
                    url,
                    params={"query": term, "format": "json", "size": 1},
                    timeout=10,
                )
                if response.status_code != 200:
                    continue
                results = response.json().get("results", [])
                if results:
                    entry = results[0]
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
