"""Reference Stoer-Wagner — straight Python port of Stoer-Wagner 1997.

Reads one input JSON object on stdin, writes the candidate output JSON
object to stdout. Stripped from ts-bench-test by infra/strip-for-testing.sh.
"""

from __future__ import annotations

import json
import sys
from typing import Any


def stoer_wagner_min_cut(n: int, edges: list[tuple[int, int, int]]):
    if n == 0:
        return 0, [], []
    if n == 1:
        return 0, [0], []

    # Adjacency: dict from vertex to dict of (neighbour -> aggregate weight).
    # Stoer-Wagner contracts vertices, so we maintain meta-vertices.
    W: dict[int, dict[int, int]] = {i: {} for i in range(n)}
    for u, v, w in edges:
        if u == v:
            continue  # self-loops don't contribute to any cut
        W[u][v] = W[u].get(v, 0) + w
        W[v][u] = W[v].get(u, 0) + w

    members: dict[int, set[int]] = {i: {i} for i in range(n)}
    active: list[int] = list(range(n))

    best_cut: int | None = None
    best_S: set[int] = set()

    while len(active) > 1:
        a = active[0]
        in_A = {a}
        attached = {v: W[a].get(v, 0) for v in active if v != a}
        order = [a]

        while attached:
            v_max = max(attached, key=attached.__getitem__)
            order.append(v_max)
            in_A.add(v_max)
            del attached[v_max]
            for u, w_u in W[v_max].items():
                if u in attached:
                    attached[u] += w_u

        s, t = order[-2], order[-1]
        cut_of_phase = sum(W[t].get(u, 0) for u in active if u != t)

        if best_cut is None or cut_of_phase < best_cut:
            best_cut = cut_of_phase
            best_S = set(members[t])  # snapshot before merge

        # Merge t into s.
        for u in active:
            if u == s or u == t:
                continue
            new_w = W[s].get(u, 0) + W[t].get(u, 0)
            if new_w:
                W[s][u] = new_w
                W[u][s] = new_w
            W[t].pop(u, None)
            W[u].pop(t, None)
        W[s].pop(t, None)
        W[t].pop(s, None)
        members[s] |= members[t]
        active.remove(t)

    if best_cut is None:
        best_cut = 0
    partition_S = sorted(best_S)
    partition_T = sorted(set(range(n)) - best_S)
    return best_cut, partition_S, partition_T


def sw_reference(payload: dict[str, Any]) -> dict[str, Any]:
    n = int(payload["n"])
    edges = [(int(u), int(v), int(w)) for u, v, w in payload["edges"]]
    cut, S, T = stoer_wagner_min_cut(n, edges)
    return {
        "min_cut_value": str(cut),
        "partition_S":   S,
        "partition_T":   T,
    }


def main() -> None:
    payload = json.load(sys.stdin)
    json.dump(sw_reference(payload), sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
