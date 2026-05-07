# 13a — `packages/bigfloat`: arbitrary-precision binary-radix floating point

The substrate that everything downstream depends on. Pure new package
in `scientist-workbench`. No overlap with existing workbench substrate
(`cas-core` is rational-arithmetic; `linalg-core` is float64).

## Scope

A pure-TypeScript arbitrary-precision floating-point library, MPFR-
style: `(BigInt mantissa, i32 binary exponent, precision)`. Correctly-
rounded primitives plus the special functions every downstream layer
needs.

## Required primitives

### Core arithmetic

- `add(a, b, prec) → bigfloat`
- `sub(a, b, prec) → bigfloat`
- `mul(a, b, prec) → bigfloat`
- `div(a, b, prec) → bigfloat`
- `sqrt(a, prec) → bigfloat`
- `pow(a, b, prec) → bigfloat` (general; integer-power fast path)
- `neg(a) → bigfloat`
- `abs(a) → bigfloat`
- Comparisons: `eq, lt, le, gt, ge` (exact)
- Conversions: `fromInt(n) / fromRational(p, q, prec) / fromString(s, prec)`,
  `toString(a, digits)`, `toFloat64(a)` (best-effort with overflow flag)

### Transcendentals (all to user-specified precision)

- `exp(a, prec)`, `expm1(a, prec)` (`exp(a) − 1`, accurate near 0)
- `log(a, prec)`, `log1p(a, prec)`
- `sin / cos / tan(a, prec)`, `asin / acos / atan(a, prec)`,
  `atan2(y, x, prec)`
- `sinh / cosh / tanh / asinh / acosh / atanh(a, prec)`
- `pi(prec)`, `e(prec)` (cached per-precision)

### Special functions (the load-bearing set for MeijerG)

- `gamma(a, prec)` — for both real and **complex** `a`. The gamma
  function on the complex plane, Lanczos approximation lifted to
  arb-prec, or Stirling for large `|a|` with reflection for `Re(a) < ½`.
- `lgamma(a, prec)` — log gamma (avoids overflow).
- `digamma(a, prec)` — `ψ(a) = Γ'(a) / Γ(a)`. Critical for the
  parameter-coalescence regime.
- `polygamma(n, a, prec)` — `ψ^{(n)}(a)`. Needed for higher-order pole
  residues.

### Complex arithmetic

`bigcomplex = {re: bigfloat, im: bigfloat}` with all arithmetic
analogues. Most of MeijerG's evaluation happens in complex space.

## Determinism

- All operations are bit-identical given fixed precision and fixed
  inputs.
- Cross-platform reproducible (BigInt is bit-identical in any JS
  runtime).
- New ADR in workbench: `arbitrary-precision tier (numerical: true;
  precision: <N>; bit-identical given (precision, platform))`.
  Extends ADR-0014/0015/0016 lineage.

## Reference

- [MPFR](https://www.mpfr.org/) — *the* canonical arbitrary-precision
  binary-radix library; reference for correct-rounding semantics. Pure
  C; not a porting source for MeijerG (no overlap), but the contract
  is what we mimic.
- mpmath's `mpf` / `mpc` core — implementation reference shape, but
  forbidden as porting source per problem-13's no-direct-porting clause.
  *Not consulted; we derive from MPFR semantics and IEEE-754 round-half-
  to-even.*

## Acceptance

- All primitives pass a comprehensive test battery cross-validated
  against `mpmath` (run *outside* the candidate; the candidate doesn't
  see mpmath's source). Random-input bit-identical-comparison harness.
- Performance gate: 100-dps `Γ(z)` in ≤ 5 ms for typical `|z| ≤ 100`,
  100-dps `exp(z)` in ≤ 1 ms.
- Independent self-test via `--test` per ADR-0010.

## Why this is the long pole

The MeijerG benchmark is downstream of every primitive in this
package. A bug in `digamma` produces wrong coalescence-tier answers;
a bug in `gamma` produces wrong everything; a bug in `exp` near `Re(z)
< 0` propagates into Slater's `z^{b_k}` factor.

The package ships when (i) every primitive's correctness is verified
against mpmath at hundreds of dps over a randomised input sweep, and
(ii) the `--test` hook proves a structural invariant per primitive.

## Workbench landing

Lands as `scientist-workbench/packages/bigfloat/`. New ADR for the
arb-prec tier. Becomes the foundation for any future arb-prec tool
(numerical-tier-2 in the workbench's lineage).

## Bead

`bd show ts-bench-meijer-g-13a` (or whatever ID is assigned).
