# Reference implementation — Problem 3, suffix automaton

> **STRIPPED.** This file (and the rest of `reference/`) is removed by
> `infra/strip-for-testing.sh`.

`sam_reference.py` is a Python port of the standard online SAM
construction (Blumer et al. 1985) using the `link, len` representation
that competitive-programming sources (CP-Algorithms, KACTL, jiangly's
`competitive-programming-library`) all converge on.

## Cross-check

`golden/generate.py` cross-checks the reference's two non-trivial outputs
against brute-force ground truth for `|s| ≤ 20`:

- `num_distinct_substrings` against the literal set of all substrings.
- `lcs_length` against the `O(|s|·|t|)` DP on a `(|s|+1) × (|t|+1)` table.

These cross-checks fire on every regeneration; a regression in the
reference would fail loudly before any case is emitted.

## Generating the golden master

```
python3 problems/03-suffix-automaton/golden/generate.py
```
