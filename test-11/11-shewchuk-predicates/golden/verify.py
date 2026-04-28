#!/usr/bin/env python3
"""
Verifier for problem 11 — Shewchuk's adaptive-precision geometric
predicates.

Reads {"input": ..., "candidate": ..., "id": "..."} on stdin.
Writes a JSON verdict on stdout (always exit 0; non-zero exit means
the verifier itself crashed).

Three checks per case:

    shape           — candidate has {"signs": [int, ...]} with values
                      in {-1, 0, 1}.
    batch_complete  — len(candidate.signs) equals the number of queries
                      in the case.
    sign_correct    — every sign agrees with the exact-rational ground
                      truth computed by the bigint reference. On
                      mismatch, the detail field reports the first 5
                      differing query indices and the aggregate failure
                      count, so debugging is targeted.

Time-budget enforcement is *not* a verifier check. It is the harness's
job: each candidate invocation should be wrapped in `timeout` (the
problem's PROMPT.md documents the 1.5s per-case budget). A timeout
manifests as the candidate exiting non-zero, which the harness reports
as a failed case before this verifier ever runs.
"""

from __future__ import annotations

import json
import os
import sys

# Make the bigint reference importable.
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "reference"))
sys.path.insert(0, HERE)  # for `generate.py` (Tier H expansion)

import predicates_reference as ref  # noqa: E402


# ---------------------------------------------------------------------------
# Query expansion
#
# Cases are either "explicit" (queries: [[pt, pt, ...], ...]) or
# "generated" (a {kind, n, seed, ...} descriptor that the harness
# expands deterministically via the generator's LCG).
# ---------------------------------------------------------------------------


def expand_queries(payload):
    predicate = payload["predicate"]
    if payload.get("format") == "generated":
        from generate import expand_generator  # noqa: E402

        return predicate, expand_generator(predicate, payload["generator"])
    return predicate, payload["queries"]


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------


def check_shape(candidate, n_queries):
    if not isinstance(candidate, dict):
        return False, f"candidate is not a JSON object (got {type(candidate).__name__})"
    if "signs" not in candidate:
        return False, "candidate missing 'signs' key"
    signs = candidate["signs"]
    if not isinstance(signs, list):
        return False, "'signs' is not a list"
    for i, s in enumerate(signs[: min(8, len(signs))]):
        if isinstance(s, bool) or not isinstance(s, int):
            return False, f"signs[{i}] is not an int (got {type(s).__name__}: {s!r})"
        if s not in (-1, 0, 1):
            return False, f"signs[{i}] = {s} not in {{-1, 0, 1}}"
    return True, f"signs is a list of {len(signs)} ternary ints"


def check_batch_complete(candidate, n_queries):
    n_signs = len(candidate.get("signs", []))
    if n_signs != n_queries:
        return False, f"expected {n_queries} signs, got {n_signs}"
    return True, f"{n_signs} signs present"


def check_sign_correct(candidate, predicate, queries):
    signs = candidate["signs"]
    mismatches = []
    n_mismatches = 0
    for i, q in enumerate(queries):
        truth = ref.evaluate(predicate, q)
        if signs[i] != truth:
            n_mismatches += 1
            if len(mismatches) < 5:
                mismatches.append(
                    {"i": i, "candidate": signs[i], "truth": truth, "query": q}
                )
    if n_mismatches == 0:
        return True, f"all {len(queries)} signs match exact-rational ground truth"
    detail = f"{n_mismatches}/{len(queries)} mismatches; first: {mismatches}"
    return False, detail


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def main():
    raw = sys.stdin.read()
    payload = json.loads(raw)
    inp = payload["input"]
    candidate = payload["candidate"]

    predicate, queries = expand_queries(inp)
    n_queries = len(queries)

    checks = {}

    ok_shape, det_shape = check_shape(candidate, n_queries)
    checks["shape"] = {"pass": ok_shape, "detail": det_shape}

    if ok_shape:
        ok_batch, det_batch = check_batch_complete(candidate, n_queries)
    else:
        ok_batch, det_batch = False, "skipped: shape failed"
    checks["batch_complete"] = {"pass": ok_batch, "detail": det_batch}

    if ok_shape and ok_batch:
        ok_sign, det_sign = check_sign_correct(candidate, predicate, queries)
    else:
        ok_sign, det_sign = False, "skipped: shape or batch_complete failed"
    checks["sign_correct"] = {"pass": ok_sign, "detail": det_sign}

    overall = all(c["pass"] for c in checks.values())
    reason = "all invariants hold" if overall else "; ".join(
        f"{name}: {c['detail']}" for name, c in checks.items() if not c["pass"]
    )

    json.dump({"pass": overall, "reason": reason, "checks": checks}, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
