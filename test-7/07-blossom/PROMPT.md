# Problem 7 — Edmonds' Blossom Algorithm (max-weight matching, general graphs)

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

Given an undirected, vertex-numbered, integer-weighted graph
`G = (V, E, w)` with `V = {0, …, n−1}`, return a **maximum-weight
matching**: a set `M ⊆ E` of pairwise vertex-disjoint edges maximising
`Σ_{e ∈ M} w(e)`.

The matching is not required to be perfect. Negative weights are
permitted in the input but should not be included in the matching unless
forced (and "max-weight" never forces a negative edge — leaving a vertex
unmatched is always at least as good).

The construction algorithm is **Edmonds' blossom algorithm** (Edmonds
1965; weighted version via dual variables and blossom shrinking; see
Galil 1986 for the unified treatment).

## I/O contract (JSON)

### Input (one JSON object on stdin)

```jsonc
{
  "n":     <int, ≥ 0>,
  "edges": [[<int u>, <int v>, "<int weight>"], ...]
}
```

Edges are undirected. Self-loops will not appear. Parallel edges may
appear; the verifier collapses them by maximum weight before scoring.

### Output (one JSON object on stdout)

```jsonc
{
  "matching":     [[<int u>, <int v>], ...],
  "total_weight": "<int>"
}
```

`matching` is a list of vertex-disjoint pairs from the input.
`total_weight` is the sum of their weights.

## Suggested TypeScript signature

```ts
type Edge      = [number, number, string];
type MatchPair = [number, number];

interface BlossomInput  { n: number; edges: Edge[]; }
interface BlossomOutput { matching: MatchPair[]; total_weight: string; }

function blossom(input: BlossomInput): BlossomOutput;
```

## Verifying your solution

`golden/verify.py` checks five properties: `shape`,
`disjoint_endpoints`, `matching_in_input`, `total_weight_consistent`,
`total_weight_optimal`. Multiple optimal matchings are accepted — only
the total weight must be optimal. See `golden/verifier_protocol.md`.

The verifier's optimality check uses a `2ⁿ`-state DP, capping the test
set at `n ≤ 16`. The agent's algorithm should still be `O(V³)` (the
spec is Edmonds), but the test sizes will not stress it asymptotically.

### Files

- `golden/inputs.json` — every test case.
- `golden/expected.json` — reference outputs.
- `golden/verify.py` — verifier.

### Exact shell command

```
infra/verifiers/run_tests.sh problems/07-blossom <your-cmd>
```

## Canonical phrasing (informational)

These short excerpts ground definitions and conventions. They are
**informational, not restrictive**.

> 1. *Berge's augmenting-path characterisation of maximum matching:*
>    "(Berge). A matching M in G is not of maximum cardinality if and
>    only if (G, M) contains an alternating path joining two exposed
>    vertices of M."
>    — `Edmonds_PathsTreesFlowers_CanadJMath_17_1965.pdf:p3`
> 2. *Blossom = odd circuit with one exposed vertex:*
>    "For each vertex b of an odd circuit B there is a unique maximum
>    matching of B which leaves b exposed. A blossom, B = B(M), in
>    (G, M) is an odd circuit in G for which M ∩ B is a maximum matching
>    in B with say vertex b exposed for M ∩ B."
>    — `Edmonds_PathsTreesFlowers_CanadJMath_17_1965.pdf:p6`
> 3. *Shrinking-preserves-augmentation (the blossom theorem):*
>    "Where B is the blossom of a flower F for (G, M), M is a maximum
>    matching of G if and only if M/B is a maximum matching of G/B."
>    — `Edmonds_PathsTreesFlowers_CanadJMath_17_1965.pdf:p7`
> 4. *Dual constraints / complementary slackness for the weighted
>    general-graph case (Galil's notation: uᵢ vertex duals, zₖ blossom
>    duals, πᵢⱼ slacks):*
>    "By duality, M has maximal weight if 7.0–7.3 hold:
>    7.0 For every i, j, and k, uᵢ, πᵢⱼ, zₖ ≥ 0.
>    7.1 (i, j) is matched ⇒ πᵢⱼ = 0.
>    7.2 i is single ⇒ uᵢ = 0."
>    — `Galil_MaxMatching_ACMCompSurv_18_1986.pdf:p14`

## What you must do

1. Conform to the JSON I/O contract above.
2. Run the verifier before declaring done:
   ```
   infra/verifiers/run_tests.sh problems/07-blossom <your-cmd>
   ```
3. In your final answer, report the verifier's per-check totals
   (e.g. `total_weight_optimal 23/23, disjoint_endpoints 23/23, …`).
4. Ship the implementation **you'd put your name on**.
