"""Generate LLL golden master.

The expected.json is the reference's reduced basis, but the verifier does
not require the candidate to match it byte-for-byte (multiple LLL-reduced
bases exist for one lattice). The verifier checks the candidate is *some*
LLL-reduced basis of the same lattice — see verify.py.
"""

from __future__ import annotations

import json
import sys
from fractions import Fraction
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "reference"))

from lll_reference import lll_reference  # noqa: E402

SEED = 20260426
ENCODING_VERSION = 1


def to_strs(rows: list[list[int]]) -> list[list[str]]:
    return [[str(v) for v in row] for row in rows]


def make_case(case_id: str, basis: list[list[int]]):
    n = len(basis)
    d = len(basis[0]) if basis else 0
    inp = {
        "id": case_id,
        "input": {
            "n": n,
            "d": d,
            "basis": to_strs(basis),
            "delta": {"num": "3", "den": "4"},
        },
    }
    expected = lll_reference(inp["input"])
    return inp, {"id": case_id, "expected": expected}


def random_unimodular(rng: np.random.Generator, n: int, max_ops: int = 20) -> list[list[int]]:
    U = [[1 if i == j else 0 for j in range(n)] for i in range(n)]
    for _ in range(max_ops):
        if rng.random() < 0.5:
            i, j = rng.choice(n, size=2, replace=False)
            i, j = int(i), int(j)
            k = int(rng.integers(-3, 4))
            for c in range(n):
                U[i][c] += k * U[j][c]
        else:
            i, j = rng.choice(n, size=2, replace=False)
            i, j = int(i), int(j)
            U[i], U[j] = U[j], U[i]
    return U


def matmul(A: list[list[int]], B: list[list[int]]) -> list[list[int]]:
    rows_A = len(A); cols_A = len(A[0])
    rows_B = len(B); cols_B = len(B[0])
    assert cols_A == rows_B
    return [
        [sum(A[i][k] * B[k][j] for k in range(cols_A)) for j in range(cols_B)]
        for i in range(rows_A)
    ]


def planted_short_basis(rng: np.random.Generator, n: int) -> list[list[int]]:
    """Build a basis whose lattice obviously contains a small vector,
    by starting from {e_1, e_2*M, e_3*M, …} and applying a random unimodular."""
    M = 100
    diag = [[1 if i == j else 0 for j in range(n)] for i in range(n)]
    diag[0][0] = 1
    for i in range(1, n):
        diag[i][i] = M
    U = random_unimodular(rng, n)
    return matmul(U, diag)


def main() -> None:
    rng = np.random.default_rng(SEED)
    cases: list[tuple[dict, dict]] = []

    # ── Hand-crafted edges ──────────────────────────────────────────────────
    cases.append(make_case("edge_n1_single", [[5]]))
    cases.append(make_case("edge_n2_id", [[1, 0], [0, 1]]))
    cases.append(make_case("edge_n3_id", [[1, 0, 0], [0, 1, 0], [0, 0, 1]]))
    cases.append(make_case("edge_n2_textbook", [[1, 1], [1, 2]]))
    cases.append(make_case("edge_n2_skew", [[201, 37], [1648, 305]]))
    cases.append(make_case("edge_n3_classic",
                           [[1, 1, 1], [-1, 0, 2], [3, 5, 6]]))
    # Already-reduced 3x3 — should come back ~unchanged.
    cases.append(make_case("edge_n3_already_reduced",
                           [[1, 0, 0], [0, 1, 0], [1, 1, 1]]))
    # Near-degenerate row.
    cases.append(make_case("edge_n3_near_dependent",
                           [[1, 0, 0], [0, 1, 0], [3, 5, 1]]))

    # ── Random small integer bases ─────────────────────────────────────────
    for i in range(8):
        n = int(rng.integers(2, 7))
        B = rng.integers(-50, 51, size=(n, n)).tolist()
        cases.append(make_case(f"rand_small_{i}_n{n}", B))

    # ── Random larger integer bases ─────────────────────────────────────────
    for i, n in enumerate([5, 6, 8]):
        B = rng.integers(-(2**12), 2**12 + 1, size=(n, n)).tolist()
        cases.append(make_case(f"rand_med_{i}_n{n}", B))

    # ── Planted short vector ────────────────────────────────────────────────
    for i, n in enumerate([4, 6]):
        B = planted_short_basis(rng, n)
        cases.append(make_case(f"planted_short_{i}_n{n}", B))

    # ── Stress: n=12, large entries ─────────────────────────────────────────
    n = 12
    B_stress = rng.integers(-(2**20), 2**20 + 1, size=(n, n)).tolist()
    cases.append(make_case(f"stress_n{n}", B_stress))

    inputs_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "05-lll",
        "cases": [c[0] for c in cases],
    }
    expected_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "05-lll",
        "cases": [c[1] for c in cases],
    }

    (HERE / "inputs.json").write_text(json.dumps(inputs_payload, indent=2) + "\n")
    (HERE / "expected.json").write_text(json.dumps(expected_payload, indent=2) + "\n")

    print(f"wrote {len(cases)} cases to inputs.json and expected.json")


if __name__ == "__main__":
    main()
