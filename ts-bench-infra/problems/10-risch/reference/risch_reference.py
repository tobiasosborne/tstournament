"""Reference Risch — wraps sympy.integrals.risch.risch_integrate.

If sympy returns an unevaluated `Integral(...)`, we treat that as the
non-elementary sentinel and emit `{"antiderivative": null}`.

Reads one input JSON object on stdin, writes the candidate output JSON
object to stdout. Stripped from ts-bench-test by infra/strip-for-testing.sh.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from sympy import Integral, Symbol, simplify
from sympy.integrals.risch import risch_integrate
from sympy.parsing.sympy_parser import parse_expr


def risch_reference(payload: dict[str, Any]) -> dict[str, Any]:
    var_name = payload["variable"]
    x = Symbol(var_name)
    integrand_str = payload["integrand"]
    f = parse_expr(integrand_str, local_dict={var_name: x})

    try:
        F = risch_integrate(f, x)
    except (NotImplementedError, Exception):
        return {"antiderivative": None}

    if isinstance(F, Integral) or F.has(Integral):
        return {"antiderivative": None}

    return {"antiderivative": str(F)}


def main() -> None:
    payload = json.load(sys.stdin)
    json.dump(risch_reference(payload), sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
