# Verifier protocol — Problem 3, suffix automaton

`verify.py` is self-contained. It computes ground truth two different ways
depending on input size: brute force for small `|s|` (and `|t|`), an
inlined reference SAM for everything else.

## Invocation

```
cat <case>.json | python3 verify.py
```

with stdin shaped as

```jsonc
{
  "input":     {"s": "...", "t": "..."},
  "candidate": {"num_states": ..., "num_distinct_substrings": "...", "lcs_length": ...},
  "id":        "<case id>"
}
```

stdout:

```jsonc
{
  "pass":   true,
  "reason": "all invariants hold",
  "checks": {
    "shape":               {"pass": ..., "detail": "..."},
    "num_states_bound":    {"pass": ..., "detail": "..."},
    "distinct_substrings": {"pass": ..., "detail": "..."},
    "lcs_length":          {"pass": ..., "detail": "..."}
  }
}
```

Verifier exits 0 even on `pass: false`; non-zero exit is a verifier crash.

## The four checks

### 1. `shape`

Output must be a JSON object with exactly the keys
`num_states` (int), `num_distinct_substrings` (decimal string), and
`lcs_length` (int). `num_distinct_substrings` is parsed as an integer; a
negative value or non-numeric string fails this check. Booleans masquerading
as ints are rejected.

### 2. `num_states_bound`

The total number of SAM states (initial state included) satisfies

- `1 ≤ num_states ≤ 2` for `|s| ≤ 1`,
- `1 ≤ num_states ≤ 2|s| − 1` for `|s| ≥ 2`.

A candidate that returns the right counts but reports an inconsistent
state count fails this. (The bound is a structural property of the SAM,
useful as a sanity check independent of correctness.)

### 3. `distinct_substrings`

For `|s| ≤ 20`, the verifier enumerates every substring into a Python
`set` and compares the cardinality. For `|s| > 20`, the verifier
constructs its own SAM and computes the count via the standard
`Σ (len[v] − len[link[v]])` identity.

### 4. `lcs_length`

For `t == ""`, the truth is `0`. For `max(|s|, |t|) ≤ 20`, the verifier
runs the literal `O(|s||t|)` LCS DP. Above that, it walks `t` through its
own SAM of `s`.

## What is *not* checked

- The internal state representation, transition encoding, or whether the
  agent's construction is online vs. batch. The verifier only sees the
  three return values.
- Construction time complexity. The harness will time out only if the
  process is unreasonably slow at the stress sizes.

## Edge-case rationale

| ID                          | What it catches                                                  |
|-----------------------------|------------------------------------------------------------------|
| `edge_empty`                | Initial-state-only base case                                     |
| `edge_single_a`             | Length-1 SAM has exactly 2 states                                |
| `edge_two_aa`               | Cloning is *not* triggered at `aa`; len/link only                |
| `edge_three_aaa`            | Suffix-link chain forms a path                                   |
| `edge_all_equal_50`         | Pathological linear chain                                        |
| `edge_alphabet_first`       | Distinct-character path exercises wide transition tables         |
| `edge_palindrome_8`         | Cloning fires several times                                      |
| `lcs_empty_t`               | Boundary: empty `t` returns `0`                                  |
| `lcs_self`                  | `lcs(s, s) == |s|`                                               |
| `lcs_disjoint_alpha`        | No common character ⇒ `lcs == 0`                                 |
| `fibonacci_150`             | Adversarial cloning growth pattern                               |
| `rand_binary_*`             | Small alphabet maximises clone frequency                         |
| `stress_n10000_*`           | Performance + correctness at scale                               |
