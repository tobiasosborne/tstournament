# Problem 6 — Stoer-Wagner Global Minimum Cut

## What to implement

Given an undirected, vertex-numbered, **non-negatively-weighted** graph
`G = (V, E, w)` with `V = {0, 1, …, n−1}`, compute a global minimum cut:
the partition `(S, V \ S)` with `S, V \ S` both non-empty that minimises

```
cut(S)  =  Σ_{u∈S, v∉S, {u,v}∈E} w(u, v).
```

The construction algorithm is **Stoer-Wagner 1997** — `n − 1` "minimum cut
phases" (each is a maximum-adjacency / "MA" ordering producing a cut-of-
phase), with the last two vertices of each phase merged before the next
phase. The phase cut is recorded; the global minimum is the smallest
phase cut over all `n − 1` phases.

## I/O contract (JSON)

### Input

```jsonc
{
  "n":     <int, ≥ 1>,
  "edges": [[<int u>, <int v>, "<int weight>"], …]
}
```

- Edges are undirected: `[u, v, w]` and `[v, u, w]` denote the same edge.
- Self-loops (`u == v`) are ignored by Stoer-Wagner — the verifier
  accepts them in the input but does not feed them.
- Parallel edges are summed.
- Weights are non-negative decimal-string integers.

### Output

```jsonc
{
  "min_cut_value": "<int>",
  "partition_S":   [<int>, …],
  "partition_T":   [<int>, …]
}
```

`partition_S` and `partition_T` are disjoint, exhaustive, both non-empty
(when `n ≥ 2`). Their union is `{0, …, n−1}`. `min_cut_value` is the
total weight of edges crossing the partition.

For `n ≤ 1`, return `min_cut_value = "0"`, `partition_S = [0]` (or `[]`
if `n == 0`), `partition_T = []`.

## Invariants the verifier checks

1. **Shape.** Three keys present, types correct, partitions are lists of
   integers in `[0, n)`.
2. **Valid partition.** `S ∪ T = V`, `S ∩ T = ∅`, `|S|, |T| ≥ 1` when
   `n ≥ 2`.
3. **Cut value consistent.** `min_cut_value` equals the sum of edge
   weights crossing the candidate partition (computed independently from
   the input edges).
4. **Cut value correct.** `min_cut_value` equals the reference's global
   minimum cut value computed independently by Stoer-Wagner inside the
   verifier.

The verifier does **not** require the candidate's partition to match the
reference's partition: for some graphs the minimum cut is non-unique and
multiple partitions achieve the same cut value. Only the value must be
optimal; the partition must merely *achieve* that value.

## Edge cases the test set covers

- `n = 1`, `n = 2` trivial cases.
- Tree (cut = lightest edge).
- Cycle (`n` vertices, all edges weight 1) — min cut = 2.
- Complete graph `K_n` with unit weights, `n ∈ {3, 4, 5, 6, 8}`.
- Disconnected graph (min cut = 0).
- Graph with one bridge of weight `1` between two cliques.
- Graphs with parallel edges (summed weights).
- Random graphs at `n ∈ {10, 20, 40}` with edge probability ½ and
  weights from `[1, 50]`.
- Stress at `n = 100` with edge probability ¼.

## What the agent does *not* implement

- No directed minimum cut (Ford-Fulkerson / Dinic / Push-relabel).
- No `s, t` minimum cut variant.
- No Karger / Karger-Stein randomised cut.
- No multiterminal (Gomory-Hu) cuts.
- No support for negative weights.
