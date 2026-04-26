"""Reference PSLQ — wraps mpmath.pslq.

Reads one input JSON object on stdin, writes the candidate output JSON
object to stdout. Stripped from ts-bench-test by infra/strip-for-testing.sh.
"""

from __future__ import annotations

import json
import sys
from typing import Any

import mpmath


def pslq_reference(payload: dict[str, Any]) -> dict[str, Any]:
    dps = int(payload["precision_dps"])
    max_coeff = int(payload["max_coeff"])
    xs = payload["x"]
    mpmath.mp.dps = dps
    vec = [mpmath.mpf(s) for s in xs]
    rel = mpmath.pslq(vec, maxcoeff=max_coeff)
    return {"relation": list(rel) if rel is not None else None}


def main() -> None:
    payload = json.load(sys.stdin)
    json.dump(pslq_reference(payload), sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
