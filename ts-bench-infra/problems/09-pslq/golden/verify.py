"""PSLQ verifier — language-neutral.

Uses mpmath internally for high-precision inner products and as the
existence oracle.

stdin:
  {"input": {"x", "precision_dps", "max_coeff"},
   "candidate": {"relation": [int, ...] | null},
   "id"?: str}

stdout:
  {"pass": bool, "reason": str, "checks": {...}}

Invariants checked:
  1. shape                — list of ints with same length as x, or null
  2. bounded_magnitude    — ‖r‖_∞ ≤ max_coeff (skipped if null)
  3. non_trivial          — relation ≠ 0 (skipped if null)
  4. inner_product        — |r · x| < tolerance (skipped if null)
  5. existence_agrees     — null/non-null matches reference
"""

from __future__ import annotations

import json
import sys
import traceback
from typing import Any

import mpmath


def _inner_product_abs(r: list[int], xs_mpf: list, dps: int):
    mpmath.mp.dps = dps
    s = mpmath.mpf(0)
    for ri, xi in zip(r, xs_mpf):
        s = s + mpmath.mpf(ri) * xi
    return abs(s)


def verify(payload: dict[str, Any]) -> dict[str, Any]:
    inp = payload["input"]
    candidate = payload["candidate"]
    dps = int(inp["precision_dps"])
    max_coeff = int(inp["max_coeff"])
    xs_str = inp["x"]
    mpmath.mp.dps = dps
    xs_mpf = [mpmath.mpf(s) for s in xs_str]
    n = len(xs_mpf)

    checks: dict[str, dict[str, Any]] = {}

    # ── shape ───────────────────────────────────────────────────────────────
    if not isinstance(candidate, dict) or "relation" not in candidate:
        return {
            "pass": False,
            "reason": "candidate must be {'relation': ...}",
            "checks": {"shape": {"pass": False, "detail": "missing relation"}},
        }
    rel = candidate["relation"]
    if rel is None:
        checks["shape"] = {"pass": True, "detail": "null (no relation)"}
    else:
        if not isinstance(rel, list) or len(rel) != n:
            return {
                "pass": False,
                "reason": "relation must be a list of n ints (or null)",
                "checks": {"shape": {"pass": False, "detail": "wrong length"}},
            }
        if any(not isinstance(v, int) or isinstance(v, bool) for v in rel):
            return {
                "pass": False,
                "reason": "relation entries must be ints",
                "checks": {"shape": {"pass": False, "detail": "non-int entry"}},
            }
        checks["shape"] = {"pass": True, "detail": f"length {n}"}

    # ── existence_agrees ───────────────────────────────────────────────────
    ref_rel = mpmath.pslq(xs_mpf, maxcoeff=max_coeff)
    cand_has = rel is not None
    ref_has = ref_rel is not None
    checks["existence_agrees"] = {
        "pass":   cand_has == ref_has,
        "detail": (
            "both find a relation"      if cand_has and ref_has
            else "both decline"          if not cand_has and not ref_has
            else "candidate has relation but reference does not" if cand_has
            else "reference has relation but candidate does not"
        ),
    }

    if rel is None:
        # The remaining checks are vacuous.
        checks["bounded_magnitude"] = {"pass": True, "detail": "null"}
        checks["non_trivial"]       = {"pass": True, "detail": "null"}
        checks["inner_product"]     = {"pass": True, "detail": "null"}
    else:
        # ── bounded_magnitude ─────────────────────────────────────────────
        max_abs = max(abs(v) for v in rel)
        checks["bounded_magnitude"] = {
            "pass":   max_abs <= max_coeff,
            "detail": f"‖r‖_∞ = {max_abs}, max_coeff = {max_coeff}",
        }

        # ── non_trivial ───────────────────────────────────────────────────
        nontrivial = any(v != 0 for v in rel)
        checks["non_trivial"] = {
            "pass":   nontrivial,
            "detail": "non-zero" if nontrivial else "all zeros",
        }

        # ── inner_product ─────────────────────────────────────────────────
        ip = _inner_product_abs(rel, xs_mpf, dps + 20)
        # tolerance: 10^(-dps/2) * n * max_coeff   (loose; PSLQ output is
        # typically much tighter, but this still rejects trivial junk).
        tol = mpmath.power(10, -dps / 2) * n * max_coeff
        checks["inner_product"] = {
            "pass":   ip < tol,
            "detail": f"|r·x| ≈ {mpmath.nstr(ip, 5)}, tol ≈ {mpmath.nstr(tol, 5)}",
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
