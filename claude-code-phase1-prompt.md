# Prompt for Claude Code: TS-Benchmark Infrastructure (Phase 1)

## Context

I'm testing the hypothesis that Claude models effectively "think" in TypeScript — that for sophisticated algorithms with no public TS implementation, Claude implements them in TS faster and more correctly than in Julia, Python, or C. The benchmark is 10 algorithms in increasing order of subtlety / obscurity. Algorithms 2–10 have, by selection, no usable TS implementations on the public web.

The 10 problems (fixed order, do not reorder):

1. Iterative radix-2 Cooley-Tukey FFT (in-place, bit-reversal). *Baseline; TS impls exist.*
2. Number-Theoretic Transform — arbitrary length, Bluestein chirp-z, Montgomery multiplication.
3. Online suffix automaton (Blumer et al., 1985).
4. Schreier-Sims with Sims' filter (BSGS + group order).
5. LLL lattice reduction with exact rationals, δ = 3/4.
6. Stoer-Wagner global minimum cut.
7. Edmonds' blossom algorithm for maximum-weight matching in general graphs.
8. Buchberger's algorithm for Gröbner bases over ℚ[x₁,…,xₙ], lex + degrevlex, with normal selection + Buchberger's two criteria.
9. PSLQ integer relation detection (Ferguson-Bailey, multi-precision floats).
10. Risch algorithm, transcendental Liouvillian case (Bronstein, *Symbolic Integration I*, Ch. 5–6).

We are building the **infrastructure** repo today: `ts-bench-infra`. A separate **testing** repo `ts-bench-test`, derived from it in Phase 2 with reference implementations stripped, is what test agents will see in Phase 3. Today's job is Phase 1 only.

## Directory layout

```
ts-bench-infra/
├── README.md
├── problems/
│   ├── 01-fft/
│   ├── 02-ntt/
│   ├── 03-suffix-automaton/
│   ├── 04-schreier-sims/
│   ├── 05-lll/
│   ├── 06-stoer-wagner/
│   ├── 07-blossom/
│   ├── 08-buchberger/
│   ├── 09-pslq/
│   └── 10-risch/
├── infra/
│   ├── playwright/         # headed-Chrome scrapers (TIB VPN)
│   ├── verifiers/          # shared language-neutral verification harness
│   └── strip-for-testing.sh
└── scripts/
```

Every `problems/NN-name/` contains:

- `DESCRIPTION.md` — formal problem statement: signature, inputs, outputs, invariants, edge-case checklist.
- `REFERENCES.md` — full citations + local PDF paths + one paragraph naming exactly which sections of which sources are load-bearing ground truth.
- `sources/` — downloaded papers, book chapters, errata.
- `reference/` — canonical reference implementation(s). **Excluded from `ts-bench-test`.**
- `golden/inputs.json` — test inputs.
- `golden/expected.json` — expected outputs (when direct comparison applies).
- `golden/verifier_protocol.md` — plain-language verification protocol.
- `golden/verify.py` (or `.sage`, or `.wls`) — language-neutral verifier with a JSON I/O contract.
- `golden/generate.py` — the script that produced the golden master, with seeded RNG, for audit.
- `PROMPT.md` — the exact prompt that will be handed to the test agent in Phase 3.

## Phase-1 tasks

### Task A — Canonical sources via Playwright

I'm on the TIB Hannover VPN, so paywalled content (Springer, IEEE, ACM, Wiley, Elsevier) is reachable. Spawn one research subagent per problem. **Use Playwright with headed Chrome.** Reuse the session / cookie / user-profile patterns from `../Feynfeld.jl/scripts/` and `../FQHE.jl/scripts/` — read those first and copy their idioms; do not invent a new download harness.

Per problem, download:

- The original paper(s).
- At least one canonical textbook treatment (e.g., Bronstein for Risch; Cox-Little-O'Shea for Buchberger; the original Stoer-Wagner paper; Galil's 1986 matching survey for blossom; Cohen's *Course in Computational Algebraic Number Theory* for LLL; Holt's *Handbook of Computational Group Theory* for Schreier-Sims).
- The most-cited erratum or follow-up if the original has known subtle bugs.

Save as PDFs under `problems/NN-name/sources/`. Populate `REFERENCES.md`.

### Task B — Canonical implementations

For each problem, install or fetch a trusted reference implementation:

| #  | Reference                                                                          |
|----|------------------------------------------------------------------------------------|
| 1  | NumPy `numpy.fft.fft`                                                              |
| 2  | SymPy `sympy.discrete.transforms.ntt` + cross-check Mathematica `Fourier`          |
| 3  | A vetted C++ competitive-programming source (KACTL or jiangly); cite the SHA       |
| 4  | GAP via subprocess, or SymPy `combinatorics.PermutationGroup`                       |
| 5  | SageMath `Matrix.LLL()` or `fpylll`                                                |
| 6  | NetworkX `stoer_wagner`                                                            |
| 7  | NetworkX `max_weight_matching`                                                     |
| 8  | SymPy `groebner`; cross-check Singular if available                                |
| 9  | `mpmath.pslq`                                                                      |
| 10 | SymPy `risch_integrate`; cross-check Mathematica `Integrate` via `wolframscript`   |

Place under `problems/NN-name/reference/`. These will be stripped in Phase 2.

### Task C — Language-agnostic golden masters (the critical task)

Golden masters must be consumable by any target language — TS, Julia, Python, C, Lean. Rules:

1. **Inputs are JSON.** Pick a uniform encoding per data type, document it in `infra/verifiers/encoding.md`, and apply it consistently across problems:
    - Complex numbers: `[re, im]` as decimal strings.
    - Big integers: decimal strings, never JSON numbers.
    - Rationals: `{"num": "...", "den": "..."}` with string fields.
    - Polynomials: sparse `[[exponent_vector, coeff_string], …]`.
    - Permutations: 0-indexed image arrays.
    - Graphs: `{"n": …, "edges": [[u, v, w], …]}` with weights as strings if exact.
2. **Outputs are JSON in the same encoding.** Ship `expected.json` whenever direct comparison is well-defined.
3. **Where direct comparison fails, ship a verifier predicate.** `verify.py` reads `(input, candidate_output)` JSON on stdin and writes `{"pass": bool, "reason": str, "checks": {...}}` on stdout. The verifier is allowed to use SymPy/SageMath/mpmath internally — what matters is that the *interface* is language-neutral. The test agent's TS code only ever produces JSON and shells out to `verify.py`.
4. **Per-problem test population:**
    - 5–10 hand-crafted edge cases: empty input, n=1, n=2, degenerate graphs, repeated roots, integrands that hit Liouville's negative-result theorem, etc. Document each in `verifier_protocol.md`.
    - ≥20 seeded random cases at varied scales. Pin the seed in `generate.py`.
    - ≥2 "stress" cases at the upper bound of what the reference handles cleanly.
5. **Encode invariants, not just I/O equality.** For each problem, the verifier checks the algorithm's defining mathematical invariants in addition to (or instead of) raw output equality:
    - **FFT:** forward∘inverse = id to machine ε; Parseval's identity holds; vs. O(N²) DFT for N ≤ 64.
    - **NTT:** NTT∘INTT = id mod p; convolution-via-NTT equals schoolbook for small inputs.
    - **Suffix automaton:** distinct-substring count matches brute force for |s| ≤ 20; |states| ≤ 2|s|−1; LCS via product automaton matches brute force.
    - **Schreier-Sims:** returned BSGS reproduces the known order for Sₙ, Aₙ, M₁₁, M₁₂, M₂₄; random membership tests agree with reference.
    - **LLL:** post-reduction satisfies size-reduction (|μ_{i,j}| ≤ ½) and Lovász conditions exactly (rational arithmetic); Gram determinant is preserved; on Lagarias-Odlyzko knapsack lattices the planted short vector is recovered.
    - **Stoer-Wagner:** cut value equals NetworkX; cut is a valid partition.
    - **Blossom:** matching is valid (disjoint endpoints); total weight equals reference.
    - **Buchberger:** every input generator reduces to 0 modulo the output basis; every S-pair of basis elements reduces to 0; cross-check leading-monomial ideal matches SymPy.
    - **PSLQ:** returned relation vector dotted with input vector is below threshold; recovers known relations for [1, ln 2, ln 3, ln 6], BBP coefficients, and minimal polynomials of small algebraic numbers.
    - **Risch:** symbolic differentiation of the candidate antiderivative equals the input integrand (SymPy `simplify(diff(F) - f) == 0`); for known non-elementary inputs (e^{x²}, sin(x)/x) the agent must return a "no elementary antiderivative" sentinel that the verifier accepts.

### Task D — Per-problem agent prompt

Each `problems/NN-name/PROMPT.md` contains exactly:

1. The problem statement (trimmed `DESCRIPTION.md`).
2. The function signature and JSON I/O schema the agent must implement.
3. Paths to `golden/inputs.json`, `golden/expected.json` (if shipped), `golden/verify.py`, and the exact shell command to run them.
4. A **string-match block** with short verbatim excerpts from the local PDFs — at most one sentence each, respect copyright — each excerpt followed by file path + page number. This grounds the agent in canonical phrasing without shipping the full PDFs into the test repo. Use these excerpts to pin down the load-bearing definitions and invariants only.
5. Explicit constraints: do not consult external sources; implement from the description and cited passages alone; run `verify.py` before declaring done; report the verifier's `checks` dict in the final answer.

`PROMPT.md` plus the `golden/` directory is the *only* input the Phase-3 test agent receives.

### Task E — Phase-2 strip script

Write `infra/strip-for-testing.sh` that produces `ts-bench-test/` from `ts-bench-infra/` by:

- Copying everything except `problems/*/reference/` and `problems/*/sources/`.
- Removing any mention of reference-implementation function names or library names from `DESCRIPTION.md` and `PROMPT.md` (e.g., the test repo must not contain the strings `risch_integrate`, `stoer_wagner`, `LLL()`, etc.).
- Running `grep -rE` for a configurable list of forbidden tokens and failing loudly if any appear.

Do not run this script in Phase 1. Just write it and unit-test it on a dummy problem.

## What to do right now

1. Create the directory skeleton.
2. Read `../Feynfeld.jl/scripts/` and `../FQHE.jl/scripts/`. Report back with a one-paragraph summary of the Playwright patterns you'll reuse (cookie store path, profile dir, headed-mode flags, retry/backoff).
3. Draft `infra/verifiers/encoding.md` proposing the unified JSON encoding for all data types listed in Task C.1.
4. **Stop and wait for me to confirm** the source list per problem and the encoding draft before downloading anything.

After my confirmation, execute Tasks A–E **problem-by-problem**. Do not start problem N+1 until problem N's full pipeline runs end-to-end and the reference implementation passes its own golden master with all invariants green.

## Hard rules

- Golden masters are language-agnostic JSON + a verifier with a JSON I/O contract. No exceptions.
- Reference implementations live in `reference/` only. Never inline reference code or distinctive identifiers into `DESCRIPTION.md` or `PROMPT.md`.
- Every random test case has its RNG seed pinned in `generate.py`.
- Verifiers check mathematical invariants, not just output equality.
- Phase 1 ends when all 10 problems' pipelines verify green against their reference implementations *and* `strip-for-testing.sh` produces a `ts-bench-test/` that I can manually inspect for leakage.
- No work on Phase 3 (running test agents) until I have signed off on the test repo.
