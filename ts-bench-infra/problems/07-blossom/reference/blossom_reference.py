"""Reference max-weight matching — exact bitmask DP over vertex subsets.

For n ≤ ~16, enumerates the optimal matching via the classical
`f[mask] = max weight of matching using vertices ⊆ mask` recurrence:

    f[mask]  =  max(  f[mask \ {i}],
                       max over j ∈ adj(i) ∩ mask  of  f[mask \ {i, j}] + w(i, j) )

where `i` is the lowest-index vertex in `mask`. This is exact and
algorithm-agnostic — it does not assume Edmonds' or any other algorithm.

Reads one input JSON object on stdin, writes the candidate output JSON
object to stdout. Stripped from ts-bench-test by infra/strip-for-testing.sh.
"""

from __future__ import annotations

import json
import sys
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


def max_weight_matching(n: int, edges: list[tuple[int, int, int]]):
    if n == 0:
        return 0, []
    adj = _collapse_parallel(n, edges)
    full = (1 << n) - 1
    NEG = -(10 ** 18)

    # f[mask] = max-weight matching restricted to vertices in mask.
    f = [0] * (full + 1)
    parent: list[tuple[int, tuple[int, int, int] | None]] = [(0, None)] * (full + 1)

    for mask in range(1, full + 1):
        lsb = mask & -mask
        i = lsb.bit_length() - 1
        rest = mask ^ lsb

        # Option A: i is not matched.
        best = f[rest]
        choice: tuple[int, tuple[int, int, int] | None] = (rest, None)

        # Option B: match i with some j in mask (j > i since i was lsb).
        for j, w in adj[i].items():
            j_bit = 1 << j
            if j_bit & rest:
                cand = f[rest ^ j_bit] + w
                if cand > best:
                    best = cand
                    choice = (rest ^ j_bit, (i, j, w))

        f[mask] = best
        parent[mask] = choice

    # Reconstruct matching.
    matching: list[tuple[int, int, int]] = []
    mask = full
    while mask:
        nxt, edge = parent[mask]
        if edge is not None:
            matching.append(edge)
        mask = nxt

    return f[full], matching


def blossom_reference(payload: dict[str, Any]) -> dict[str, Any]:
    n = int(payload["n"])
    edges = [(int(u), int(v), int(w)) for u, v, w in payload["edges"]]
    if n > 18:
        raise ValueError(f"reference DP capped at n ≤ 18; received n={n}")
    weight, matching = max_weight_matching(n, edges)
    return {
        "matching":     [[u, v] for u, v, _w in matching],
        "total_weight": str(weight),
    }


def main() -> None:
    payload = json.load(sys.stdin)
    json.dump(blossom_reference(payload), sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
