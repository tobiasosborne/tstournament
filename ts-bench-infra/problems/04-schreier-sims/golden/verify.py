"""Schreier-Sims verifier — language-neutral.

stdin:
  {"input": {"degree", "generators", "membership_queries"},
   "candidate": {"base", "strong_generators", "transversal_sizes",
                 "order", "membership_results"},
   "id"?: str}

stdout:
  {"pass": bool, "reason": str, "checks": {...}}

Invariants checked:
  1. shape                 — all keys present with correct types and structure
  2. base_validity         — distinct points in [0, degree); empty only when |G|=1
  3. order_consistency     — len(transversal_sizes) == len(base) AND
                             prod(transversal_sizes) == int(order)
  4. order_correct         — int(order) equals the reference group's order
  5. membership_correct    — every membership_results[i] equals the reference
"""

from __future__ import annotations

import json
import sys
import traceback
from typing import Any

from sympy.combinatorics import Permutation, PermutationGroup


def _is_perm(image: Any, degree: int) -> bool:
    if not isinstance(image, list) or len(image) != degree:
        return False
    if any(not isinstance(v, int) or isinstance(v, bool) for v in image):
        return False
    if any(not (0 <= v < degree) for v in image):
        return False
    return len(set(image)) == degree


def _to_perm(image: list[int], degree: int) -> Permutation:
    return Permutation(image, size=degree)


def verify(payload: dict[str, Any]) -> dict[str, Any]:
    inp = payload["input"]
    candidate = payload["candidate"]
    degree = int(inp["degree"])
    generators_imgs = inp["generators"]
    queries_imgs = inp.get("membership_queries", [])

    checks: dict[str, dict[str, Any]] = {}

    # ── shape ───────────────────────────────────────────────────────────────
    if not isinstance(candidate, dict):
        return {
            "pass": False,
            "reason": "candidate must be a JSON object",
            "checks": {"shape": {"pass": False, "detail": "not an object"}},
        }
    required = {
        "base":                list,
        "strong_generators":   list,
        "transversal_sizes":   list,
        "order":               str,
        "membership_results":  list,
    }
    missing = [k for k in required if k not in candidate]
    if missing:
        return {
            "pass": False,
            "reason": f"missing keys: {missing}",
            "checks": {"shape": {"pass": False, "detail": str(missing)}},
        }
    for k, ty in required.items():
        if not isinstance(candidate[k], ty):
            return {
                "pass": False,
                "reason": f"wrong type for {k!r}",
                "checks": {"shape": {"pass": False, "detail": f"bad type for {k}"}},
            }

    base = candidate["base"]
    sg = candidate["strong_generators"]
    ts = candidate["transversal_sizes"]
    order_str = candidate["order"]
    mem = candidate["membership_results"]

    if any(not isinstance(b, int) or isinstance(b, bool) for b in base):
        return {
            "pass": False,
            "reason": "base must be a list of ints",
            "checks": {"shape": {"pass": False, "detail": "non-int in base"}},
        }
    if any(not isinstance(s, int) or isinstance(s, bool) for s in ts):
        return {
            "pass": False,
            "reason": "transversal_sizes must be a list of ints",
            "checks": {"shape": {"pass": False, "detail": "non-int in transversal_sizes"}},
        }
    for i, g in enumerate(sg):
        if not _is_perm(g, degree):
            return {
                "pass": False,
                "reason": f"strong_generators[{i}] is not a valid permutation of degree {degree}",
                "checks": {"shape": {"pass": False, "detail": f"sg[{i}] invalid"}},
            }
    if any(not isinstance(b, bool) for b in mem):
        return {
            "pass": False,
            "reason": "membership_results must be a list of bools",
            "checks": {"shape": {"pass": False, "detail": "non-bool in membership_results"}},
        }
    if len(mem) != len(queries_imgs):
        return {
            "pass": False,
            "reason": f"membership_results length {len(mem)} ≠ queries length {len(queries_imgs)}",
            "checks": {"shape": {"pass": False, "detail": "membership length"}},
        }
    try:
        order_int = int(order_str)
    except ValueError:
        return {
            "pass": False,
            "reason": "order must be a decimal integer string",
            "checks": {"shape": {"pass": False, "detail": "non-int order"}},
        }
    if order_int < 1:
        return {
            "pass": False,
            "reason": "order must be ≥ 1",
            "checks": {"shape": {"pass": False, "detail": "non-positive order"}},
        }
    checks["shape"] = {"pass": True, "detail": "all keys present, types ok"}

    # Build reference group once for the remaining checks.
    perms = [_to_perm(g, degree) for g in generators_imgs]
    if not perms:
        perms = [_to_perm(list(range(degree)), degree)]
    G_ref = PermutationGroup(perms)
    ref_order = G_ref.order()

    # ── base_validity ───────────────────────────────────────────────────────
    base_ok = (
        all(0 <= b < degree for b in base)
        and len(set(base)) == len(base)
        and (len(base) > 0 or ref_order == 1)
    )
    base_detail = (
        f"base={base}, degree={degree}, |G|={ref_order}"
        if not base_ok
        else f"|base|={len(base)}, distinct, in [0,{degree})"
    )
    checks["base_validity"] = {"pass": base_ok, "detail": base_detail}

    # ── order_consistency ───────────────────────────────────────────────────
    prod_ts = 1
    for s in ts:
        prod_ts *= int(s)
    cons_ok = (len(ts) == len(base)) and (prod_ts == order_int)
    cons_detail = (
        f"len(transversal_sizes)={len(ts)}, len(base)={len(base)}, "
        f"prod={prod_ts}, order={order_int}"
    )
    checks["order_consistency"] = {"pass": cons_ok, "detail": cons_detail}

    # ── order_correct ───────────────────────────────────────────────────────
    correct_ok = order_int == ref_order
    checks["order_correct"] = {
        "pass":   correct_ok,
        "detail": f"candidate={order_int}, reference={ref_order}",
    }

    # ── membership_correct ──────────────────────────────────────────────────
    mismatches: list[tuple[int, bool, bool]] = []
    for i, q_img in enumerate(queries_imgs):
        if not _is_perm(q_img, degree):
            return {
                "pass": False,
                "reason": f"membership_queries[{i}] is not a valid permutation",
                "checks": {**checks, "membership_correct": {
                    "pass": False, "detail": f"query[{i}] malformed"}},
            }
        ref_in = bool(G_ref.contains(_to_perm(q_img, degree)))
        if mem[i] is not ref_in:
            mismatches.append((i, mem[i], ref_in))
    mem_ok = not mismatches
    if mem_ok:
        mem_detail = f"all {len(mem)} membership decisions match the reference"
    else:
        first = mismatches[0]
        mem_detail = (
            f"{len(mismatches)}/{len(mem)} mismatches; "
            f"first at index {first[0]}: cand={first[1]}, ref={first[2]}"
        )
    checks["membership_correct"] = {"pass": mem_ok, "detail": mem_detail}

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
