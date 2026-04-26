"""Generate NTT golden master.

Produces:
  - inputs.json   : [{"id": ..., "input": {n, modulus, primitive_root, direction, x}}, ...]
  - expected.json : [{"id": ..., "expected": ["<a>", ...]}, ...]

Reproducibility: seeded numpy.random.Generator, seed pinned below. The fast
power-of-two NTT is cross-checked against the schoolbook definition for
every power-of-two `n` ≤ 64 before any cases are emitted, so the fast path
cannot drift silently.

Run:
  python3 generate.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "reference"))

from ntt_reference import (  # noqa: E402
    P,
    G,
    fast_pow2_forward,
    fast_pow2_inverse,
    reference_compute,
    schoolbook_forward,
    schoolbook_inverse,
)

SEED = 20260426
ENCODING_VERSION = 1


def to_strs(x: list[int]) -> list[str]:
    return [str(a) for a in x]


def from_strs(s: list[str]) -> list[int]:
    return [int(a) for a in s]


def cross_check_fast_against_schoolbook(rng: np.random.Generator) -> None:
    for n in (2, 4, 8, 16, 32, 64):
        x = rng.integers(0, P, size=n).tolist()
        f1 = fast_pow2_forward(x, n)
        f2 = schoolbook_forward(x, n)
        assert f1 == f2, f"fast vs schoolbook forward mismatch at n={n}"
        i1 = fast_pow2_inverse(x, n)
        i2 = schoolbook_inverse(x, n)
        assert i1 == i2, f"fast vs schoolbook inverse mismatch at n={n}"


def make_case(case_id: str, n: int, direction: str, x: list[int]):
    expected = reference_compute(n, direction, x)
    inp = {
        "id": case_id,
        "input": {
            "n": n,
            "modulus": str(P),
            "primitive_root": str(G),
            "direction": direction,
            "x": to_strs(x),
        },
    }
    exp = {"id": case_id, "expected": to_strs(expected)}
    return inp, exp


def circular_convolution(a: list[int], b: list[int], n: int) -> list[int]:
    out = [0] * n
    for i in range(n):
        for j in range(n):
            out[(i + j) % n] = (out[(i + j) % n] + a[i] * b[j]) % P
    return out


def main() -> None:
    rng = np.random.default_rng(SEED)
    cross_check_fast_against_schoolbook(rng)

    cases: list[tuple[dict, dict]] = []
    edges: list[tuple[str, int, str, list[int]]] = []

    # ── Hand-crafted edge cases ──────────────────────────────────────────────
    edges.append(("edge_n1_fwd",     1, "forward", [3]))
    edges.append(("edge_n1_inv",     1, "inverse", [3]))
    edges.append(("edge_n2_dc",      2, "forward", [1, 1]))
    edges.append(("edge_n2_alt",     2, "forward", [1, P - 1]))
    edges.append(("edge_n2_impulse", 2, "forward", [1, 0]))
    edges.append(("edge_n4_dc",      4, "forward", [1, 1, 1, 1]))
    edges.append(("edge_n4_impulse", 4, "forward", [1, 0, 0, 0]))
    edges.append(("edge_n8_seq",     8, "forward", [1, 2, 3, 4, 5, 6, 7, 8]))

    # Non-power-of-two edge: n=7 (forces Bluestein in agent's code).
    edges.append(("edge_n7_seq", 7, "forward", [1, 2, 3, 4, 5, 6, 7]))
    edges.append(("edge_n7_dc",  7, "forward", [1] * 7))

    # Inverse round-trip edge.
    fwd_seq = schoolbook_forward([1, 2, 3, 4, 5, 6, 7, 8], 8)
    edges.append(("edge_n8_inverse_of_fwd_seq", 8, "inverse", fwd_seq))

    for cid, n, direction, x in edges:
        cases.append(make_case(cid, n, direction, x))

    # ── Power-of-two random cases ────────────────────────────────────────────
    pow2_sizes = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024]
    for n in pow2_sizes:
        x = rng.integers(0, P, size=n).tolist()
        cases.append(make_case(f"rand_pow2_n{n}_fwd", n, "forward", x))
        cases.append(make_case(f"rand_pow2_n{n}_inv", n, "inverse", x))

    # ── Bluestein cases (non-power-of-two; only n | (p−1)) ───────────────────
    bluestein_sizes = [7, 14, 17, 28, 34, 56, 68, 112, 119, 136, 224, 238, 476]
    for n in bluestein_sizes:
        x = rng.integers(0, P, size=n).tolist()
        cases.append(make_case(f"rand_blu_n{n}_fwd", n, "forward", x))

    # A handful of inverse-direction Bluestein cases too.
    for n in (7, 17, 119):
        x = rng.integers(0, P, size=n).tolist()
        cases.append(make_case(f"rand_blu_n{n}_inv", n, "inverse", x))

    # ── Convolution-theorem triples (small n) ───────────────────────────────
    for trip_idx, n in enumerate([4, 8, 16, 7, 14]):
        a = rng.integers(0, P, size=n).tolist()
        b = rng.integers(0, P, size=n).tolist()
        c = circular_convolution(a, b, n)
        cases.append(make_case(f"conv{trip_idx}_n{n}_a_fwd",     n, "forward", a))
        cases.append(make_case(f"conv{trip_idx}_n{n}_b_fwd",     n, "forward", b))
        cases.append(make_case(f"conv{trip_idx}_n{n}_acircb_fwd", n, "forward", c))

    # ── Stress (power of two) ────────────────────────────────────────────────
    for n in (4096, 16384):
        x = rng.integers(0, P, size=n).tolist()
        cases.append(make_case(f"stress_n{n}_fwd", n, "forward", x))

    # ── Self-consistency on canonical edges ─────────────────────────────────
    assert schoolbook_forward([1, 1, 1, 1], 4) == [4, 0, 0, 0]
    assert schoolbook_forward([1, 0, 0, 0], 4) == [1, 1, 1, 1]
    # Roundtrip on a small Bluestein-sized example.
    x7 = [1, 2, 3, 4, 5, 6, 7]
    assert schoolbook_inverse(schoolbook_forward(x7, 7), 7) == x7

    inputs_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "02-ntt",
        "cases": [c[0] for c in cases],
    }
    expected_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "02-ntt",
        "cases": [c[1] for c in cases],
    }

    (HERE / "inputs.json").write_text(
        json.dumps(inputs_payload, indent=2) + "\n"
    )
    (HERE / "expected.json").write_text(
        json.dumps(expected_payload, indent=2) + "\n"
    )

    print(f"wrote {len(cases)} cases to inputs.json and expected.json")


if __name__ == "__main__":
    main()
