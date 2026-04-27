"""Generate Schreier-Sims golden master.

Builds inputs for a fixed list of named permutation groups (Z_n, D_2n,
S_n, A_n, M_11, M_12), plus membership-query lists that mix in-group and
out-of-group permutations. The reference (sympy-backed) computes the
expected output for each case.

Asserts the known order of every named group on every regeneration.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from sympy.combinatorics import Permutation, PermutationGroup
from sympy.combinatorics.named_groups import (
    AlternatingGroup,
    CyclicGroup,
    DihedralGroup,
    SymmetricGroup,
)

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "reference"))

from ss_reference import ss_reference, _pad  # noqa: E402

SEED = 20260426
ENCODING_VERSION = 1


# ── Standard Mathieu generators ──────────────────────────────────────────────


def m11_generators() -> tuple[int, list[list[int]]]:
    # M_11 ≤ Sym(11). Classical 0-indexed generators:
    #   g1 = (0 1 2 3 4 5 6 7 8 9 10)         11-cycle
    #   g2 = (2 6 10 7)(3 9 4 5)
    g1 = Permutation([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0], size=11)
    g2 = Permutation([(2, 6, 10, 7), (3, 9, 4, 5)], size=11)
    return 11, [list(g1.array_form), _pad(list(g2.array_form), 11)]


def m12_generators() -> tuple[int, list[list[int]]]:
    # M_12 ≤ Sym(12). Classical 0-indexed generators:
    #   g1 = (0 1 2 3 4 5 6 7 8 9 10), fixing 11
    #   g2 = (2 6 10 7)(3 9 4 5)
    #   g3 = (0 11)(1 10)(2 5)(3 7)(4 8)(6 9)
    g1 = Permutation([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0, 11], size=12)
    g2 = Permutation([(2, 6, 10, 7), (3, 9, 4, 5)], size=12)
    g3 = Permutation([(0, 11), (1, 10), (2, 5), (3, 7), (4, 8), (6, 9)], size=12)
    return 12, [_pad(list(g.array_form), 12) for g in (g1, g2, g3)]


# ── Group catalogue ─────────────────────────────────────────────────────────


def group_catalogue() -> list[tuple[str, int, list[list[int]], int]]:
    """Returns (name, degree, generator_image_arrays, expected_order)."""
    out: list[tuple[str, int, list[list[int]], int]] = []

    def gens_of(G: PermutationGroup, degree: int) -> list[list[int]]:
        return [_pad(list(g.array_form), degree) for g in G.generators]

    # Trivial: identity in degree 5.
    out.append(("trivial_d5", 5, [[0, 1, 2, 3, 4]], 1))

    # Cyclic Z_n
    for n in (5, 10, 30):
        G = CyclicGroup(n)
        out.append((f"Z_{n}", n, gens_of(G, n), n))

    # Dihedral D_{2n} (sympy DihedralGroup(n) has order 2n, degree n)
    for n in (4, 6, 10):
        G = DihedralGroup(n)
        out.append((f"D_{2*n}", n, gens_of(G, n), 2 * n))

    # Symmetric S_n
    for n in (3, 4, 5, 6, 8):
        G = SymmetricGroup(n)
        out.append((f"S_{n}", n, gens_of(G, n), math.factorial(n)))

    # Alternating A_n
    for n in (4, 5, 6, 7):
        G = AlternatingGroup(n)
        out.append((f"A_{n}", n, gens_of(G, n), math.factorial(n) // 2))

    # Mathieu M_11, M_12
    deg, gens = m11_generators()
    out.append(("M_11", deg, gens, 7920))
    deg, gens = m12_generators()
    out.append(("M_12", deg, gens, 95040))

    return out


def make_membership_queries(
    rng: np.random.Generator,
    degree: int,
    gens: list[list[int]],
    expected_order: int,
    n_in: int = 4,
    n_out: int = 4,
) -> list[list[int]]:
    """Build a mix of in-group and out-of-group permutations."""
    # Build the sympy group to test in/out membership of candidates.
    perms = [Permutation(g, size=degree) for g in gens]
    G = PermutationGroup(perms) if perms else PermutationGroup(
        [Permutation(list(range(degree)), size=degree)]
    )

    queries: list[list[int]] = []

    # Identity is always a member.
    queries.append(list(range(degree)))

    # In-group: random products of generators.
    for _ in range(n_in):
        p = Permutation(list(range(degree)), size=degree)
        for _ in range(int(rng.integers(2, 8))):
            p = p * perms[int(rng.integers(0, len(perms)))]
        queries.append(_pad(list(p.array_form), degree))

    # Out-of-group: random Sym(degree) elements rejected by sympy.
    if expected_order < math.factorial(degree):
        attempts = 0
        while sum(1 for q in queries if not G.contains(Permutation(q, size=degree))) < n_out:
            attempts += 1
            if attempts > 200:
                break
            shuffled = list(range(degree))
            rng.shuffle(shuffled)
            p = Permutation(shuffled, size=degree)
            if not G.contains(p):
                queries.append(_pad(list(p.array_form), degree))

    return queries


def make_case(case_id: str, degree: int, gens: list[list[int]],
              queries: list[list[int]]):
    inp = {
        "id": case_id,
        "input": {
            "degree":             degree,
            "generators":         gens,
            "membership_queries": queries,
        },
    }
    expected = ss_reference(inp["input"])
    return inp, {"id": case_id, "expected": expected}


def main() -> None:
    rng = np.random.default_rng(SEED)
    cases: list[tuple[dict, dict]] = []

    catalogue = group_catalogue()

    # Sanity: pinned orders match sympy.
    for name, degree, gens, expected_order in catalogue:
        perms = [Permutation(g, size=degree) for g in gens]
        if perms:
            G = PermutationGroup(perms)
        else:
            G = PermutationGroup([Permutation(list(range(degree)), size=degree)])
        actual = G.order()
        assert actual == expected_order, (
            f"order mismatch for {name}: expected {expected_order}, got {actual}"
        )

    # ── Build cases ─────────────────────────────────────────────────────────
    for name, degree, gens, expected_order in catalogue:
        queries = make_membership_queries(rng, degree, gens, expected_order)
        cases.append(make_case(name, degree, gens, queries))

    # Stress: a few extra random membership queries for the larger named groups.
    for name, degree, gens, expected_order in catalogue:
        if expected_order >= 1000:
            queries = make_membership_queries(
                rng, degree, gens, expected_order, n_in=10, n_out=10
            )
            cases.append(make_case(f"{name}_more_queries", degree, gens, queries))

    inputs_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "04-schreier-sims",
        "cases": [c[0] for c in cases],
    }
    expected_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "04-schreier-sims",
        "cases": [c[1] for c in cases],
    }

    (HERE / "inputs.json").write_text(json.dumps(inputs_payload, indent=2) + "\n")
    (HERE / "expected.json").write_text(json.dumps(expected_payload, indent=2) + "\n")

    print(f"wrote {len(cases)} cases to inputs.json and expected.json")


if __name__ == "__main__":
    main()
