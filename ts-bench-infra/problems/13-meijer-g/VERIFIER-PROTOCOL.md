# Problem 13 — Verifier protocol

The verifier is unusual for the suite: it accepts **three output
categories** depending on which tier the test case targets. Most
problems in tstournament have a single output shape; problem 13
inherits the `cas-simplify`-style multi-shape contract from the
workbench (ADR-0003 lineage, generalised).

## Test-case input shape

Every test case in `golden/inputs.json` has the form

```json
{
  "case_id": "tier-A-001-exp-z",
  "tier": "A",
  "input": {
    "kind": "MeijerG-eval-request",
    "an": ["1/2", "1"],
    "ap": ["3/2"],
    "bm": ["0", "1/2"],
    "bq": [],
    "z": {"kind": "rational", "num": "5", "den": "3"},
    "request_mode": "auto",
    "request_precision": 50
  },
  "expected": { ... }
}
```

- `an` (list of strings) — the first `n` `a`-parameters.
- `ap` (list of strings) — the remaining `p − n` `a`-parameters.
- `bm` (list of strings) — the first `m` `b`-parameters.
- `bq` (list of strings) — the remaining `q − m` `b`-parameters.
- `z` — the argument; `rational` for tier-0 anchors,
  `{kind: "complex", re: <bigfloat-string>, im: <bigfloat-string>}`
  for generic complex cases.
- `request_mode ∈ {"auto", "symbolic-required", "numerical-required"}`:
  - `"symbolic-required"` — used in tiers A and B; the candidate must
    return `kind: "symbolic"`. Returning a numerical answer is a
    failure even if numerically correct.
  - `"numerical-required"` — used in tier H (speed gate) and parts of
    C / D; the candidate must return `kind: "numerical"`. Returning a
    symbolic answer is a failure even if symbolically correct.
  - `"auto"` (default) — the candidate may choose; both shapes are
    accepted as correct if they pass their respective checks.
- `request_precision` (integer, decimal digits) — meaningful when the
  candidate returns `kind: "numerical"`.

## Three output categories

The candidate's `solution.ts` reads the input from stdin (one
JSON object per line), writes one JSON object per line to stdout.

### 1. Symbolic output

```json
{
  "kind": "symbolic",
  "expr": {"head": "Times",
           "args": [{"head": "Power",
                     "args": [{"head": "E", "args": []},
                              {"head": "Negate",
                               "args": [{"head": "Symbol", "value": "z"}]}]},
                    {"head": "Constant", "value": "1"}]}
}
```

The `expr` is an AST in the closed special-function vocabulary
(`Plus / Times / Power / Negate / Constant / Sin / Cos / Exp / Log /
BesselJ / BesselY / BesselI / BesselK / HypergeometricPFQ / WhittakerM
/ WhittakerW / ParabolicCylinderD / Erf / Erfc / ExpIntegralEi /
Polylog / Gamma / Digamma / Pi / E / I / Sqrt / Square / Inverse / ...`).
The exact vocabulary is fixed in
[`sub-problems/13b-special-fn-ast-and-pfq/DESCRIPTION.md`](sub-problems/13b-special-fn-ast-and-pfq/DESCRIPTION.md).

### 2. Numerical output

```json
{
  "kind": "numerical",
  "value": {"kind": "complex", "re": "0.082084998623898781...", "im": "0"},
  "achieved_precision": 50
}
```

`value.re` and `value.im` are decimal strings. `achieved_precision`
must be ≥ `request_precision`.

### 3. Out-of-region refusal

```json
{
  "kind": "out-of-region",
  "reason": "p > q with |z| < 1: integrand has no convergent contour",
  "ruled_out_methods": ["slater-series-1", "slater-series-2", "mellin-barnes-direct"]
}
```

`reason` is a free-text human-readable diagnosis. `ruled_out_methods`
is a closed-vocabulary list. The verifier accepts the refusal iff the
test-case `expected.shape == "out-of-region"`.

## Verifier checks

For each test case:

### shape check (always)

The candidate output shape (`kind`) must match the test case's
`expected.shape`. Mismatched shape ⇒ fail.

### symbolic check (`expected.shape == "symbolic"`)

1. Parse `candidate.expr` and `expected.expr` into the closed AST.
2. **Multi-point sampling**: generate `K = 20` random complex points
   `z₁, …, z_K` from the convergence region of the test case (or the
   expected expression's natural domain), with `|z_i|` log-uniform in
   `[10^{−3}, 10^3]` and `arg z_i` uniform in `(−π, π)`. For each `z_i`,
   evaluate both expressions at high precision (200 dps) using the
   verifier's reference implementation of the AST evaluator (Python +
   mpmath; the verifier is allowed to use the workbench, so to speak,
   from outside).
3. **Pass** iff for every `i`, `|candidate(z_i) − expected(z_i)| /
   max(|expected(z_i)|, 10^{−180}) < 10^{−100}`.

The verifier does *not* attempt symbolic equality via canonicalisation.
The candidate is free to emit any equivalent closed form
(`(1−z²)^{−1/2}` and `(1/√(1−z²))` and `1/sqrt(1−z*z)` all pass).

### numerical check (`expected.shape == "numerical"`)

1. Parse `candidate.value` and `expected.value` as bigfloats.
2. Compute relative error
   `|candidate − expected| / max(|expected|, 10^{-(precision)−10})`.
3. **Pass** iff the relative error is below the tier-tolerance
   (table below).
4. Additionally: `candidate.achieved_precision ≥
   expected.request_precision`.

### refusal check (`expected.shape == "out-of-region"`)

1. `candidate.kind == "out-of-region"`.
2. The test case's `expected.allowed_reasons` (a closed-vocabulary
   list) must contain at least one element that matches some
   substring of `candidate.reason` *or* `candidate.ruled_out_methods ⊇
   expected.required_ruled_out_methods`.

## Tier-by-tier tolerance table

| Tier | Description | Cases | Mode | Tolerance |
|---|---|---|---|---|
| 0 | Closed-form anchors (RHS-evaluated, oracle-bug-immune) | ~35 | symbolic-required | multi-point ≤ `1e-100` |
| A | Elementary reductions (`exp`, `sin`, `log(1+z)`, `arctan`) | 12 | symbolic-required | multi-point ≤ `1e-100` |
| B | Bessel / erf / Whittaker / pFq / incomplete-Γ | 25 | symbolic-required | multi-point ≤ `1e-100` |
| C | Random non-coalescent `(m,n,p,q)`, `\|z\| ∈ [0.1, 10]` | 60 | auto | rel ≤ `1e-(precision − 5)` |
| D | `\|z\| ∈ {0.95, 1.05}`, anti-Stokes | 30 | auto | rel ≤ `1e-(precision − 8)` |
| E | Coalescent `b`-list (integer differences) | 25 | auto | rel ≤ `1e-(precision − 8)` |
| F | Complex `z` straddling `arg z = ±π` (branch cut) | 20 | numerical-required | rel ≤ `1e-(precision − 8)` |
| G | Out-of-region: `p > q ∧ \|z\| < 1`, on-circle boundary | 15 | refusal | tag match |
| H | Speed-gate: 200 LCG-generated cases at `request_precision = 50`, time budget `≤ 1.5 s/case` after warm-up | 200 | numerical-required | rel ≤ `1e-40`, plus per-case wall-clock check |

## Hybrid-tolerance floor

For every numerical check, the tolerance is

```
|candidate − expected|  ≤  tol · max(|expected|, atol)
```

with `atol = 10^{-(precision)}`. This handles near-zero answers (e.g.
`J_n` evaluated near a Bessel zero) without inflating relative
tolerance.

## What "speed gate" measures

For tier H, each case has a per-case wall-clock budget. The verifier
times the candidate's evaluation at 50-dps precision. **Symbolic
dispatch myopia trap**: the LCG sweep includes parameter values that
look generic but actually collapse to closed-form Bessel / Whittaker
shapes; an implementation that always falls through to Slater (no
symbolic dispatch) takes 50–500 ms per case via `pFq` evaluation,
while symbolic-first dispatch resolves it in microseconds. A pure
Slater implementation will time out on a fraction of tier H.

## Implementation note

The verifier is `golden/verify.py` (Python, language-neutral JSON I/O
per existing tstournament convention). It uses mpmath for the
arbitrary-precision AST evaluation. The verifier is NOT pure-TS —
that constraint is on the *candidate*, not the oracle.
