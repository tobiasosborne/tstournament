# Reference implementation — Problem 10, Risch

> **STRIPPED.** This file (and the rest of `reference/`) is removed by
> `infra/strip-for-testing.sh`.

`risch_reference.py` calls SymPy's `risch_integrate(f, x)`. SymPy
implements the transcendental Liouvillian Risch algorithm (the same
scope as Bronstein Ch. 5–6). When the integrand is non-elementary, SymPy
returns an unevaluated `Integral(...)`; we translate that into
`{"antiderivative": null}` so the verifier can compare on the same
sentinel.

## Cross-check inside the verifier

The verifier (`golden/verify.py`) does not import this reference. It
parses the candidate's antiderivative via `sympy.parsing.sympy_parser.parse_expr`,
differentiates, and uses `simplify` to check the result equals the
integrand. It then runs its own `risch_integrate` to test
existence agreement.

## Generating the golden master

```
python3 problems/10-risch/golden/generate.py
```
