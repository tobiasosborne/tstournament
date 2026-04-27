# tstournament — session worklog (handoff for the next orchestrator agent)

Last updated: 2026-04-27, end of Opus 4.7 (1M) orchestrator session — Phase-3 trials `test-3` through `test-7` all green, problem 11 (Shewchuk's adaptive-precision predicates) added to `ts-bench-infra/`, repo unpushed.

---

## ► YOUR NEXT TASK

Three reasonable paths. The user has not pinned one; default is (a) unless they signal otherwise.

**(a) Orchestrate `test-11`** — Phase-3 trial of the brand-new problem 11 (Shewchuk's adaptive-precision predicates) added this session.

This is the most interesting next move because problem 11 is **structurally unlike** test-1..10. Where 1..10 reward "implement the canonical form correctly", problem 11 *punishes* the canonical form: the naive `Math.sign(determinant)` evaluator looks right and passes random cases, but fails ~25% of the test set on near-degenerate inputs; a `bigint`-rational evaluator passes correctness everywhere but **times out** on the speed-gate tier; only an IEEE-754 adaptive-precision implementation in the spirit of Shewchuk's `predicates.c` passes everything. Cross-model behaviour here is unknown.

The trial is structurally a little different from 1..10 because of the budget enforcement: invoke the candidate as `timeout 1.5s npx --yes tsx 11-shewchuk-predicates/solution.ts`. Without the wrapper, a slow-but-correct implementation will appear to pass while violating the contract.

Staging recipe: same as for test-3..7 (forbidden-token scrub + reference-impl pointer strip in REFERENCES.md). The `## Reference implementation` section in problem 11's REFERENCES.md must be stripped before staging — same trap as every other problem.

Note: rebuild `libpredicates.so` on the host before running `golden/generate.py`:
```
cd ts-bench-infra/problems/11-shewchuk-predicates
gcc -O2 -shared -fPIC -o reference/libpredicates.so sources/Shewchuk_predicates_DCG_18_1996.c -lm
```
The .so is gitignored; verify.py uses the cross-validated Python reference and does *not* require the .so.

**(b) Orchestrate `test-8`** — march forward through the canonical sweep, problem 08 (Buchberger / Gröbner basis over ℚ).

The Python shortcut is `sympy.polys.groebner` which the verifier uses internally — same forbidden-token scrub pattern as test-2, test-4. Default if the user prefers problem-coverage over model-comparison.

**(c) Sonnet 4.6 cross-model probe.** Eight Opus 4.7 baselines now exist (test-1..7, test-10) — a clean enough corpus to start cross-model. The strongest single discrimination point is **test-7 blossom** (`test-7/REVIEW.md` §5 gives the rationale: at least eight named pieces, no single load-bearing decision resolves the others). Sonnet 4.6 on test-7 is the most informative cross-model data point currently available. Stage as `test-7-sonnet/` and only the model differs.

Concrete protocol for any of (a/b/c) is in §"Staging recipe" / §"Agent brief template" / §"Review scorecard" below. Do not start until you've read §"Don'ts".

---

## ► PROJECT STATE SNAPSHOT (end of session)

### Repos

```
/home/tobiasosborne/Projects/tstournament/   (git repo, public on GitHub)
├── ts-bench-infra/        ← Phase-1 infra repo (now ELEVEN problems; problem 11
│                            added this session — Shewchuk's adaptive-precision
│                            predicates with canonical-oracle ground truth)
├── test-1/                ← Phase-3 trial: 01-fft (Opus 4.7, pure TS, 39/39 green)
├── test-2/                ← Phase-3 trial: 02-ntt (Opus 4.7, pure TS, 64/64 green)
├── test-3/                ← Phase-3 trial: 03-suffix-automaton (Opus 4.7, pure TS, 43/43 green) — this session
├── test-4/                ← Phase-3 trial: 04-schreier-sims (Opus 4.7, pure TS, 22/22 green) — this session
├── test-5/                ← Phase-3 trial: 05-lll (Opus 4.7, pure TS, 22/22 green) — this session
├── test-6/                ← Phase-3 trial: 06-stoer-wagner (Opus 4.7, pure TS, 21/21 green) — this session
├── test-7/                ← Phase-3 trial: 07-blossom (Opus 4.7, pure TS, 23/23 green) — this session
├── test-10/               ← Phase-3 trial: 10-risch (Opus 4.7, pure TS, 18/18 green)
├── test-10-shellout/      ← archived: 10-risch (Opus 4.7, SymPy-driven, 18/18 green)
├── README.md              ← public-repo intro (now reflects 11 problems)
├── LICENSE                ← AGPL-3.0
├── .gitignore             ← excludes PDFs, marker-out/staging, quarantine, node_modules,
│                            .browser-profile, .claude, AND now compiled .so/.dylib/.dll
├── claude-code-phase1-prompt.md   ← original phase-1 prompt (historical)
└── WORKLOG.md             ← this file
```

All test-3..7 / problem 11 work is **uncommitted on `main`** at end of session. The next orchestrator should commit + push these as part of normal protocol.

### Public repo

- `https://github.com/tobiasosborne/tstournament` — public, AGPL-3.0, default branch `main`.
- Initial commit `7a482d3` was the full state of the project at end of test-2.
- gh CLI is auth'd as `tobiasosborne` (SSH protocol). The user's PAT was upgraded mid-session to include repo-creation scope.
- Anything that would re-add a copyrighted PDF, a Playwright `.browser-profile`, or `.claude/` Lean4 leftovers is gitignored — re-check `.gitignore` before adding new top-level dirs.
- Standard incremental workflow: edit, `git add`, `git commit`, `git push`. No force-push, no rewriting `main`.

### `ts-bench-infra/` state

| Item | Status |
|---|---|
| 11 problem dirs | all present, all reference impls green against their golden masters (`README.md` table). Problem 11 added this session — see §"Problem 11 design" below. |
| Source PDFs | 21 of 22 in `problems/*/sources/`. Problem 11's source artefact is `Shewchuk_predicates_DCG_18_1996.c` (4262-line public-domain C, *not* a PDF — committed under `sources/`); the actual paper PDF is not auto-downloaded. |
| Quarantined files | 2 misnomer artefacts in `.quarantine/` (forensic record only — do not delete) |
| `infra/strip-for-testing.sh` | works; `--self-test` passes |
| `infra/verifiers/run_tests.sh` | works; uses `python3 + jq`. Problem 11 invokes the candidate via `timeout 1.5s` per case — see PROMPT.md for the wrapper invocation. |
| `infra/playwright/sources.config.json` | 3 DOIs corrected (see "Bogus DOIs" below); Shewchuk 1996 not in the playwright list (the .c is the canonical artefact for problem 11) |
| `infra/playwright/fetch.mjs` | exists — **DO NOT RERUN** without explicit user OK |
| All 11 `problems/*/PROMPT.md` | canonical-phrasing blocks contain verbatim string-identical excerpts from the actual sources (PDFs for 1-10, C source for 11) |

### Marker batch state

`/home/tobiasosborne/Projects/tstournament/ts-bench-infra/.marker-out/` contains markdown extractions for **5 of 19** queued PDFs (Cooley-Tukey, Blumer, Bronstein-tutorial, Risch-1969, plus a couple more). The batch was running in background when WSL OOM'd. **User explicitly said: do NOT rerun marker.** PROMPT.md updates were done via `pdftotext -layout` directly, not via marker output, so marker is non-blocking — leave it.

`.marker-staging/` (real PDF copies) is still on disk; safe to ignore.

---

## ► WHAT THE 2026-04-27 SESSION ACCOMPLISHED (current session)

Chronological:

A. **`test-3` trial** (problem 03 suffix automaton, Opus 4.7, pure-TS): 43/43 across `shape · num_states_bound · distinct_substrings · lcs_length`. 244 lines / 9 632 B. ~5m wall-clock, 45 308 tokens, 18 tool uses (cheapest pass at this point). Struct-of-arrays `Int32Array` `len`/`link`, `Map<number, number>[]` for transitions (alphabet-agnostic per spec), `bigint` for substring sum, full Blumer 1985 online `extend(c)` with clone-on-non-solid-edge. REVIEW at `test-3/REVIEW.md`.

B. **`test-4` trial** (problem 04 Schreier-Sims, Opus 4.7, pure-TS): 22/22 across all 5 checks including M_11 / M_12. 450 lines / 18 174 B. ~30m wall-clock, 119 323 tokens, 84 tool uses. Deterministic Schreier-Sims with Sims' filter; explicit coset-rep transversals; `firstMovedPoint` base extension; BigInt for order. **The strongest tier-discrimination probe in the suite at the time** — four canonical bug surfaces (composition order, Phase-1 input handling, base extension, Schreier-gen formula), each must be made correctly in isolation. REVIEW at `test-4/REVIEW.md`.

C. **`test-5` trial** (problem 05 LLL, Opus 4.7, pure-TS, **strictest constraint pass**): 22/22 across all 5 checks. 296 lines / 10 774 B. ~9m wall-clock, 66 522 tokens, 28 tool uses. Cohen §2.6 integer LLL — `(d_i, λ_{i,j})` lattice-determinant-scaled storage (no `Q` rationals, no GCDs in the hot loop), descending-`j` size-reduction, Cohen integer-recurrence swap, Lovász test rearranged to a single integer comparison. `bigint` exclusively. **Zero grep hits in constraint audit** — first trial in the suite without even a docblock-negation comment. REVIEW at `test-5/REVIEW.md`.

D. **`test-6` trial** (problem 06 Stoer-Wagner, Opus 4.7, pure-TS, **cheapest pass in the suite**): 21/21 across all 4 checks. 241 lines / 8 830 B. ~3m wall-clock, **33 692 tokens, 11 tool uses**. Flat row-major `bigint[]` adjacency matrix, linear-scan-argmax MA-ordering, in-place merge, partition recovered via per-super-vertex `members[v]` snapshot. Single-shot ship; no debug iteration. **Zero grep hits.** REVIEW at `test-6/REVIEW.md`.

E. **`test-7` trial** (problem 07 Edmonds blossom, Opus 4.7, pure-TS, **most expensive pass in the suite**): 23/23 across all 5 checks including the canonical odd-cycle blossom-shrink discriminators (`C_5`, `C_7`, `C_9`). 710 lines / 24 488 B. ~43m wall-clock, **166 106 tokens, 54 tool uses**. Edmonds 1965 + Galil 1986 weighted general-graph blossom, structured after Van Rantwijk's `mwmatching.py`; primal-dual with unified `dualVar[0..2n)`, blossom tree with cycle-ordered children, four classical δ cases including δ₁ free-vertex preemption (the max-weight-vs-perfect distinguishing piece), Van Rantwijk endpoint trick. Agent self-stressed against a from-scratch bitmask DP oracle on 98 additional cases — all green. **Zero grep hits.** REVIEW at `test-7/REVIEW.md`. **Now the strongest tier-discrimination probe in the suite**, narrowly edging out test-4.

F. **Problem 11 added to ts-bench-infra** — Shewchuk's adaptive-precision geometric predicates. The user pitched it as the first benchmark addition that *punishes* the canonical form (every other problem rewards "implement the textbook expression"). The naive `Math.sign(det)` evaluator passes random cases but fails ~25% on near-degenerate inputs; a `bigint`-rational evaluator passes correctness everywhere but **times out on the speed-gate tier**; only an IEEE-754 adaptive-precision implementation in the spirit of Shewchuk's `predicates.c` passes all eight tiers under the 1.5s per-case budget. See §"Problem 11 design" below for the construction details.

G. Repository unpushed at end of session — `test-3..7` and `ts-bench-infra/problems/11-shewchuk-predicates/` are all untracked on `main`. Next orchestrator commits + pushes per protocol.

---

## ► PROBLEM 11 DESIGN (added this session)

This is a brand-new section; problem 11 is structurally distinct from 1..10 and the next orchestrator should read this before staging a `test-11` trial.

### Why problem 11 is different

Problems 1..10 each have a canonical textbook form that maps cleanly to TypeScript. The benchmark's job is to observe whether the model writes that form correctly versus shellouts to a CAS. Problem 11 has a *deceptive* canonical form: the naive 2×2 / 3×3 / 4×4 determinants ARE the textbook orient2d/orient3d/incircle/insphere predicates as taught in computational geometry, but those naive determinants are *wrong* on near-degenerate inputs because of IEEE-754 rounding. Shewchuk 1996 (DCG 18, 305-363) introduced adaptive-precision expansion arithmetic specifically to fix this; CGAL, Triangle, TetGen, libigl, Geogram, Voro++ all use his `predicates.c` or close ports.

The hierarchy of model behaviour we expect:
- **Tier 1 — naive:** writes `Math.sign(determinant)` in doubles. Passes ~25% of the adversarial test set (mostly random / well-separated cases). Fails ~30-46% on the snap-to-grid / ULP-perturbation / planted-on-manifold tiers.
- **Tier 2 — bigint-rational:** writes `bigint` numerator/denominator arithmetic, correctness-equivalent to Shewchuk by Shewchuk's own theorem. **Times out on the speed-gate tier** under the 1.5s per-case budget.
- **Tier 3 — Shewchuk-port:** writes Dekker / Knuth two-sum + two-product expansion arithmetic with static + dynamic error bounds gating escalation. Passes everything.

### Test set (committed)

`golden/inputs.json` is 2.3MB and contains 27 cases / ~860k queries across 8 tiers per predicate. The full per-tier rationale is in `DESCRIPTION.md`; summary:

| Tier | Per-predicate batch | Naive failure rate | Bigint-rational | Shewchuk-port |
|---|---|---|---|---|
| A. random_easy | 100 | 0% | passes | passes |
| B. integer_exact_zero | 200 | 0% (sanity) | passes | passes |
| C. snap_to_grid | 1000 | **30-46%** | passes | passes |
| D. ulp_perturbation | 1000-2000 | **13-30%** | passes | passes |
| E. catastrophic_cancel | 500 | 0% (sanity, robust form) | passes | passes |
| F. planted_on_manifold | 1000 (3 predicates) | **20-46%** | passes | passes |
| G | (skipped — redundant with B-F) | — | — | — |
| H. speed_gate | 50k-500k via shared LCG | passes (correct) | **TIMES OUT** | passes |

### Canonical-correctness chain

This is the load-bearing piece. The user said "the golden masters obviously have to be generated via the canonical reference impl" — so:

1. `sources/Shewchuk_predicates_DCG_18_1996.c` — the 4262-line public-domain reference, downloaded from CMU, committed under sources/.
2. `reference/shewchuk_oracle.py` — ctypes wrapper. Compile via:
   ```
   cd ts-bench-infra/problems/11-shewchuk-predicates
   gcc -O2 -shared -fPIC -o reference/libpredicates.so \
       sources/Shewchuk_predicates_DCG_18_1996.c -lm
   ```
   The .so is gitignored (platform-specific; rebuild on each host).
3. `reference/predicates_reference.py` — Python `Fraction`-based bigint reference. **Validated equivalent** to the canonical oracle on every query in the test set (0 disagreements / ~860k queries) after fixing one orient3d row-order bug `(b−a, c−a, d−a)` → Shewchuk's `(a−d, b−d, c−d)`. Used by `verify.py` for ground truth at runtime (no .so build required).
4. `golden/generate.py` — generates `expected.json` from the canonical Shewchuk oracle, asserts Python agreement at every query, aborts loudly on any disagreement. Today's seed: `random.seed(20260427)`.

The verifier never reads `expected.json` (truth is recomputed live via `predicates_reference.py`); the file is committed for completeness but not load-bearing.

### Per-case time budget (the bigint kill)

The harness does *not* enforce a budget by default. The PROMPT documents the budget and the recommended invocation:

```
infra/verifiers/run_tests.sh problems/11-shewchuk-predicates \
    timeout 1.5s npx --yes tsx 11-shewchuk-predicates/solution.ts
```

The `timeout 1.5s` wrapper around the candidate is **essential**. Without it, a slow-but-correct bigint-rational implementation appears to pass while violating the contract. With it, a budget breach manifests as the candidate exiting non-zero, which the harness reports as `FAIL <case_id>: candidate command exited non-zero` before `verify.py` ever runs.

The next orchestrator must include `timeout 1.5s` in any test-11 trial harness invocation. The agent brief should also mention the budget so the agent knows what to optimise for.

### Tier H expansion via shared LCG

Tier H queries are not stored in inputs.json (would be 100MB+); instead the case's `input.format = "generated"` and `input.generator = {kind, n, seed, lo, hi}` describe a deterministic LCG-driven query stream. Both the agent and the verifier expand this descriptor through identical 64-bit LCG code documented in `golden/verifier_protocol.md` §"Tier H expansion". Constants:

```
state_{i+1} = (state_i * 6364136223846793005 + 1442695040888963407) mod 2^64
double_unit = (state >> 11) / 2^53
```

A divergence between agent and verifier expansion will manifest as widespread `sign_correct` failures.

### What was NOT done for problem 11

- **No Phase-3 trial run yet.** The infrastructure (problem dir, golden master, verifier, oracle, docs, top-level READMEs, .gitignore for .so) is complete; an agent trial has not been spawned.
- **The problem 11 .c source is not in the playwright fetcher config.** Fine — Shewchuk's predicates.c is plain ASCII source code, not a copyrighted PDF, so it's checked in directly under `sources/` rather than fetched.
- **No PDF of Shewchuk 1996.** The source code IS the canonical reference operationally. The DCG 18 paper PDF would be useful for the canonical-phrasing block but is not currently in `sources/`.

---

## ► PRIOR-SESSION ACCOMPLISHMENTS (preserved for continuity)

Chronological from earlier sessions:

1. **Diagnosed the previous-session damage**: the prior agent had broken parts of the PDF download pipeline. 5 of 21 PDFs already on disk were good; the rest were missing or wrong.
2. **Manual PDF salvage** (user clicked DOI links in Windows browser; orchestrator geoguessed the files out of `/mnt/c/Users/tobia/Downloads`). 21 of 21 papers eventually placed correctly.
3. **Three bogus DOIs caught** (see "Bogus DOIs" below — all patched in `sources.config.json`).
4. **Two misnomer files quarantined** to `.quarantine/`:
   - `Bronstein_SymbolicIntegrationTutorial_ISSAC_1998.pdf` was actually Egner-Pueschel "Solving Puzzles related to Permutation Groups"
   - `Buchberger_TwoCriteria_EUROSAM_1979.pdf` was actually Fitch "Application of Symbolic Algebra to Physics"
5. **Buchberger 1979** is on disk (correct paper) but is **image-only** (no text layer). OCR via tesseract works at decent quality. CLO 4ed is the cleaner alternative source for the modern S-polynomial / two-criteria phrasing.
6. **All 10 PROMPT.md files** updated with verbatim string-identical canonical-phrasing excerpts (no more paraphrases / DRAFT placeholders).
7. **`test-1` trial** (problem 01-fft, TypeScript, Opus 4.7): 39/39 green; 218-line clean iterative radix-2 FFT with Float64Array storage. ~6 min, ~$0.65.
8. **`test-10` shellout trial** (problem 10-risch, Opus, no constraint on method): 18/18 green via SymPy `risch_integrate` driven from a TS wrapper. 300 lines, ~5 min, ~$0.65. **Archived to `test-10-shellout/` as comparison reference.**
9. **`test-10` pure-TS trial** (problem 10-risch, Opus, **pure-TS constraint**): 18/18 green, 2265 lines of from-scratch Bronstein-shaped TypeScript (Q rationals → polys → Expr AST → Risch). ~25 min, ~$3.

### Continuation session (after compact)

10. **`test-2` pure-TS trial** (problem 02-ntt, Opus 4.7, **pure-TS constraint**): 64/64 green across all four checks (`shape · canonical_range · modular_equality · roundtrip`). 417 lines / 17 491 B / single-file TypeScript: hand-rolled Montgomery REDC (R = 2³², 16-bit limb splits in pure `Number` via `Math.imul`), iterative Cooley-Tukey on `Uint32Array`, full Bluestein chirp-z reduction for non-power-of-two `n`, both directions cached. ~24 min, 113k tokens, ~$2. Honest self-report (per-check totals matched harness exactly; architecture description matched source order 1:1). REVIEW at `test-2/REVIEW.md`. Found one staging gotcha: REFERENCES.md had a `## Reference implementation` section pointing at `reference/README.md` — leaks the existence of a stripped reference impl. Stripped before spawning. Recorded in §"Don'ts" item 8.
11. **Repository published to GitHub.** Top-level README.md (project intro, methodology, results table), AGPL-3.0 LICENSE (canonical text via `gh api licenses/agpl-3.0`), comprehensive .gitignore. 162 files / 31 MB. Initial commit `7a482d3`. The PAT initially lacked `Administration: write` scope (fine-grained PATs need it explicitly to create repos); user updated the token mid-session and the second `gh repo create` succeeded.

---

## ► STAGING RECIPE (use this for `test-2`)

```bash
cd /home/tobiasosborne/Projects/tstournament
mkdir -p test-2/02-ntt
cp ts-bench-infra/problems/02-ntt/DESCRIPTION.md  test-2/02-ntt/
cp ts-bench-infra/problems/02-ntt/PROMPT.md       test-2/02-ntt/
cp ts-bench-infra/problems/02-ntt/REFERENCES.md   test-2/02-ntt/
cp -r ts-bench-infra/problems/02-ntt/golden       test-2/02-ntt/
cp -r ts-bench-infra/infra/verifiers              test-2/

# Forbidden-token scrub (mirrors strip-for-testing.sh).
cd test-2
TOKENS=(
  'risch_integrate' 'stoer_wagner' 'max_weight_matching' 'mpmath\.pslq'
  'numpy\.fft\.fft' 'numpy\.fft\.ifft' 'np\.fft' 'pocketfft'
  'Matrix\.LLL' '\.lll\(' 'fpylll'
  'sympy\.discrete\.transforms\.ntt' 'sympy_ntt'
  'sympy\.combinatorics\.PermutationGroup' 'sympy\.integrals\.risch'
  '\.groebner\(' 'wolframscript' 'KACTL' 'jiangly' 'CP-Algorithms'
)
for f in 02-ntt/DESCRIPTION.md 02-ntt/PROMPT.md 02-ntt/REFERENCES.md \
         02-ntt/golden/verifier_protocol.md; do
  for t in "${TOKENS[@]}"; do
    sed -E -i "s,$t,[REDACTED],g" "$f"
  done
done

# Leakage re-check
LEAK=0
for t in "${TOKENS[@]}"; do
  hits=$(grep -rE "$t" 02-ntt/*.md 02-ntt/golden/*.md 2>/dev/null)
  if [ -n "$hits" ]; then echo "LEAK: $t"; LEAK=1; fi
done
[ $LEAK -eq 0 ] && echo "  clean"
```

**For NTT specifically**: the forbidden tokens that would actually leak in problem 02's prose are `sympy.discrete.transforms.ntt` and `sympy_ntt`. The scrub catches them. Verify `clean` before spawning.

---

## ► AGENT BRIEF TEMPLATE (pure-TS constraint variant)

This is the brief that produced the gold-standard `test-10` pure-TS run (18/18, 2265 lines from scratch). Use it verbatim, substituting only the problem identifiers.

The hard constraint section MUST be at the top, before the sandbox / task sections, and worded firmly. The pure-TS constraint is the single biggest determinant of result quality vs the let-it-shellout default — see "Methodology" below.

Skeleton:

```
You are participating in a benchmark that observes how Claude solves
sophisticated algorithm problems in TypeScript. This is a real run; we
want to see how you solve it.

## ⚠ HARD CONSTRAINT — overrides PROMPT.md's "any way you want" clause

The implementation must be 100% TypeScript / JavaScript. The algorithmic
core must in principle run in a browser.

❌ NO `child_process` / `spawn` / `exec` / shelling out.
❌ NO Python, SymPy, NumPy, Mathematica, Maxima, Pari, or any external CAS.
❌ NO native binaries. NO WASM that wraps a non-JS CAS.
✅ stdin/stdout glue is fine — `process.stdin` or `fs.readFileSync(0, "utf8")`.
✅ Pure-JS/TS npm packages OK (mathjs, decimal.js, big.js — anything that
   runs in a browser).
✅ Hand-rolled is encouraged.

[…sandbox layout…]
[…task: read PROMPT, implement, run verifier, iterate…]
[…final report: per-check totals, design choices, coverage breakdown,
  full source in fenced code block…]
```

The full template lived in this session's transcript when spawning `test-10` (pure-TS); model it on that. Keep `≤ 800 words` cap on the agent's final report so it stays scannable.

---

## ► REVIEW SCORECARD (use this format for the test-2 review)

After the agent completes, the orchestrator must:

1. **Re-run the verifier independently** — do not trust the agent's self-reported per-check totals. Run `verifiers/run_tests.sh 02-ntt npx --yes tsx 02-ntt/solution.ts` yourself.
2. **Audit constraint compliance** with this exact grep:
   ```
   grep -nE 'child_process|spawn|spawnSync|exec\(|execSync|execFile|fork\(|node:child_process|python|sympy|wolfram|maxima|pari|wasm|webassembly' 02-ntt/solution.ts
   ```
   Inspect every hit. The legitimate hits are typically the words "sympy" / "Pythonic" appearing in comments describing the I/O surface format. Anything else is a constraint violation.
3. **Sample the source structure** to confirm the agent's section layout matches its self-report (architectural honesty check). Long files are fine; clearly delineated sections are the signal.
4. **Write the formal review** with these dimensions, in this order:

| Dimension | Grade | Evidence |
|---|---|---|
| Correctness (verifier) | … | per-check totals, independently re-run |
| Constraint compliance | … | grep audit, only legitimate hits |
| Algorithmic depth | … | what's actually implemented vs. delegated |
| Code quality | … | structure, types, idiomaticity |
| Numerical / arithmetic stability | … | for problem 02: modular arithmetic correctness, Montgomery REDC handling, lazy reduction safety |
| Honesty of self-report | … | per-case breakdown, claimed coverage, stated limitations |
| Engineering judgment | … | which alternatives were considered and rejected, with reasons |

Plus the comparative table:

| Metric | This trial | Reference (test-10 pure-TS) |
|---|---|---|
| Wall-clock | … | 24m 59s |
| Tokens | … | 159k |
| Output | … | 2265 lines |
| Cost | … | ~$3 |
| Verifier | … | 18/18 |

End with one or two paragraphs of methodology / benchmark-design observations.

---

## ► TRIAL-RUN RECORDS (reference for next agent)

### `test-1/` — problem 01-fft (TypeScript, Opus 4.7)
- Result: `shape 39/39 · equality 39/39 · parseval 39/39 · naive_dft 39/39` (all green)
- 218 lines / 7360 bytes
- Wall-clock 5m46s, 42k tokens, 17 tool uses, ~$0.65
- Strategy: hand-rolled iterative radix-2 with `Float64Array` parallel re/im, NR §12.2 bit-reversal, precomputed twiddle table, `clz32` for log₂, sign-flag for fwd/inv
- File: `test-1/01-fft/solution.ts`

### `test-2/` — problem 02-ntt (TypeScript, Opus 4.7, **pure-TS reference run for arithmetic-heavy problems**)
- Result: `shape 64/64 · canonical_range 64/64 · modular_equality 64/64 · roundtrip 64/64` (all green)
- 417 lines / 17 491 bytes
- Wall-clock 23m42s, 113k tokens, 48 tool uses, ~$2
- Strategy:
  - Field constants frozen as literals (`p = 998244353`, Montgomery R = 2³², `R mod p`, `R² mod p`, `p_inv = -p⁻¹ mod 2³²`).
  - BigInt setup helpers (`modpowBig`, `modinv` via Fermat) — used only at plan-build time; never enters the inner loop.
  - Montgomery REDC `mmul(a, b)` in pure `Number` arithmetic via 16-bit limb splits and `Math.imul`. No BigInt, no `% p`, no division on the hot path.
  - Power-of-two iterative Cooley-Tukey on `Uint32Array` (Montgomery values), in-place, single bit-reversal up front, twiddle table flat-packed across all stages, cached per `(size, direction)`.
  - Bluestein chirp-z for non-power-of-two `n | (p − 1)`: `ζ = ω_{2n}`, length `L = nextPow2(2n − 1)` cyclic convolution, chirp constructed iteratively via `ζ^{(j+1)²} = ζ^{j²} · ζ^{2j+1}`. Forward/inverse plans cached separately.
  - Top-level dispatcher routes power-of-two through fast path, else through Bluestein. Inverse handled by ζ → ζ⁻¹ in the plan; `n⁻¹` and `L⁻¹` folded into a single per-output post-multiply.
  - JSON driver: `fs.readFileSync(0)` → parse → `ntt(...)` → `JSON.stringify` → `process.stdout.write`. Only import is `node:fs`.
- File: `test-2/02-ntt/solution.ts`
- Constraint compliance: audited clean (single grep hit is the self-declarative comment "Pure JS / TS only. No child_process, no shellouts, no native bindings.")
- Review: `test-2/REVIEW.md` — full 7-row scorecard, comparative table vs test-10, methodology paragraphs.
- Agent self-report calibration: per-check totals reproduced exactly; architecture description matched source order 1:1; resource log within 5% of measured wall-clock. Honesty grade A+.

### `test-10-shellout/` — problem 10-risch (TypeScript wrapper, archived)
- Result: 18/18 green
- 300 lines / 12 412 bytes (TS) + ~100 lines embedded Python helper
- Wall-clock 4m36s, 41k tokens
- Strategy: TS spawned `python3 -c <embedded helper>` that called `sympy.integrals.risch.risch_integrate` (which is what the verifier uses). Honest fallback path. **Identity check, not algorithm reimplementation.**
- File: `test-10-shellout/10-risch/solution.ts`

### `test-10/` — problem 10-risch (pure TypeScript, **gold-standard reference run**)
- Result: `shape 18/18 · existence_agrees 18/18 · derivative_matches 18/18` (all green)
- 2265 lines / 86 178 bytes
- Wall-clock 24m59s, 159k tokens, 79 tool uses, ~$3
- Strategy: 10 layered sections, fully from scratch:
  - `Q` rationals over BigInt
  - `Poly` univariate polys over Q (gcd, extgcd, Yun square-free)
  - `Expr` tagged-union AST + simplifiers + serializer
  - `diff` symbolic derivative
  - SymPy-syntax printer + recursive-descent parser
  - Polynomial/rational extraction
  - `integrateRational` (Hermite via partial fractions + Rothstein-Trager)
  - Top-level `integrateLogClass` / `integrateExpClass` / `solveRischDE` / `integrateOverLog`
  - Q-Gaussian-elim linear solver
  - stdin/stdout JSON driver (`require("node:fs")` only)
- File: `test-10/10-risch/solution.ts`
- Constraint compliance: audited clean (only "sympy" hits are in comments describing the I/O format)

### `test-3/` — problem 03 suffix automaton (Opus 4.7, pure TS, **suite-cheapest at the time**)
- Result: `shape · num_states_bound · distinct_substrings · lcs_length`, all 43/43
- 244 lines / 9 632 bytes
- Wall-clock 5m, 45 308 tokens, 18 tool uses, ~$0.7
- Strategy: struct-of-arrays `Int32Array` `len`/`link`, `Map<number, number>[]` for transitions (alphabet-agnostic per spec), `bigint` for substring sum, full Blumer 1985 online `extend(c)` with clone-on-non-solid-edge. Pre-sized typed arrays from the `2|s| − 1` state bound to avoid growth on the batch path.
- File: `test-3/03-suffix-automaton/solution.ts`
- Constraint compliance: single grep hit in the docblock-negation comment.
- Methodology note: SAM is close to the training distribution; this is a **coverage anchor**, not a tier-discrimination probe.

### `test-4/` — problem 04 Schreier-Sims (Opus 4.7, pure TS, **the four-bug-surface algorithm**)
- Result: `shape · base_validity · order_consistency · order_correct · membership_correct`, all 22/22
- 450 lines / 18 174 bytes
- Wall-clock 30m, 119 323 tokens, 84 tool uses, ~$2
- Strategy: deterministic Schreier-Sims with Sims' filter; explicit coset-rep transversals + cached inverses (no Schreier vectors); two-phase construction (install input gens at shallowest moving level → bottom-up Schreier-gen sweep with restart on insertion); classical iterative `sift`; `firstMovedPoint` base extension; BigInt for order. Crucially does *not* sift input generators in Phase 1 — that's the canonical-but-wrong shortcut on imprimitive inputs.
- File: `test-4/04-schreier-sims/solution.ts`
- M_11 base length 4, M_12 base length 5 — both canonical short bases for those groups, the textbook sanity that the filter is doing its job.
- Constraint compliance: single grep hit (docblock negation).
- Methodology note: SS has four canonical bug surfaces (composition order, Phase-1 input handling, base extension, Schreier-gen formula) each of which produces *plausible* output on small groups. M_11 and M_12 filter all four simultaneously. Strongest discrimination probe in the suite at the time.

### `test-5/` — problem 05 LLL (Opus 4.7, pure TS, **strictest constraint pass in the suite**)
- Result: `shape · same_lattice · size_reduction · lovasz · det_preserved`, all 22/22
- 296 lines / 10 774 bytes
- Wall-clock 9m, 66 522 tokens, 28 tool uses, ~$1
- Strategy: Cohen §2.6 integer LLL — `(d_i, λ_{i,j})` lattice-determinant-scaled storage (no `Q` rationals, no GCDs in the hot loop), descending-`j` size-reduction, Cohen integer-recurrence swap, Lovász test rearranged to a single integer comparison `δ_den · (D_{k−1}·D_{k+1} + λ²) ≥ δ_num · D_k²`. `bigint` exclusively in the algorithmic core.
- File: `test-5/05-lll/solution.ts`
- Constraint compliance: **zero grep hits** (no constraint-string anywhere in the file, including no docblock-negation comment).
- Methodology note: LLL has one load-bearing decision (`(d_i, λ_{i,j})` integer storage vs `Q` rationals) that resolves all the other potential bug surfaces — an asymmetry from SS where four decisions must be made independently. This explains the 28-vs-84 tool-use gap.

### `test-6/` — problem 06 Stoer-Wagner (Opus 4.7, pure TS, **suite-cheapest pass — single-shot ship**)
- Result: `shape · valid_partition · cut_value_consistent · cut_value_correct`, all 21/21
- 241 lines / 8 830 bytes
- Wall-clock 3m, **33 692 tokens, 11 tool uses**, ~$0.5
- Strategy: flat row-major `bigint[]` adjacency matrix, linear-scan-argmax MA-ordering with `wA[v]` running sum updated by row-fold, in-place merge (row+column accumulation, deactivate `t`, splice from active), partition recovered via per-super-vertex `members[v]` lists snapshotted on best improvement.
- File: `test-6/06-stoer-wagner/solution.ts`
- Constraint compliance: zero grep hits (second trial in a row).
- Methodology note: SW is also near training distribution with one forced structural decision (matrix vs adjacency-list, nearly forced at `n ≤ 100`). Coverage anchor, not discriminator. Likely passes cleanly on Sonnet 4.6 and Haiku 4.5 too.

### `test-7/` — problem 07 Edmonds blossom (Opus 4.7, pure TS, **the new strongest discrimination probe**)
- Result: `shape · disjoint_endpoints · matching_in_input · total_weight_consistent · total_weight_optimal`, all 23/23 (including the canonical odd-cycle blossom-shrink discriminators `C_5`, `C_7`, `C_9`)
- 710 lines / 24 488 bytes
- Wall-clock **43m, 166 106 tokens, 54 tool uses, ~$3.5** — the most expensive trial in the suite, narrowly above test-10 Risch.
- Strategy: Edmonds 1965 + Galil 1986 weighted general-graph blossom, structured after Van Rantwijk's `mwmatching.py` (the most-tested open-source reference port). Primal-dual with unified `dualVar[0..2n)`; blossom tree of nested blossoms via cycle-ordered child / endpoint arrays; four classical δ cases — δ₁ free-vertex preemption (the max-weight-vs-perfect distinguishing piece), δ₂ S-to-free, δ₃ S-to-S, δ₄ z-shrinks-to-zero T-blossom expansion; Van Rantwijk endpoint trick (`endpoint[2k] = u`, `endpoint[2k+1] = v` so `mate[s] = p` identifies both partner and edge); BigInt weights stored in 2·w units to keep `δ₃ = slack/2` exact.
- Architecture note: one large `blossom(...)` function (~600 lines internal, lines 61-695) holding all state in flat typed arrays plus closured helpers, declared explicitly by the agent as "the cleanest way to share the dozen+ pieces of mutable state without ceremonial `this`/class plumbing." Defensible.
- Self-stress beyond verifier: the agent ran 90 random graphs (`n ∈ [2, 16]`) plus 8 targeted odd-cycle / nested-blossom / all-negative cases against an independent bitmask-DP oracle, all 98 green. This is beyond the spec floor and the right kind of self-confidence pattern.
- Constraint compliance: zero grep hits.
- Methodology note: Edmonds' blossom has **at least eight named pieces** (δ₁..δ₄ scheduling, primal-dual maintenance, blossom shrink, blossom expand, augmentation walk, dual update, free-list management, endpoint trick) — all must be coordinated correctly. **Now the strongest tier-discrimination probe in the suite**, narrowly above test-4 SS. Sonnet 4.6 / Haiku 4.5 will likely diverge on `C_5..C_9` and `K_4..K_6` distinct-weight cases.

### Cost-per-quality anchors (updated 2026-04-27)

| Trial | Lines | Time | Tokens | Cost | Verifier | Notes |
|---|---|---|---|---|---|---|
| 01-fft pure-TS    | 218   | 5m46s  | 42k    | ~$0.65 | 39/39 | coverage |
| 02-ntt pure-TS    | 417   | 23m42s | 113k   | ~$2    | 64/64 | arithmetic-heavy |
| 03-sam pure-TS    | 244   | 5m     | 45k    | ~$0.7  | 43/43 | coverage |
| 04-ss pure-TS     | 450   | 30m    | 119k   | ~$2    | 22/22 | discriminator (4-bug) |
| 05-lll pure-TS    | 296   | 9m     | 67k    | ~$1    | 22/22 | strictest pass |
| 06-sw pure-TS     | 241   | 3m     | 34k    | ~$0.5  | 21/21 | **cheapest** / coverage |
| 07-blossom pure-TS| 710   | 43m    | 166k   | ~$3.5  | 23/23 | **most expensive** / strongest discriminator |
| 10-risch shellout | 300   | 4m36s  | 41k    | ~$0.65 | 18/18 | side probe |
| 10-risch pure-TS  | 2 265 | 24m59s | 159k   | ~$3    | 18/18 | gold-standard |

Pure-TS Risch is **~5× wall-clock and ~4× cost** vs the shellout for the same verifier score. Same model, just constraint differs.

**Tier-discrimination thesis (after this session):** problems 1, 3, 5, 6 are coverage anchors — Opus / Sonnet / Haiku all likely pass these. Problems 2 and 4 are mid-tier discriminators. Problems 7, 9, 10 (and likely the new 11) are the load-bearing discrimination probes. Problem 11 is genuinely unknown — its three-tier hierarchy (naive fails correctness / bigint fails timing / Shewchuk passes) doesn't map onto anything in 1..10.

---

## ► METHODOLOGY DECISION (made this session, propagating forward)

**Default to the pure-TS constraint for all model-comparison trials going forward.** Without it, problem 10's verifier turns into "SymPy agreeing with itself" and produces no model-tier signal. The shellout strategy will dominate uniformly.

The shellout variant is still useful as a **side probe** — "would this model take the obvious cheat when allowed?" — but should not be the primary scored trial.

For problem 02 (NTT) specifically, the shortcut would be `sympy.discrete.transforms.ntt`, and the same logic applies. **Pure-TS constraint by default.**

---

## ► BOGUS DOIs IN `sources.config.json` (all patched, but for the record)

| Paper | Bogus DOI in original config | Correct value | Notes |
|---|---|---|---|
| Risch 1970 Bull AMS | `10.1090/S0002-9904-1970-12455-7` | `10.1090/S0002-9904-1970-12454-5` | The actual article ID. |
| Buchberger 1979 EUROSAM | `10.1007/3-540-09519-5_55` | `10.1007/3-540-09519-5_52` | Chapter 55 of LNCS 72 is Fitch's paper, not Buchberger's. |
| Bronstein 1998 ISSAC | `10.1145/281508.281611` (DOI) | `url: http://www-sop.inria.fr/cafe/Manuel.Bronstein/publications/issac98.pdf` | The DOI resolves to Egner-Pueschel "Solving Puzzles", not Bronstein's tutorial. The tutorial has no DOI; it's hosted on the author's INRIA homepage. Field type changed from `doi` to `url`. |

If the next agent or any future fetch run hits a "wrong content" issue, **always cross-check the DOI vs. paper title** before assuming the file or fetcher is broken.

---

## ► TOOLS / VENVS / CAPABILITIES DISCOVERED THIS SESSION

User has many venvs scattered across `~/Projects/*/`. Always look in `.venv` and `venv` of sibling project dirs **before** installing anything fresh.

| Tool | Path | Use case |
|---|---|---|
| **marker** (PDF→markdown, ML OCR) | `/home/tobiasosborne/Projects/archivum/.venv/bin/marker` and `marker_single` | Best for OCR-heavy / scanned PDFs |
| **pdftotext** (poppler) | system `/usr/bin/pdftotext` | Faster than marker for digital PDFs with text layer; use `-layout` for column preservation |
| **pdfimages** + **tesseract** | `/usr/bin/{pdfimages,tesseract}` | Direct OCR for image-only PDFs (e.g. Buchberger 1979 scan); `pdfimages -p -png` then per-page `tesseract` |
| **pdfinfo** | `/usr/bin/pdfinfo` | Quick PDF metadata + producer field — distinguishes digital from scanned (look for `ImageMagick` / `Adobe Distiller scan` in producer) |
| Verifier deps | `python3` + `numpy 1.26` + `sympy 1.12` | All preinstalled |
| Test agent deps | `node 25.2.1`, `npx`, `npm`, `jq` | All preinstalled; `tsx` invoked via `npx --yes tsx` |

Windows Downloads folder (for "geoguess what the user just clicked"):
```
/mnt/c/Users/tobia/Downloads/
```

---

## ► DON'TS (real traps seen this session)

1. **Don't rerun marker without explicit user OK.** A WSL OOM crashed the host this session; the user explicitly said do not rerun.
2. **Don't trust an agent's self-reported verifier output.** Always re-run the harness yourself. (Both Opus trials were honest, but the protocol should hold under cheaper/weaker models too.)
3. **Don't manual-cp problem dirs without scrubbing.** `cp -r` does NOT replicate `strip-for-testing.sh`'s forbidden-token redaction. The first `test-10` staging this session leaked `risch_integrate` in `verifier_protocol.md`. The recipe in §"Staging recipe" handles this; use it.
4. **Don't assume DOIs in `sources.config.json` are correct.** Three were wrong. Always content-verify a downloaded PDF (`pdftotext -l 1 …`) against expected title before placing it in `sources/`.
5. **Don't put excerpts in PROMPT.md without verbatim PDF backing.** The session replaced all paraphrases with string-identical quotes from the actual PDFs (with file:p<page> citations). Maintain this standard for any future PROMPT.md edits.
6. **Don't hallucinate URLs or DOIs.** If asked to find a paper or resource, use `WebSearch` and verify hits with `curl -sIL` HEAD checks before presenting them. The user has explicitly flagged this.
7. **Don't modify the canonical `ts-bench-infra/problems/*/PROMPT.md` for trial-specific overrides.** The pure-TS constraint must go in the **agent brief**, not in the PROMPT, so the same PROMPT works across both shellout and pure-TS variants.
8. **Don't forget to scrub the `## Reference implementation` section in REFERENCES.md.** The forbidden-token list in the staging recipe catches *Python-API* leaks (`sympy.discrete.transforms.ntt`, etc.) but does **not** catch the textual pointer "Documented in `reference/README.md` (stripped from `ts-bench-test` by the Phase-2 strip script)". `test-2` had this exact leak in `02-ntt/REFERENCES.md`; caught and stripped manually before spawning. Run `grep -nEi 'reference/|reference impl|stripped|ts-bench' <staged>/<problem>/*.md <staged>/<problem>/golden/*.md` after the token scrub and remove any matching section.
9. **Don't commit copyrighted PDFs, Playwright `.browser-profile`, or `.claude/`.** All three are gitignored in the published repo. Re-check `.gitignore` before adding new top-level dirs that might bring binaries with them.

---

## ► USER PREFERENCES OBSERVED THIS SESSION

(In addition to whatever's already in `~/.claude/projects/-home-tobiasosborne-Projects-tstournament/memory/`.)

- Wants concise, direct, no-fluff communication. Short emoji-free responses. No lengthy summaries unless asked.
- Wants real verification, not vibes. Will explicitly call out hallucinated URLs, unverified claims, etc.
- Comfortable with WSL pain points. Expects the orchestrator to handle them silently when reasonable.
- Emphasises *quality* over *speed*: would rather wait 25 min for a 2265-line pure-TS Risch than 5 min for a shellout, when measuring model capability.
- Plans to test the same protocol on Sonnet 4.6, Haiku 4.5, and local LLMs. Make sure trial outputs are model-comparable: same staging, same brief skeleton, same scorecard.

---

## ► WHAT WAS NOT FINISHED (updated 2026-04-27)

- **Phase-3 trials for problems 08, 09, 11.** Opus 4.7 baselines now exist for problems 01-07 and 10 (both shellout and pure-TS variants on 10). Problem 08 (Buchberger) is the next canonical-sweep step; problem 09 (PSLQ) follows; problem 11 (Shewchuk predicates) is a brand-new addition with unknown agent behaviour and is plausibly the most informative single trial to run next.
- **Cross-model sweep.** No Sonnet 4.6 / Haiku 4.5 / local-model trials yet. Strongest single discrimination point currently available is **test-7 blossom**; second-strongest is test-4 SS. If the user pivots to model-comparison, those are the two cheapest discriminators.
- **Commit + push for this session's work.** test-3..7 trials and the entire `ts-bench-infra/problems/11-shewchuk-predicates/` directory are uncommitted on `main` at end of session. The next orchestrator (or this one on resume) commits + pushes.
- **Marker batch** on the remaining 14 of 19 PDFs in `.marker-out/` — still not rerun. User explicit "do NOT rerun" still in effect; non-blocking for any current trial.
- **Stehlé Ch.5** from the LLL Algorithm book — still on disk, not extracted. PROMPT 05 is sufficient with LLL 1982 excerpts only; the agent shipped 22/22 pure-TS without it (`test-5`).
- **Shewchuk 1996 PDF.** The .c source is the canonical artefact for problem 11 and is committed under `sources/`. The DCG 18 paper PDF would be useful for the canonical-phrasing block but is not in `sources/` and not in the playwright fetcher config.

---

## ► QUICK-REFERENCE COMMANDS

Re-run any of the eight completed Phase-3 trials:

```bash
cd /home/tobiasosborne/Projects/tstournament/test-1   && verifiers/run_tests.sh 01-fft              npx --yes tsx 01-fft/solution.ts
cd /home/tobiasosborne/Projects/tstournament/test-2   && verifiers/run_tests.sh 02-ntt              npx --yes tsx 02-ntt/solution.ts
cd /home/tobiasosborne/Projects/tstournament/test-3   && verifiers/run_tests.sh 03-suffix-automaton npx --yes tsx 03-suffix-automaton/solution.ts
cd /home/tobiasosborne/Projects/tstournament/test-4   && verifiers/run_tests.sh 04-schreier-sims    npx --yes tsx 04-schreier-sims/solution.ts
cd /home/tobiasosborne/Projects/tstournament/test-5   && verifiers/run_tests.sh 05-lll              npx --yes tsx 05-lll/solution.ts
cd /home/tobiasosborne/Projects/tstournament/test-6   && verifiers/run_tests.sh 06-stoer-wagner     npx --yes tsx 06-stoer-wagner/solution.ts
cd /home/tobiasosborne/Projects/tstournament/test-7   && verifiers/run_tests.sh 07-blossom          npx --yes tsx 07-blossom/solution.ts
cd /home/tobiasosborne/Projects/tstournament/test-10  && verifiers/run_tests.sh 10-risch            npx --yes tsx 10-risch/solution.ts
cd /home/tobiasosborne/Projects/tstournament/test-10-shellout && verifiers/run_tests.sh 10-risch    npx --yes tsx 10-risch/solution.ts
```

For problem 11 (no Phase-3 trial yet — generator + verifier sanity only):

```bash
cd /home/tobiasosborne/Projects/tstournament/ts-bench-infra/problems/11-shewchuk-predicates
gcc -O2 -shared -fPIC -o reference/libpredicates.so sources/Shewchuk_predicates_DCG_18_1996.c -lm
python3 reference/shewchuk_oracle.py    # smoke test
python3 golden/generate.py              # regenerate golden master (~30s, byte-identical when reseeded)
```

Re-run a reference impl against its golden (sanity check the infra repo):

```bash
cd /home/tobiasosborne/Projects/tstournament/ts-bench-infra \
  && infra/verifiers/run_tests.sh problems/02-ntt python3 problems/02-ntt/reference/ntt_reference.py
```

Strip script self-test:

```bash
cd /home/tobiasosborne/Projects/tstournament/ts-bench-infra \
  && infra/strip-for-testing.sh --self-test
```

---

End of worklog. Good luck with whichever next move you take — `test-11`, `test-8`, or a Sonnet 4.6 cross-model probe on `test-7` blossom.
