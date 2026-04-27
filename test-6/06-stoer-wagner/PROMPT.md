# Problem 6 — Stoer-Wagner Global Minimum Cut

## ⚠ How you will be graded

You will be graded on **QUALITY** and **CORRECTNESS**.

Produce the **most elegant, most efficient, most perfect, most impressive**
TypeScript implementation you can. This is a portfolio piece. The verifier
is a *floor*, not a ceiling — passing it is necessary but not sufficient.

**Dev time is infinite.** Take as long as you need. Use multiple sessions
if that helps. Refactor. Re-architect. Profile. Polish. **Prefer
multi-session quality over quick-fix janky band-aid shortcuts.** Do not
ship the first thing that passes the verifier — ship the version you'd put
your name on.

**How** you solve it is up to you: search the web, use libraries, port
from another language, copy patterns from prior art — whatever you'd do
normally. The JSON I/O contract is the only hard interface constraint.

## Problem statement

Given an undirected, vertex-numbered, **non-negatively-weighted** graph
`G = (V, E, w)` with `V = {0, …, n−1}`, compute a global minimum cut: a
partition `(S, V \ S)` minimising `Σ w(u, v)` over edges with one endpoint
in each side. The construction algorithm is **Stoer-Wagner**: `n − 1`
maximum-adjacency phases, each producing a "cut-of-phase" between the
last vertex `t` and the rest, with `t` then merged into the penultimate
vertex `s`. The minimum over phase cuts is the global minimum.

## I/O contract (JSON)

### Input (one JSON object on stdin)

```jsonc
{
  "n":     <int, ≥ 1>,
  "edges": [[<int u>, <int v>, "<int weight>"], ...]
}
```

Edges are undirected. Self-loops (`u == v`) are ignored — they will not
appear in the test set. Parallel edges are summed.

### Output (one JSON object on stdout)

```jsonc
{
  "min_cut_value": "<int>",
  "partition_S":   [<int>, ...],
  "partition_T":   [<int>, ...]
}
```

`partition_S ∪ partition_T = {0, …, n−1}`, disjoint, both non-empty for
`n ≥ 2`. For `n ≤ 1`, return `min_cut_value = "0"`,
`partition_S = [0]` (or `[]` if `n == 0`), `partition_T = []`.

## Suggested TypeScript signature

```ts
type Edge = [number, number, string];

interface SWInput  { n: number; edges: Edge[]; }
interface SWOutput {
  min_cut_value: string;
  partition_S:   number[];
  partition_T:   number[];
}

function stoerWagner(input: SWInput): SWOutput;
```

## Verifying your solution

`golden/verify.py` reads `{"input": ..., "candidate": ..., "id": ...}` on
stdin and emits four checks: `shape`, `valid_partition`,
`cut_value_consistent`, `cut_value_correct`. The candidate's partition is
**not required to match** the reference's partition — graphs with
multiple optimal cuts admit multiple correct answers. See
`golden/verifier_protocol.md`.

### Files

- `golden/inputs.json` — every test case.
- `golden/expected.json` — reference outputs.
- `golden/verify.py` — verifier.

### Exact shell command

```
infra/verifiers/run_tests.sh problems/06-stoer-wagner <your-cmd>
```

## Canonical phrasing (informational)

These short excerpts ground the algorithm. They are **informational, not
restrictive**.

> 1. *Maximum-adjacency ordering:*
>    "In each step, the vertex outside of A most tightly connected with A
>    is added."
>    — `Stoer_Wagner_SimpleMinCut_JACM_44_1997.pdf:p3`
> 2. *Cut-of-phase lemma:*
>    "Each cut-of-the-phase is a minimum s-t-cut in the current graph,
>    where s and t are the two vertices added last in the phase."
>    — `Stoer_Wagner_SimpleMinCut_JACM_44_1997.pdf:p3`
> 3. *Merge step:*
>    "At the end of each such phase, the two vertices added last are
>    merged, that is, the two vertices are replaced by a new vertex, and
>    any edges from the two vertices to a remaining vertex are replaced
>    by an edge weighted by the sum of the weights of the previous two
>    edges."
>    — `Stoer_Wagner_SimpleMinCut_JACM_44_1997.pdf:p3`

## What you must do

1. Conform to the JSON I/O contract above.
2. Run the verifier before declaring done:
   ```
   infra/verifiers/run_tests.sh problems/06-stoer-wagner <your-cmd>
   ```
3. In your final answer, report the verifier's per-check totals
   (e.g. `cut_value_correct 21/21, valid_partition 21/21, …`).
4. Ship the implementation **you'd put your name on**, not the first
   thing that passes.
