# test-11 — Problem 11 (Shewchuk's adaptive-precision geometric predicates) — Opus 4.7, pure-TS

**Result:** `shape 27/27 · batch_complete 27/27 · sign_correct 27/27`. Independently re-run by the orchestrator with the canonical `timeout 1.5s` wrapper; nothing tripped the budget. Total harness wall-clock 77 s for 27 cases (per-case mostly dominated by `npx tsx` startup amortised over the batch; algorithmic work was 150-180 ms even on the heaviest Tier H).

This is the **first all-three-tiers green pass** on problem 11. The hierarchy of expected model behaviour was: tier 1 naive doubles passes ~25% / fails 13-46% on degeneracies; tier 2 bigint-rational passes correctness everywhere but times out on Tier H; tier 3 IEEE-754 adaptive-precision passes everything. Opus 4.7 landed cleanly in tier 3.

## 7-row scorecard

| Dimension | Grade | Evidence |
|---|---|---|
| **Correctness (verifier)** | A+ | All 27 cases pass under `timeout 1.5s` wrapper. `shape 27/27 · batch_complete 27/27 · sign_correct 27/27`. Re-run independently from orchestrator session — totals match agent's self-report exactly. |
| **Constraint compliance** | A+ | **Zero hits** under `grep -nE 'child_process\|spawn\|exec\(\|execSync\|python\|sympy\|wolfram\|maxima\|pari\|wasm\|webassembly'`. Only import in the whole file: `import * as fs from "fs"` (line 3118). No docblock-negation comment either — the file makes no reference to the constraint at all, it just respects it. Cleanest compliance in the suite, tied with test-5/-6/-7. |
| **Algorithmic depth** | A+ | Faithful staged port of Shewchuk's `predicates.c`. Knuth two-sum, Dekker split, Veltkamp/Dekker two-product all emitted *inline* (visible at lines 96-98 / 110-120: `Fast_Two_Sum` and `Two_Sum` macro-equivalents expanded into the JIT-friendly arithmetic without a function-call boundary). `fastExpansionSumZeroelim` (line 66) and `scaleExpansionZeroelim` (line 165) are textbook Shewchuk. All four predicates have the canonical four-stage layout (errboundA fast filter → errboundB exact-leading-difference → errboundC second-order tail correction → full exact). For insphere stage 4, falls through to a complete `insphereExact` (line 2703) rather than threading a higher-order tail-cascade through `insphereAdapt` — matches `predicates.c`'s own choice; defensible given the test set never reaches stage 4 for insphere. |
| **Code quality** | A | 3 254 lines / 116 KB. Single file, but cleanly sectioned with banner comments (`// =====` separators) into: error-bound constants, expansion-arithmetic primitives, pre-allocated working buffers, four predicates with `*Adapt` siblings, LCG, JSON dispatcher, main. The size is genuine algorithmic content — Shewchuk's `predicates.c` itself is ~4.3 K lines of macro-expanded C; a faithful TS port is necessarily of similar order. Inline-macro style means lots of repetition in the adapt routines but the alternative (helper functions) measurably loses to the JIT. Defensible engineering trade-off. |
| **Numerical / arithmetic stability** | A+ | All Shewchuk error-bound constants emitted from `exactinit()` reproduced verbatim from the canonical C (`(3.0 + 16.0 * EPS) * EPS` etc.). `EPS = 2⁻⁵³` and `SPLITTER = 2²⁷ + 1` correct. Stage-1 / stage-2 inequality conventions preserved (`>` strict for stage 1, `≥` for B/C — agent flagged this explicitly as a place where mismatch causes spurious sign flips on degenerate inputs, which is exactly right). Tier H adversarial test set with snap-to-grid / ULP-perturbation / planted-on-manifold all green. |
| **Honesty of self-report** | A+ | Per-check totals reproduced exactly. Architecture description matched source order 1:1 (constants → primitives → predicates → LCG → main). File-size claim "3 254 lines, 117 KB" matches `wc -l` (3 254) and `ls -lh` (116 K) byte-perfect. Stage-1 filter-rejection claim ("100% accept on Tier H, 90.2% rejection on `orient2d_C_snap_to_grid`") is consistent with the tier construction (Tier H is uniform random in `[-100, 100]^d` — well-separated; Tier C is rational degeneracy snapped to doubles — lots of cancellation). Self-stated Tier H wall-clock of 0.94 s slowest is consistent with my 77 s total / 27 cases observation. |
| **Engineering judgment** | A+ | Three load-bearing decisions called out explicitly and correctly: (1) inline expansion-arithmetic macros not function calls, for V8 register-allocation; (2) pre-allocated module-scope `Float64Array` working buffers up to 5760 components for `insphereExact`, hot path allocates nothing; (3) hand-rolled 64-bit MMIX LCG via two `Number` halves + `Math.imul`-based 16-bit chunked multiply, ~10× faster than a `bigint` LCG on Tier H. Each of these is the right move and each is the kind of thing a tier-2 implementation gets wrong. The decision NOT to thread a higher-order tail-cascade through `insphereAdapt` (mirroring Shewchuk's own choice) is also the right call — extending it would balloon the file to ~5 K lines for queries the test set never exercises. |

## Comparative table

| Metric | This trial (test-11) | test-7 blossom (prior strongest discriminator) | test-10 pure-TS Risch (gold-standard ref) |
|---|---|---|---|
| Verifier | 27/27 | 23/23 | 18/18 |
| Lines | 3 254 | 710 | 2 265 |
| Bytes | 116 K | 24 K | 86 K |
| Wall-clock | ~33 m | 43 m | 25 m |
| Tokens | 271 k | 166 k | 159 k |
| Tool uses | 108 | 54 | 79 |
| Cost | ~$5–6 | ~$3.5 | ~$3 |
| Constraint grep | zero hits | zero hits | clean (only "sympy" in I/O comments) |

test-11 is now the **most expensive trial in the suite** — narrowly above test-7 blossom on tokens (271 k vs 166 k) and well above on tool uses (108 vs 54), while landing under it on wall-clock thanks to lower per-iteration debugging churn. The token spend is reasonable given the file size: a faithful port of `predicates.c` necessarily encodes thousands of lines of macro-expanded expansion arithmetic, and Opus chose to write it inline rather than abstract it into helpers. That choice has a measurable correctness and performance pay-off that you can see in the grep audit and the speed-gate margin.

## Methodology / benchmark-design observations

**Problem 11 worked exactly as designed.** The three-tier hierarchy (naive / bigint-rational / Shewchuk-port) was the explicit thesis of the problem, and Opus 4.7 picked the third tier without prompting from the brief beyond the framing "bigint-rational won't pass speed gate, you need adaptive-precision in the spirit of Shewchuk's predicates.c". The agent did not attempt a bigint-first prototype-then-port — it went directly to the adaptive port. That's the optimal traversal.

**Speed-gate headroom of 0.6-0.7 s under the 1.5 s budget** confirms that the budget is tight enough to discriminate but not so tight that a competent implementation has to fight for milliseconds. A future Sonnet 4.6 or Haiku 4.5 trial that produces a slightly less aggressively inlined implementation would still pass; one that goes naive-doubles or bigint-rational definitely wouldn't. The discrimination tier here is "did the model recognise that Shewchuk's framework is the only viable architecture", not "did the model micro-optimise its hot loop."

**The `timeout 1.5s` wrapper is essential and worked as designed.** A bigint-rational implementation would have manifested as `FAIL <case_id>: candidate command exited non-zero` on every `_H_speed_gate` case before the verifier ever ran — visible in the harness output, attributable to the right cause, no false positives. This is a deliberately constructed feature of the harness; the WORKLOG flagged it and it's now demonstrated in production.

**Cross-model expectation.** Sonnet 4.6 will likely also reach tier 3, but with measurably more iteration churn — predicting based on the test-7 token gap. Haiku 4.5 is genuinely uncertain: this is the first problem in the suite where the load-bearing decision is "recognise that the canonical textbook expression IS the trap." Models that pattern-match the textbook 3×3 / 4×4 determinant and ship it will fail tiers C/D/F at 13-46%. A naive-doubles Haiku trial would be the most informative single cross-model data point in the suite to date.

**Ranking after this trial.** Problem 11 is now the **strongest single discrimination probe** in the bench, edging out test-7 blossom because: (a) the failure-mode hierarchy is more crisply tiered (binary correctness on naive, binary timing on bigint, only Shewchuk-port wins both), (b) the IEEE-754 expansion-arithmetic body is genuinely outside training distribution for general-purpose coding LLMs, (c) the `timeout 1.5s` wrapper makes "but it's correct!" inadmissible.
