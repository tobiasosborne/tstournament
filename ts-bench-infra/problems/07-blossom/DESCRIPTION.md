# Problem 7 — Edmonds' Blossom Algorithm (max-weight matching, general graphs)

## What to implement

Given an undirected, vertex-numbered, weighted graph
`G = (V, E, w)` with `V = {0, …, n−1}` and **real-valued (signed)**
weights, return a maximum-weight matching: a set `M ⊆ E` of pairwise
vertex-disjoint edges maximising `Σ_{e ∈ M} w(e)`.

The matching is **not required to be perfect**: vertices may be left
unmatched, and a negative-weight edge should never be included unless
forced by the spec — but the spec is "max-weight", so a free vertex is
always at least as good as a forced negative edge.

The construction algorithm is **Edmonds' blossom algorithm** (Edmonds
1965 + the classical extension to weighted graphs via dual variables and
blossom shrinking; see Galil 1986 for the unified treatment).

## I/O contract (JSON)

### Input

```jsonc
{
  "n":     <int, ≥ 0>,
  "edges": [[<int u>, <int v>, "<int weight>"], …]
}
```

- Edges are undirected; `[u, v, w]` and `[v, u, w]` denote the same edge.
- Self-loops (`u == v`) are ignored — the verifier will not feed them.
- Parallel edges: if both `[u, v, w₁]` and `[u, v, w₂]` appear, only one
  is used in the matching; the agent should treat the input as a multiset
  but use `max(w_1, w_2)` if convenient. The verifier collapses parallel
  edges by maximum weight before scoring.
- Weights are signed decimal-string integers.

### Output

```jsonc
{
  "matching":     [[<int u>, <int v>], …],   // pairs, disjoint endpoints
  "total_weight": "<int>"
}
```

`matching` is a list of edges; each pair is a vertex-disjoint subset of
the input edges. `total_weight` is `Σ w(u, v)` over the matched pairs.

## Invariants the verifier checks

1. **Shape.** Two keys present, types correct; every matching pair has
   distinct endpoints in `[0, n)`; every matching pair appears in the
   input edge set (with the chosen weight at most the input weight).
2. **Disjoint endpoints.** No vertex appears in more than one matching
   pair.
3. **Total-weight consistent.** `total_weight` equals the sum of weights
   of the matching pairs (under the parallel-edge max-weight convention).
4. **Total-weight optimal.** `total_weight` equals the maximum-weight
   matching value computed independently inside the verifier.

The verifier does **not** require the matching itself to match the
reference's matching — graphs with ties admit multiple optimal matchings.

## Edge cases the test set covers

- `n = 0` (empty matching).
- `n = 1` (no edges; empty matching).
- `K_3` (triangle): pick the heaviest edge.
- `K_4` and `K_5` with distinct weights.
- `C_5` (odd cycle of length 5) — the classical blossom example;
  unweighted Bipartite-style augmenting paths fail here.
- `C_6`, `C_7`, `C_9` (odd cycles → blossoms).
- Trees (unique optimal matching by greedy on a leaf).
- Bipartite graphs (cross-check against assignment).
- Negative-weight edges (must be ignored when free vertices remain).
- Graphs where the optimum is non-perfect (an isolated vertex with no
  positive edge to anywhere).
- Random graphs at `n ∈ {8, 12, 14, 16}`.
- Stress at `n = 16` with edge probability ½.

The test set caps at **n ≤ 16**, the limit at which the verifier's
exact bitmask DP runs in milliseconds.

## What the agent does *not* implement

- No directed / bipartite-only special cases as a substitute (e.g.,
  Hungarian / Kuhn-Munkres). The `K_5` and `C_5` cases force
  general-graph treatment.
- No fractional / LP-relaxed matching.
- No Gabow's `O(V (E + V log V))` improvement (allowed but not required).
- No min-cost-perfect-matching / Kolmogorov Blossom V variant (the spec
  is max-weight, not min-cost-perfect).
