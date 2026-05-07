# Problem 13 — Meijer G-function

The thirteenth problem in the suite. Implements the Meijer G-function in pure
TypeScript across **three coupled axes simultaneously**: a curated symbolic
reduction table, arbitrary-precision numerical evaluation, and the dispatch
between them. The bar is "better than Mathematica" — more reliable symbolic
reductions in the parameter-coalescence regime, matched arbitrary-precision
numerics across the entire `(m, n, p, q)` parameter space, and honest
out-of-region tagging where a closed-form / convergent answer does not exist.

This is a **mega-test**: substantially larger than problems 11 and 12 combined,
and the first multi-session campaign in the suite.

## The function

The Meijer G-function is defined by a Mellin–Barnes contour integral

```
                   m,n  ⎛ a₁,…,aₚ │   ⎞       1     ⌠   ∏_{j=1}^m Γ(b_j − s) · ∏_{j=1}^n Γ(1 − a_j + s)
                  G    ⎜          │ z ⎟ =  ─────  ⎮  ─────────────────────────────────────────────────  z^s ds
                   p,q  ⎝ b₁,…,b_q │   ⎠     2πi   ⌡L  ∏_{j=m+1}^q Γ(1 − b_j + s) · ∏_{j=n+1}^p Γ(a_j − s)
```

with three contour choices `L_-`, `L_+`, `L_∞` whose admissibility depends on
`(m, n, p, q)` and on `|z|` (DLMF §16.17.2). It generalises virtually the
entire elementary-and-special-function pantheon: every `pFq`, every Bessel,
every Whittaker, every parabolic-cylinder, every Legendre / Chebyshev /
Laguerre / Hermite / Gegenbauer, every error / Fresnel / exponential-integral,
every polylogarithm and Lerch transcendent, every incomplete Γ / B, plus all
the elementary `sin / cos / exp / log / arcsin / arctan / pow` cases.

## Why this is the mega-test

Problems 1–10 reward "implement the canonical form correctly". Problem 11
punishes the canonical form on near-degenerate geometric inputs (Shewchuk
adaptive predicates); problem 12 punishes both naive arithmetic *and*
transliteration of canonical reference C (Ryu / Eisel-Lemire). Problem 13
punishes:

- **Naive Slater residue summation** when two `b`-parameters differ by an
  integer — simple-pole formula gives 0/0; correct handling needs polygamma
  derivative residues. Or, equivalently, **Johansson's perturbation trick** —
  perturb every parameter by `2^-hmag` and retry, recovering the L'Hôpital
  limit.
- **Stokes-phenomenon misses** at `|z| ≈ 1` in the balanced `p = q` case,
  where Slater's two natural series both diverge term-wise on the boundary.
- **Wrong branch convention** on the negative real axis (`z = −r ± iε`).
- **Symbolic-dispatch myopia** — failing to recognise that the input has a
  closed-form reduction (e.g. `G^{1,0}_{0,2}({};{ν/2, −ν/2}|z²/4) = J_ν(z)`)
  and falling back to a slow, lossy numerical eval.
- **Missing the arbitrary-precision tier** — passing tests at double precision
  but blowing up at 50, 100, 200 dps when catastrophic cancellation between
  Slater's `m` residue terms dominates.

The brief explicitly demands all four are handled correctly.

## What the candidate must produce

A pure-TypeScript implementation with **two output modes**:

1. **Symbolic reduction.** When the input has a known closed-form reduction
   (Adamchik–Marichev / Roach pattern-table dispatch), the candidate emits
   a closed-form expression in a fixed AST vocabulary
   (`Sin / Cos / Exp / Log / Pow / Gamma / Digamma / BesselJ / BesselY / BesselI /
   BesselK / HypergeometricPFQ / WhittakerM / WhittakerW / ParabolicCylinderD /
   Erf / Erfc / ExpIntegralEi / Polylog / Pi / E`).
2. **Arbitrary-precision numerical.** When the verifier requests an arb-prec
   value at `N` decimal digits, the candidate returns the value as a
   decimal string with the requested precision, agreeing with the
   Wolfram + mpmath consensus oracle to ≥ N sig figs.

Plus an **honest refusal mode** when the input is genuinely out of every
convergent region (`p > q ∧ |z| < 1` etc., per the DLMF §16.17 case-tree).

## Constraints

Same pure-TS constraint as problems 11 and 12 (no shellout, no Python /
SymPy / NumPy / external CAS, no native binaries, no non-JS WASM); pure-JS
npm packages permitted **for plumbing substrate only** (an arbitrary-precision
binary-radix bigfloat package is permitted; any package whose API is itself
a special-function library — `bessel.js`, `mathjs.MeijerG`, etc. — is not).

**No-direct-porting** — extending problem 12's clause: forbidden to consult
`mpmath/functions/hypergeometric.py` (especially `meijerg`, `hypercomb`,
`hyper`, `_hyp_borel`, `nint_distance`, `hmag`); SymPy's
`sympy/simplify/hyperexpand.py` and `sympy/integrals/meijerint.py`;
Mathematica internals; Maple internals. Audit grep across four dimensions —
function names, short-form variable names, table-name patterns, byte-identical
constant tables — as in problem 12. The benchmark measures *derive from
papers*, not *transliterate Python to TS*.

**Workbench reuse.** The candidate's implementation must reuse
`scientist-workbench` substrate where it exists (cas-core AST, cas-simplify
pattern-matching infrastructure, integrate-1d quadrature shape, the
numerical-tier ADR-0014/0015 conventions, the foreign-pass-through
invariant). New substrate (arb-prec bigfloat, special-function AST
vocabulary, pFq evaluator at arb-prec, MeijerG itself) lands in
`scientist-workbench` packages/tools after the trial closes — see
[`PLAN.md`](PLAN.md) §"Workbench landing".

## Methodology — multi-session campaign

This is the first problem in the suite structured as a **five sub-problem
campaign**, not a single trial:

- **13a — `packages/bigfloat`**: arbitrary-precision binary-radix floating
  point with correctly-rounded primitives and the Γ / ψ / log / exp /
  trig / sqrt / pow special functions needed for everything downstream.
- **13b — special-function AST + `tools/hypergeometric-pfq`**: extend
  `cas-core`'s AST vocabulary with the special-function heads MeijerG
  needs; build the arb-prec `pFq(a₁..aₚ; b₁..b_q; z)` evaluator
  (Pearson–Olver–Porter 2017 taxonomy).
- **13c — Slater numerical path**: residue-summation evaluator with
  Johansson `hmag` perturbation for parameter coalescence; Series-1 /
  Series-2 dispatch by `(p, q, m, n, |z|)`. Passes Tiers C / D / G of the
  main verifier.
- **13d — Adamchik–Marichev + Roach symbolic dispatch**: pattern-table of
  ~1300 reductions; `pFq → named-function` recogniser. Passes Tiers A / B
  (closed-form reductions).
- **13e — coalescence + branch + asymptotic + integrated dispatcher**:
  Braaksma 1964 / Paris–Kaminski 2001 asymptotic path; principal-branch
  pin (DLMF §16.17.1, `arg z ∈ (−π, π]`); top-level
  symbolic-then-Slater-then-contour-then-asymptotic dispatcher with honest
  refusal. Passes Tiers E / F / H.

Each sub-problem ships its own REVIEW.md; problem 13 is "green" only when
all five close. Wall-clock budget: months, not minutes.

## Files in this directory

- [`DESCRIPTION.md`](DESCRIPTION.md) — this file.
- [`PROMPT.md`](PROMPT.md) — the canonical campaign brief; sub-problem-specific
  briefs live in `sub-problems/13{a..e}/PROMPT.md` (filled in when staged).
- [`PLAN.md`](PLAN.md) — the seven-layer implementation stack, dependency
  DAG, and `scientist-workbench` reuse map.
- [`REFERENCES.md`](REFERENCES.md) — load-bearing bibliography.
- [`ORACLE-STRATEGY.md`](ORACLE-STRATEGY.md) — Wolfram + mpmath consensus
  protocol, quarantine policy, Tier-0 anchor strategy.
- [`VERIFIER-PROTOCOL.md`](VERIFIER-PROTOCOL.md) — three output categories,
  multi-point sampling for symbolic equality, tier-by-tier tolerances.
- [`golden/`](golden/) — to be generated.
- [`sub-problems/13{a..e}/`](sub-problems/) — per-sub-problem
  DESCRIPTION.md and PROMPT.md.
