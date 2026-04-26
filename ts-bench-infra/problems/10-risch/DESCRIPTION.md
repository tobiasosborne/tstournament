# Problem 10 — Risch Algorithm (transcendental Liouvillian case)

## What to implement

Given a univariate integrand `f(x)` built from `ℚ(x)` and the
**transcendental** elementary functions `exp(·)` and `log(·)`, return
either an elementary antiderivative `F(x)` such that `F'(x) = f(x)`, or
a sentinel claim that **no elementary antiderivative exists**.

The supported function class is exactly the one covered by **Bronstein,
*Symbolic Integration I*, Chapters 5–6** — the transcendental
Liouvillian extensions. Trigonometric extensions, algebraic extensions,
and special functions (Ei, Li, erf, …) are explicitly out of scope.

The construction algorithm is the **Risch algorithm**, recursing
through nested transcendental extensions: at each level, decompose into
polynomial part, simple part, and reduced part; integrate each by the
appropriate Hermite, Liouvillian, and Risch-Norman procedures; combine
or report failure.

## I/O contract (JSON)

### Input

```jsonc
{
  "integrand": "<expression string>",
  "variable":  "x"
}
```

`integrand` is a SymPy-parseable expression in `x` involving `+`, `-`,
`*`, `/`, `**`, integer constants, rationals (`Rational(1, 2)` style is
not required; `1/2` is fine), and the symbols `exp`, `log`. Example
inputs:

- `"x*exp(x)"`
- `"log(x)/x"`
- `"(2*x + 1)/(x**2 + x + 1)"`
- `"exp(x**2)"`  ← non-elementary
- `"exp(x)/x"`   ← non-elementary

### Output

```jsonc
{ "antiderivative": "<expression string>" }
{ "antiderivative": null }                  // no elementary antiderivative exists
```

The answer is a SymPy-parseable expression; surface form is up to you,
as long as `d/dx` of your answer simplifies to the integrand.

## Invariants the verifier checks

1. **Shape.** Either `null` or a string that parses as a sympy
   expression in `x` (or in the constants `exp`, `log` applied to such).
2. **Differentiation matches.** If non-null,
   `simplify( diff(antiderivative, x)  −  integrand ) == 0`.
3. **Existence agrees with reference.** Either both candidate and
   reference return non-null, or both return null.

The verifier does **not** check antiderivative equality up to a
constant in any other way: differentiation is the unique invariant.

## Edge cases the test set covers

- Polynomial integrands: `x`, `x**2 + 1`, `0`.
- Rational integrands: `1/x`, `(2*x + 1)/(x**2 + x + 1)`,
  `1/(x*(x + 1))`.
- Mixed exp/log: `x*exp(x)`, `log(x)/x`, `1/(x*log(x))`.
- Exponential of polynomial: `x*exp(x**2)` (elementary;
  `(1/2)*exp(x**2)`).
- Logarithmic integrands: `log(x)`, `x*log(x)`.
- The classical non-elementary diagnostics: `exp(x**2)`,
  `exp(x)/x`, `1/log(x)` — antiderivative is `null`.
- Constant: `5`.
- Zero integrand: `0`.

## What the agent does *not* implement

- No trigonometric integrands. `sin`, `cos`, `tan` will not appear.
- No algebraic extensions (no `sqrt(...)` of an irreducible polynomial
  in `x`).
- No special functions (no Ei, Li, erf, gamma, …) in either input or
  output. The non-elementary sentinel is `null`, not "Ei(x)".
- No definite integration, no integration over contours.
- No multivariate integrands (the integration variable is always `x`).
