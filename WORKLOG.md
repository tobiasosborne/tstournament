# tstournament — session worklog (handoff for the next orchestrator agent)

Last updated: 2026-04-26, end of Opus 4.7 (1M) continuation session — `test-2` done, repo published.

---

## ► YOUR NEXT TASK

**Orchestrate `test-3`** — Phase-3 trial of problem 03 (Suffix Automaton).
**Same protocol as `test-2` and `test-10` pure-TS** (gold-standard reference runs; details below).

Concretely:

1. `mkdir -p /home/tobiasosborne/Projects/tstournament/test-3/03-suffix-automaton`
2. Copy `ts-bench-infra/problems/03-suffix-automaton/{DESCRIPTION.md,PROMPT.md,REFERENCES.md}` and `ts-bench-infra/problems/03-suffix-automaton/golden/` (whole subtree) into `test-3/03-suffix-automaton/`. **Do not** copy `reference/` or `sources/`.
3. Copy `ts-bench-infra/infra/verifiers/` into `test-3/verifiers/`.
4. Apply the forbidden-token scrub on the staged prose files. Token list and one-liner are in §"Staging recipe" below — substitute `test-3` / `03-suffix-automaton` for the example. (For problem 03 specifically: pre-scrub will probably find nothing — there is no canonical-shortcut Python package to redact — but **also strip any reference-impl pointer in REFERENCES.md** like the `## Reference implementation` section that pointed at `reference/README.md` in problem 02. That one is the real leak risk for this problem.)
5. Run the leakage check (same one-liner). It must report `clean`. Also `grep -nEi 'reference/|reference impl|stripped|ts-bench' test-3/03-suffix-automaton/*.md test-3/03-suffix-automaton/golden/*.md` — should be empty.
6. Spawn one general-purpose subagent (no `--model` override → inherits Opus 4.7) with the **pure-TS hard constraint** in the brief. Use the `test-2` Agent invocation in §"Trial-run records" as a template; just substitute `test-3` / `03-suffix-automaton`. Keep the brief verbatim where possible. The constraint section MUST be at the top.
7. When the agent completes, **independently re-run the verifier yourself** (`verifiers/run_tests.sh 03-suffix-automaton npx --yes tsx 03-suffix-automaton/solution.ts`), audit the source for constraint compliance with the same grep, then write a formal review at `test-3/REVIEW.md` using the scorecard template in §"Trial-run records".
8. After the review lands, commit + push as a normal incremental commit on `main`. The repo (see §"Public repo" below) is set up with this in mind; no force pushing, no rewrite.

Do not start `test-3` until you've read §"Don'ts" below.

**Side-note alternative — Sonnet 4.6 cross-model probe.** The `test-2` REVIEW recommends running `test-2` on Sonnet 4.6 next as the cheapest cross-model discrimination data point while the Opus 4.7 baseline is fresh. If the user's plan tilts toward model-comparison rather than problem-coverage, do that first — the staging directory would be `test-2-sonnet/` and only the model differs. Default is to march forward through problems unless the user signals otherwise.

---

## ► PROJECT STATE SNAPSHOT (end of session)

### Repos

```
/home/tobiasosborne/Projects/tstournament/   (now a git repo, public on GitHub)
├── ts-bench-infra/        ← Phase-1 infra repo (10 problems, golden masters, reference impls)
├── test-1/                ← Phase-3 trial: 01-fft (Opus 4.7, pure TS, 39/39 green)
├── test-10/               ← Phase-3 trial: 10-risch (Opus 4.7, pure TS, 18/18 green)
├── test-10-shellout/      ← archived: 10-risch (Opus 4.7, SymPy-driven, 18/18 green)
├── test-2/                ← Phase-3 trial: 02-ntt (Opus 4.7, pure TS, 64/64 green) — REVIEW.md present
├── test-3/                ← (to be created — your task)
├── README.md              ← public-repo intro
├── LICENSE                ← AGPL-3.0
├── .gitignore             ← excludes PDFs, marker-out/staging, quarantine, node_modules, .browser-profile, .claude
├── claude-code-phase1-prompt.md   ← original phase-1 prompt (historical)
└── WORKLOG.md             ← this file
```

### Public repo

- `https://github.com/tobiasosborne/tstournament` — public, AGPL-3.0, default branch `main`.
- Initial commit `7a482d3` was the full state of the project at end of test-2.
- gh CLI is auth'd as `tobiasosborne` (SSH protocol). The user's PAT was upgraded mid-session to include repo-creation scope.
- Anything that would re-add a copyrighted PDF, a Playwright `.browser-profile`, or `.claude/` Lean4 leftovers is gitignored — re-check `.gitignore` before adding new top-level dirs.
- Standard incremental workflow: edit, `git add`, `git commit`, `git push`. No force-push, no rewriting `main`.

### `ts-bench-infra/` state

| Item | Status |
|---|---|
| 10 problem dirs | all present, all reference impls green against their golden masters (`README.md` table) |
| Source PDFs | 21 of 22 in `problems/*/sources/` (the 22nd is CLO 4ed, dropped into `08-buchberger/sources/` as bonus) |
| Quarantined files | 2 misnomer artefacts in `.quarantine/` (forensic record only — do not delete) |
| `infra/strip-for-testing.sh` | works; `--self-test` passes |
| `infra/verifiers/run_tests.sh` | works; uses `python3 + jq` |
| `infra/playwright/sources.config.json` | 3 DOIs corrected this session (see "Bogus DOIs" below) |
| `infra/playwright/fetch.mjs` | exists, was killed earlier in session per user request — **DO NOT RERUN** without explicit user OK |
| All 10 `problems/*/PROMPT.md` | canonical-phrasing blocks contain verbatim string-identical excerpts from the actual PDFs (zero DRAFT placeholders remaining) |

### Marker batch state

`/home/tobiasosborne/Projects/tstournament/ts-bench-infra/.marker-out/` contains markdown extractions for **5 of 19** queued PDFs (Cooley-Tukey, Blumer, Bronstein-tutorial, Risch-1969, plus a couple more). The batch was running in background when WSL OOM'd. **User explicitly said: do NOT rerun marker.** PROMPT.md updates were done via `pdftotext -layout` directly, not via marker output, so marker is non-blocking — leave it.

`.marker-staging/` (real PDF copies) is still on disk; safe to ignore.

---

## ► WHAT THIS SESSION ACCOMPLISHED

Chronological:

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

### Cost-per-quality anchors

| Trial | Lines | Time | Tokens | Cost | Verifier |
|---|---|---|---|---|---|
| 01-fft pure-TS    | 218   | 5m46s  | 42k  | ~$0.65 | 39/39 |
| 02-ntt pure-TS    | 417   | 23m42s | 113k | ~$2    | 64/64 |
| 10-risch shellout | 300   | 4m36s  | 41k  | ~$0.65 | 18/18 |
| 10-risch pure-TS  | 2 265 | 24m59s | 159k | ~$3    | 18/18 |

Pure-TS Risch is **~5× wall-clock and ~4× cost** vs the shellout for the same verifier score. Same model, just constraint differs. This is the most useful single data point in the benchmark for distinguishing "delegate cleanly" from "implement actually".

NTT (`test-2`) sits roughly midway in cost between FFT and Risch: arithmetic-heavy and structurally non-trivial (Bluestein + Montgomery), but with much smaller surface area than Risch's nested-algorithm stack. Useful as a baseline for arithmetic-heavy problems, less useful for tier discrimination — likely too easy for Sonnet 4.6 / Haiku 4.5 to discriminate against Opus 4.7.

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

## ► WHAT WAS NOT FINISHED

- Marker batch on the remaining 14 of 19 PDFs in `.marker-out/`. Stopped after 5 due to WSL OOM concern. Markdown extracts that did complete: Cooley-Tukey, Blumer, Bronstein-tutorial, Risch-1969, plus one more. The PROMPTs do not depend on these — they were used as a convenience cross-reference, with `pdftotext -layout` doing the actual work.
- Stehlé Ch.5 from the LLL Algorithm book. The whole 503-page book is on disk at `problems/05-lll/sources/Stehle_LLL_FloatingPoint_2010.pdf`. PROMPT 05 currently uses only LLL 1982 excerpts (sufficient). If the user wants floating-point variant grounding, extract pages corresponding to Ch.5.
- Test runs for problems 03–09. Problem 03 (Suffix Automaton) is **next** (this handoff).
- Cross-model sweep. Opus 4.7 baselines exist for 01-fft, 02-ntt, and 10-risch (both shellout and pure-TS). Sonnet 4.6 / Haiku 4.5 / local-model sweeps are still pending. The `test-2` REVIEW recommends Sonnet on 02-ntt as the cheapest cross-model discrimination point — useful if the user pivots from problem-coverage to model-comparison.

---

## ► QUICK-REFERENCE COMMANDS

Re-run any of the four completed trials:

```bash
cd /home/tobiasosborne/Projects/tstournament/test-1 \
  && verifiers/run_tests.sh 01-fft npx --yes tsx 01-fft/solution.ts

cd /home/tobiasosborne/Projects/tstournament/test-2 \
  && verifiers/run_tests.sh 02-ntt npx --yes tsx 02-ntt/solution.ts

cd /home/tobiasosborne/Projects/tstournament/test-10 \
  && verifiers/run_tests.sh 10-risch npx --yes tsx 10-risch/solution.ts

cd /home/tobiasosborne/Projects/tstournament/test-10-shellout \
  && verifiers/run_tests.sh 10-risch npx --yes tsx 10-risch/solution.ts
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

End of worklog. Good luck with `test-3`.
