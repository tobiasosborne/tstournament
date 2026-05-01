"""Buchberger verifier — language-neutral, self-contained.

Uses sympy internally to:
  1. parse the candidate polynomials,
  2. test ideal containment in both directions,
  3. test the Gröbner basis property (S-pairs reduce to 0 mod candidate).

stdin:
  {"input": {"vars", "order", "polynomials"},
   "candidate": {"groebner_basis": [...]},
   "id"?: str}

stdout:
  {"pass": bool, "reason": str, "checks": {...}}
"""

from __future__ import annotations

import json
import sys
import traceback
from typing import Any

from sympy import Integer, Poly, Rational, groebner, reduced, symbols


def _sparse_to_expr(sparse: list, syms: tuple):
    out = Integer(0)
    for entry in sparse:
        if not isinstance(entry, list) or len(entry) != 2:
            raise ValueError("polynomial entries must be [expvec, coeff]")
        expvec, coeff_str = entry
        if not isinstance(expvec, list) or len(expvec) != len(syms):
            raise ValueError("exponent vector length mismatch")
        if any(not isinstance(e, int) or isinstance(e, bool) or e < 0
               for e in expvec):
            raise ValueError("exponent vector entries must be non-negative ints")
        if not isinstance(coeff_str, str):
            raise ValueError("coefficient must be a string")
        c = Rational(coeff_str)
        if c == 0:
            continue
        m = Integer(1)
        for s, e in zip(syms, expvec):
            if e > 0:
                m = m * s ** e
        out = out + c * m
    return out


def _s_polynomial(f, g, syms, order):
    """Compute S(f, g) as a sympy expression.

    Both f and g are sympy expressions (non-zero polynomials). We use
    sympy.Poly internally to get LM/LC.
    """
    fp = Poly(f, *syms, domain="QQ")
    gp = Poly(g, *syms, domain="QQ")
    f_exps = fp.monoms()[0]   # leading monomial in the Poly's order
    g_exps = gp.monoms()[0]
    lc_f = fp.coeffs()[0]
    lc_g = gp.coeffs()[0]
    lcm_exps = tuple(max(a, b) for a, b in zip(f_exps, g_exps))
    f_q = tuple(lcm_exps[i] - f_exps[i] for i in range(len(syms)))
    g_q = tuple(lcm_exps[i] - g_exps[i] for i in range(len(syms)))

    def monomial(exps):
        out = Integer(1)
        for s, e in zip(syms, exps):
            if e > 0:
                out = out * s ** e
        return out

    return (monomial(f_q) / lc_f) * f - (monomial(g_q) / lc_g) * g


def verify(payload: dict[str, Any]) -> dict[str, Any]:
    inp = payload["input"]
    candidate = payload["candidate"]
    vars_str = inp["vars"]
    order = inp["order"]

    if order not in ("lex", "degrevlex"):
        return {
            "pass": False,
            "reason": f"unsupported order {order!r}",
            "checks": {},
        }
    sympy_order = "grevlex" if order == "degrevlex" else order

    syms = symbols(" ".join(vars_str))
    if not isinstance(syms, tuple):
        syms = (syms,)

    checks: dict[str, dict[str, Any]] = {}

    # ── shape ───────────────────────────────────────────────────────────────
    if not isinstance(candidate, dict) or "groebner_basis" not in candidate:
        return {
            "pass": False,
            "reason": "candidate must contain 'groebner_basis'",
            "checks": {"shape": {"pass": False, "detail": "missing key"}},
        }
    gb_sparse = candidate["groebner_basis"]
    if not isinstance(gb_sparse, list):
        return {
            "pass": False,
            "reason": "groebner_basis must be a list",
            "checks": {"shape": {"pass": False, "detail": "non-list"}},
        }

    try:
        cand_exprs = [_sparse_to_expr(p, syms) for p in gb_sparse]
        input_exprs = [_sparse_to_expr(p, syms) for p in inp["polynomials"]]
    except (ValueError, TypeError) as e:
        return {
            "pass": False,
            "reason": f"parse error: {e}",
            "checks": {"shape": {"pass": False, "detail": str(e)}},
        }

    cand_nonzero = [e for e in cand_exprs if e != 0]
    input_nonzero = [e for e in input_exprs if e != 0]

    checks["shape"] = {
        "pass": True,
        "detail": f"|input|={len(input_nonzero)}, |candidate|={len(cand_nonzero)}",
    }

    # ── input_in_candidate_ideal ────────────────────────────────────────────
    if not cand_nonzero:
        # Candidate is empty (or all zero). Only valid if input ideal is also (0).
        all_zero_input = all(e == 0 for e in input_exprs)
        checks["input_in_candidate_ideal"] = {
            "pass":   all_zero_input,
            "detail": (
                "both empty"
                if all_zero_input
                else "candidate is empty but input is non-zero"
            ),
        }
        # If candidate is empty, skip rest.
        if all_zero_input:
            checks["candidate_in_input_ideal"] = {"pass": True, "detail": "vacuous"}
            checks["groebner_basis_property"] = {"pass": True, "detail": "vacuous"}
        else:
            checks["candidate_in_input_ideal"] = {"pass": False, "detail": "candidate empty"}
            checks["groebner_basis_property"] = {"pass": False, "detail": "candidate empty"}
        overall = all(c["pass"] for c in checks.values())
        return {
            "pass": overall,
            "reason": "all invariants hold" if overall else "empty-basis case fails",
            "checks": checks,
        }

    cand_gb = groebner(cand_nonzero, *syms, order=sympy_order)
    misses_in = [e for e in input_nonzero if not cand_gb.contains(e)]
    checks["input_in_candidate_ideal"] = {
        "pass":   not misses_in,
        "detail": (
            "every input poly ∈ ⟨candidate⟩"
            if not misses_in
            else f"{len(misses_in)} input polys not in ⟨candidate⟩"
        ),
    }

    # ── candidate_in_input_ideal ────────────────────────────────────────────
    if input_nonzero:
        ref_gb = groebner(input_nonzero, *syms, order=sympy_order)
        misses_out = [e for e in cand_nonzero if not ref_gb.contains(e)]
    else:
        # Input ideal is (0); candidate must also be all zero, but we already
        # know cand_nonzero is non-empty here, so this fails.
        misses_out = list(cand_nonzero)
    checks["candidate_in_input_ideal"] = {
        "pass":   not misses_out,
        "detail": (
            "every candidate poly ∈ ⟨input⟩"
            if not misses_out
            else f"{len(misses_out)} candidate polys not in ⟨input⟩"
        ),
    }

    # ── groebner_basis_property ─────────────────────────────────────────────
    # We have to set up a polynomial ring with the requested order so that
    # `reduced(...)` uses the right LM definition. sympy passes order
    # through `reduced(..., order=...)`.
    bad_pairs: list[tuple[int, int]] = []
    for i in range(len(cand_nonzero)):
        for j in range(i + 1, len(cand_nonzero)):
            try:
                spoly = _s_polynomial(cand_nonzero[i], cand_nonzero[j], syms, order)
            except Exception:  # noqa: BLE001
                bad_pairs.append((i, j))
                continue
            _q, r = reduced(spoly, cand_nonzero, *syms, order=sympy_order)
            if r != 0:
                bad_pairs.append((i, j))
    checks["groebner_basis_property"] = {
        "pass":   not bad_pairs,
        "detail": (
            "all S-pairs reduce to 0 mod candidate"
            if not bad_pairs
            else f"{len(bad_pairs)} S-pairs do not reduce to 0; first: {bad_pairs[0]}"
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
