"""Risch verifier — language-neutral.

Uses sympy internally to differentiate the candidate antiderivative and
to run an independent Risch existence check.

stdin:
  {"input": {"integrand": "...", "variable": "x"},
   "candidate": {"antiderivative": "..." | null},
   "id"?: str}

stdout:
  {"pass": bool, "reason": str, "checks": {...}}

Invariants checked:
  1. shape              — antiderivative is null or a parseable string
  2. derivative_matches — diff(antiderivative, x) == integrand (simplify)
  3. existence_agrees   — candidate null/non-null matches reference
"""

from __future__ import annotations

import json
import sys
import traceback
from typing import Any

from sympy import Integral, Symbol, diff, simplify
from sympy.integrals.risch import risch_integrate
from sympy.parsing.sympy_parser import parse_expr


def _parse(expr_str: str, var_name: str):
    x = Symbol(var_name)
    return parse_expr(expr_str, local_dict={var_name: x})


def verify(payload: dict[str, Any]) -> dict[str, Any]:
    inp = payload["input"]
    candidate = payload["candidate"]
    var_name = inp["variable"]
    integrand_str = inp["integrand"]

    checks: dict[str, dict[str, Any]] = {}

    # ── shape ───────────────────────────────────────────────────────────────
    if not isinstance(candidate, dict) or "antiderivative" not in candidate:
        return {
            "pass": False,
            "reason": "candidate must contain 'antiderivative'",
            "checks": {"shape": {"pass": False, "detail": "missing key"}},
        }
    F_str = candidate["antiderivative"]
    if F_str is not None and not isinstance(F_str, str):
        return {
            "pass": False,
            "reason": "antiderivative must be a string or null",
            "checks": {"shape": {"pass": False, "detail": "wrong type"}},
        }
    checks["shape"] = {"pass": True, "detail": "ok"}

    x = Symbol(var_name)
    try:
        f = _parse(integrand_str, var_name)
    except Exception as e:  # noqa: BLE001
        return {
            "pass": False,
            "reason": f"could not parse integrand: {e}",
            "checks": {"shape": {"pass": False, "detail": "integrand parse error"}},
        }

    # ── derivative_matches ─────────────────────────────────────────────────
    if F_str is None:
        checks["derivative_matches"] = {"pass": True, "detail": "null (skipped)"}
    else:
        try:
            F = _parse(F_str, var_name)
        except Exception as e:  # noqa: BLE001
            return {
                "pass": False,
                "reason": f"could not parse antiderivative: {e}",
                "checks": {**checks,
                           "derivative_matches": {"pass": False, "detail": "parse error"}},
            }
        residual = simplify(diff(F, x) - f)
        if residual == 0:
            checks["derivative_matches"] = {"pass": True, "detail": "diff(F) == f"}
        else:
            checks["derivative_matches"] = {
                "pass":   False,
                "detail": f"residual = {residual}",
            }

    # ── existence_agrees ───────────────────────────────────────────────────
    try:
        ref_F = risch_integrate(f, x)
    except Exception:  # noqa: BLE001
        ref_F = None
    ref_has_elem = ref_F is not None and not isinstance(ref_F, Integral) \
        and not (hasattr(ref_F, "has") and ref_F.has(Integral))
    cand_has_elem = F_str is not None
    checks["existence_agrees"] = {
        "pass":   cand_has_elem == ref_has_elem,
        "detail": (
            "both find an elementary antiderivative"  if cand_has_elem and ref_has_elem
            else "both decline (no elementary form)"  if not cand_has_elem and not ref_has_elem
            else "candidate found one; reference did not" if cand_has_elem
            else "reference found one; candidate did not"
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
