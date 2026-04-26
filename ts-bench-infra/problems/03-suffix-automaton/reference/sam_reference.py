"""Reference suffix automaton — online construction by extend(c), with the
three queries the problem requires. Written from the Blumer et al. 1985
description and the standard (CP-Algorithms / KACTL / jiangly) `link, len`
representation.

Reads one input JSON object on stdin, writes the candidate output JSON
object to stdout. Stripped from ts-bench-test by infra/strip-for-testing.sh.
"""

from __future__ import annotations

import json
import sys


class SuffixAutomaton:
    """Online suffix automaton over arbitrary characters (dict transitions).

    States are integers; state 0 is the initial state. Each state carries
    `len` (longest endpos-equivalent string ending here) and `link`
    (suffix link, −1 only for the initial state). Transitions are stored
    as `dict[char, state_id]` per state so the alphabet is unbounded.
    """

    __slots__ = ("len_", "link", "trans", "last")

    def __init__(self) -> None:
        # state 0 = initial; len=0, link=-1, no transitions.
        self.len_:  list[int] = [0]
        self.link:  list[int] = [-1]
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

    # ── queries ─────────────────────────────────────────────────────────────

    def num_states(self) -> int:
        return len(self.len_)

    def num_distinct_substrings(self) -> int:
        # Σ (len[v] − len[link[v]])  over v ≠ initial.
        total = 0
        for v in range(1, len(self.len_)):
            total += self.len_[v] - self.len_[self.link[v]]
        return total

    def lcs(self, t: str) -> int:
        v, length, best = 0, 0, 0
        for c in t:
            while v != 0 and c not in self.trans[v]:
                v = self.link[v]
                length = self.len_[v]
            if c in self.trans[v]:
                v = self.trans[v][c]
                length += 1
            if length > best:
                best = length
        return best


def build(s: str) -> SuffixAutomaton:
    sam = SuffixAutomaton()
    for c in s:
        sam.extend(c)
    return sam


def sam_reference(payload: dict) -> dict:
    s = payload["s"]
    t = payload.get("t", "") or ""
    if not isinstance(s, str) or not isinstance(t, str):
        raise ValueError("s and t must be strings")
    sam = build(s)
    return {
        "num_states":              sam.num_states(),
        "num_distinct_substrings": str(sam.num_distinct_substrings()),
        "lcs_length":              sam.lcs(t) if t else 0,
    }


def main() -> None:
    payload = json.load(sys.stdin)
    out = sam_reference(payload)
    json.dump(out, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
