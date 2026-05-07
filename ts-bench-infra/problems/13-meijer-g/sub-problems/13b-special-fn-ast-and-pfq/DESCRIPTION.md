# 13b — Special-function AST + `tools/hypergeometric-pfq`

Two coupled deliverables, one sub-problem. Lifts the substrate from
13a one layer: from arithmetic primitives to symbolic vocabulary and
the first arb-prec numerical tool.

## Part 1 — `cas-core` AST vocabulary extension

`scientist-workbench/packages/cas-core` already has a closed AST with
the elementary numerical vocabulary used by `cas-diff`,
`integrate-1d`, `optimize-lbfgs-projected`:

```
+ − * / ^ neg
exp sin cos tan sinh cosh tanh log sqrt abs
asin acos atan asinh acosh atanh
log2 log10
pi e
```

MeijerG demands extending this with the **special-function vocabulary**:

```
Gamma Digamma Polygamma            (Γ, ψ, ψ^{(n)})
BesselJ BesselY BesselI BesselK    (cylindrical Bessel functions)
HypergeometricPFQ                  (the generalised pFq)
WhittakerM WhittakerW              (confluent in Whittaker form)
ParabolicCylinderD                 (parabolic-cylinder D_ν)
Erf Erfc                           (error / complementary error)
ExpIntegralEi ExpIntegralE         (Ei, E_n)
FresnelC FresnelS                  (Fresnel cosine / sine)
LegendreP LegendreQ                (Legendre P_ν, Q_ν)
LaguerreL HermiteH ChebyshevT ChebyshevU GegenbauerC
                                   (orthogonal-polynomial families)
Polylog                            (polylog Li_s)
LerchPhi                           (Lerch transcendent Φ)
MeijerG                            (MeijerG itself, as a recursive node)
```

Each new head needs:

1. AST node definition + canonicalisation order.
2. Numerical evaluation `evalAt(args, prec)` calling 13a's bigfloat
   primitives (or pFq, recursively, where appropriate).
3. Symbolic derivative rule (cascades into `cas-diff`).
   E.g. `d/dz J_ν(z) = (J_{ν−1}(z) − J_{ν+1}(z))/2`;
   `d/dz Γ(z) = ψ(z) · Γ(z)`;
   `d/dz (z^a) = a · z^{a−1}`.
4. Pretty-printer.
5. `expr-parse` round-trip: text "BesselJ[1/2, z]" parses correctly.

This is a **closed vocabulary** — no head outside the list above is
admitted. Foreign sub-terms wrap as `tagged "<tool>/out-of-scope"`
per workbench convention.

ADR required: "Special-function vocabulary extension to cas-core".
Cascades into all downstream tools that use `cas-core` AST
(`cas-diff`, `integrate-1d`, `optimize-lbfgs-projected`,
`integrate-ode-*`, `solve`).

## Part 2 — `tools/hypergeometric-pfq`

The first arb-prec numerical tool in the workbench. Evaluates

```
pFq(a₁, …, aₚ; b₁, …, b_q; z) = Σ_{k=0}^∞  (a₁)_k · … · (aₚ)_k
                                            ───────────────────  ·  z^k / k!
                                            (b₁)_k · … · (b_q)_k
```

at user-requested precision `N` decimal digits.

### Algorithm — Pearson–Olver–Porter 2017 taxonomy

The which-method-where map for `pFq` evaluation:

- **Direct power series** (default): when the series converges
  absolutely with no catastrophic cancellation. Sum up to the
  precision target plus a safety margin.
- **Asymptotic / Borel resummation** for divergent series (`p ≥ q + 1`):
  `2F0`, `3F1` etc. Truncate at the optimal point (smallest term);
  Borel sum what remains where applicable.
- **Closed-form fast paths** for the named cases:
  - `0F0(; ; z) = e^z`.
  - `0F1(; b; z) = Γ(b) · z^{(1−b)/2} · J_{b−1}(2√z)` for `Re(b) > 0`,
    or `I_{b−1}(2√(−z))` for `z < 0` etc. — but these are *one
    direction*; in the other direction we compute Bessel via `0F1`.
    Wire carefully.
  - `1F1(a; b; z)` — Kummer's confluent hypergeometric. Use the
    Kummer transformation `1F1(a; b; z) = e^z · 1F1(b−a; b; −z)`
    for sign-flip when beneficial.
  - `2F1(a, b; c; z)` — Gauss. Direct series for `|z| < 1 − ε`;
    Bühring 1987 / Becken-Schmelcher 2000 connection at `z ≈ 1`;
    Pfaff / Euler transformations to bring `|z|` into the convergence
    disc when feasible.
- **Recurrence relations** for parameter shifts (Gauss's contiguous
  relations) — useful when one parameter is far from the origin and
  recurrence is numerically stable per Gil–Segura–Temme 2006.

### I/O contract

```json
input:  {"a": ["1/2", "1"],
         "b": ["3/2", "2"],
         "z": {"kind": "complex", "re": "...", "im": "..."},
         "precision": 50}
output: {"value": {"kind": "complex", "re": "...", "im": "..."},
         "achieved_precision": 50,
         "method": "direct-series-with-acceleration",
         "n_terms": 142,
         "warnings": []}

      | tagged "hypergeometric-pfq/non-convergent"  (e.g. parameters
                                                     create the divergent
                                                     2F0 with no Borel
                                                     interpretation)
      | tagged "hypergeometric-pfq/branch-cut-crossing"
                                                    (when the connection
                                                     formula needed lies
                                                     across an
                                                     undocumented branch)
```

`warnings` list captures (i) cancellation-detected-precision-bumped,
(ii) close-to-Stokes-line, (iii) parameter approaching pole.

### Determinism

`numerical: true; precision: <N>` — bit-identical given
`(precision, platform)` per the new ADR. Provenance records the
platform fingerprint when float64 is involved at any rounding step.

## Bench

`bench/hypergeometric-pfq` battery in `scientist-workbench`. Tier-graded
parallel to `bench/linalg-{qr,svd,eigh}` lineage. Cross-validated
against `mpmath.hyper` at high precision.

## Acceptance

- AST extension passes `bun run check` end-to-end (including
  `cas-diff` derivative-rule additions).
- `tools/hypergeometric-pfq` passes its bench (~50 cases across
  `0F1`, `1F1`, `2F1`, `2F0`, `3F2`, edge cases at `z ≈ 1` and
  `z = 1`).
- `--test` hook proves the structural invariant: agreement between
  direct series and the closed-form fast path on a representative
  case for each `(p, q)` pair.

## Workbench landing

- AST extension lands directly in `packages/cas-core`. ADR. Cascades.
- `tools/hypergeometric-pfq` lands as a new tool. ADR for the
  arb-prec-numerical tier (extension of ADR-0014/0015/0016).
- `bench/hypergeometric-pfq` lands as the test battery.

## Bead

`bd show ts-bench-meijer-g-13b` (or assigned ID).
