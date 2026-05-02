# test-8 — Formal review

**Trial:** Phase-3, problem 08 (Buchberger / Gröbner basis over ℚ).
**Model:** Claude Opus 4.7 (1M context), inherited via general-purpose subagent.
**Constraint:** pure-TS hard constraint (no `child_process`, no shellouts, no
external CAS / SymPy / SageMath / Singular / Magma / CoCoA / Mathematica /
Maxima / Pari-GP / GAP, no native binaries, no non-JS WASM).
**Date:** 2026-05-01.
**Solution:** `test-8/08-buchberger/solution.ts` — 737 lines / 28 346 bytes / single file.

---

## 1. Verifier — independently re-run

Command: `verifiers/run_tests.sh 08-buchberger npx --yes tsx 08-buchberger/solution.ts`.

```
shape 18/18 · candidate_in_input_ideal 18/18 · groebner_basis_property 18/18 · input_in_candidate_ideal 18/18
all 18 cases green
```

Every per-case line printed `pass`. Wall-clock 3m30s real / 3m30s user. The
agent's self-reported per-check totals match the harness output exactly,
and the agent's identification of `rand_3_lex_n3_m4` as the dominant cost
(~3 minutes) is borne out by the per-case timing in the harness output.

Coverage walk: a degenerate single-generator case (`single_x2_plus_y`); the
classical CLO Ch.2 textbook example `(x²y, xy + 1)` in both `lex` and
`degrevlex` (where the bases differ structurally and the lex one collapses
to `{x, y² + …}` while degrevlex keeps two generators); the canonical
**cyclic-3** system `(x + y + z, xy + yz + zx, xyz − 1)` in both orders
(the standard mid-difficulty Gröbner-basis benchmark, where the lex GB
contains a cubic in `z` only and reveals the elimination property of lex);
a univariate-already-reduced sanity case; a monomial-ideal-only case
(LM-only inputs, where Buchberger should be a no-op); an `expanding_2vars`
case where the GB has size strictly larger than the input (proof that the
implementation correctly clones non-trivial residues into the basis); and
five families of random low-degree systems at `(n_vars, m_polys) ∈ {(2, 3),
(2, 3), (2, 3), (2, 3), (3, 3), (3, 3), (3, 4), (3, 4), (2, 4), (2, 4)}`
with degrees ≤ 3 and small rational coefficients, run in both `lex` and
`degrevlex`. The hardest single case in the harness is `rand_3_lex_n3_m4`,
where the lex Gröbner basis collapses to `{1}` (the unit ideal) after
substantial intermediate-coefficient blow-up — the load-bearing test of
whether the implementation can survive the well-known lex-coefficient
ballooning. Verifier check 4 (`groebner_basis_property`) is the canonical
Buchberger criterion: every S-polynomial S(g_i, g_j) reduces to 0 modulo
the candidate. Checks 2 and 3 verify ideal equality in both directions;
the verifier internally re-Buchbergers each side and uses ideal-membership
to test containment. Multiple Gröbner bases of the same ideal in the same
order all pass — the candidate is *not* required to match the reference's
reduced form byte-for-byte, but the agent shipped the unique reduced GB
anyway as a polish gesture.

## 2. Constraint audit

```
grep -nE 'child_process|spawn|spawnSync|exec\(|execSync|execFile|fork\(|node:child_process|python|sympy|sage|magma|singular|cocoa|wolfram|maxima|pari|gap|wasm|webassembly' 08-buchberger/solution.ts
```

**Two hits**, both legitimate:
- Line 656: `*  reference outputs, *and* avoids tickling sympy.polys.polytools'`
- Line 659: `*  rational. (Hit at sympy 1.14, raises CoercionFailed.)`

Both are inside the docblock for `polyClearDenoms` (lines 642-664) and
describe a verifier-side coercion bug the function works around: when the
candidate carries rational-coefficient generators while the reference
inferred a `ZZ` ground ring, sympy 1.14's `groebner.contains(...)` raises
`CoercionFailed`. The agent's `polyClearDenoms` clears denominators from
the output (multiply by lcm of denominators, divide by gcd of resulting
numerators — same ideal element up to scalar, same leading monomial, so
the GB property is preserved) before serialising to JSON. This is not
delegation to SymPy; it is a defensive cosmetic step on the candidate's
output that happens to mention SymPy in the comment that explains why.
Per the WORKLOG protocol's stated policy ("legitimate hits are the words
sympy / Pythonic appearing in comments describing the I/O surface format"),
both hits are acceptable.

Imports: a single `import { readFileSync } from "node:fs"` at line 24.
No `package.json`, no `node_modules`, no transitive deps. Numeric core is
`bigint` for rational num/den, `number` for monomial exponents (tiny on
the test set), `Map<string, {exp, coef}>` for the inner loop of
`normalForm`, plain `Array` for everything else.

## 3. Scorecard

| Dimension                          | Grade | Evidence |
|---|---|---|
| Correctness (verifier)             | **A+** | 18/18 across all 4 checks, independently re-run; the hardest single case `rand_3_lex_n3_m4` (lex GB collapses to `{1}` after coefficient blow-up) passes; the canonical cyclic-3 system passes in both `lex` and `degrevlex`; the monomial-ideal-no-op and the expanding-2-vars (basis-grows-beyond-input) cases both pass, ruling out two distinct corner-case-misses. The verifier checks the Buchberger criterion directly (every S-pair reduces to 0 mod candidate), so check 4 is a direct sanity test that the candidate genuinely *is* a Gröbner basis, not just a basis of the right ideal. |
| Constraint compliance              | **A** | Two grep hits — both inside a single docblock, both describing a verifier-side SymPy coercion bug that the candidate's `polyClearDenoms` step works around. Single import is `node:fs`. No native bindings, no CAS deps, no float arithmetic, no shellouts. The grade is A rather than A+ because the docblock mentions SymPy more than strictly necessary; a stricter reading of the brief might prefer "verifier coercion issue" without naming SymPy directly. The hits do not represent any actual delegation. |
| Algorithmic depth                  | **A+** | The full Buchberger pipeline is implemented from scratch in seven labelled sections (lines 26-737). The load-bearing depth call is the **Gebauer–Möller UPDATE procedure** for pair-set maintenance (lines 467-526) — three labelled passes (M, F, B) that apply Buchberger's two pruning criteria at *insertion time* rather than at pop time. (M) keeps a canonical lcm-representative among new pairs sharing the same LCM; (F) drops new pairs with coprime LMs (Buchberger Criterion 1, lifted to insertion time); (B) prunes existing pairs (i, j) when the new generator's LM properly divides lcm(LM(g_i), LM(g_j)) and the chains (i, t) / (j, t) are not lcm-equivalent (Buchberger Criterion 2 / chain criterion, lifted to insertion time). This is the canonical exposition in Becker & Weispfenning Ch. 5 (Algorithm 5.66) and Gebauer & Möller (JSC 1988); it is not the most direct implementation of "Criterion 1 + Criterion 2 at pop time" that the brief literally calls for, but it is materially more efficient and is the standard treatment in the reference computer-algebra literature. The agent declared the equivalence explicitly in the §5 docblock and kept a defensive pop-time Criterion 1 check as belt-and-braces. The other depth calls are the **Map-based `normalForm`** (lines 338-399, with subtraction of `c · x^m · g` performed term-by-term in O(\|g\|) regardless of the running polynomial size, avoiding the O(\|p\|) array-rebuild that a naive sorted-merge would do per cancellation step), the **descending-sorted Poly invariant** maintained by `polyMulTerm` (multiplying by a monomial preserves descending order under any monomial order) and `polyAxBy` (linear merge of two descending lists), and the unit-ideal short-circuit. The S-polynomial is textbook. **Both monomial orders** (`lex` and `degrevlex`) are implemented in `compareExp` (lines 184-200) — the `degrevlex` branch is the trap (degree first, then *last* differing-from-right with inverted comparison) and the agent gets it right. |
| Code quality                       | **A** | Seven clearly delineated top-level sections in source order, each with a header comment that names what the section owns: §1 Rational arithmetic (`Q` class with cached `ZERO` / `ONE`, private constructor + factory, normalised invariant), §2 Monomials & orders, §3 Polynomial layer (`Term`, `Poly`, sparse / dense converters, `polyAxBy` linear-merge), §4 Normal form / S-polynomial, §5 Buchberger main loop with Gebauer–Möller, §6 Final inter-reduction + denominator clearing, §7 JSON I/O. Names are consistent (`expEqual`, `expAdd`, `expSub`, `expMax`, `expDivides`, `expCoprime`, `expIsOne` for monomial ops; `polyScale`, `polyMulTerm`, `polyAxBy`, `polyMakeMonic` for polynomial ops). The §5 docblock spends ~30 lines explaining Gebauer–Möller's three passes including soundness sketches, which is the right amount of docblock for a non-obvious refinement. The grade is A rather than A+ because the linear-scan-for-leading-term in `normalForm` (lines 358-365) is O(\|p\|) per cancellation step, and the linear-scan-for-smallest-LCM in the main loop (lines 558-561) is O(\|pairs\|) per pop — both declared as future-work in §"Stated limitations" but neither tipped over to a heap. On the test set this is fine; on `n_vars ≥ 4` systems it would start to bite. |
| Numerical / arithmetic correctness | **A+** | Exact `bigint` rationals end-to-end. The `Q` class normalises every result (positive denominator, gcd reduced) so equality is structural; the polynomial layer uses `Q.ZERO` / `Q.ONE` cached singletons and short-circuits zero coefficients on every operation. The Map-based `normalForm` cancels exactly via `existing.coef.add(delta)` with `if (sum.isZero()) p.delete(newKey)` to keep the map free of zero entries — the kind of book-keeping that kills less-careful implementations on cases where many terms cancel exactly (the `expanding_2vars` and `cyclic3_lex` cases both stress this). No float arithmetic anywhere; no precision loss possible by construction. The `polyClearDenoms` step is bit-exact (multiply by lcm of denominators, divide by gcd of numerators, both via `bgcd`). |
| Honesty of self-report             | **A+** | Per-check totals reproduced *exactly* (`shape 18/18 · candidate_in_input_ideal 18/18 · groebner_basis_property 18/18 · input_in_candidate_ideal 18/18`). Architecture description matches source order 1:1: seven claimed sections all in the named line ranges (§1 lines 26-115, §2 lines 117-200, §3 lines 202-309, §4 lines 311-412, §5 lines 414-587, §6 lines 589-701, §7 lines 703-737), and the §5 sub-pieces (`Pair`, `makePair`, `gmUpdate` with three labelled passes M/F/B, `buchberger` driver) are all present and correctly named. The "Stated limitations" section names *five* real weaknesses honestly: (1) lex coefficient blow-up on `rand_3_lex_n3_m4`, with the correct diagnosis that fixing it would require FGLM or modular reconstruction (out of scope); (2) linear-scan pair selection vs heap; (3) the **normal-strategy interpretation** — the agent uses "smallest LCM(LM(f), LM(g))" as the canonical proxy for "smallest LM of S-polynomial" because computing the actual S-poly LM would require computing every S-poly first, and declares this is the standard CLO / Becker-Weispfenning treatment but is not literally what PROMPT.md asks for; (4) linear scan for leading term in `normalForm`; (5) `tsc --strict` would flag missing `@types/node`. The "Alternatives considered and rejected" section names *seven* real alternatives with correct rejection reasons. The mid-trial-pivot log (initial naive Buchberger → Criteria-at-pop → Gebauer–Möller insertion-time + Map-based normalForm) is corroborated by the §5 docblock explicitly declaring that the equivalent pop-time formulation also works, and by the cleanness of the final architecture. |
| Engineering judgment               | **A+** | The decision to apply Buchberger's criteria via Gebauer–Möller UPDATE at insertion time, rather than the literal pop-time form the brief asks for, is the most-loaded call in this problem, and the agent makes it correctly. Pop-time-only application is what you get if you read PROMPT.md literally and stop reading at the chain criterion; insertion-time application is what every production-quality Gröbner basis implementation does (Singular's `std`, sympy's `groebner`, Macaulay2's `gb`, FGLM-as-a-front-end-to-Buchberger), and is the canonical exposition in Becker & Weispfenning Ch. 5 — it produces a logically equivalent basis at the cost of being substantially less wasteful on hard inputs. The agent declared the equivalence explicitly and kept a defensive pop-time Criterion 1 belt-and-braces check (which "almost never fires" per the docblock — also correct). The other notable judgement calls: (i) Map-based `normalForm` instead of array-rebuild, declared as a mid-trial pivot after diagnosing that `rand_3_lex_n3_m4` was reduction-bound; (ii) `polyClearDenoms` to dodge a sympy 1.14 verifier-side coercion bug, which is a pragmatic fix to a real edge case rather than a workaround for a candidate-side bug; (iii) the unit-ideal short-circuit (`return [[1]]` on any constant residue), which is correct and saves substantial work on the harder lex cases; (iv) the choice to ship the *reduced* Gröbner basis even though the verifier accepts any GB of the right ideal, declared explicitly as a polish gesture. Each call is named and defended in the report. The seven-alternatives-considered list is the right depth for a problem with this much accumulated computer-algebra literature behind it. |

## 4. Comparative tables

| Metric                     | This trial (test-8 Buchberger) | Predecessor (test-7 blossom)    |
|---|---|---|
| Verifier                   | 18/18 (4 checks)               | 23/23 (5 checks)                |
| Wall-clock (agent)         | ~84m / 5.04M ms                | ~43m / 2.58M ms                 |
| Total tokens               | 169 620                        | 166 106                         |
| Tool uses                  | 107                            | 54                              |
| Output                     | 737 lines / 28 346 B           | 710 lines / 24 488 B            |
| Estimated cost             | ~$3.5-4                        | ~$3.5                           |

| Metric                     | This trial (test-8 Buchberger) | Reference (test-10 pure-TS Risch) |
|---|---|---|
| Verifier                   | 18/18 (4 checks)               | 18/18 (3 checks)                  |
| Wall-clock (agent)         | ~84m                           | 24m 59s                           |
| Total tokens               | 169 620                        | ~159 000                          |
| Tool uses                  | 107                            | 79                                |
| Output                     | 737 lines / 28 346 B           | 2 265 lines / 86 178 B            |
| Estimated cost             | ~$3.5-4                        | ~$3.0                             |

`test-8` is now the **third-most-expensive trial in the suite by wall-clock**
(behind `test-12` float ↔ string at ~115m + ~15m and `test-11` Shewchuk
predicates at ~33m fading from the top — actually `test-7` blossom at 43m
is now also surpassed). The 84-minute wall-clock comes substantially from
two distinct mid-trial pivots (initial pop-time-criteria implementation,
then Gebauer–Möller refactor; initial sorted-array `normalForm`, then
Map-based reducer) and from `rand_3_lex_n3_m4` itself running ~3 minutes
of the 3m30s harness run. Tokens (169k) are within margin of `test-7`
(166k) and slightly above the gold-standard `test-10` Risch (159k); the
tool-use count (107) is *roughly twice* `test-7`'s, reflecting the two
honest mid-trial refactors rather than any cost asymmetry per fix. Output
size (737 lines) is in the same ballpark as `test-7` (710 lines) and far
short of `test-10` Risch (2 265 lines) — Buchberger has roughly the same
"single tightly-coupled state machine" character as Edmonds' blossom,
unlike Risch which is ten layered sub-algorithms.

`test-8` versus `test-5` LLL (the closest neighbour in the canonical
sweep on algorithmic style — both are bigint-rational-arithmetic
algorithms with a tight inner loop and one canonical structural decision):
LLL was 296 lines / ~9m / 67k tokens / 28 tool uses. Buchberger is 737
lines / ~84m / 170k tokens / 107 tool uses — substantially more across
every axis. The asymmetry is real: LLL has *one* load-bearing decision
(`(d_i, λ_{i,j})` integer storage vs Q rationals) that resolves all the
other potential bug surfaces; Buchberger has at least *four* decisions
(monomial-order representation, polynomial representation, normal-form
strategy, pair-handling refinement strategy) each of which can be made
incorrectly in plausible-looking ways.

## 5. Methodology / benchmark-design observations

**`test-8` slots cleanly into the canonical-sweep coverage.** Problem 08
is the eighth of the original ten problems and the only remaining
algorithmic discriminator (alongside `test-9` PSLQ) without an Opus 4.7
baseline. The result completes the 1-7 + 10 + 11 + 12 picture: every
canonical-sweep problem with a baseline now has a pure-TS Opus 4.7
trial recorded, with `test-9` PSLQ as the last remaining gap to close
the 1-12 sweep on Opus.

**The pure-TS constraint does substantial work here.** The Python
shortcut is `sympy.polys.groebner` (which the verifier itself uses
internally for ideal-membership testing); the `\.groebner\(` token in
the canonical FORBIDDEN_TOKENS list catches `.groebner(...)`-style
direct-call leaks in prose, and the staging recipe scrubs it
defense-in-depth. With the constraint in place there is no shortcut:
the agent must implement the full Buchberger pipeline, including the
two distinct monomial orders (`lex` and `degrevlex` differ
non-trivially in the inner comparison), exact rational arithmetic, and
the pair-handling refinements that distinguish "passing the verifier
on the easy cases" from "passing on `rand_3_lex_n3_m4`". The constraint
is the difference between a coverage-anchor trial and an
algorithmic-depth trial.

**The Gebauer–Möller call is the real signal.** A weaker
implementation could pass the verifier with pop-time Criterion 1 and
Criterion 2 only — the verifier doesn't probe the pair-handling
strategy directly, just the output ideal. But pop-time-only blows up
on `rand_3_lex_n3_m4`'s pair queue (5 000+ pending pairs in the agent's
own diagnosis before refactor) and the wall-clock would run into the
tens of minutes per case. The agent went out of its way to refactor
into the canonical Becker-Weispfenning treatment — that's not what the
brief asks for literally, but it's what an expert
computer-algebra-system author would do, and the agent both made the
call and declared it. This is the kind of "go beyond the brief in the
direction the brief is pointing" judgement that distinguishes a
portfolio-grade implementation from a verifier-passing one.

**Tier classification.** `test-8` is a **mid-tier discriminator** — not
as rich as `test-4` Schreier-Sims (four canonical bug surfaces) or
`test-7` blossom (eight named pieces with cross-constraint
coordination), but more than `test-3` SAM or `test-6` Stoer-Wagner
(near training distribution, one structural decision resolves
everything). The four Buchberger bug surfaces — monomial-order
correctness (especially `degrevlex` direction), polynomial-arithmetic
exactness under cancellation, normal-form termination on near-unit
ideals, pair-handling efficiency under coefficient blow-up — are each a
place where less-careful implementations produce plausible output on
small inputs and silently fail on the harder random cases. Cross-model
behaviour on Sonnet 4.6 / Haiku 4.5 will likely show first-failure on
`degrevlex` vs `lex` mismatches (the right-to-left comparison with
inverted sign is subtle) or on `rand_3_lex_n3_m4` timing out without
the Gebauer–Möller refactor.

**Honesty calibration: nine trials in a row of A+ on honesty.**
`test-1`-`test-7`, `test-10`, `test-12` (test-11 was the first
correctness/speed-tension trial, also honest). `test-8` continues the
streak: per-check totals reproduced exactly, architecture description
verified line-by-line against the source via grep, mid-trial pivots
declared explicitly in the report and corroborated by the §5 docblock's
discussion of the equivalent pop-time formulation. The Opus 4.7
honesty prior is now extremely well-established — the protocol's
independent re-run remains mandatory, but the prior on whether the
self-report will match is now near-1.

**Recommendation for next trial.** Two reasonable paths. (a) Close the
canonical sweep with **`test-9`** (PSLQ integer-relation detection) —
the last problem from 1-12 without an Opus 4.7 baseline, and the only
one whose Python shortcut (`mpmath.pslq`) is on the canonical
FORBIDDEN_TOKENS list. After `test-9` the canonical sweep on Opus is
complete and the corpus is ready for cross-model probes. (b) Begin
**model-comparison** on the three load-bearing discriminators
(`test-7` blossom, `test-11` Shewchuk predicates, `test-12` float ↔
string) on Sonnet 4.6 — the strongest single cross-model data points
the suite currently affords. The user's call.
