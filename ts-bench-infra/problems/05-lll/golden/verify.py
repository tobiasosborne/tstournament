"""LLL verifier — language-neutral, self-contained, exact-rational.

Verifies the candidate basis is LLL-reduced for δ = 3/4 and spans the
same lattice as the input. Independent of any LLL implementation: the
checks are computed directly from the LLL definition.

stdin:
  {"input": {"n", "d", "basis", "delta"},
   "candidate": {"reduced_basis": [[...]]},
   "id"?: str}

stdout:
  {"pass": bool, "reason": str, "checks": {...}}

Invariants checked:
  1. shape           — n × d matrix of decimal-string integers
  2. same_lattice    — Hermite normal form of B equals HNF of candidate
  3. size_reduction  — |μ_{i,j}| ≤ ½ for all j < i (exact rationals)
  4. lovasz          — ‖b*_i‖² ≥ (δ − μ_{i,i−1}²) · ‖b*_{i−1}‖² (exact)
  5. det_preserved   — det(BBᵀ) == det(B′B′ᵀ)
"""

from __future__ import annotations

import json
import sys
import traceback
from fractions import Fraction
from typing import Any


# ── Linear-algebra helpers (exact rationals) ─────────────────────────────────


def _as_int_matrix(rows: Any, n: int, d: int) -> list[list[int]] | None:
    if not isinstance(rows, list) or len(rows) != n:
        return None
    out: list[list[int]] = []
    for r in rows:
        if not isinstance(r, list) or len(r) != d:
            return None
        cleaned: list[int] = []
        for v in r:
            if not isinstance(v, str):
                return None
            try:
                cleaned.append(int(v))
            except ValueError:
                return None
        out.append(cleaned)
    return out


def _gram_schmidt_rationals(B: list[list[int]]) -> tuple[
    list[list[Fraction]], list[list[Fraction]]
]:
    """Return (B*, μ) computed exactly over ℚ.

    B* is a list of Gram-Schmidt orthogonal vectors (rationals).
    μ is an n×n lower-triangular array (with μ[i][i] = 1; μ[i][j] for j<i).
    """
    n = len(B)
    Bf = [[Fraction(v) for v in row] for row in B]
    Bstar: list[list[Fraction]] = []
    mu: list[list[Fraction]] = [[Fraction(0)] * n for _ in range(n)]
    norm2: list[Fraction] = []

    for i in range(n):
        # Start b*_i = b_i.
        bs = list(Bf[i])
        for j in range(i):
            if norm2[j] == 0:
                mu[i][j] = Fraction(0)
                continue
            num = sum(Bf[i][k] * Bstar[j][k] for k in range(len(bs)))
            m = num / norm2[j]
            mu[i][j] = m
            for k in range(len(bs)):
                bs[k] -= m * Bstar[j][k]
        Bstar.append(bs)
        n2 = sum(x * x for x in bs)
        norm2.append(n2)
        mu[i][i] = Fraction(1)

    return Bstar, mu


def _hermite_normal_form(B: list[list[int]]) -> list[list[int]]:
    """Compute the column-style HNF of the matrix M whose ROWS are B's
    rows — i.e., HNF of B as a row-lattice. Returns the unique reduced
    upper-triangular form representing the same row-lattice.

    Uses the standard "row-reduction" HNF algorithm over ℤ. Self-contained
    so we don't pull in sympy from inside the verifier (sympy is fine to
    use here, but a 30-line implementation is clearer and avoids any
    surprises about whether sympy.hnf operates row- or column-style).
    """
    n = len(B)
    if n == 0:
        return []
    d = len(B[0])
    # We'll reduce a copy.
    A = [row[:] for row in B]

    # Algorithm: standard row-style HNF (works on rectangular matrices).
    # We scan pivot columns left-to-right; for each pivot column, we use
    # the rows below the pivot to clear the pivot column to a single
    # non-zero entry (the pivot), then reduce all rows above the pivot
    # mod the pivot.
    pivot_row = 0
    for col in range(d):
        if pivot_row >= n:
            break
        # Find a non-zero entry in this column at or below pivot_row.
        # Use Euclidean reduction among rows in [pivot_row, n).
        # First, gather rows with non-zero entry in column `col` ≥ pivot_row.
        while True:
            non_zero = [r for r in range(pivot_row, n) if A[r][col] != 0]
            if not non_zero:
                break
            if len(non_zero) == 1:
                r0 = non_zero[0]
                if r0 != pivot_row:
                    A[pivot_row], A[r0] = A[r0], A[pivot_row]
                # Sign-normalise.
                if A[pivot_row][col] < 0:
                    A[pivot_row] = [-v for v in A[pivot_row]]
                break
            # Reduce: take two non-zero rows, replace the larger by remainder.
            r1, r2 = non_zero[0], non_zero[1]
            if abs(A[r1][col]) < abs(A[r2][col]):
                r1, r2 = r2, r1
            q = A[r1][col] // A[r2][col]
            A[r1] = [A[r1][k] - q * A[r2][k] for k in range(d)]
        if pivot_row < n and A[pivot_row][col] != 0:
            # Reduce rows above pivot_row mod the pivot.
            piv = A[pivot_row][col]
            for r in range(pivot_row):
                if A[r][col] != 0:
                    q = A[r][col] // piv
                    if A[r][col] - q * piv < 0:
                        q -= 1
                    if q != 0:
                        A[r] = [A[r][k] - q * A[pivot_row][k] for k in range(d)]
            pivot_row += 1

    # Drop zero rows for canonical form.
    A = [row for row in A if any(v != 0 for v in row)]
    return A


def _det_BBT(B: list[list[int]]) -> int:
    """det(B Bᵀ); for an integer n×d matrix with n ≤ d this is the squared
    Gram volume of the row lattice."""
    n = len(B)
    if n == 0:
        return 1
    d = len(B[0])
    # Form n×n Gram matrix.
    G = [
        [sum(B[i][k] * B[j][k] for k in range(d)) for j in range(n)]
        for i in range(n)
    ]
    # Bareiss-like exact integer determinant.
    return _int_det(G)


def _int_det(M: list[list[int]]) -> int:
    n = len(M)
    if n == 0:
        return 1
    A = [row[:] for row in M]
    sign = 1
    prev = 1
    for i in range(n):
        if A[i][i] == 0:
            piv = next(
                (k for k in range(i + 1, n) if A[k][i] != 0), None
            )
            if piv is None:
                return 0
            A[i], A[piv] = A[piv], A[i]
            sign = -sign
        for j in range(i + 1, n):
            for k in range(i + 1, n):
                A[j][k] = (A[j][k] * A[i][i] - A[j][i] * A[i][k]) // prev
            A[j][i] = 0
        prev = A[i][i]
    return sign * A[n - 1][n - 1]


# ── Verifier ────────────────────────────────────────────────────────────────


def verify(payload: dict[str, Any]) -> dict[str, Any]:
    inp = payload["input"]
    candidate = payload["candidate"]
    n = int(inp["n"])
    d = int(inp["d"])
    delta = Fraction(int(inp["delta"]["num"]), int(inp["delta"]["den"]))
    B_in = [[int(s) for s in row] for row in inp["basis"]]

    checks: dict[str, dict[str, Any]] = {}

    # ── shape ───────────────────────────────────────────────────────────────
    if not isinstance(candidate, dict) or "reduced_basis" not in candidate:
        return {
            "pass": False,
            "reason": "candidate must be {'reduced_basis': [[...]]}",
            "checks": {"shape": {"pass": False, "detail": "missing reduced_basis"}},
        }
    B_out = _as_int_matrix(candidate["reduced_basis"], n, d)
    if B_out is None:
        return {
            "pass": False,
            "reason": f"reduced_basis must be an n×d ({n}×{d}) matrix of decimal-string integers",
            "checks": {"shape": {"pass": False, "detail": "wrong shape or non-int"}},
        }
    checks["shape"] = {"pass": True, "detail": f"{n}×{d} integer matrix"}

    # ── same_lattice ────────────────────────────────────────────────────────
    hnf_in  = _hermite_normal_form(B_in)
    hnf_out = _hermite_normal_form(B_out)
    same = hnf_in == hnf_out
    checks["same_lattice"] = {
        "pass":   same,
        "detail": "row HNF agrees" if same else "row HNF disagrees",
    }

    # ── size_reduction & lovasz ─────────────────────────────────────────────
    Bstar, mu = _gram_schmidt_rationals(B_out)
    norm2 = [sum(x * x for x in bs) for bs in Bstar]

    sr_violations: list[tuple[int, int, str]] = []
    for i in range(n):
        for j in range(i):
            if abs(mu[i][j]) > Fraction(1, 2):
                sr_violations.append((i, j, str(mu[i][j])))
    checks["size_reduction"] = {
        "pass":   not sr_violations,
        "detail": (
            "all |μ_{i,j}| ≤ 1/2"
            if not sr_violations
            else f"{len(sr_violations)} violations; first: μ[{sr_violations[0][0]}][{sr_violations[0][1]}] = {sr_violations[0][2]}"
        ),
    }

    lov_violations: list[tuple[int, str, str]] = []
    for i in range(1, n):
        lhs = norm2[i]
        rhs = (delta - mu[i][i - 1] ** 2) * norm2[i - 1]
        if lhs < rhs:
            lov_violations.append((i, str(lhs), str(rhs)))
    checks["lovasz"] = {
        "pass":   not lov_violations,
        "detail": (
            "Lovász condition holds at every level"
            if not lov_violations
            else (
                f"{len(lov_violations)} violations; first at i={lov_violations[0][0]}: "
                f"lhs={lov_violations[0][1]} < rhs={lov_violations[0][2]}"
            )
        ),
    }

    # ── det_preserved ───────────────────────────────────────────────────────
    det_in  = _det_BBT(B_in)
    det_out = _det_BBT(B_out)
    checks["det_preserved"] = {
        "pass":   det_in == det_out,
        "detail": f"det(BBᵀ)={det_in}, det(B′B′ᵀ)={det_out}",
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
