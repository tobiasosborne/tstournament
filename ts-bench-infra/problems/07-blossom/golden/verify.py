"""Blossom verifier — language-neutral, self-contained.

Verifies the candidate matching is valid and achieves the optimal
total weight. The verifier's optimal-weight oracle is the same exact
bitmask DP as the reference (no Edmonds inside the verifier — the DP
is enough at the n ≤ 16 cap).
"""

from __future__ import annotations

import json
import sys
import traceback
from typing import Any


def _collapse_parallel(n: int, edges: list[tuple[int, int, int]]) -> dict[int, dict[int, int]]:
    adj: dict[int, dict[int, int]] = {i: {} for i in range(n)}
    for u, v, w in edges:
        if u == v or not (0 <= u < n) or not (0 <= v < n):
            continue
        if v in adj[u]:
            if w > adj[u][v]:
                adj[u][v] = w
                adj[v][u] = w
        else:
            adj[u][v] = w
            adj[v][u] = w
    return adj


def _max_weight(n: int, edges: list[tuple[int, int, int]]) -> int:
    if n == 0:
        return 0
    adj = _collapse_parallel(n, edges)
    full = (1 << n) - 1
    f = [0] * (full + 1)
    for mask in range(1, full + 1):
        lsb = mask & -mask
        i = lsb.bit_length() - 1
        rest = mask ^ lsb
        best = f[rest]
        for j, w in adj[i].items():
            j_bit = 1 << j
            if j_bit & rest:
                cand = f[rest ^ j_bit] + w
                if cand > best:
                    best = cand
        f[mask] = best
    return f[full]


def verify(payload: dict[str, Any]) -> dict[str, Any]:
    inp = payload["input"]
    candidate = payload["candidate"]
    n = int(inp["n"])
    edges = [(int(u), int(v), int(w)) for u, v, w in inp["edges"]]

    checks: dict[str, dict[str, Any]] = {}

    # ── shape ───────────────────────────────────────────────────────────────
    if not isinstance(candidate, dict):
        return {"pass": False, "reason": "candidate must be an object", "checks": {}}
    if "matching" not in candidate or "total_weight" not in candidate:
        return {
            "pass": False,
            "reason": "missing matching / total_weight",
            "checks": {"shape": {"pass": False, "detail": "missing keys"}},
        }
    M = candidate["matching"]
    if not isinstance(M, list):
        return {
            "pass": False,
            "reason": "matching must be a list",
            "checks": {"shape": {"pass": False, "detail": "non-list matching"}},
        }
    pairs: list[tuple[int, int]] = []
    for e in M:
        if not isinstance(e, list) or len(e) != 2:
            return {
                "pass": False,
                "reason": "every matching entry must be [u, v]",
                "checks": {"shape": {"pass": False, "detail": "bad entry"}},
            }
        u, v = e
        if not isinstance(u, int) or not isinstance(v, int) \
                or isinstance(u, bool) or isinstance(v, bool):
            return {
                "pass": False,
                "reason": "matching endpoints must be ints",
                "checks": {"shape": {"pass": False, "detail": "non-int endpoint"}},
            }
        if u == v or not (0 <= u < n) or not (0 <= v < n):
            return {
                "pass": False,
                "reason": "matching endpoints must be distinct in [0, n)",
                "checks": {"shape": {"pass": False, "detail": "endpoint range"}},
            }
        pairs.append((u, v))
    try:
        cand_w = int(candidate["total_weight"])
    except (TypeError, ValueError):
        return {
            "pass": False,
            "reason": "total_weight must be a decimal-integer string",
            "checks": {"shape": {"pass": False, "detail": "non-int total_weight"}},
        }
    checks["shape"] = {"pass": True, "detail": f"|matching|={len(pairs)}"}

    # Build adjacency from the input.
    adj = _collapse_parallel(n, edges)

    # ── disjoint_endpoints ─────────────────────────────────────────────────
    used = set()
    edges_in_input = True
    consistency_w = 0
    for (u, v) in pairs:
        if u in used or v in used:
            checks["disjoint_endpoints"] = {
                "pass":   False,
                "detail": f"vertex reused in matching",
            }
            break
        used.add(u); used.add(v)
        if v not in adj[u]:
            edges_in_input = False
            break
        consistency_w += adj[u][v]
    else:
        checks["disjoint_endpoints"] = {"pass": True, "detail": "no reuse"}

    if not edges_in_input:
        checks["disjoint_endpoints"] = checks.get(
            "disjoint_endpoints", {"pass": True, "detail": "no reuse"}
        )
        checks["matching_in_input"] = {
            "pass":   False,
            "detail": "matching contains an edge not present in the input",
        }
    else:
        checks["matching_in_input"] = {"pass": True, "detail": "all matching edges in input"}

    # ── total_weight_consistent ────────────────────────────────────────────
    checks["total_weight_consistent"] = {
        "pass":   cand_w == consistency_w,
        "detail": f"sum of matching edge weights = {consistency_w}, claimed = {cand_w}",
    }

    # ── total_weight_optimal ───────────────────────────────────────────────
    if n > 18:
        checks["total_weight_optimal"] = {
            "pass":   False,
            "detail": f"verifier capped at n ≤ 18 (received n={n})",
        }
    else:
        opt = _max_weight(n, edges)
        checks["total_weight_optimal"] = {
            "pass":   cand_w == opt,
            "detail": f"candidate={cand_w}, optimum={opt}",
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
