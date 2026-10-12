"""
References for the resources and methods Helix uses, and their formatting.

Every entry below was checked on 2026-10-12 against Crossref (title, journal,
volume, issue, pages, year, DOI) and, where Crossref's author list is
incomplete, against PubMed. A wrong reference in an exported methods section
is worse than none — it gets copied into a manuscript — so these are data,
not something to retype from memory.

Each resource cites what its own maintainers ask for: KEGG asks for both the
original and the current paper, AlphaFold DB for the method and the
database, and so on.
"""

from typing import Dict, List

from version import HELIX_DOI, HELIX_VERSION, REPOSITORY_URL

REFERENCES: Dict[str, Dict] = {
    "uniprot2025": {
        "group": "The UniProt Consortium",
        "year": 2025,
        "title": "UniProt: the Universal Protein Knowledgebase in 2025",
        "journal": "Nucleic Acids Res",
        "volume": "53", "issue": "D1", "pages": "D609–D617",
        "doi": "10.1093/nar/gkae1010",
    },
    "sayers2025": {
        "authors": ["Sayers EW", "Beck J", "Bolton EE"], "et_al": True,
        "year": 2025,
        "title": "Database resources of the National Center for Biotechnology Information in 2025",
        "journal": "Nucleic Acids Res",
        "volume": "53", "issue": "D1", "pages": "D20–D29",
        "doi": "10.1093/nar/gkae979",
    },
    "brown2015": {
        "authors": ["Brown GR", "Hem V", "Katz KS"], "et_al": True,
        "year": 2015,
        "title": "Gene: a gene-centered information resource at NCBI",
        "journal": "Nucleic Acids Res",
        "volume": "43", "issue": "D1", "pages": "D36–D42",
        "doi": "10.1093/nar/gku1055",
    },
    "berman2000": {
        "authors": ["Berman HM", "Westbrook J", "Feng Z"], "et_al": True,
        "year": 2000,
        "title": "The Protein Data Bank",
        "journal": "Nucleic Acids Res",
        "volume": "28", "issue": "1", "pages": "235–242",
        "doi": "10.1093/nar/28.1.235",
    },
    "burley2025": {
        "authors": ["Burley SK", "Bhatt R", "Bhikadiya C"], "et_al": True,
        "year": 2025,
        "title": "Updated resources for exploring experimentally-determined PDB structures and Computed Structure Models at the RCSB Protein Data Bank",
        "journal": "Nucleic Acids Res",
        "volume": "53", "issue": "D1", "pages": "D564–D574",
        "doi": "10.1093/nar/gkae1091",
    },
    "kanehisa2000": {
        "authors": ["Kanehisa M", "Goto S"],
        "year": 2000,
        "title": "KEGG: Kyoto Encyclopedia of Genes and Genomes",
        "journal": "Nucleic Acids Res",
        "volume": "28", "issue": "1", "pages": "27–30",
        "doi": "10.1093/nar/28.1.27",
    },
    "kanehisa2025": {
        "authors": ["Kanehisa M", "Furumichi M", "Sato Y"], "et_al": True,
        "year": 2025,
        "title": "KEGG: biological systems database as a model of the real world",
        "journal": "Nucleic Acids Res",
        "volume": "53", "issue": "D1", "pages": "D672–D677",
        "doi": "10.1093/nar/gkae909",
    },
    "jumper2021": {
        "authors": ["Jumper J", "Evans R", "Pritzel A"], "et_al": True,
        "year": 2021,
        "title": "Highly accurate protein structure prediction with AlphaFold",
        "journal": "Nature",
        "volume": "596", "issue": "7873", "pages": "583–589",
        "doi": "10.1038/s41586-021-03819-2",
    },
    "varadi2024": {
        "authors": ["Varadi M", "Bertoni D", "Magana P"], "et_al": True,
        "year": 2024,
        "title": "AlphaFold Protein Structure Database in 2024: providing structure coverage for over 214 million protein sequences",
        "journal": "Nucleic Acids Res",
        "volume": "52", "issue": "D1", "pages": "D368–D375",
        "doi": "10.1093/nar/gkad1011",
    },
    "needleman1970": {
        "authors": ["Needleman SB", "Wunsch CD"],
        "year": 1970,
        "title": "A general method applicable to the search for similarities in the amino acid sequence of two proteins",
        "journal": "J Mol Biol",
        "volume": "48", "issue": "3", "pages": "443–453",
        "doi": "10.1016/0022-2836(70)90057-4",
    },
    "smith1981": {
        "authors": ["Smith TF", "Waterman MS"],
        "year": 1981,
        "title": "Identification of common molecular subsequences",
        "journal": "J Mol Biol",
        "volume": "147", "issue": "1", "pages": "195–197",
        "doi": "10.1016/0022-2836(81)90087-5",
    },
    "gotoh1982": {
        "authors": ["Gotoh O"],
        "year": 1982,
        "title": "An improved algorithm for matching biological sequences",
        "journal": "J Mol Biol",
        "volume": "162", "issue": "3", "pages": "705–708",
        "doi": "10.1016/0022-2836(82)90398-9",
    },
    "henikoff1992": {
        "authors": ["Henikoff S", "Henikoff JG"],
        "year": 1992,
        "title": "Amino acid substitution matrices from protein blocks",
        "journal": "Proc Natl Acad Sci USA",
        "volume": "89", "issue": "22", "pages": "10915–10919",
        "doi": "10.1073/pnas.89.22.10915",
    },
    # A book chapter with no DOI — the standard citation for the PAM matrices.
    "dayhoff1978": {
        "authors": ["Dayhoff MO", "Schwartz RM", "Orcutt BC"],
        "year": 1978,
        "title": "A model of evolutionary change in proteins",
        "book": "Atlas of Protein Sequence and Structure, vol. 5, suppl. 3",
        "publisher": "National Biomedical Research Foundation, Washington DC",
        "pages": "345–352",
    },
    "cock2009": {
        "authors": ["Cock PJA", "Antao T", "Chang JT"], "et_al": True,
        "year": 2009,
        "title": "Biopython: freely available Python tools for computational molecular biology and bioinformatics",
        "journal": "Bioinformatics",
        "volume": "25", "issue": "11", "pages": "1422–1423",
        "doi": "10.1093/bioinformatics/btp163",
    },
    "helix": {
        "group": "secretcoder45",
        "year": 2026,
        "title": f"Helix: a unified bioinformatics workspace (version {HELIX_VERSION})",
        "software": True,
        "url": REPOSITORY_URL,
        "doi": HELIX_DOI,
    },
}

# What each source asks to be cited with.
SOURCE_CITATIONS = {
    "UniProtKB": ["uniprot2025"],
    "NCBI Gene": ["brown2015", "sayers2025"],
    "PubMed": ["sayers2025"],
    "RCSB PDB": ["berman2000", "burley2025"],
    "KEGG": ["kanehisa2000", "kanehisa2025"],
    "AlphaFold DB": ["jumper2021", "varadi2024"],
}

MATRIX_CITATIONS = {
    "BLOSUM45": "henikoff1992",
    "BLOSUM62": "henikoff1992",
    "BLOSUM80": "henikoff1992",
    "PAM250": "dayhoff1978",
}


def _surname(author: str) -> str:
    return author.rsplit(" ", 1)[0]


def in_text(key: str) -> str:
    """Author–year label: 'Gotoh, 1982', 'Needleman and Wunsch, 1970', 'Sayers et al., 2025'."""
    ref = REFERENCES[key]
    year = ref["year"]
    if ref.get("group"):
        return f"{ref['group']}, {year}"
    authors = ref["authors"]
    if len(authors) == 1 and not ref.get("et_al"):
        return f"{_surname(authors[0])}, {year}"
    if len(authors) == 2 and not ref.get("et_al"):
        return f"{_surname(authors[0])} and {_surname(authors[1])}, {year}"
    return f"{_surname(authors[0])} et al., {year}"


def cite(keys: List[str]) -> str:
    """Parenthetical citation for one or more references."""
    return "(" + "; ".join(in_text(k) for k in keys) + ")"


def formatted(key: str) -> str:
    """Full reference, author–year style with a resolvable DOI link."""
    ref = REFERENCES[key]
    who = ref.get("group") or ", ".join(ref["authors"]) + (", et al." if ref.get("et_al") else "")
    parts = [f"{who} ({ref['year']}). {ref['title']}."]
    if ref.get("journal"):
        parts.append(f"{ref['journal']} {ref['volume']}({ref['issue']}):{ref['pages']}.")
    elif ref.get("book"):
        parts.append(f"In: {ref['book']}, pp. {ref['pages']}. {ref['publisher']}.")
    elif ref.get("software"):
        parts.append("Computer software.")
    if ref.get("doi"):
        parts.append(f"https://doi.org/{ref['doi']}")
    elif ref.get("url"):
        parts.append(ref["url"])
    return " ".join(parts)


def _bibtex_name(author: str) -> str:
    surname, initials = author.rsplit(" ", 1)
    return f"{surname}, {' '.join(c + '.' for c in initials)}"


def bibtex(key: str) -> str:
    ref = REFERENCES[key]
    if ref.get("group"):
        author = "{" + ref["group"] + "}"
    else:
        author = " and ".join(_bibtex_name(a) for a in ref["authors"])
        if ref.get("et_al"):
            author += " and others"

    if ref.get("software"):
        kind = "software"
    elif ref.get("book"):
        kind = "incollection"
    else:
        kind = "article"

    fields = [("author", author), ("title", "{" + ref["title"] + "}"), ("year", str(ref["year"]))]
    if ref.get("journal"):
        fields += [("journal", ref["journal"]), ("volume", ref["volume"]), ("number", ref["issue"])]
    if ref.get("book"):
        fields += [("booktitle", ref["book"]), ("publisher", ref["publisher"])]
    if ref.get("pages"):
        fields.append(("pages", ref["pages"].replace("–", "--")))
    if ref.get("doi"):
        fields.append(("doi", ref["doi"]))
    if ref.get("url"):
        fields.append(("url", ref["url"]))
    if ref.get("software"):
        fields.append(("version", HELIX_VERSION))

    body = ",\n".join(f"  {name} = {{{value}}}" for name, value in fields)
    return f"@{kind}{{{key},\n{body}\n}}"


def reference_entry(key: str) -> Dict:
    ref = REFERENCES[key]
    return {
        "key": key,
        "in_text": in_text(key),
        "text": formatted(key),
        "bibtex": bibtex(key),
        "doi": ref.get("doi"),
        "url": ref.get("url"),
    }
