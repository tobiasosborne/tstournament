# Verifier protocol — Problem 10, Risch

`verify.py` differentiates the candidate antiderivative and uses
`simplify` to compare against the integrand. It also runs an independent
Risch existence check.

## Invocation

```
cat <case>.json | python3 verify.py
```

stdin:

```jsonc
{
  "input":     {"integrand": "...", "variable": "x"},
  "candidate": {"antiderivative": "..." | null},
  "id":        "<case id>"
}
```

stdout:

```jsonc
{
  "pass":   true,
  "reason": "all invariants hold",
  "checks": {
    "shape":              {"pass": ..., "detail": "..."},
    "derivative_matches": {"pass": ..., "detail": "..."},
    "existence_agrees":   {"pass": ..., "detail": "..."}
  }
}
```

## The three checks

### 1. `shape`

Output is `{"antiderivative": null}` or `{"antiderivative": <string>}`.
The string must parse as a sympy expression.

### 2. `derivative_matches`

If non-null, `simplify( diff(F, x) − f ) == 0` where `F` is the
candidate antiderivative and `f` is the integrand.

Note: `simplify` is the identity operator on already-simplified
expressions but can fail to simplify some valid identities. If the
agent's antiderivative is mathematically correct but written in an
unusual form that `simplify` cannot collapse, this check may
spuriously fail. The agent should ensure their answer reduces under
`sympy.simplify` — typically by avoiding hyperbolic ↔ exponential
rewrites and keeping the answer in the same extension as the input.

### 3. `existence_agrees`

The candidate's null/non-null answer matches the reference's
null/non-null answer. The reference is `risch_integrate(f, x)`, with
unevaluated `Integral(...)` translated to `null`.

## What is *not* checked

- The candidate's antiderivative is **not required** to match the
  reference's antiderivative as a string. Two antiderivatives differing
  by a constant or by a different choice of representative form both
  pass `derivative_matches`.
- Trigonometric, algebraic, and special-function extensions are out of
  scope. The verifier will not feed them.

## Edge-case rationale

| ID                    | What it catches                                     |
|-----------------------|-----------------------------------------------------|
| `poly_zero`           | `0 → 0`                                             |
| `poly_const`          | `C → C·x`                                           |
| `rat_one_over_x`      | `1/x → log(x)`                                      |
| `rat_log_arg`         | Rational with logarithmic primitive                 |
| `x_exp_x`             | Integration by parts in disguise                    |
| `log_over_x`          | `log(x)²/2` — typical Risch test                    |
| `recip_x_log_x`       | `log(log(x))`                                       |
| `x_exp_x2`            | Substitution-style; `(1/2)·exp(x²)`                 |
| `nonelem_exp_x2`      | Classical non-elementary diagnostic                 |
| `nonelem_exp_over_x`  | Classical non-elementary diagnostic                 |
| `nonelem_recip_log`   | Classical non-elementary diagnostic                 |
