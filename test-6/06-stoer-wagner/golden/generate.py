"""Generate Stoer-Wagner golden master."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "reference"))

from sw_reference import sw_reference  # noqa: E402

SEED = 20260426
ENCODING_VERSION = 1


def make_case(case_id: str, n: int, edges: list[tuple[int, int, int]]):
    edges_json = [[u, v, str(w)] for u, v, w in edges]
    inp = {"id": case_id, "input": {"n": n, "edges": edges_json}}
    expected = sw_reference(inp["input"])
    return inp, {"id": case_id, "expected": expected}


def complete_graph(n: int, weight: int = 1) -> list[tuple[int, int, int]]:
    return [(i, j, weight) for i in range(n) for j in range(i + 1, n)]


def cycle_graph(n: int, weight: int = 1) -> list[tuple[int, int, int]]:
    return [(i, (i + 1) % n, weight) for i in range(n)]


def path_graph(n: int, weight: int = 1) -> list[tuple[int, int, int]]:
    return [(i, i + 1, weight) for i in range(n - 1)]


def main() -> None:
    rng = np.random.default_rng(SEED)
    cases: list[tuple[dict, dict]] = []

    # ── Hand-crafted edges ──────────────────────────────────────────────────
    cases.append(make_case("trivial_n1", 1, []))
    cases.append(make_case("trivial_n2_disconnected", 2, []))
    cases.append(make_case("trivial_n2_connected", 2, [(0, 1, 7)]))

    # K_3 with unit weights — min cut = 2.
    cases.append(make_case("K3_unit", 3, complete_graph(3, 1)))
    # K_4, K_5, K_6, K_8.
    for n in (4, 5, 6, 8):
        cases.append(make_case(f"K{n}_unit", n, complete_graph(n, 1)))

    # Cycle C_n — min cut = 2.
    for n in (4, 5, 8):
        cases.append(make_case(f"cycle_{n}_unit", n, cycle_graph(n, 1)))

    # Path P_5 — min cut = lightest edge.
    cases.append(make_case("path_5_unit", 5, path_graph(5, 1)))
    cases.append(make_case("path_5_weighted", 5,
                           [(0, 1, 5), (1, 2, 3), (2, 3, 7), (3, 4, 4)]))

    # Two triangles bridged by one edge of weight 1.
    bridge_edges = [
        (0, 1, 5), (1, 2, 5), (0, 2, 5),    # left triangle
        (3, 4, 5), (4, 5, 5), (3, 5, 5),    # right triangle
        (2, 3, 1),                          # the bridge
    ]
    cases.append(make_case("bridge_two_triangles", 6, bridge_edges))

    # Disconnected: two isolated edges.
    cases.append(make_case("two_isolated_edges", 4,
                           [(0, 1, 10), (2, 3, 10)]))

    # Parallel edges (summed).
    cases.append(make_case("parallel_edges_n3", 3,
                           [(0, 1, 2), (0, 1, 3), (1, 2, 4), (0, 2, 1)]))

    # ── Random graphs ──────────────────────────────────────────────────────
    for i, (n, p) in enumerate([(10, 0.5), (15, 0.4), (20, 0.4), (40, 0.3)]):
        edges = []
        for u in range(n):
            for v in range(u + 1, n):
                if rng.random() < p:
                    edges.append((u, v, int(rng.integers(1, 51))))
        cases.append(make_case(f"rand_{i}_n{n}_p{p}", n, edges))

    # ── Stress ──────────────────────────────────────────────────────────────
    n = 100
    edges = []
    for u in range(n):
        for v in range(u + 1, n):
            if rng.random() < 0.25:
                edges.append((u, v, int(rng.integers(1, 51))))
    cases.append(make_case(f"stress_n{n}", n, edges))

    inputs_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "06-stoer-wagner",
        "cases": [c[0] for c in cases],
    }
    expected_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "06-stoer-wagner",
        "cases": [c[1] for c in cases],
    }

    (HERE / "inputs.json").write_text(json.dumps(inputs_payload, indent=2) + "\n")
    (HERE / "expected.json").write_text(json.dumps(expected_payload, indent=2) + "\n")

    print(f"wrote {len(cases)} cases to inputs.json and expected.json")


if __name__ == "__main__":
    main()
