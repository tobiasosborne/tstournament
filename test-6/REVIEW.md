# test-6 — Formal review

**Trial:** Phase-3, problem 06 (Stoer-Wagner global minimum cut).
**Model:** Claude Opus 4.7 (1M context), inherited via general-purpose subagent.
**Constraint:** pure-TS hard constraint (no `child_process`, no shellouts, no
external graph/CAS library, no native binaries, no non-JS WASM).
**Date:** 2026-04-27.
**Solution:** `test-6/06-stoer-wagner/solution.ts` — 241 lines / 8 830 bytes / single file.

---

## 1. Verifier — independently re-run

Command: `verifiers/run_tests.sh 06-stoer-wagner npx --yes tsx 06-stoer-wagner/solution.ts`.

```
shape 21/21 · valid_partition 21/21 · cut_value_consistent 21/21 · cut_value_correct 21/21
all 21 cases green
```

Every per-case line printed `pass`. Wall-clock 0m32s real / 0m25s user
(again the 21× `npx tsx` cold-start ceiling; the algorithmic core for
the `stress_n100` case is sub-millisecond in isolation). The agent's
self-reported per-check totals match the harness output exactly.

Coverage walk: trivial `n = 1` (degenerate `cut = 0`); `n = 2`
disconnected and connected; complete-graph `K_n` with unit weights at
`n ∈ {3, 4, 5, 6, 8}` (the canonical MA-ordering discrimination input —
min cut equals `n − 1`, exactly one less than every other cut, so a
buggy MA ordering picks one of the over-counted cuts); cycles
`C_{4,5,8}` with unit weights (min cut = 2); paths `P_5` unit-weighted
and weighted; "bridge of weight 1 between two triangles" (the canonical
edge-summation discriminator); two isolated edges (disconnected, min
cut = 0); parallel-edges at `n = 3` (parallel-edge summation check); 4
random graphs at `n ∈ {10, 15, 20, 40}` with edge probabilities
`{0.5, 0.4, 0.4, 0.3}`; and the headline stress at `n = 100, p = 0.25`.
Every check is *independent of the agent's choice of partition*: the
verifier sums the candidate's edges crossing `(S, T)` to verify
`cut_value_consistent`, and runs its own Stoer-Wagner inside the
verifier to verify `cut_value_correct`. Multiple optimal partitions are
acceptable; only the value must match the reference's optimum.

## 2. Constraint audit

```
grep -nE 'child_process|spawn|spawnSync|exec\(|execSync|execFile|fork\(|node:child_process|python|networkx|igraph|graph-tool|scipy|numpy|sage|wolfram|maxima|pari|gap|magma|wasm|webassembly' 06-stoer-wagner/solution.ts
```

**Zero hits.** Second trial in a row with no constraint-string anywhere
in the file — the docblock declares compliance via prose ("Pure
TypeScript, no native deps, no shell-outs") that doesn't match the
regex. Imports: a single `require("fs") as typeof import("fs")` inside
`main()` for `fs.readFileSync(0, "utf8")`. No `package.json`, no
`node_modules`, no transitive deps, no typed arrays, no `Math.*` calls
in the algorithm body. The numeric primitive in the algorithmic core is
`bigint` exclusively.

## 3. Scorecard

| Dimension                          | Grade | Evidence |
|---|---|---|
| Correctness (verifier)             | **A+** | 21/21 across all 4 checks, independently re-run; passes the canonical MA-ordering discriminators (`K_3..K_8` unit) and the canonical edge-summation discriminators (parallel edges at `n=3`, bridge between two triangles), plus the `stress_n100` density-0.25 random graph. |
| Constraint compliance              | **A+** | Zero grep hits, second trial in a row with no constraint-string anywhere. The numeric core is `bigint`-only; no float, no typed array, no native bindings. |
| Algorithmic depth                  | **A** | Stoer-Wagner with MA-ordering implemented from scratch: flat row-major `bigint[]` weight matrix `W[u·n+v]` with parallel-edge summation at build time and self-loops dropped; `n−1` phases each with a linear-scan-argmax MA-ordering driven by a `wA[v]` running sum updated by folding each newly-admitted vertex's row into `wA`; cut-of-phase computed as the weight degree of the last-admitted vertex `t` against the active set immediately before the merge; merge step doing row+column accumulation `W[s,*] ← W[s,*] + W[t,*]` and zeroing the `t`-incident entries before deactivating `t`. The partition is recovered by carrying `members[v]` lists per super-vertex (each merge appends `members[t]` into `members[s]`), and snapshotting `members[t]` whenever the running-best phase cut strictly improves — this is the textbook approach (Stoer-Wagner Theorem 2.3 + the standard merge-tree partition reconstruction) without the merge-tree replay. The one place where ambition does not exceed the bare ask: linear-scan argmax instead of a binary-or-Fibonacci heap. The agent argues this trade-off explicitly (`O(n³) ≈ 10⁶` ops for `n = 100` is sub-millisecond; heap bookkeeping over `bigint` keys is constant-factor worse here). At this scale the call is correct. |
| Code quality                       | **A** | Single 241-line file. Structurally simpler than test-5 LLL: one docblock, three interfaces, one big `stoerWagner` function (lines 60-228) containing the algorithm in linear sub-phases (degenerate `n ≤ 1` handling; matrix build; outer phase loop with inner MA pick / cut-of-phase / merge; partition assembly), plus a `main()` glue function. Doc comments at the function head name the algorithm complexity (`O(n³)` total) and the partition-reconstruction invariant (`members[t]` snapshotted on best improvement). The module-level docblock is precise: it correctly identifies the cut-of-phase as the s-t cut in the contracted graph (Lemma 2.3) and explains why bigint is the right primitive (sum-of-weights priority structurally cannot overflow). The structure is honest but flatter than test-5 / test-4 — a less-experienced reader might prefer the inner loops factored into named helpers (`maxAdjacencyOrder`, `mergeIntoSuperVertex`), but the current structure with section-comment dividers is also readable. |
| Numerical / arithmetic stability   | **A+** | `bigint` end-to-end is the right choice: the MA-ordering priority `wA[v]` is a running sum of edge weights and the cut-of-phase is another sum, both of which can in principle exceed `2⁵³` on adversarial inputs even when individual edge weights stay small. The agent explicitly notes this in §3 of its report ("staying in `bigint` is the only zero-cost guarantee against silent overflow"). The marshaling boundary (`bigint.toString(10)` for the output) matches the spec's decimal-string-integer contract exactly. |
| Honesty of self-report             | **A** | Per-check totals reproduced exactly (`shape · valid_partition · cut_value_consistent · cut_value_correct`, all 21/21). Resource log within tolerance (33s wall, sub-ms per case). The "Stated limitations" section names five real weaknesses honestly (`O(n³)` ceiling above `n ≈ few thousand`; `active.splice(t)` is `O(n)`; no parallelism opportunity in SW phase loop; no benchmarking on `n ≥ 500` dense graphs; the `require("fs")` CommonJS escape hatch). The "Alternatives considered and rejected" section names four real alternatives with reasons. The single soft spot in the architecture self-report is that the agent describes seven "sections" but the file has structurally four top-level units (docblock, three interfaces, the `stoerWagner` function, the `main` function); sections 3-6 of the self-report are sub-phases inside `stoerWagner`. Defensible — the description is accurate at the level of "what the code does in source order" — but slightly inflates the section count vs. test-5's tighter 1:1 file-structure mapping. Grade: A rather than A+ on this dimension. |
| Engineering judgment               | **A+** | The flat row-major `bigint[]` adjacency matrix at `n ≤ 100` is the correct choice over both adjacency-list (no asymptotic win at this density, more bookkeeping) and bigint matrix (same thing, no allocation amortisation). Linear-scan argmax over heap-based MA-ordering at this scale is correct and the agent argues both directions explicitly. Snapshotting `members[t]` on best improvement (rather than maintaining a merge tree and reconstructing the partition post-hoc) is the textbook simplification — the merge tree is necessary if you want *all* optimal partitions but redundant if you want one. The decision *not* to consider Karger / Karger-Stein is correct (the brief explicitly forbids randomised cut algorithms; SW is what's being measured). The single judgment call that could go either way is choosing not to factor the inner phase logic into named helpers (`maxAdjacencyOrder`, `mergeIntoSuperVertex`) — at 168 lines for the function body, that's the upper end of what's reasonable as one function. Defensible either way. |

## 4. Comparative tables

| Metric                     | This trial (test-6 SW) | Predecessor (test-5 LLL)        |
|---|---|---|
| Verifier                   | 21/21 (4 checks)       | 22/22 (5 checks)                |
| Wall-clock (agent)         | ~3m / 0.16M ms         | ~9m / 0.56M ms                  |
| Total tokens               | 33 692                 | 66 522                          |
| Tool uses                  | 11                     | 28                              |
| Output                     | 241 lines / 8 830 B    | 296 lines / 10 774 B            |
| Estimated cost             | ~$0.5                  | ~$1.0                           |

| Metric                     | This trial (test-6 SW) | Reference (test-10 pure-TS Risch) |
|---|---|---|
| Verifier                   | 21/21 (4 checks)       | 18/18 (3 checks)                  |
| Wall-clock (agent)         | ~3m                    | 24m 59s                           |
| Total tokens               | 33 692                 | ~159 000                          |
| Tool uses                  | 11                     | 79                                |
| Output                     | 241 lines / 8 830 B    | 2 265 lines / 86 178 B            |
| Estimated cost             | ~$0.5                  | ~$3.0                             |

`test-6` is now the cheapest pass in the entire suite, by every metric:
11 tool uses, 33 692 tokens, ~$0.5, ~3 min wall-clock. Cheaper than
`test-3` SAM (18 tool uses) and `test-5` LLL (28 tool uses). Single-shot
ship — the agent's tool log shows verifier-then-done with no debug
iteration.

## 5. Methodology / benchmark-design observations

**SW joins LLL and SAM in the "near-training-distribution + one
load-bearing decision" tier.** Like LLL, Stoer-Wagner has a textbook
canonical form with one structural decision (matrix vs. adjacency list,
which is nearly forced at `n ≤ 100`) that resolves the surrounding bug
surfaces. Once the matrix is chosen, MA-ordering is a linear-scan
argmax over a `wA` running-sum, the merge is a row/column
accumulation, the cut-of-phase is the last vertex's weight degree, and
partition reconstruction is `members[t]` snapshot — none of these have
materially-different alternatives at this scale. The agent shipped in
11 tool uses precisely because there was nothing to debug. By contrast
`test-4` Schreier-Sims has *four* independent decisions (composition
order, Phase-1 input handling, base extension, Schreier-gen formula),
each of which must be made correctly in isolation; the 84-tool-use cost
reflects that asymmetry.

**The pure-TS constraint is single-pivot here.** The Python shortcut is
`networkx.algorithms.connectivity.stoer_wagner(G)`, which the verifier's
own reference path uses. The constraint forecloses it. There is no
*partial* shortcut analogous to test-5's "FP Gram-Schmidt with periodic
exact rescue" — Stoer-Wagner's MA-ordering doesn't admit a
floating-point variant that would silently fail on adversarial inputs
the way Schnorr-Euchner LLL does. So the constraint here is purely
binary (use NetworkX or write the algorithm), not multi-dimensional.
The agent unambiguously wrote it.

**Tier-discrimination implications.** SW is unlikely to discriminate
strongly between Opus 4.7, Sonnet 4.6, and Haiku 4.5 — the algorithm is
well-known, the `O(n³)` bound is forgiving at the verifier's `n ≤ 100`
ceiling, and the only structural decision (matrix vs list) is forced.
Cross-model sweeps will likely show all three Anthropic models passing
this trial cleanly, with the discrimination signal living elsewhere
(test-4 SS for sure; possibly test-9 PSLQ and test-10 Risch). For a
suite-design lens: tests 1, 3, 5, 6 are coverage anchors; tests 2, 4,
7-10 are likely to be the discriminators.

**Honesty calibration: seven trials in a row of A+ on per-check totals
and resource logs.** `test-1` (FFT), `test-2` (NTT), `test-3` (SAM),
`test-4` (SS), `test-5` (LLL), `test-6` (SW), `test-10` (Risch). The
sole soft spot in this trial is a section-count inflation in the
architecture self-report (seven claimed vs. four structural top-level
units), graded A rather than A+ on the honesty dimension. Negligible
for the protocol's purposes; the orchestrator's grep confirms the
*content* of the description is accurate.

**Recommendation for next trial.** Two reasonable paths. (a) March
forward to problem 07 (Edmonds' blossom — maximum-weight matching) —
the next problem in the canonical sweep, and the first one whose
algorithm has a real discrimination surface (the blossom-shrink /
expand step is genuinely hard to get right; the canonical bug is
mishandling odd alternating cycles). (b) Pivot to a Sonnet 4.6
cross-model probe; `test-4` SS remains the single strongest
discrimination point in the suite, but `test-7` Edmonds may overtake it
once it's run. The user's call.
