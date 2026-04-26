"""Reference LLL — wraps sympy's exact-rational DomainMatrix.lll().

Reads one input JSON object on stdin, writes the candidate output JSON
object to stdout. Stripped from ts-bench-test by infra/strip-for-testing.sh.
"""

from __future__ import annotations

import json
import sys

from sympy import Rational
from sympy.polys.domains import QQ, ZZ
from sympy.polys.matrices import DomainMatrix


def lll_reference(payload: dict) -> dict:
    n = int(payload["n"])
    d = int(payload["d"])
    rows = [[int(s) for s in row] for row in payload["basis"]]
    if len(rows) != n or any(len(r) != d for r in rows):
        raise ValueError(f"basis dimensions do not match n={n}, d={d}")

    delta = Rational(int(payload["delta"]["num"]), int(payload["delta"]["den"]))

    M = DomainMatrix([[ZZ(v) for v in row] for row in rows], (n, d), ZZ)
    R = M.lll(delta=QQ(delta.p, delta.q))
    out_rows = R.to_Matrix().tolist()

    return {"reduced_basis": [[str(v) for v in row] for row in out_rows]}


def main() -> None:
    payload = json.load(sys.stdin)
    out = lll_reference(payload)
    json.dump(out, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
