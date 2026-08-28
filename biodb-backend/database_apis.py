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


# Singleton instance
db_connector = DatabaseConnector()
