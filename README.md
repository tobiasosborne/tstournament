# tstournament

A TypeScript algorithm benchmark for evaluating large language models on
sophisticated, paper-grounded algorithm implementation. Twelve problems
spanning FFT, NTT, suffix automata, Schreier-Sims, LLL, Stoer-Wagner,
Edmonds' blossom, Buchberger / Gröbner, PSLQ, Risch integration,
Shewchuk's adaptive-precision predicates, and the shortest-round-trip
float-to-string / correctly-rounded string-to-float pair —
each pinned to a primary source paper, with a golden-master test harness
that is exact (no tolerance for symbolic / modular problems, tight
numerical tolerance for floating-point ones).

## Why TypeScript

Most LLM coding benchmarks land in Python with a NumPy / SciPy / SymPy
ecosystem one import away. That measures *delegation taste* more than
*algorithmic implementation*. TypeScript, with no scientific stdlib,
forces the model to actually implement: write the modular reduction,
write the bit-reversal, write the symbol-pushing AST. The
algorithmic core must in principle run in a browser.

## Repository layout

```
.
├── ts-bench-infra/        Phase-1 infra: 10 problem dirs, golden masters,
│                          reference implementations, verifier harness.
├── test-1/                Phase-3 trial: 01-fft (Opus 4.7, pure-TS, 39/39 green).
├── test-2/                Phase-3 trial: 02-ntt (Opus 4.7, pure-TS, 64/64 green).
├── test-10/               Phase-3 trial: 10-risch (Opus 4.7, pure-TS, 18/18 green).
├── test-10-shellout/      Counterpoint trial: 10-risch with shellout allowed
│                          (SymPy-driven, 18/18 green) — kept as a side probe.
├── WORKLOG.md             Session handoff document.
└── claude-code-phase1-prompt.md   Original Phase-1 spec prompt (historical).
```

Each `test-N/` is a self-contained sandbox: the problem statement, the
golden master, the verifier harness, and the model's solution. Source
PDFs and reference implementations are deliberately not staged in trial
dirs, so the model sees only the canonical problem description and the
verifier surface.

## The twelve problems

See `ts-bench-infra/README.md` for the full table. The short list:

| # | Problem | Primary paper |
|---|---|---|
| 01 | FFT (radix-2/4, mixed-radix) | Cooley & Tukey 1965 |
| 02 | NTT (`p = 998244353`, arbitrary length) | Pollard 1971 + Bluestein 1970 + Montgomery 1985 |
| 03 | Suffix automaton | Blumer et al. 1985 |
| 04 | Schreier-Sims (permutation-group base/SGS) | Sims 1970 |
| 05 | LLL (lattice basis reduction) | Lenstra-Lenstra-Lovász 1982 |
| 06 | Stoer-Wagner min-cut | Stoer & Wagner 1997 |
| 07 | Edmonds' blossom (max-weight matching) | Edmonds 1965 + Galil 1986 |
| 08 | Buchberger / Gröbner basis | Buchberger 1965/1979 |
| 09 | PSLQ (integer-relation detection) | Ferguson-Bailey-Arno 1999 |
| 10 | Risch integration (transcendental-elementary) | Risch 1969/1970 + Bronstein 1998 |
| 11 | Shewchuk's adaptive-precision predicates (orient2d, orient3d, incircle, insphere) | Shewchuk 1996 |
| 12 | Shortest-round-trip float ↔ string (`dtoa` + `strtod`) | Steele-White 1990 + Loitsch 2010 + Adams 2018 + Clinger 1990 + Lemire 2021 |

Problem 11 is structurally distinct from 1–10. Where 1–10 reward
"implement the canonical form correctly" — each has a textbook
expression that maps cleanly to TypeScript — problem 11 *punishes* the
canonical form. The naive `Math.sign(determinant)` evaluator looks
right and passes random cases, but fails ~25% of an adversarially-
constructed test set on near-degenerate inputs. A `bigint`-rational
implementation passes correctness everywhere but times out on the
speed-gate tier. Only an IEEE-754 adaptive-precision implementation in
the spirit of Shewchuk's `predicates.c` (staged expansion arithmetic,
static + dynamic error-bound escalation) passes all tiers under the
1.5-second per-case budget. The golden master is generated from a
ctypes-wrapped build of Shewchuk's canonical C, with a `Fraction`-based
Python reference cross-validated to byte-perfect agreement on every
query — see `ts-bench-infra/problems/11-shewchuk-predicates/`.

Problem 12 inherits problem 11's correctness/speed tension and adds an
explicit **no-direct-porting** hard constraint. The brief forbids the
agent from consulting `ulfjack/ryu`, `lemire/fast_float`, OpenJDK's
`DoubleToDecimal`, Go `strconv`, David Gay's `dtoa.c`, or any other
canonical reference implementation, and the orchestrator audits the
delivered source for transliteration markers (function names matching
a published reference verbatim, comment-by-comment correspondence,
constant tables byte-identical to a known reference's `.h`). The
benchmark measures *derive from paper*, not *transliterate C to TS*.
The test set includes the full Apache-2.0 `nigeltao/parse-number-fxx-
test-data` strtod corpus (~21 200 cross-implementation cases used by
Rust's `fast-float`, Go's `strconv` since 1.16, simdjson, RapidJSON,
FreeType) plus an Adams-2018-§5 dtoa regression catalogue and a full
subnormal-binade sweep — see
`ts-bench-infra/problems/12-float-string/`.

## Methodology

Each Phase-3 trial:

1. **Stage** the problem directory (`PROMPT.md`, `DESCRIPTION.md`,
   `REFERENCES.md`, `golden/`) into a fresh `test-N/` sandbox. Copy the
   verifier harness. **Do not** copy reference implementations or source
   PDFs — the model is graded on what it produces, not on what it can
   echo.
2. **Scrub** forbidden tokens that would leak the canonical solution
   (e.g. `sympy.discrete.transforms.ntt`, `sympy.integrals.risch`).
   Defense-in-depth, mirrors `ts-bench-infra/infra/strip-for-testing.sh`.
3. **Spawn** the model with a brief that includes the **pure-TS hard
   constraint**: no `child_process`, no shellout, no Python / SymPy /
   NumPy / external CAS, no native binaries, no non-JS WASM. Stdin/stdout
   glue and pure-JS npm packages are fine.
4. **Run** the verifier independently after the model declares done.
   Trust the harness, not the self-report. Audit the source for
   constraint compliance.
5. **Review** with a seven-dimension scorecard: correctness, constraint
   compliance, algorithmic depth, code quality, numerical stability,
   honesty of self-report, and engineering judgment. See
   `test-2/REVIEW.md` for the canonical example.

A "shellout" variant (test-10-shellout) is kept as a side probe — it
shows what the model does when the constraint is removed. Without the
constraint, problem 10's verifier degenerates into "SymPy agreeing with
itself" and produces no model-tier signal.

## Results so far

| Trial | Problem | Model | Constraint | Verifier | Lines | Wall-clock | Tokens |
|---|---|---|---|---|---|---|---|
| `test-1`  | 01-fft   | Opus 4.7 | pure-TS  | 39/39 | 218   | 5m 46s | 42k  |
| `test-2`  | 02-ntt   | Opus 4.7 | pure-TS  | 64/64 | 417   | 23m 42s | 113k |
| `test-10` | 10-risch | Opus 4.7 | pure-TS  | 18/18 | 2 265 | 24m 59s | 159k |
| `test-10-shellout` | 10-risch | Opus 4.7 | none | 18/18 | 300 | 4m 36s | 41k |

The `test-10` pure-TS / shellout pair is the load-bearing comparison:
same model, same verifier score, ~5× wall-clock and ~4× tokens to
implement Risch from scratch versus delegating to SymPy. That gap is the
benchmark.

Planned: re-run problems 02-09 on Opus 4.7 first, then sweep Sonnet 4.6,
Haiku 4.5, and local models against the same protocol. Trial outputs are
deliberately structured to be model-comparable: same staging, same brief
skeleton, same scorecard.

## Running a trial

The verifier harness expects `python3` (with `numpy` and `sympy` for
some problems), `node` 20+, `npx`, and `jq`.

```bash
# Sanity-check a reference impl against its golden master.
cd ts-bench-infra
infra/verifiers/run_tests.sh problems/02-ntt python3 problems/02-ntt/reference/ntt_reference.py

# Re-run a completed trial.
cd test-2
verifiers/run_tests.sh 02-ntt npx --yes tsx 02-ntt/solution.ts
```

Trial protocol details and the staging recipe live in `WORKLOG.md`.

## Source materials

The primary papers are referenced in `ts-bench-infra/problems/*/REFERENCES.md`
with DOIs / URLs. **The PDFs themselves are not redistributed** — they
are copyrighted by their respective publishers (AMS, IEEE, Springer,
ACM, Elsevier, …). Anyone reproducing the benchmark needs to source the
papers via institutional access, fair-use download from open archives,
or the publishers directly.

The benchmark's prose (`PROMPT.md`, `DESCRIPTION.md`) quotes short
canonical-phrasing excerpts from the papers, with file:page citations,
under fair use.

## License

AGPL-3.0. See `LICENSE`.

The choice is deliberate: this is research scaffolding, and any
downstream service that wraps it should remain available to the same
community. If you're running a private benchmark internally, AGPL is no
imposition; if you're embedding it into a hosted service, AGPL asks you
to share the modifications back.
