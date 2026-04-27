# Verifier protocol — Problem 6, Stoer-Wagner

`verify.py` is self-contained. It implements its own Stoer-Wagner inside
the verifier so the candidate can be checked without depending on any
external graph library.

## Invocation

```
cat <case>.json | python3 verify.py
```

stdin shape:

```jsonc
{
  "input":     {"n": ..., "edges": [[u, v, "w"], ...]},
  "candidate": {"min_cut_value": "...", "partition_S": [...], "partition_T": [...]},
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
    "valid_partition":     {"pass": ..., "detail": "..."},
    "cut_value_consistent":{"pass": ..., "detail": "..."},
    "cut_value_correct":   {"pass": ..., "detail": "..."}
  }
}
```

Verifier exits 0 even on `pass: false`.

## The four checks

### 1. `shape`

`min_cut_value` is a decimal-integer string. `partition_S` and
`partition_T` are lists of distinct integers in `[0, n)`.

### 2. `valid_partition`

`S ∪ T = V`, `S ∩ T = ∅`, both non-empty for `n ≥ 2`. For `n = 1` we
accept `S = [0], T = []`. For `n = 0`, both are empty.

### 3. `cut_value_consistent`

The verifier independently sums `w(u, v)` over every input edge with
exactly one endpoint in `S` and one in `T`. This sum must equal the
claimed `min_cut_value`.

### 4. `cut_value_correct`

The claimed `min_cut_value` must equal the global minimum cut value
computed by an independent Stoer-Wagner inside the verifier.

The candidate's partition is **not required to match** the reference's
partition. Any partition achieving the optimal cut value is accepted —
graphs with multiple minimum cuts have multiple valid answers.

## Edge-case rationale

| ID                          | What it catches                                                  |
|-----------------------------|------------------------------------------------------------------|
| `trivial_n1`, `trivial_n2_*`| Base cases, including disconnected `n=2` (cut = 0)               |
| `K_n_unit`                  | Min cut of `K_n` = `n − 1`; tightest "every cut is the same"     |
| `cycle_n_unit`              | Min cut of `C_n` = 2 (any two non-adjacent edges)                |
| `path_5_*`                  | Min cut = lightest edge                                          |
| `bridge_two_triangles`      | Bridge edge = 1 dominates; partition must split there            |
| `two_isolated_edges`        | Disconnected → min cut = 0                                       |
| `parallel_edges_n3`         | Parallel edges must sum                                          |
| `rand_*`                    | Random sparse + dense graphs                                     |
| `stress_n100`               | Performance + correctness at scale                               |
