# Verifier protocol — Problem 4, Schreier-Sims

`verify.py` builds the reference group from the input generators and
checks every claim in the candidate output against it.

## Invocation

```
cat <case>.json | python3 verify.py
```

with stdin shaped as

```jsonc
{
  "input":     {"degree": ..., "generators": [...], "membership_queries": [...]},
  "candidate": {"base": [...], "strong_generators": [...],
                "transversal_sizes": [...], "order": "...",
                "membership_results": [...]},
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
    "base_validity":       {"pass": ..., "detail": "..."},
    "order_consistency":   {"pass": ..., "detail": "..."},
    "order_correct":       {"pass": ..., "detail": "..."},
    "membership_correct":  {"pass": ..., "detail": "..."}
  }
}
```

Verifier exits 0 even on `pass: false`.

## The five checks

### 1. `shape`

Output is an object with exactly the five expected keys; every
permutation listed under `strong_generators` and every entry of
`membership_queries` parsed as a permutation must be a valid permutation
of `degree` (length `degree`, values distinct in `[0, degree)`); `order`
parses as a positive decimal integer; `membership_results` is a list of
booleans of the same length as the input queries.

### 2. `base_validity`

`base` consists of distinct integers in `[0, degree)`. The empty base is
accepted only when the reference order is `1`.

### 3. `order_consistency`

`len(transversal_sizes) == len(base)` and the product of
`transversal_sizes` equals the integer encoded by `order`. This is the
orbit-stabiliser identity `|G| = ∏ |U_i|` and pins the structural
correctness of the BSGS as reported.

### 4. `order_correct`

The integer `order` equals the reference's group order computed
independently from the same generators.

### 5. `membership_correct`

For every query permutation, the candidate's boolean equals the
reference's `contains(p)` decision.

## What is *not* checked

- The base itself is **not compared** to the reference base. Different
  bases are valid for the same group; only the order, the per-level
  transversal sizes (multiplicatively), and the membership decisions
  are pinned.
- The strong generating set is checked structurally (each element is a
  permutation of `degree`) but not by re-deriving the BSGS from it. The
  order and order-consistency checks together rule out a "wrong SGS,
  right order" scenario where the SGS does not actually generate `G`.

## Edge-case rationale

| ID                | What it catches                                                    |
|-------------------|--------------------------------------------------------------------|
| `trivial_d5`      | Empty base permitted iff `|G| = 1`                                 |
| `Z_n`             | Cyclic groups: single non-trivial transversal                      |
| `D_*`             | Dihedral generators have a reflection — agent must close under it  |
| `S_n`             | Order `n!` — sift / Sims-filter must produce `n−1` non-trivial levels |
| `A_n`             | `n!/2` — sign of the permutations must be respected                |
| `M_11`, `M_12`    | Sporadic finite simple groups — known orders 7920, 95040; classical|
|                   | tests of any Schreier-Sims implementation                          |
| `*_more_queries`  | More aggressive membership testing for the larger groups           |
