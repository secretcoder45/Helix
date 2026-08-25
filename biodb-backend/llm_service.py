import anthropic
import os
from typing import List, Dict
from dotenv import load_dotenv

load_dotenv()


class BioinformaticsLLM:
    """LLM service for bioinformatics queries, backed by Claude Haiku."""

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        # Haiku 4.5 — cheapest/fastest current Claude model, well suited to
        # grounded Q&A where the database results do most of the heavy lifting.
        self.model = "claude-haiku-4-5-20251001"

        self.system_prompt = """You are an expert bioinformatics AI assistant with deep knowledge of:
- Genomics and genetics
- Protein structures and functions
- Biological pathways
- Drug discovery
- Sequence analysis

Your role is to answer questions about bioinformatics clearly and accurately.

IMPORTANT:
- Be concise but informative
- If "Related database results" are provided below the question, ground your answer in them and reference specific IDs/names when relevant
- Mention relevant databases when relevant (PDB, NCBI, UniProt, KEGG)
- If you don't know something, say so — never invent an accession number, gene ID, or citation
- Suggest a related search when appropriate"""

    def answer_query(self, query: str, search_results: List[Dict] = None) -> str:
        """Answer a bioinformatics question, optionally grounded in search results."""

        context = ""
        if search_results:
            context = "\n\nRelated database results:\n"
            for result in search_results[:5]:
                context += f"- {result['name']} ({result.get('database', '')}): {result['description']}\n"

        user_message = f"{query}{context}"

        try:
            message = self.client.messages.create(
                model=self.model,
                max_tokens=1024,
                system=self.system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            return message.content[0].text

        except Exception as e:
            return f"Error reaching the LLM: {str(e)}"


# Singleton instance
llm = BioinformaticsLLM()
