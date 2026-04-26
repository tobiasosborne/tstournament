"""NTT verifier — language-neutral, self-contained.

stdin:
  {"input": {"n", "modulus", "primitive_root", "direction", "x"},
   "candidate": ["<residue>", ...],
   "id"?: str}

stdout:
  {"pass": bool, "reason": str, "checks": {...}}

Modular arithmetic is exact: there is no tolerance.

Invariants checked:
  1. shape           — candidate is a list of decimal-string residues, length n
  2. canonical_range — every residue lies in [0, p)
  3. modular_equality — candidate equals the schoolbook NTT of the input mod p
  4. roundtrip       — applying the opposite-direction reference to the
                       candidate recovers the input exactly
"""

from __future__ import annotations

import json
import sys
import traceback
from typing import Any

P = 998244353
G = 3


# ── Schoolbook (definitional) ────────────────────────────────────────────────


def _omega(n: int) -> int:
    if n <= 0 or (P - 1) % n != 0:
        raise ValueError(f"n={n} does not divide p−1")
    return pow(G, (P - 1) // n, P)


def _schoolbook_forward(x: list[int], n: int) -> list[int]:
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


def _schoolbook_inverse(X: list[int], n: int) -> list[int]:
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


# ── Fast power-of-two (for stress-sized cases) ───────────────────────────────


def _bit_reverse(a: list[int]) -> None:
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


def _fast_ntt_in_place(a: list[int], invert: bool) -> None:
    n = len(a)
    if n & (n - 1) != 0:
        raise ValueError(f"fast NTT requires power-of-two length; got n={n}")
    _bit_reverse(a)
    length = 2
    while length <= n:
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


def _reference(n: int, direction: str, x: list[int]) -> list[int]:
    if n > 0 and (n & (n - 1)) == 0:
        a = list(x)
        _fast_ntt_in_place(a, invert=(direction == "inverse"))
        return a
    return (
        _schoolbook_forward(x, n)
        if direction == "forward"
        else _schoolbook_inverse(x, n)
    )


# ── Verifier ────────────────────────────────────────────────────────────────


def verify(payload: dict[str, Any]) -> dict[str, Any]:
    inp = payload["input"]
    candidate = payload["candidate"]
    n = int(inp["n"])
    direction = inp["direction"]
    if direction not in ("forward", "inverse"):
        return {"pass": False, "reason": f"unknown direction {direction!r}", "checks": {}}
    if int(inp["modulus"]) != P:
        return {
            "pass": False,
            "reason": f"modulus mismatch: declared {inp['modulus']}, expected {P}",
            "checks": {},
        }
    x = [int(s) for s in inp["x"]]
    if len(x) != n:
        return {"pass": False, "reason": "input length disagrees with declared n", "checks": {}}

    checks: dict[str, dict[str, Any]] = {}

    # ── shape ───────────────────────────────────────────────────────────────
    shape_ok = (
        isinstance(candidate, list)
        and len(candidate) == n
        and all(isinstance(s, str) for s in candidate)
    )
    if not shape_ok:
        return {
            "pass": False,
            "reason": "candidate must be a list of decimal-string residues, length n",
            "checks": {"shape": {"pass": False, "detail": "malformed"}},
        }
    checks["shape"] = {"pass": True, "detail": f"length {n}"}

    # ── canonical range ─────────────────────────────────────────────────────
    try:
        cand = [int(s) for s in candidate]
    except ValueError:
        return {
            "pass": False,
            "reason": "candidate contains a non-integer string",
            "checks": {"shape": checks["shape"],
                       "canonical_range": {"pass": False, "detail": "non-int"}},
        }
    out_of_range = [(i, v) for i, v in enumerate(cand) if not (0 <= v < P)]
    checks["canonical_range"] = {
        "pass": not out_of_range,
        "detail": (
            "all residues in [0, p)"
            if not out_of_range
            else f"{len(out_of_range)} residues out of range, first: {out_of_range[0]}"
        ),
    }

    # ── modular equality ────────────────────────────────────────────────────
    ref = _reference(n, direction, x)
    if cand == ref:
        checks["modular_equality"] = {"pass": True, "detail": "exact match"}
    else:
        # Find first divergence for diagnostics.
        idx = next((i for i in range(n) if cand[i] != ref[i]), None)
        checks["modular_equality"] = {
            "pass": False,
            "detail": (
                f"first mismatch at k={idx}: candidate={cand[idx]}, ref={ref[idx]}"
                if idx is not None
                else "mismatch"
            ),
        }

    # ── roundtrip ───────────────────────────────────────────────────────────
    opp = "inverse" if direction == "forward" else "forward"
    recovered = _reference(n, opp, cand)
    checks["roundtrip"] = {
        "pass": recovered == x,
        "detail": (
            "ref(opposite_direction)(candidate) == input"
            if recovered == x
            else "roundtrip via reference does not recover the input"
        ),
    }

    overall = all(c["pass"] for c in checks.values())
    if overall:
        reason = "all invariants hold"
    else:
        first_fail = next(k for k, v in checks.items() if not v["pass"])
        reason = f"failed: {first_fail} — {checks[first_fail]['detail']}"

    return {"pass": overall, "reason": reason, "checks": checks}


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        result = verify(payload)
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(traceback.format_exc())
        sys.stderr.write("\n")
        result = {
            "pass": False,
            "reason": f"verifier crashed: {type(e).__name__}: {e}",
            "checks": {},
        }
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
