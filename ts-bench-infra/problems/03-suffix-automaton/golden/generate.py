"""Generate suffix-automaton golden master.

Cross-checks the reference SAM against brute-force computations for every
case with `max(|s|, |t|) ≤ 20`, asserting agreement before writing
inputs.json / expected.json. Seeded numpy.random.Generator.
"""

from __future__ import annotations

import json
import string
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "reference"))

from sam_reference import sam_reference, build  # noqa: E402

SEED = 20260426
ENCODING_VERSION = 1
ALPHABET = string.ascii_lowercase  # a-z, 26 letters


def brute_distinct_substrings(s: str) -> int:
    n = len(s)
    seen = set()
    for i in range(n):
        for j in range(i + 1, n + 1):
            seen.add(s[i:j])
    return len(seen)


def brute_lcs(s: str, t: str) -> int:
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
                if curr[j] > best:
                    best = curr[j]
            else:
                curr[j] = 0
        prev, curr = curr, prev
    return best


def random_string(rng: np.random.Generator, n: int, alphabet: str = ALPHABET) -> str:
    if n == 0:
        return ""
    idx = rng.integers(0, len(alphabet), size=n)
    return "".join(alphabet[int(i)] for i in idx)


def fibonacci_word(n: int) -> str:
    a, b = "a", "b"
    while len(b) < n:
        a, b = b, b + a
    return b[:n]


def make_case(case_id: str, s: str, t: str = ""):
    expected = sam_reference({"s": s, "t": t})
    inp = {"id": case_id, "input": {"s": s, "t": t}}
    exp = {"id": case_id, "expected": expected}
    return inp, exp


def main() -> None:
    rng = np.random.default_rng(SEED)
    cases: list[tuple[dict, dict]] = []

    # ── Hand-crafted edge cases ──────────────────────────────────────────────
    edges: list[tuple[str, str, str]] = []
    edges.append(("edge_empty",          "",            ""))
    edges.append(("edge_single_a",       "a",           ""))
    edges.append(("edge_two_aa",         "aa",          ""))
    edges.append(("edge_two_ab",         "ab",          ""))
    edges.append(("edge_three_aaa",      "aaa",         ""))
    edges.append(("edge_abracadabra",    "abracadabra", ""))
    edges.append(("edge_all_equal_10",   "a" * 10,      ""))
    edges.append(("edge_all_equal_50",   "a" * 50,      ""))
    edges.append(("edge_alphabet_first", "abcdefghij",  ""))
    edges.append(("edge_palindrome_8",   "abcddcba",    ""))

    # LCS edges
    edges.append(("lcs_empty_t",         "abracadabra", ""))
    edges.append(("lcs_self",            "abracadabra", "abracadabra"))
    edges.append(("lcs_disjoint_alpha",  "aaaa",        "bbbb"))
    edges.append(("lcs_simple",          "abcde",       "xyzcdefg"))
    edges.append(("lcs_one_char_match",  "axyz",        "byza"))
    edges.append(("lcs_full_overlap",    "abcdef",      "abcdef"))

    for cid, s, t in edges:
        cases.append(make_case(cid, s, t))

    # ── Small random (|s| ≤ 20) — fully brute-forceable ─────────────────────
    for i in range(15):
        n = int(rng.integers(1, 21))
        m = int(rng.integers(0, 21))
        s = random_string(rng, n)
        t = random_string(rng, m)
        cases.append(make_case(f"rand_small_{i}_n{n}_m{m}", s, t))

    # ── Medium random (|s| up to 200) ───────────────────────────────────────
    for i, n in enumerate([50, 100, 150, 200]):
        s = random_string(rng, n)
        t = random_string(rng, max(1, n // 2))
        cases.append(make_case(f"rand_medium_{i}_n{n}", s, t))

    # Binary alphabet at length 100 — adversarial for cloning.
    for i in range(3):
        s = random_string(rng, 100, alphabet="ab")
        t = random_string(rng, 50, alphabet="ab")
        cases.append(make_case(f"rand_binary_100_{i}", s, t))

    # Fibonacci word fragment.
    fib = fibonacci_word(150)
    cases.append(make_case("fibonacci_150", fib, fib[::-1]))

    # ── Large random (|s| ∈ {1000, 5000}) ───────────────────────────────────
    for i, n in enumerate([1000, 5000]):
        s = random_string(rng, n)
        t = random_string(rng, n // 4)
        cases.append(make_case(f"rand_large_{i}_n{n}", s, t))

    # ── Stress (|s| = 10000) ────────────────────────────────────────────────
    s_stress = random_string(rng, 10000)
    t_stress = random_string(rng, 5000)
    cases.append(make_case("stress_n10000_m5000", s_stress, t_stress))
    cases.append(make_case("stress_self_n10000", s_stress, s_stress))

    # ── Cross-check reference vs brute-force on every small case ────────────
    for inp, exp in cases:
        s = inp["input"]["s"]
        t = inp["input"]["t"]
        if max(len(s), len(t)) <= 20:
            sam = build(s)
            assert sam.num_distinct_substrings() == brute_distinct_substrings(s), (
                f"reference SAM disagrees with brute on case {inp['id']}: "
                f"sam={sam.num_distinct_substrings()}, "
                f"brute={brute_distinct_substrings(s)}"
            )
            assert sam.lcs(t) == brute_lcs(s, t), (
                f"reference SAM lcs disagrees with brute on case {inp['id']}: "
                f"sam={sam.lcs(t)}, brute={brute_lcs(s, t)}"
            )

    # ── Self-consistency on canonical edges ─────────────────────────────────
    sam_empty = build("")
    assert sam_empty.num_states() == 1
    assert sam_empty.num_distinct_substrings() == 0
    sam_a = build("a")
    assert sam_a.num_states() == 2
    assert sam_a.num_distinct_substrings() == 1

    inputs_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "03-suffix-automaton",
        "cases": [c[0] for c in cases],
    }
    expected_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "03-suffix-automaton",
        "cases": [c[1] for c in cases],
    }

    (HERE / "inputs.json").write_text(json.dumps(inputs_payload, indent=2) + "\n")
    (HERE / "expected.json").write_text(json.dumps(expected_payload, indent=2) + "\n")

    print(f"wrote {len(cases)} cases to inputs.json and expected.json")


if __name__ == "__main__":
    main()
