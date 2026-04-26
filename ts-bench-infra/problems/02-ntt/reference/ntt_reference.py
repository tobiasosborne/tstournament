"""Reference NTT — defines the answer by the literal schoolbook formula and
provides a fast power-of-two implementation for stress-sized golden masters.

The schoolbook routines `schoolbook_forward` and `schoolbook_inverse` are
the unambiguous definitional reference; `fast_pow2_forward` and
`fast_pow2_inverse` are an iterative Cooley-Tukey-style NTT used only for
speed at large power-of-two `n` (cross-checked against schoolbook on small
inputs in `golden/generate.py`).

Reads one input JSON object on stdin, writes the candidate output JSON
array to stdout. Stripped from ts-bench-test by infra/strip-for-testing.sh.
"""

from __future__ import annotations

import json
import sys

P = 998244353
G = 3  # primitive root of (Z/p)*; 3^((p-1)/q) != 1 for q in {2, 7, 17}.


# ── Schoolbook (definitional) ────────────────────────────────────────────────


def _omega(n: int) -> int:
    if (P - 1) % n != 0:
        raise ValueError(f"n={n} does not divide p−1; no primitive n-th root in Z/p")
    return pow(G, (P - 1) // n, P)


def schoolbook_forward(x: list[int], n: int) -> list[int]:
    if n == 0:
        return []
    w = _omega(n)
    out = [0] * n
    for k in range(n):
        wk = pow(w, k, P)
        s = 0
        wjk = 1
        for j in range(n):
            s = (s + x[j] * wjk) % P
            wjk = wjk * wk % P
        out[k] = s
    return out


def schoolbook_inverse(X: list[int], n: int) -> list[int]:
    if n == 0:
        return []
    w = _omega(n)
    w_inv = pow(w, P - 2, P)
    n_inv = pow(n, P - 2, P)
    out = [0] * n
    for j in range(n):
        wj = pow(w_inv, j, P)
        s = 0
        wjk = 1
        for k in range(n):
            s = (s + X[k] * wjk) % P
            wjk = wjk * wj % P
        out[j] = s * n_inv % P
    return out


# ── Fast power-of-two (iterative Cooley-Tukey over Z/p) ──────────────────────


def _bit_reverse_perm(a: list[int]) -> None:
    n = len(a)
    j = 0
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j ^= bit
        if i < j:
            a[i], a[j] = a[j], a[i]


def _ntt_in_place(a: list[int], invert: bool) -> None:
    n = len(a)
    if n & (n - 1) != 0:
        raise ValueError(f"fast NTT requires a power-of-two length; got {n}")
    _bit_reverse_perm(a)
    length = 2
    while length <= n:
        # Primitive length-th root of unity (or its inverse).
        wn = pow(G, (P - 1) // length, P)
        if invert:
            wn = pow(wn, P - 2, P)
        half = length >> 1
        for i in range(0, n, length):
            w = 1
            for k in range(half):
                u = a[i + k]
                v = a[i + k + half] * w % P
                a[i + k] = (u + v) % P
                a[i + k + half] = (u - v) % P
                w = w * wn % P
        length <<= 1
    if invert:
        n_inv = pow(n, P - 2, P)
        for i in range(n):
            a[i] = a[i] * n_inv % P


def fast_pow2_forward(x: list[int], n: int) -> list[int]:
    if n != len(x):
        raise ValueError("length mismatch")
    a = list(x)
    _ntt_in_place(a, invert=False)
    return a


def fast_pow2_inverse(X: list[int], n: int) -> list[int]:
    if n != len(X):
        raise ValueError("length mismatch")
    a = list(X)
    _ntt_in_place(a, invert=True)
    return a


# ── Public entry points ──────────────────────────────────────────────────────


def reference_compute(n: int, direction: str, x: list[int]) -> list[int]:
    """Pick fast pow2 path when applicable, otherwise schoolbook."""
    is_pow2 = n > 0 and (n & (n - 1)) == 0
    if is_pow2:
        return (
            fast_pow2_forward(x, n)
            if direction == "forward"
            else fast_pow2_inverse(x, n)
        )
    return (
        schoolbook_forward(x, n)
        if direction == "forward"
        else schoolbook_inverse(x, n)
    )


def ntt_reference(payload: dict) -> list[str]:
    n = int(payload["n"])
    if int(payload["modulus"]) != P:
        raise ValueError(
            f"modulus mismatch: declared {payload['modulus']}, expected {P}"
        )
    if int(payload["primitive_root"]) != G:
        raise ValueError(
            f"primitive_root mismatch: declared {payload['primitive_root']}, "
            f"expected {G}"
        )
    direction = payload["direction"]
    if direction not in ("forward", "inverse"):
        raise ValueError(f"unknown direction: {direction!r}")
    x = [int(s) for s in payload["x"]]
    if len(x) != n:
        raise ValueError(f"length mismatch: declared n={n}, got {len(x)}")
    if any(not (0 <= a < P) for a in x):
        raise ValueError("input contains a residue outside [0, p)")
    out = reference_compute(n, direction, x)
    return [str(a) for a in out]


def main() -> None:
    payload = json.load(sys.stdin)
    out = ntt_reference(payload)
    json.dump(out, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
