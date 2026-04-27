# test-5 — Formal review

**Trial:** Phase-3, problem 05 (LLL lattice reduction, exact rationals, δ = 3/4).
**Model:** Claude Opus 4.7 (1M context), inherited via general-purpose subagent.
**Constraint:** pure-TS hard constraint (no `child_process`, no shellouts, no
external CAS/lattice library, no native binaries, no non-JS WASM, **no
floating point in the inner loop**).
**Date:** 2026-04-27.
**Solution:** `test-5/05-lll/solution.ts` — 296 lines / 10 774 bytes / single file.

---

## 1. Verifier — independently re-run

Command: `verifiers/run_tests.sh 05-lll npx --yes tsx 05-lll/solution.ts`.

```
shape 22/22 · same_lattice 22/22 · size_reduction 22/22 · lovasz 22/22 · det_preserved 22/22
all 22 cases green
```

Every per-case line printed `pass`. Wall-clock 0m35s real / 0m30s user
(the 22× `npx tsx` cold-start ceiling, again; the algorithm itself is
sub-millisecond per case including the n=12 / d=12 / 30-bit-entry
stress case). The agent's self-reported per-check totals match the
harness output exactly.

Coverage walk: `n = 1` single-row already-reduced base; `n ∈ {2, 3}`
identity bases (idempotency check); `n = 2` textbook
`((1,1),(1,2))`-style examples and a skew variant; `n = 3` classic
already-reduced and a near-dependent base (LLL must still split the
dependency); 8 random small bases at `n ∈ {3, 4, 5, 6}` with
`|entries| ≤ 50`; 3 random medium at `n ∈ {5, 6, 8}`; two
"planted-short" bases at `n ∈ {4, 6}` (where LLL's approximation
factor must recover a planted short vector — the canonical
discrimination input for any lattice-reduction implementation); and
the headline stress case at `n = 12, d = 12, |entries| ≤ 2³⁰` which
forces real multi-precision in the inner loop. Every check is
*independent of the agent's choice of reduced basis*: the verifier
computes Hermite normal form for `same_lattice`, computes `μ_{i,j}` in
exact `ℚ` for `size_reduction` and `lovasz`, and computes
`det(B′ B′ᵀ)` for `det_preserved`. Multiple LLL-reduced bases are
valid for the same lattice and the verifier accepts any of them.

## 2. Constraint audit

```
grep -nE 'child_process|spawn|spawnSync|exec\(|execSync|execFile|fork\(|node:child_process|python|sympy|numpy|sage|wolfram|maxima|pari|gap|magma|fpylll|fplll|wasm|webassembly|Math\.fround|Float64Array|Float32Array' 05-lll/solution.ts
```

**Zero hits.** No constraint-string anywhere — not even in a negation
comment, which is unusual: every prior Phase-3 trial (`test-1`,
`test-2`, `test-3`, `test-4`) had a single docblock-negation hit ("no
child_process, no shellouts…"). The agent declared compliance via
indirect prose instead ("no rationals, no floats, no GCDs in the hot
loop"), which doesn't match the regex but is equally clear in context.

Imports: a single `require("fs")` inside `main()` for
`fs.readFileSync(0, "utf8")`. No `package.json`, no `node_modules`, no
transitive deps. The numeric primitive in the algorithmic core is
`bigint` exclusively — no `Number`, no typed arrays, no `Math.*`. This
is the strictest pure-integer pass in the suite so far.

## 3. Scorecard

| Dimension                          | Grade | Evidence |
|---|---|---|
| Correctness (verifier)             | **A+** | 22/22 across all 5 checks, independently re-run; passes the n=12 / d=12 / 30-bit-entry stress case (the load-bearing multi-precision test) and both `planted_short_*` cases (where LLL's approximation factor must actually reduce). |
| Constraint compliance              | **A+** | Zero grep hits — no constraint-string anywhere in the file, including in negation comments. The numeric core uses only `bigint`; no `Float64Array`, no `Math.fround`, no float anywhere. The strictest constraint pass of any trial in the suite. |
| Algorithmic depth                  | **A+** | Cohen §2.6 integer LLL implemented from scratch, with the canonical lattice-determinant-scaled storage: `d_i = ∏_{k<i} ‖b*_k‖²` (positive integer, the squared lattice determinant of the first `i` rows; `d_0 = 1`) and `λ_{i,j}` such that `μ_{i,j} = λ_{i,j}/d_{j+1}`. By Sylvester's identity every recurrence is exact integer arithmetic — no GCDs, no rationals, no floats. The size-reduction primitive `redi(k, ℓ)` descends `j` from `i−1` to `0` (the only correct order, since reducing against `j+1` introduces λ-changes at `j` that the descending pass picks up). The swap primitive uses Cohen's integer recurrence (`B = (D_{k−1}·D_{k+1} + λ²)/D_k`, then per-row `λ_{i,k} / λ_{i,k−1}` updates) — `O(n)` bigint ops per swap rather than the `O(n³)` GS recompute. The Lovász test is rearranged to a single integer comparison `δ_den · (D_{k−1}·D_{k+1} + λ²) ≥ δ_num · D_k²`, derived inline so the reader can audit the algebra without reaching for a textbook. |
| Code quality                       | **A+** | Single 296-line file, six clearly delineated sections in source order — header docblock; I/O contract; bigint helpers (`babs`, `nearestInt`, `dot`); `lllReduce` with embedded `recomputeRow` / `redi` / `swap` / main `k`-walk; `lll` JSON adapter; `main`. Section markers verified against the architectural self-report. The header docblock alone (lines 1–26) is a small textbook entry on the algorithm — names the storage convention, cites Cohen Lemma 2.6.2 / Pohst-Zassenhaus, states the `O(n⁴ log B)` complexity bound. The `nearestInt` doc comment derives the `⌊(2p + q)/(2q)⌋` formula from first principles and notes the half-integer-tie rule is consistent. Doc comments at every method name the *invariant* the method maintains. Types are minimal and tight: `bigint` everywhere, plus the JSON-shape interfaces. No dead code, no commented-out scaffolding, no TODOs. The shortest pure-TS trial in the suite at this difficulty level (296 lines vs. test-2's 417, test-4's 450) — and that compactness is genuine algorithmic compression, not omission. |
| Numerical / arithmetic stability   | **A+** | This is the dimension LLL actually rewards, and the agent's choices are textbook-correct on every count. Storing `(d_i, λ_{i,j})` rather than rationals avoids per-step GCD reduction (the canonical-but-wrong shortcut for an exact LLL is `Q` rationals with periodic GCDs, which has the same operand sizes by Cohen Lemma 2.6.2 but pays the GCD cost on every step). The `nearestInt` rounding rule is explicitly half-integer-consistent and the doc comment names the tolerance the size-reduction step requires (`|p/q − round(p/q)| ≤ 1/2`). The Lovász comparison stays exact-integer by clearing denominators on both sides simultaneously — a less-careful implementation cross-multiplies in the wrong direction and drops a sign on negative `λ`. The bigint hot-loop has no silent-overflow surface (no `Number(x)` coercion, no `& 0xffffffff`, no shift past the 53-bit safe-integer ceiling). The headline stress at `n = d = 12, |entries| ≤ 2³⁰` forces operand sizes around 2³⁶⁰ in the inner products; bigint handles this trivially. |
| Honesty of self-report             | **A+** | Per-check totals reproduced exactly (`shape · same_lattice · size_reduction · lovasz · det_preserved`, all 22/22). Architecture description matches source order 1:1 (six sections, all in the named order, with `lllReduce` containing exactly the four claimed sub-pieces). Resource log within tolerance (35–36s wall, sub-ms per case, ~140 MB RSS dominated by the tsx loader). The "Stated limitations" section names four real weaknesses honestly (no scaling beyond `n ≈ 12`, no early-termination probe for already-reduced bases, no δ-range validation, no inner-loop dot-product caching). The "Alternatives considered and rejected" section names three real alternatives — pure-rational `{num, den}` GS (rejected for GCD cost), Schnorr-Euchner FP-with-exact-rescue (rejected for the spec's no-FP clause), full GS recompute on each swap (rejected for `O(n³)` vs Cohen's `O(n)`) — each with the right reason. No sandbagging, no over-claiming. |
| Engineering judgment               | **A+** | The decision to store `(d_i, λ_{i,j})` rather than `Q` rationals is the single most-load-bearing call in this problem and the agent made it on the right grounds (avoiding GCDs, not for nominal "correctness"). Replacing Cohen's interleaved `kmax` cursor with an eager up-front `recomputeRow(k)` loop is a defensible structural simplification at `n ≤ 12`; it costs an `O(n⁴)` one-shot init that's negligible against swap work and produces a main loop with exactly one pre-condition (`(D, λ)` reflect current `b`) — the agent argues this trade-off explicitly. Rearranging the Lovász test to a single integer comparison `δ_den · (…) ≥ δ_num · D_k²` rather than evaluating `μ²` separately is the kind of micro-architectural call you only make if you've thought about where rationals would otherwise creep in. Choosing not to write a docblock-negation comment matching the constraint regex (the only trial in the suite that didn't) is borderline: it's cleaner not to have noise-text, but it does mean the constraint-grep produces zero hits without the orchestrator having a clear "self-declared compliance" anchor. Defensible either way. |

## 4. Comparative tables

| Metric                     | This trial (test-5 LLL) | Predecessor (test-4 SS)         |
|---|---|---|
| Verifier                   | 22/22 (5 checks)        | 22/22 (5 checks)                |
| Wall-clock (agent)         | ~9m / 0.56M ms          | ~30m / 1.81M ms                 |
| Total tokens               | 66 522                  | 119 323                         |
| Tool uses                  | 28                      | 84                              |
| Output                     | 296 lines / 10 774 B    | 450 lines / 18 174 B            |
| Estimated cost             | ~$1.0                   | ~$2.0                           |

| Metric                     | This trial (test-5 LLL) | Reference (test-10 pure-TS Risch) |
|---|---|---|
| Verifier                   | 22/22 (5 checks)        | 18/18 (3 checks)                  |
| Wall-clock (agent)         | ~9m                     | 24m 59s                           |
| Total tokens               | 66 522                  | ~159 000                          |
| Tool uses                  | 28                      | 79                                |
| Output                     | 296 lines / 10 774 B    | 2 265 lines / 86 178 B            |
| Estimated cost             | ~$1.0                   | ~$3.0                             |

`test-5` is the cheapest and cleanest "real algorithm" pass in the suite
(the cheaper trial is `test-3` SAM, but SAM is materially closer to the
training distribution). 28 tool uses for an exact-integer LLL on a
22-case suite that includes a 12-dimensional 30-bit-entry stress is
remarkable — the agent reached the textbook Cohen §2.6 form on first
read and didn't need a debug cycle.

## 5. Methodology / benchmark-design observations

**Why test-5 came out so clean.** LLL has a textbook canonical form
(Cohen §2.6) that maps essentially verbatim to TypeScript with
`bigint`. The four canonical bug surfaces — choosing `Q` rationals
instead of integer `(d_i, λ_{i,j})` storage; ascending vs. descending
the `j`-loop in size-reduction; full GS recompute vs. Cohen's
integer-recurrence swap; sign error on negative `λ` in the cleared
Lovász comparison — all become *non*-traps when the implementer reaches
for the integer-storage form, because the other three follow from it.
The agent clearly recognised this on the first read and shipped the
canonical form. By contrast, `test-4` Schreier-Sims has four *active*
bug surfaces (composition order, Phase-1 input handling, base
extension, Schreier-gen formula) where each must be made correctly *on
its own* — there is no single decision that resolves the others. The
84-vs.-28 tool-use gap reflects this asymmetry, not a difference in
algorithm difficulty per se.

**The pure-TS constraint does targeted work here.** The PROMPT.md's
"any way you want" clause is a one-liner away from
`from sage.modules.free_module_integer import IntegerLattice; … .LLL()`
or `fpylll.LLL.reduction(B, delta=0.75)`, both of which the verifier's
own reference path uses. The constraint forecloses both. More subtly,
the brief explicitly flagged `Float64Array` and `Math.fround` in the
constraint grep, because the canonical *partial* shortcut is "use FP
Gram-Schmidt with periodic exact rescue" (Schnorr-Euchner), which is
faster in practice but silently wrong on adversarial inputs at `n = 12,
30-bit entries`. The agent recognised this in §4 of its report and
correctly chose pure integer arithmetic. That matters: a
weaker model would plausibly reach for FP "for performance" and pass
the small cases while failing the stress.

**Honesty calibration: six trials in a row of A+.** `test-1` (FFT),
`test-2` (NTT), `test-3` (SAM), `test-4` (SS), `test-5` (LLL), and
`test-10` (Risch). Self-report calibration at Opus 4.7 is now an
established prior. The protocol's independent re-run remains mandatory
regardless.

**Recommendation for next trial.** Two reasonable paths. (a) March
forward to problem 06 (Stoer-Wagner min-cut) — the next problem in the
canonical sweep, and the first one that's a pure-graph algorithm
rather than a number-theoretic / combinatorial one. (b) Pivot to a
Sonnet 4.6 cross-model probe; the strongest-discrimination single
problem in the suite is now `test-4` (Schreier-Sims), so a Sonnet run
on `test-4` would be the cheapest discrimination data point. But six
completed Opus 4.7 problems is a clean enough baseline to keep
marching, if the user prefers coverage. The user's call.
