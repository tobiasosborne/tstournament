# Verifier protocol — Problem 7, blossom

`verify.py` is self-contained. It uses an exact `O(2ⁿ · n)` bitmask DP
to compute the optimum, accepting any candidate matching that achieves
that optimum. The test set is therefore capped at `n ≤ 16` so the DP is
fast inside the verifier; this is a verifier limit, not a spec limit on
the agent's algorithm.

## Invocation

```
cat <case>.json | python3 verify.py
```

stdin shape:

```jsonc
{
  "input":     {"n": ..., "edges": [[u, v, "w"], ...]},
  "candidate": {"matching": [[u, v], ...], "total_weight": "..."},
  "id":        "<case id>"
}
```

stdout:

```jsonc
{
  "pass":   true,
  "reason": "all invariants hold",
  "checks": {
    "shape":                   {"pass": ..., "detail": "..."},
    "disjoint_endpoints":      {"pass": ..., "detail": "..."},
    "matching_in_input":       {"pass": ..., "detail": "..."},
    "total_weight_consistent": {"pass": ..., "detail": "..."},
    "total_weight_optimal":    {"pass": ..., "detail": "..."}
  }
}
```

## The five checks

### 1. `shape`

Output is an object with `matching` (list of `[u, v]` integer pairs in
`[0, n)` with `u ≠ v`) and `total_weight` (decimal-integer string).

### 2. `disjoint_endpoints`

No vertex appears in more than one matching pair.

### 3. `matching_in_input`

Every matching pair `(u, v)` is an edge of the input graph (after
collapsing parallel edges by maximum weight).

### 4. `total_weight_consistent`

`total_weight` equals the sum of the chosen edges' weights, where
parallel input edges are collapsed by maximum weight.

### 5. `total_weight_optimal`

The verifier independently runs the bitmask DP on the input and asserts
the candidate's `total_weight` equals the optimum. Multiple optimal
matchings are accepted — only the value is pinned.

## What is *not* checked

- The candidate's matching set is not compared to the reference's
  matching set. Many graphs have ties; any optimal matching is accepted.
- The agent's algorithm is invisible to the verifier. The bitmask DP is
  a *correctness* oracle, not a complexity expectation — implementing
  Edmonds' blossom algorithm is the spec, and the agent should strive
  for `O(V³)` or better even though the test sizes do not force it.

## Edge-case rationale

| ID                          | What it catches                                           |
|-----------------------------|-----------------------------------------------------------|
| `trivial_n0`, `trivial_n1`  | Empty matching base cases                                 |
| `single_edge`               | Trivial inclusion                                         |
| `triangle_*`                | Pick the heaviest edge in `K_3`                           |
| `C5_*`, `C7_unit`, `C9_unit`| Odd cycles — bipartite augmenting paths fail; **blossom required** |
| `star_4_leaves`             | Trees: greedy on leaves                                   |
| `K{n}_distinct`             | Cliques with non-uniform weights                          |
| `C4_with_negatives`         | Negative weights must be skipped when free vertices remain|
| `bipartite_4x4_dense`       | Bipartite cross-checked against `linear_sum_assignment`   |
| `rand_*_n16_*`              | Larger random graphs at the verifier's DP cap             |
