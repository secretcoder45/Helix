"""
Tests for distance matrices and tree building.

Trees are easy to produce and hard to check: any implementation returns
*a* tree, and a wrong one looks entirely plausible. So these tests assert
structural invariants (symmetry, ultrametricity, leaf preservation) plus one
biological ground truth — insulin orthologs must group together and IGF1,
a related but distinct protein, must fall outside them.
"""

import pytest

import phylo_service as ps

INS_HUMAN = (
    "MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAEDLQVGQ"
    "VELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN"
)
INS_PIG = (
    "MALWTRLLPLLALLALWAPAPTLAFVNQHLCGSHLVEALYLVCGERGFFYTPKARREAENPQAGA"
    "VELGGGLGGLQALALEGPPQKRGIVEQCCTSICSLYQLENYCN"
)
INS_MOUSE = (
    "MALWMRFLPLLALLILWEPKPAQAFVKQHLCGPHLVEALYLVCGERGFFYTPKSRREVEDPQVEQ"
    "LELGGSPGDLQTLALEVARQKRGIVDQCCTSICSLYQLENYCN"
)
IGF1_HUMAN = (
    "MGKISSLPTQLFKCCFCDFLKVKMHTMSSSHLFYLALCLLTFTSSATAGPETLCGAELVDALQFV"
    "CGDRGFYFNKPTGYGSSSRRAPQTGIVDECCFRSCDLRRLEMYCAPLKPAKSA"
)

SEQS = [
    {"label": "INS_HUMAN", "sequence": INS_HUMAN},
    {"label": "INS_PIG", "sequence": INS_PIG},
    {"label": "INS_MOUSE", "sequence": INS_MOUSE},
    {"label": "IGF1_HUMAN", "sequence": IGF1_HUMAN},
]


def _leaves(node):
    if not node["children"]:
        return [node["name"]]
    out = []
    for c in node["children"]:
        out.extend(_leaves(c))
    return out


def _depth(node, acc=0.0):
    """Root-to-leaf distances, for the ultrametric check."""
    if not node["children"]:
        return [acc + node["length"]]
    out = []
    for c in node["children"]:
        out.extend(_depth(c, acc + node["length"]))
    return out


def test_distance_matrix_is_symmetric_with_zero_diagonal():
    d = ps.distance_matrix(SEQS)
    n = len(SEQS)
    for i in range(n):
        assert d[i][i] == 0.0
        for j in range(n):
            assert d[i][j] == d[j][i]
            assert 0.0 <= d[i][j] <= 1.0


def test_distances_reflect_known_biology():
    """Insulin orthologs are nearer each other than any is to IGF1."""
    d = ps.distance_matrix(SEQS)
    human, pig, mouse, igf1 = 0, 1, 2, 3

    # Pig insulin is the closest ortholog to human insulin
    assert d[human][pig] < d[human][mouse]
    # Every insulin-insulin distance beats every insulin-IGF1 distance
    insulin_pairs = [d[human][pig], d[human][mouse], d[pig][mouse]]
    igf1_pairs = [d[human][igf1], d[pig][igf1], d[mouse][igf1]]
    assert max(insulin_pairs) < min(igf1_pairs)


@pytest.mark.parametrize("method", ["upgma", "nj"])
def test_tree_preserves_every_sequence_as_a_leaf(method):
    r = ps.build(SEQS, method=method)
    assert sorted(_leaves(r["tree"])) == sorted(r["names"])


def test_upgma_is_ultrametric():
    """
    UPGMA's defining property: it assumes a constant rate of change, so every
    leaf ends up equidistant from the root. If this fails the averaging step
    is wrong.
    """
    r = ps.build(SEQS, method="upgma")
    depths = _depth(r["tree"])
    assert max(depths) - min(depths) < 1e-6, f"not ultrametric: {depths}"


def test_upgma_places_igf1_outside_the_insulins():
    # UPGMA produces a rooted tree, so the outgroup is checkable: IGF1 should
    # split off first, leaving the three insulins together.
    r = ps.build(SEQS, method="upgma")
    top = r["tree"]["children"]
    groups = [set(_leaves(c)) for c in top]
    assert {"IGF1_HUMAN"} in groups
    assert {"INS_HUMAN", "INS_PIG", "INS_MOUSE"} in groups


def test_nj_splits_the_closest_pair_from_the_rest():
    # NJ trees are unrooted; for four taxa the only claim is the 2|2 split,
    # which must put the two nearest sequences together.
    r = ps.build(SEQS, method="nj")
    groups = [set(_leaves(c)) for c in r["tree"]["children"]]
    assert {"INS_HUMAN", "INS_PIG"} in groups


def test_newick_has_one_leaf_per_sequence():
    r = ps.build(SEQS, method="nj")
    assert r["newick"].endswith(";")
    for name in r["names"]:
        assert name in r["newick"]
    assert r["newick"].count(",") == len(SEQS) - 1


def test_rejects_too_few_and_too_many():
    with pytest.raises(ps.PhyloError):
        ps.build(SEQS[:2])
    with pytest.raises(ps.PhyloError):
        ps.build([{"label": f"s{i}", "sequence": "ACDEFGHIKL"} for i in range(31)])


def test_rejects_unknown_method():
    with pytest.raises(ps.PhyloError):
        ps.build(SEQS, method="not-a-method")


def test_phylo_endpoint(client):
    res = client.post("/phylo", json={"sequences": SEQS, "method": "nj"}).json()
    assert len(res["names"]) == 4
    assert res["newick"].endswith(";")
    assert client.post("/phylo", json={"sequences": SEQS[:1]}).status_code == 400
