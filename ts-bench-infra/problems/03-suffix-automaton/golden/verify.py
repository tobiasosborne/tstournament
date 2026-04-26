"""Suffix-automaton verifier — language-neutral, self-contained.

stdin:
  {"input": {"s": ..., "t": ...},
   "candidate": {"num_states": ..., "num_distinct_substrings": "...", "lcs_length": ...},
   "id"?: str}

stdout:
  {"pass": bool, "reason": str, "checks": {...}}

Invariants checked:
  1. shape                 — three keys present with correct types
  2. num_states_bound      — 2|s|−1 for |s| ≥ 2, ≤ 2 for |s| ≤ 1
  3. distinct_substrings   — brute-force comparison if |s| ≤ 20, else
                             reference SAM comparison
  4. lcs_length            — O(|s||t|) DP if max(|s|,|t|) ≤ 20, else
                             reference SAM walk
"""

from __future__ import annotations

import json
import sys
import traceback
from typing import Any


# ── Reference suffix automaton (inlined; verify.py must be self-contained) ──


class _SAM:
    __slots__ = ("len_", "link", "trans", "last")

    def __init__(self) -> None:
        self.len_: list[int] = [0]
        self.link: list[int] = [-1]
        self.trans: list[dict[str, int]] = [{}]
        self.last: int = 0

    def extend(self, c: str) -> None:
        cur = len(self.len_)
        self.len_.append(self.len_[self.last] + 1)
        self.link.append(-1)
        self.trans.append({})
        p = self.last
        while p != -1 and c not in self.trans[p]:
            self.trans[p][c] = cur
            p = self.link[p]
        if p == -1:
            self.link[cur] = 0
        else:
            q = self.trans[p][c]
            if self.len_[p] + 1 == self.len_[q]:
                self.link[cur] = q
            else:
                clone = len(self.len_)
                self.len_.append(self.len_[p] + 1)
                self.link.append(self.link[q])
                self.trans.append(dict(self.trans[q]))
                while p != -1 and self.trans[p].get(c) == q:
                    self.trans[p][c] = clone
                    p = self.link[p]
                self.link[q] = clone
                self.link[cur] = clone
        self.last = cur


def _build(s: str) -> _SAM:
    sam = _SAM()
    for c in s:
        sam.extend(c)
    return sam


def _ref_distinct_substrings(s: str) -> int:
    sam = _build(s)
    return sum(sam.len_[v] - sam.len_[sam.link[v]] for v in range(1, len(sam.len_)))


def _ref_lcs(s: str, t: str) -> int:
    if not s or not t:
        return 0
    sam = _build(s)
    v, length, best = 0, 0, 0
    for c in t:
        while v != 0 and c not in sam.trans[v]:
            v = sam.link[v]
            length = sam.len_[v]
        if c in sam.trans[v]:
            v = sam.trans[v][c]
            length += 1
        if length > best:
            best = length
    return best


def _brute_distinct_substrings(s: str) -> int:
    n = len(s)
    seen = set()
    for i in range(n):
        for j in range(i + 1, n + 1):
            seen.add(s[i:j])
    return len(seen)


def _brute_lcs(s: str, t: str) -> int:
    if not s or not t:
        return 0
    m, n = len(s), len(t)
    prev = [0] * (n + 1)
    curr = [0] * (n + 1)
    best = 0
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s[i - 1] == t[j - 1]:
                curr[j] = prev[j - 1] + 1
                best = max(best, curr[j])
            else:
                curr[j] = 0
        prev, curr = curr, prev
    return best


# ── Verifier ────────────────────────────────────────────────────────────────


def verify(payload: dict[str, Any]) -> dict[str, Any]:
    inp = payload["input"]
    candidate = payload["candidate"]
    s = inp.get("s", "")
    t = inp.get("t", "") or ""
    if not isinstance(s, str) or not isinstance(t, str):
        return {"pass": False, "reason": "s and t must be strings", "checks": {}}

    checks: dict[str, dict[str, Any]] = {}

    # ── shape ───────────────────────────────────────────────────────────────
    if not isinstance(candidate, dict):
        return {
            "pass": False,
            "reason": "candidate must be a JSON object",
            "checks": {"shape": {"pass": False, "detail": "not an object"}},
        }
    required = {
        "num_states":              int,
        "num_distinct_substrings": str,
        "lcs_length":              int,
    }
    missing = [k for k in required if k not in candidate]
    if missing:
        return {
            "pass": False,
            "reason": f"missing keys: {missing}",
            "checks": {"shape": {"pass": False, "detail": f"missing {missing}"}},
        }
    for k, ty in required.items():
        if not isinstance(candidate[k], ty):
            return {
                "pass": False,
                "reason": f"wrong type for {k!r}: expected {ty.__name__}, got {type(candidate[k]).__name__}",
                "checks": {"shape": {"pass": False, "detail": f"bad type for {k}"}},
            }
    # Booleans are ints in Python — explicitly reject them.
    for k in ("num_states", "lcs_length"):
        if isinstance(candidate[k], bool):
            return {
                "pass": False,
                "reason": f"{k} must be an int, not bool",
                "checks": {"shape": {"pass": False, "detail": f"bool for {k}"}},
            }
    # num_distinct_substrings string must parse as a non-negative integer.
    try:
        cand_distinct = int(candidate["num_distinct_substrings"])
    except ValueError:
        return {
            "pass": False,
            "reason": "num_distinct_substrings must be a decimal integer string",
            "checks": {"shape": {"pass": False, "detail": "non-int string"}},
        }
    if cand_distinct < 0:
        return {
            "pass": False,
            "reason": "num_distinct_substrings is negative",
            "checks": {"shape": {"pass": False, "detail": "negative"}},
        }
    checks["shape"] = {"pass": True, "detail": "three keys present, types ok"}

    n = len(s)
    cand_states = candidate["num_states"]
    cand_lcs    = candidate["lcs_length"]

    # ── num_states_bound ────────────────────────────────────────────────────
    if n <= 1:
        ok = cand_states <= 2 and cand_states >= 1
        detail = f"|s|={n}, num_states={cand_states}, expected 1 or 2"
    else:
        ok = 1 <= cand_states <= 2 * n - 1
        detail = f"|s|={n}, num_states={cand_states}, expected 1 ≤ x ≤ 2|s|−1 = {2*n-1}"
    checks["num_states_bound"] = {"pass": ok, "detail": detail}

    # ── distinct_substrings ─────────────────────────────────────────────────
    if n <= 20:
        truth = _brute_distinct_substrings(s)
        method = "brute force"
    else:
        truth = _ref_distinct_substrings(s)
        method = "reference SAM"
    checks["distinct_substrings"] = {
        "pass":   cand_distinct == truth,
        "detail": f"candidate={cand_distinct}, truth={truth} ({method})",
    }

    # ── lcs_length ──────────────────────────────────────────────────────────
    if not t:
        truth_lcs = 0
        method_lcs = "t is empty"
    elif max(n, len(t)) <= 20:
        truth_lcs = _brute_lcs(s, t)
        method_lcs = "brute DP"
    else:
        truth_lcs = _ref_lcs(s, t)
        method_lcs = "reference SAM walk"
    checks["lcs_length"] = {
        "pass":   cand_lcs == truth_lcs,
        "detail": f"candidate={cand_lcs}, truth={truth_lcs} ({method_lcs})",
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
