"""Stoer-Wagner verifier — language-neutral, self-contained."""

from __future__ import annotations

import json
import sys
import traceback
from typing import Any


def _stoer_wagner(n: int, edges: list[tuple[int, int, int]]):
    if n == 0:
        return 0, [], []
    if n == 1:
        return 0, [0], []

    W: dict[int, dict[int, int]] = {i: {} for i in range(n)}
    for u, v, w in edges:
        if u == v:
            continue
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
            best_S = set(members[t])
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

    return best_cut or 0, sorted(best_S), sorted(set(range(n)) - best_S)


def verify(payload: dict[str, Any]) -> dict[str, Any]:
    inp = payload["input"]
    candidate = payload["candidate"]
    n = int(inp["n"])
    edges = [(int(u), int(v), int(w)) for u, v, w in inp["edges"]]

    checks: dict[str, dict[str, Any]] = {}

    # ── shape ───────────────────────────────────────────────────────────────
    if not isinstance(candidate, dict):
        return {"pass": False, "reason": "candidate must be an object", "checks": {}}
    for k, ty in (("min_cut_value", str),
                  ("partition_S",  list),
                  ("partition_T",  list)):
        if k not in candidate or not isinstance(candidate[k], ty):
            return {
                "pass": False,
                "reason": f"missing or wrong-type field {k!r}",
                "checks": {"shape": {"pass": False, "detail": f"bad {k}"}},
            }
    try:
        cand_cut = int(candidate["min_cut_value"])
    except ValueError:
        return {
            "pass": False,
            "reason": "min_cut_value must be a decimal integer string",
            "checks": {"shape": {"pass": False, "detail": "non-int cut value"}},
        }
    S = candidate["partition_S"]
    T = candidate["partition_T"]
    if any(not isinstance(v, int) or isinstance(v, bool) for v in S) or \
       any(not isinstance(v, int) or isinstance(v, bool) for v in T):
        return {
            "pass": False,
            "reason": "partitions must be lists of integers",
            "checks": {"shape": {"pass": False, "detail": "non-int in partition"}},
        }
    if any(not (0 <= v < n) for v in S + T):
        return {
            "pass": False,
            "reason": "partition vertex out of range [0, n)",
            "checks": {"shape": {"pass": False, "detail": "vertex out of range"}},
        }
    checks["shape"] = {"pass": True, "detail": "ok"}

    # ── valid_partition ────────────────────────────────────────────────────
    S_set, T_set = set(S), set(T)
    if n == 0:
        partition_ok = (not S_set and not T_set)
    elif n == 1:
        partition_ok = (S_set | T_set == {0}) and not (S_set & T_set)
    else:
        partition_ok = (
            len(S_set) == len(S)
            and len(T_set) == len(T)
            and not (S_set & T_set)
            and S_set | T_set == set(range(n))
            and len(S_set) >= 1
            and len(T_set) >= 1
        )
    checks["valid_partition"] = {
        "pass":   partition_ok,
        "detail": f"|S|={len(S)}, |T|={len(T)}, n={n}",
    }

    # ── cut_value_consistent ───────────────────────────────────────────────
    actual_cut = 0
    if S_set and T_set:
        for u, v, w in edges:
            if u == v:
                continue
            if (u in S_set and v in T_set) or (u in T_set and v in S_set):
                actual_cut += w
    checks["cut_value_consistent"] = {
        "pass":   actual_cut == cand_cut,
        "detail": (
            f"sum over crossing edges = {actual_cut}, claimed = {cand_cut}"
        ),
    }

    # ── cut_value_correct ──────────────────────────────────────────────────
    ref_cut, _ref_S, _ref_T = _stoer_wagner(n, edges)
    checks["cut_value_correct"] = {
        "pass":   cand_cut == ref_cut,
        "detail": f"candidate={cand_cut}, reference={ref_cut}",
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
