"""Reference Buchberger — wraps sympy.groebner.

Reads one input JSON object on stdin, writes the candidate output JSON
object to stdout. Stripped from ts-bench-test by infra/strip-for-testing.sh.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from sympy import Integer, Poly, Rational, groebner, symbols


def _sparse_to_expr(sparse: list[list], syms: list):
    out = Integer(0)
    for expvec, coeff_str in sparse:
        c = Rational(coeff_str)
        if c == 0:
            continue
        m = Integer(1)
        for s, e in zip(syms, expvec):
            if e > 0:
                m = m * s ** e
        out = out + c * m
    return out


def _poly_to_sparse(p: Poly) -> list[list]:
    out = []
    for monom, coef in zip(p.monoms(), p.coeffs()):
        out.append([list(monom), str(coef)])
    return out


def buchberger_reference(payload: dict[str, Any]) -> dict[str, Any]:
    vars_str = payload["vars"]
    order = payload["order"]
    if order not in ("lex", "degrevlex"):
        raise ValueError(f"unsupported order: {order!r}")
    sympy_order = "grevlex" if order == "degrevlex" else order
    syms = symbols(" ".join(vars_str))
    if not isinstance(syms, tuple):
        syms = (syms,)
    polys_sparse = payload["polynomials"]
    exprs = [_sparse_to_expr(s, syms) for s in polys_sparse]
    nonzero = [e for e in exprs if e != 0]
    if not nonzero:
        return {"groebner_basis": []}
    gb = groebner(nonzero, *syms, order=sympy_order)
    out = []
    for g in gb:
        gp = Poly(g, *syms, domain="QQ")
        out.append(_poly_to_sparse(gp))
    return {"groebner_basis": out}


def main() -> None:
    payload = json.load(sys.stdin)
    json.dump(buchberger_reference(payload), sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
