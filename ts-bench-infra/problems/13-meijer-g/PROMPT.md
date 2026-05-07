# Problem 13 — Campaign brief (top level)

This file is the **campaign-level brief**. The tournament protocol for
problem 13 is structured as a **five sub-problem campaign**, not a
single trial. The agent invocations live in
[`sub-problems/13a..e/PROMPT.md`](sub-problems/) — those files are the
ones to copy into a `test-13a/` … `test-13e/` sandbox when staging a
trial. This file gives the over-arching context that every sub-trial
inherits.

## Goal

Implement the Meijer G-function in pure TypeScript across:

1. **Symbolic dispatch.** When the input parameters match a known
   closed-form reduction, the candidate emits a closed-form
   expression in the closed special-function vocabulary — identical
   semantic content to the right-hand side of an identity in
   Bateman §5.6, PBM Vol 3 §8.4, or DLMF §16.18.

2. **Arbitrary-precision numerical evaluation.** When the verifier
   requests `N` decimal digits, the candidate returns the value as a
   decimal string with `≥ N` significant figures of agreement against
   the Wolfram + mpmath consensus oracle. Empirically the two oracles
   agree bytewise to ≥ 200 digits on generic parameters.

3. **Honest out-of-region refusal.** When the input has no convergent
   contour (`p > q ∧ |z| < 1` etc., per DLMF §16.17 case-tree), the
   candidate returns a tagged refusal — never a silently wrong
   number.

The bar is **better than Mathematica**: more reliable handling of the
parameter-coalescence regime (Mathematica's symbolic engine handles
this well but its numerical code path occasionally returns
indeterminate); honest tagging at the `|z| = 1` Stokes boundary;
pinned principal-branch convention; matched arb-prec across the
parameter space.

See [`DESCRIPTION.md`](DESCRIPTION.md) for the function definition and
the failure-mode taxonomy.

## Constraints

- **Pure TypeScript.** No `child_process`, no shellout, no
  Python / SymPy / NumPy / external CAS, no native binaries, no
  non-JS WASM. Stdin/stdout glue and pure-JS npm packages permitted
  for **plumbing substrate only**. Specifically:
  - **Permitted plumbing**: pure-JS arbitrary-precision binary-radix
    bigfloat libraries; pure-JS BigInt-based linear algebra;
    pure-JS expression-parser libraries.
  - **Forbidden**: any package whose API is itself a special-function
    library (`bessel.js`, `mathjs.MeijerG`, `cephes.js`,
    `besselj.js`, etc.). The algorithm must be the candidate's.

- **No-direct-porting** (extending problem 12's clause). The brief
  forbids consulting and audits the delivered source against:
  - `mpmath/functions/hypergeometric.py` — especially the function
    `meijerg` and its support routines `hypercomb`, `hyper`,
    `_hyp_borel`, `nint_distance`, `hmag`, `eliminate`,
    `_hypercomb_msg`.
  - SymPy's `sympy/simplify/hyperexpand.py`,
    `sympy/integrals/meijerint.py`, `sympy/functions/special/hyper.py`.
  - Mathematica internals (closed; not retrievable, but flagged for
    completeness).
  - Maple internals (closed; same).
  - REDUCE / Maxima / FriCAS implementation source.

  **Permitted**: every paper / book / handbook in
  [`REFERENCES.md`](REFERENCES.md), the NIST DLMF, the Wolfram
  Functions Site formulas (1363 of them across 14 categories — they
  are derivations, not source code), the mpmath / SymPy / Wolfram
  *documentation* (API reference, parameter lists).

  **Audit grep at trial close.** Four dimensions:
  1. **Function-name grep.** Forbidden identifiers list (above).
  2. **Short-form variable grep.** mpmath's `hmag`, `vp`, `vm`, `nint`,
     `hextra`; SymPy's `inhomogeneous_series`, `_my_unpolarify`.
  3. **Constant-table grep.** Any byte-identical pre-computed
     constant table from a known reference's source.
  4. **Comment-by-comment grep.** Suspicious correspondence between
     the candidate's docblock comments and a known reference's
     comments.

- **Workbench reuse is mandatory.** The `scientist-workbench` repo
  provides substrate that **must** be reused (not duplicated):
  - The `cas-core` AST and pattern-matching engine.
  - The `cas-simplify` reduction-rule infrastructure.
  - The `integrate-1d` adaptive G7K15 quadrature shape (extended
    to arb-prec for layer 5).
  - The numerical-tier ADR-0014/0015/0016 conventions
    (`numerical: true`, platform fingerprint, warning-based scaling).
  - The protocol value language (10 primitive kinds; foreign-pass-
    through invariant).
  - The `defineTool` / `runTool` shape (ADR-0010).
  - The seven-artefact tool contract.

  New substrate (arbitrary-precision bigfloat, special-function AST
  vocabulary extension, pFq evaluator, MeijerG itself) lands in
  `scientist-workbench` packages/tools after the trial closes — see
  [`PLAN.md`](PLAN.md) §"Workbench landing" for the graduation map.

## Methodology — five sub-problem campaign

The five sub-problems in dependency order:

1. **[13a — `packages/bigfloat`](sub-problems/13a-bigfloat/)**.
   Arbitrary-precision binary-radix floating point with correctly-
   rounded `±·÷√/exp/log/sin/cos/atan/Γ/ψ`. Pure new substrate; no
   workbench overlap. Foundation for everything downstream.

2. **[13b — special-function AST + `tools/hypergeometric-pfq`](sub-problems/13b-special-fn-ast-and-pfq/)**.
   Extend `cas-core`'s closed AST vocabulary with the
   special-function heads MeijerG needs (Bessel, Whittaker, PFQ,
   Erf, Polylog, Γ, ψ, …). Build the arb-prec
   `pFq(a₁..aₚ; b₁..b_q; z)` evaluator (Pearson–Olver–Porter 2017
   taxonomy). Cascades into `cas-diff` derivative rules.

3. **[13c — MeijerG numerical Slater](sub-problems/13c-meijerg-numerical-slater/)**.
   Slater residue-summation evaluator with Series 1 / Series 2
   dispatch; Johansson `hmag` perturbation for parameter
   coalescence; cancellation-detection retry. Composes the 13a
   substrate and the 13b pFq evaluator. Passes Tiers C / D / G of
   the main verifier.

4. **[13d — MeijerG symbolic dispatch](sub-problems/13d-meijerg-symbolic-dispatch/)**.
   Adamchik–Marichev (ISSAC 1990) + Roach (ISSAC 1996/97) pattern-
   table dispatch with ~1300 reduction rules curated from Bateman
   §5.6, PBM Vol 3 §8.4, and the Wolfram Functions site. Reuses
   `cas-simplify`'s pattern-matching engine. Passes Tiers A / B
   (closed-form reductions).

5. **[13e — integrated MeijerG with branch + asymptotic + dispatcher](sub-problems/13e-meijerg-integrated/)**.
   Braaksma 1964 / Paris–Kaminski 2001 asymptotic path for `|z| → ∞`;
   principal-branch convention pin (DLMF §16.17.1, `arg z ∈ (−π, π]`);
   top-level symbolic-then-Slater-then-contour-then-asymptotic
   dispatcher with honest refusal. Reuses 13a / 13b / 13c / 13d.
   Passes Tiers E / F / H + final integration.

Each sub-problem has its own PROMPT.md (filled in when staged for a
trial). Each ships a REVIEW.md scorecard. Problem 13 is "green" only
when all five close.

**Multi-session continuation.** This is the first problem in the suite
expected to span months. The orchestrator maintains a
`WORKLOG-13.md` in this directory tracking which sub-problem is
in-progress, what the on-disk artefact is, and what remains. The
test-12 lesson from worklog 005 ("orchestration outage event")
applies: when an async agent appears stalled, prefer
continuation-from-file over kill-and-respawn.

## Verifier and oracle

- **Test-set design**: [`VERIFIER-PROTOCOL.md`](VERIFIER-PROTOCOL.md) —
  three output categories (symbolic / numerical / refusal); 8 tiers
  + Tier-0 anchors; tolerances per tier.
- **Ground truth**: [`ORACLE-STRATEGY.md`](ORACLE-STRATEGY.md) —
  Wolfram + mpmath consensus at 110 dps; Tier-0 closed-form anchors
  computed from the RHS in mpmath at 200 dps (oracle-bug-immune);
  quarantine band at `|z| = 1 ∧ p = q ∧ m + n = p`.

## Output contract (per sub-problem trial)

The agent's `solution.ts` reads JSON test cases from stdin, writes one
JSON object per line to stdout. The output object has one of three
`kind` values: `"symbolic"`, `"numerical"`, `"out-of-region"`. See
[`VERIFIER-PROTOCOL.md`](VERIFIER-PROTOCOL.md) for the exact shape.

## Beads (issue tracking)

This problem and every sub-problem is registered as a bead in
`scientist-workbench`. List with:

```sh
cd ../../scientist-workbench
bd list -l "ts-bench-meijer-g"
```

Pick up the next ready sub-problem with `bd ready`; close completed
work with `bd close <id>`. The pre-commit hook auto-syncs
`.beads/issues.jsonl` to git.

## Source materials

The primary papers are referenced in
[`REFERENCES.md`](REFERENCES.md) with DOIs / URLs. **Source PDFs are
not redistributed** — they are copyrighted by their respective
publishers. Anyone reproducing the benchmark needs to source the
papers via institutional access, fair-use download from open archives
(arxiv where applicable), or the publishers directly.
