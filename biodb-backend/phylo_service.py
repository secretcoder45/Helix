"""
Distance matrices and phylogenetic trees.

Distances come from this app's own aligners rather than a library: the whole
point is that the tree is built from the same Needleman-Wunsch implementation
the alignment page uses, with the same scoring parameters, so a researcher can
inspect any pair in the tree and see exactly the alignment that produced its
distance.

UPGMA and Neighbour-Joining are both implemented here. They disagree, and the
disagreement is the reason to have both: UPGMA assumes a constant rate of
change (a molecular clock) and produces an ultrametric tree where every leaf
sits at the same depth; NJ makes no such assumption and is the right default
when the sequences may have evolved at different rates — which is usually.
"""

from typing import Dict, List, Tuple

import alignment_service

MAX_SEQUENCES = 30
MIN_SEQUENCES = 3


class PhyloError(Exception):
    pass


def distance_matrix(
    sequences: List[Dict],
    sequence_type: str = "protein",
    matrix: str = "BLOSUM62",
    gap_open: float = -10.0,
    gap_extend: float = -0.5,
) -> List[List[float]]:
    """
    Pairwise distances as 1 - fractional identity, from global alignments.

    Identity is measured over aligned (non-gap) columns, matching what the
    alignment page reports, so a distance of 0.16 here corresponds to the
    84% identity shown there for the same pair.
    """
    n = len(sequences)
    d = [[0.0] * n for _ in range(n)]

    for i in range(n):
        for j in range(i + 1, n):
            result = alignment_service.needleman_wunsch(
                sequences[i]["sequence"],
                sequences[j]["sequence"],
                sequence_type=sequence_type,
                matrix=matrix,
                gap_open=gap_open,
                gap_extend=gap_extend,
            )
            dist = round(1.0 - result["identity_pct"] / 100.0, 6)
            d[i][j] = d[j][i] = dist

    return d


def _leaf(name: str) -> Dict:
    return {"name": name, "children": [], "length": 0.0, "height": 0.0}


def upgma(dist: List[List[float]], names: List[str]) -> Dict:
    """
    UPGMA: repeatedly join the closest pair, placing the new node at half
    their distance. Produces an ultrametric tree (all leaves equidistant from
    the root), which is only meaningful under a molecular-clock assumption.
    """
    n = len(names)
    clusters = {i: _leaf(names[i]) for i in range(n)}
    sizes = {i: 1 for i in range(n)}
    d = {(i, j): dist[i][j] for i in range(n) for j in range(n) if i != j}
    active = set(range(n))
    next_id = n

    while len(active) > 1:
        i, j = min(
            ((a, b) for a in active for b in active if a < b),
            key=lambda p: d[(p[0], p[1])],
        )
        dij = d[(i, j)]
        height = dij / 2.0

        node = {
            "name": "",
            "children": [clusters[i], clusters[j]],
            "height": height,
            "length": 0.0,
        }
        # Branch length is the drop from this node down to each child.
        clusters[i]["length"] = round(height - clusters[i]["height"], 6)
        clusters[j]["length"] = round(height - clusters[j]["height"], 6)

        for k in active:
            if k in (i, j):
                continue
            # Average linkage, weighted by cluster size.
            new = (d[(i, k)] * sizes[i] + d[(j, k)] * sizes[j]) / (sizes[i] + sizes[j])
            d[(next_id, k)] = d[(k, next_id)] = new

        active.discard(i)
        active.discard(j)
        clusters[next_id] = node
        sizes[next_id] = sizes[i] + sizes[j]
        active.add(next_id)
        next_id += 1

    return clusters[next(iter(active))]


def neighbour_joining(dist: List[List[float]], names: List[str]) -> Dict:
    """
    Saitou & Nei neighbour-joining. Chooses the pair minimising the Q
    criterion rather than raw distance, which is what removes UPGMA's
    equal-rate assumption.
    """
    n = len(names)
    if n < 3:
        raise PhyloError("Neighbour-joining needs at least 3 sequences")

    nodes = {i: _leaf(names[i]) for i in range(n)}
    d = {(i, j): dist[i][j] for i in range(n) for j in range(n)}
    active = list(range(n))
    next_id = n

    while len(active) > 2:
        r = len(active)
        totals = {i: sum(d[(i, k)] for k in active if k != i) for i in active}

        best = None
        for a_i, i in enumerate(active):
            for j in active[a_i + 1 :]:
                q = (r - 2) * d[(i, j)] - totals[i] - totals[j]
                if best is None or q < best[0]:
                    best = (q, i, j)

        _, i, j = best
        dij = d[(i, j)]
        # Split the branch asymmetrically — this is where NJ differs from UPGMA.
        li = 0.5 * dij + (totals[i] - totals[j]) / (2 * (r - 2))
        lj = dij - li

        nodes[i]["length"] = round(max(li, 0.0), 6)
        nodes[j]["length"] = round(max(lj, 0.0), 6)
        node = {"name": "", "children": [nodes[i], nodes[j]], "length": 0.0, "height": 0.0}

        for k in active:
            if k in (i, j):
                continue
            new = 0.5 * (d[(i, k)] + d[(j, k)] - dij)
            d[(next_id, k)] = d[(k, next_id)] = new
        d[(next_id, next_id)] = 0.0

        active = [k for k in active if k not in (i, j)]
        nodes[next_id] = node
        active.append(next_id)
        next_id += 1

    a, b = active
    nodes[a]["length"] = round(d[(a, b)], 6)
    nodes[b]["length"] = 0.0
    return {"name": "", "children": [nodes[a], nodes[b]], "length": 0.0, "height": 0.0}


def to_newick(node: Dict) -> str:
    """Newick format, so a tree can leave this app for FigTree, iTOL, etc."""
    if not node["children"]:
        safe = node["name"].replace(" ", "_").replace(",", "").replace(":", "")
        return f"{safe}:{node['length']:.6f}"
    inner = ",".join(to_newick(c) for c in node["children"])
    if node["length"]:
        return f"({inner}):{node['length']:.6f}"
    return f"({inner})"


def build(
    sequences: List[Dict],
    method: str = "nj",
    sequence_type: str = "protein",
    matrix: str = "BLOSUM62",
    gap_open: float = -10.0,
    gap_extend: float = -0.5,
) -> Dict:
    if len(sequences) < MIN_SEQUENCES:
        raise PhyloError(f"Need at least {MIN_SEQUENCES} sequences to build a tree")
    if len(sequences) > MAX_SEQUENCES:
        raise PhyloError(
            f"At most {MAX_SEQUENCES} sequences — pairwise alignment is O(n²), "
            f"so {len(sequences)} would mean {len(sequences) * (len(sequences) - 1) // 2} alignments"
        )
    if method not in ("upgma", "nj"):
        raise PhyloError("method must be 'upgma' or 'nj'")

    names = [s.get("label") or s.get("id") or f"seq{i + 1}" for i, s in enumerate(sequences)]
    d = distance_matrix(sequences, sequence_type, matrix, gap_open, gap_extend)
    tree = upgma(d, names) if method == "upgma" else neighbour_joining(d, names)

    return {
        "method": method,
        "names": names,
        "distance_matrix": d,
        "tree": tree,
        "newick": to_newick(tree) + ";",
    }
