# test-4 — Formal review

**Trial:** Phase-3, problem 04 (Deterministic Schreier-Sims with Sims' filter).
**Model:** Claude Opus 4.7 (1M context), inherited via general-purpose subagent.
**Constraint:** pure-TS hard constraint (no `child_process`, no shellouts, no
external CAS/computer-algebra system, no native binaries, no non-JS WASM).
**Date:** 2026-04-27.
**Solution:** `test-4/04-schreier-sims/solution.ts` — 450 lines / 18 174 bytes / single file.

---

## 1. Verifier — independently re-run

Command: `verifiers/run_tests.sh 04-schreier-sims npx --yes tsx 04-schreier-sims/solution.ts`.

```
shape 22/22 · base_validity 22/22 · order_consistency 22/22 · order_correct 22/22 · membership_correct 22/22
all 22 cases green
```

Every per-case line printed `pass`. Wall-clock 0m40s real / 0m34s user
(again dominated by `npx tsx`'s 22× cold-start; the algorithm itself is
sub-millisecond per case). The agent's self-reported per-check totals
match the harness output exactly.

Coverage walk: trivial group `{e}` at degree 5 (forces the empty-base
acceptance); cyclic `Z_n` at `n ∈ {5, 10, 30}` (the chain-of-length-1
sanity); dihedral `D_2n` at `2n ∈ {8, 12, 20}` (two-generator
non-abelian warm-ups, where the second generator forces a base
extension); symmetric `S_n` at `n ∈ {3, 4, 5, 6, 8}` (testing `|G| =
n!` exactly via `∏ |U_i|`); alternating `A_n` at `n ∈ {4, 5, 6, 7}`
(the index-2 subgroup distinction — getting a valid sift wrong by a
factor of two is the canonical bug here); and the Mathieu groups
`M_11` (degree 11, order 7920) and `M_12` (degree 12, order 95040)
built from their classical generators — these are the load-bearing
correctness signals for any deterministic SS implementation, since
they exercise the multi-level Sims filter on a non-imprimitive sporadic
group with a 5-element base. Then four additional `_more_queries`
batches at the same groups exercise the membership-strip path against
larger query lists. Every check is structural-or-independent: the order
is verified against the verifier's own SymPy `PermutationGroup.order()`
reference, membership against the verifier's reference sift, and the
order-vs-transversals cross-check (`prod(transversal_sizes) ==
int(order)`) is a structural invariant the BSGS must satisfy regardless
of which base was chosen.

## 2. Constraint audit

```
grep -nE 'child_process|spawn|spawnSync|exec\(|execSync|execFile|fork\(|node:child_process|python|sympy|wolfram|maxima|pari|gap|magma|wasm|webassembly' 04-schreier-sims/solution.ts
```

One hit — line 80, inside the header docblock's HARD CONSTRAINT
compliance paragraph:

> `* 100% TypeScript, stdlib only. No child_process, no spawn, no exec, no`

This is the negation, not a usage. Legitimate.

Imports: a single `import { readFileSync } from "node:fs"`. No
`package.json`, no `node_modules`, no transitive deps. Hand-rolled
permutation primitives, hand-rolled BSGS class, hand-rolled sift,
hand-rolled Sims-filter sweep — every layer of the algorithm is in
the file.

## 3. Scorecard

| Dimension                          | Grade | Evidence |
|---|---|---|
| Correctness (verifier)             | **A+** | 22/22 across all 5 checks, independently re-run; passes the M_11 / M_12 sporadic-group cases (the load-bearing test inputs) and the four `_more_queries` membership-stress batches. |
| Constraint compliance              | **A+** | Single grep hit is the self-declarative negation comment. No deps, no shellout, no native code, no WASM, no CAS. |
| Algorithmic depth                  | **A+** | The full deterministic Sims-filter construction is implemented from scratch: a `BSGS` class with explicit per-level coset representatives and cached inverses (rather than a Schreier-vector encoding) — `O(k·n²)` storage that's negligible at these degrees but makes every sift step a flat `O(n)` array lookup with no Schreier-tree walk; a two-phase construction (Phase 1 installs each input generator at the shallowest level it moves, extending the base when a generator fixes everything; Phase 2 walks levels bottom-up enumerating Schreier generators `s_{p,x} = u_p · x · u_{x[p]}^{-1}`, sifts each through the current chain, and on the first non-trivial residue installs it via Phase 1's rule and restarts the bottom-up scan); the classical iterative strip in `sift`; the `firstMovedPoint` base-extension policy (Holt-Eick-O'Brien Algorithm 4.43); and BigInt for the order arithmetic. The agent reports M_12 producing a 5-element base and M_11 a 4-element base — both are the canonical short bases for those groups, which is the textbook sanity check that the filter is doing its job rather than inflating the chain. |
| Code quality                       | **A**  | Single 450-line file, nine clearly delineated sections in source order — header docblock; types & I/O; permutation primitives; `Level` interface + `BSGS` class; standalone `sift`; `schreierSimsConstruct` plus `installGenerator` and `closeLevelUnderSchreier`; `contains`; the top-level `schreierSims` driver; `main`. Section markers verified by grep against the architectural self-report. The header docblock alone (lines 1-84) is a small textbook chapter on the algorithm — it pins the composition convention with the explicit `(p·q)[i] = q[p[i]]` formula and writes out *why* that matches SymPy's array-form Permutation multiplication, names every invariant the BSGS maintains per level, and states the termination argument (each insertion strictly increases `∏ |U_i|`, bounded by `n!`). Doc comments at every method name the *invariant* maintained (the `compose` comment derives the strip formula `h · u^{-1}` from first principles in one line). Types are honest: `Perm = number[]`, `Level` interface for the per-level state, BigInt only at the order boundary. No dead code, no commented-out scaffolding, no TODOs. |
| Group-theoretic correctness / arithmetic stability | **A** | The agent navigated the two pieces of this problem that *actually* trip implementations. (i) The composition convention is fixed at the top and consistent everywhere downstream — the dihedral / alternating / Mathieu cases are exactly the inputs that catch a flipped convention (you get half the right order, or worse a non-group), and they all pass. (ii) Phase-1 input-generator installation uses input generators directly rather than sifting them — the agent explicitly notes in §4 of its report that sifting input gens is the canonical-but-wrong shortcut here, because input gens are needed verbatim to span `G^(0)` itself. The "extend the base when a generator fixes the whole current base" path is explicit and tested: any input set whose elements all happen to fix `[0..k-1]` would otherwise silently produce a too-short chain. BigInt for the order is the spec-compliant choice; the sporadic-test fits in 2⁵³ but using BigInt from the start is robust without cost. The one weakness flagged honestly: defensive `slice()` copies in `sift` aren't strictly necessary but guard against caller mutation. |
| Honesty of self-report             | **A+** | Per-check totals reproduced exactly (`shape · base_validity · order_consistency · order_correct · membership_correct`, all 22/22). Architecture description matches source order 1:1: nine claimed sections, all in the named order, with the `BSGS` class containing exactly the three claimed methods and `schreierSimsConstruct` exactly the two claimed helpers. Resource log within tolerance (40s wall, sub-ms per case). The "Stated limitations" section names five real weaknesses (per-call array allocations, redundant bottom-up sweep restart, untested degrees > 12 / orders > 2⁵³, `O(|gens|·n)` duplicate-check, non-essential `slice` copies in `sift`). The "Alternatives considered and rejected" section names four real alternatives — randomised SS, Schreier-vector transversal, sifting input gens (the canonical bug), Holt's shallow Schreier trees — each with the right reason. No sandbagging, no false modesty, no over-claiming. |
| Engineering judgment               | **A+** | Choosing explicit coset reps over Schreier vectors at these degrees is the right call: Schreier vectors save memory at scale but incur a tree walk on every sift step; at `n ≤ 12, k ≤ 5` the explicit-rep branch is shorter, faster, and easier to read, and the agent argues the trade-off explicitly. The bottom-up Schreier-generator sweep is the textbook closure proof — a clean pass that finds no non-trivial residue *is* the proof of completeness, and structuring the loop that way means termination is obvious by inspection rather than requiring a depth-of-recursion argument. Picking `firstMovedPoint` as the deterministic base-extension policy (rather than e.g. the largest moved point or a randomised choice) yields the canonical short bases for the test groups (4 for M_11, 5 for M_12), so the SGS stays small. BigInt for the group order is governed by the spec, not by the bench, which is the right way to read the contract. The decision *not* to sift input generators in Phase 1 — explicit in both the code and the self-report — is exactly the place a less-careful implementation silently produces wrong orders on imprimitive inputs. |

## 4. Comparative tables

| Metric                     | This trial (test-4 SS) | Predecessor (test-3 SAM)        |
|---|---|---|
| Verifier                   | 22/22 (5 checks)       | 43/43 (4 checks)                |
| Wall-clock (agent)         | ~30m / 1.81M ms        | ~5m / 0.34M ms                  |
| Total tokens               | 119 323                | 45 308                          |
| Tool uses                  | 84                     | 18                              |
| Output                     | 450 lines / 18 174 B   | 244 lines / 9 632 B             |
| Estimated cost             | ~$2.0                  | ~$0.7                           |

| Metric                     | This trial (test-4 SS) | Reference (test-10 pure-TS Risch) |
|---|---|---|
| Verifier                   | 22/22 (5 checks)       | 18/18 (3 checks)                  |
| Wall-clock (agent)         | ~30m                   | 24m 59s                           |
| Total tokens               | 119 323                | ~159 000                          |
| Tool uses                  | 84                     | 79                                |
| Output                     | 450 lines / 18 174 B   | 2 265 lines / 86 178 B            |
| Estimated cost             | ~$2.0                  | ~$3.0                             |

`test-4` lands between `test-2` (NTT, 113k tokens, 48 tool uses, 417
lines) and `test-10` (Risch, 159k tokens, 79 tool uses, 2 265 lines) on
all the iteration metrics — and in fact is on the high side of tool
uses (84) for a single-trial run. That is informative: SAMs were
~training-distribution and the agent shipped in 18 tool uses;
Schreier-Sims required real iteration work (~84) despite producing
substantially less output (450 vs. 2 265 lines), which means most of
those tool uses were debugging passes, not output-volume passes. SS is
genuinely harder to get right than SAM at this degree, even though both
algorithms are in the canonical CP/CGT literature.

## 5. Methodology / benchmark-design observations

**Schreier-Sims is the strongest tier-discrimination probe in the suite
so far.** The four canonical bug surfaces — composition order
(left-to-right vs right-to-left), input-generator handling in Phase 1
(install verbatim vs sift), base-extension policy (when does the base
need to grow), and the Schreier-generator formula (`u_p · x ·
u_{x[p]}^{-1}` versus its inverse) — each silently produce *plausible*
output on small groups. `S_3` will look right under three of the four
common bugs; `D_8` and `D_12` filter another; only `M_11` and `M_12`
filter all of them simultaneously, because the Mathieu groups are
non-abelian, transitive, primitive, with multi-level chains and
non-trivial sift residues at every level. The agent's 84 tool uses
versus test-3's 18 reflect this: SS forces real sift-and-debug cycles
even at Opus 4.7, where SAM did not. For cross-model comparison this
makes test-4 *more* valuable than test-3 — Sonnet 4.6 and Haiku 4.5
will plausibly diverge on the Mathieu cases where they did not on
suffix automata.

**The pure-TS constraint does substantial work here.** Unlike
problem 03 (no canonical Python shortcut), problem 04 has a one-line
SymPy path (`from sympy.combinatorics import PermutationGroup; G =
PermutationGroup(*gens); G.order()`) that the verifier itself uses.
The constraint forecloses it, forcing the model to make the four
algorithmic choices listed above on its own merits. The forbidden-token
scrub on staged prose did its job (`[REDACTED]` survives in the prose
where the SymPy call was named); the agent reached for the
hand-rolled deterministic Sims-filter implementation rather than
silently shelling out, which is exactly what the benchmark is
measuring.

**Honesty calibration: five trials in a row of A+.** `test-1` (FFT),
`test-2` (NTT), `test-3` (SAM), `test-4` (SS), and the gold-standard
`test-10` (Risch) — all five have self-reported accurately on
per-check totals, source structure, and resource use. The honesty prior
is now well-established at Opus 4.7. Independent re-runs remain
mandatory regardless: the protocol's value is invariant to the prior.

**Recommendation for next trial.** Two reasonable paths. (a) March
forward to problem 05 (LLL, lattice basis reduction) — the next
problem in the canonical sweep, and the floating-point variant adds a
new failure mode (numerical stability) that none of `test-1..4` have
exercised. (b) Pivot to a Sonnet 4.6 cross-model probe on `test-4`
specifically — given that SS is the strongest discrimination probe in
the suite, the M_11 / M_12 cases are exactly where weaker models are
likely to produce wrong-but-plausible orders. The user's call. If the
plan tilts toward problem-coverage, do (a); toward
model-comparison, do (b) on `test-4` (or the previously-recommended
`test-2`-Sonnet, which is cheaper but less discriminative).
