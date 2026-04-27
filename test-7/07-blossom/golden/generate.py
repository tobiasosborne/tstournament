"""Generate blossom golden master."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "reference"))

from blossom_reference import blossom_reference, max_weight_matching  # noqa: E402

SEED = 20260426
ENCODING_VERSION = 1


def make_case(case_id: str, n: int, edges: list[tuple[int, int, int]]):
    edges_json = [[u, v, str(w)] for u, v, w in edges]
    inp = {"id": case_id, "input": {"n": n, "edges": edges_json}}
    expected = blossom_reference(inp["input"])
    return inp, {"id": case_id, "expected": expected}


def complete_graph(n: int, weights: list[int] | None = None) -> list[tuple[int, int, int]]:
    """K_n with weight w_{ij} = (i+1)*(j+1) by default, or as supplied."""
    out = []
    k = 0
    for i in range(n):
        for j in range(i + 1, n):
            w = weights[k] if weights is not None else (i + 1) * (j + 1)
            out.append((i, j, int(w)))
            k += 1
    return out


def cycle_graph(n: int, weights: list[int] | None = None) -> list[tuple[int, int, int]]:
    return [
        (i, (i + 1) % n,
         weights[i] if weights is not None else 1)
        for i in range(n)
    ]


def random_general(rng: np.random.Generator, n: int, p: float,
                   wmin: int = 1, wmax: int = 50) -> list[tuple[int, int, int]]:
    out = []
    for i in range(n):
        for j in range(i + 1, n):
            if rng.random() < p:
                out.append((i, j, int(rng.integers(wmin, wmax + 1))))
    return out


def bipartite_graph(rng: np.random.Generator, n_left: int, n_right: int,
                    wmin: int = 1, wmax: int = 50) -> list[tuple[int, int, int]]:
    out = []
    for i in range(n_left):
        for j in range(n_right):
            out.append((i, n_left + j, int(rng.integers(wmin, wmax + 1))))
    return out


def cross_check_bipartite(n_left: int, n_right: int,
                          edges: list[tuple[int, int, int]]) -> int:
    """Cross-check max-weight matching for a complete bipartite graph
    (every left × right pair) using scipy's linear_sum_assignment, which
    minimises Σ cost. We negate weights to maximise."""
    n = max(n_left, n_right)
    cost = np.full((n, n), 0, dtype=np.int64)
    for u, v, w in edges:
        if u < n_left:
            cost[u, v - n_left] = -w
        else:
            cost[v, u - n_left] = -w
    rows, cols = linear_sum_assignment(cost)
    return int(-cost[rows, cols].sum())


def main() -> None:
    rng = np.random.default_rng(SEED)
    cases: list[tuple[dict, dict]] = []

    # ── Trivial / structural ───────────────────────────────────────────────
    cases.append(make_case("trivial_n0", 0, []))
    cases.append(make_case("trivial_n1", 1, []))
    cases.append(make_case("single_edge", 2, [(0, 1, 7)]))
    cases.append(make_case("triangle_unit", 3, complete_graph(3, [1, 1, 1])))
    cases.append(make_case("triangle_distinct", 3,
                           [(0, 1, 5), (1, 2, 7), (0, 2, 3)]))

    # ── Odd cycles → blossom-required ──────────────────────────────────────
    cases.append(make_case("C5_unit", 5, cycle_graph(5, [1] * 5)))
    cases.append(make_case("C5_distinct", 5,
                           [(0, 1, 1), (1, 2, 4), (2, 3, 1),
                            (3, 4, 4), (4, 0, 1)]))
    cases.append(make_case("C7_unit", 7, cycle_graph(7, [1] * 7)))
    cases.append(make_case("C9_unit", 9, cycle_graph(9, [1] * 9)))

    # ── Trees ──────────────────────────────────────────────────────────────
    star = [(0, 1, 5), (0, 2, 3), (0, 3, 4), (0, 4, 6)]
    cases.append(make_case("star_4_leaves", 5, star))
    path_w = [(0, 1, 1), (1, 2, 4), (2, 3, 1), (3, 4, 4), (4, 5, 1)]
    cases.append(make_case("path_6_alternating", 6, path_w))

    # ── K_n cliques ────────────────────────────────────────────────────────
    for n in (4, 5, 6):
        cases.append(make_case(f"K{n}_distinct",
                               n, complete_graph(n)))

    # ── Negative weights ───────────────────────────────────────────────────
    neg = [(0, 1, -5), (1, 2, 4), (2, 3, -1), (3, 0, 6)]
    cases.append(make_case("C4_with_negatives", 4, neg))
    cases.append(make_case("isolated_vertex_negative", 5,
                           [(0, 1, 5), (2, 3, 4), (3, 4, -10)]))

    # ── Bipartite cross-check ──────────────────────────────────────────────
    nl, nr = 4, 4
    bp_edges = bipartite_graph(rng, nl, nr)
    case_id = "bipartite_4x4_dense"
    cases.append(make_case(case_id, nl + nr, bp_edges))
    bp_assignment_value = cross_check_bipartite(nl, nr, bp_edges)
    dp_value = max_weight_matching(nl + nr, bp_edges)[0]
    assert bp_assignment_value == dp_value, (
        f"bipartite cross-check failed: assignment={bp_assignment_value}, "
        f"DP={dp_value}"
    )

    # ── Random general graphs ──────────────────────────────────────────────
    for i, (n, p) in enumerate([(8, 0.5), (10, 0.5), (12, 0.4),
                                (14, 0.4), (16, 0.5), (16, 0.3)]):
        edges = random_general(rng, n, p)
        cases.append(make_case(f"rand_{i}_n{n}_p{p}", n, edges))

    inputs_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "07-blossom",
        "cases": [c[0] for c in cases],
    }
    expected_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "07-blossom",
        "cases": [c[1] for c in cases],
    }

    (HERE / "inputs.json").write_text(json.dumps(inputs_payload, indent=2) + "\n")
    (HERE / "expected.json").write_text(json.dumps(expected_payload, indent=2) + "\n")

    print(f"wrote {len(cases)} cases to inputs.json and expected.json")


if __name__ == "__main__":
    main()
