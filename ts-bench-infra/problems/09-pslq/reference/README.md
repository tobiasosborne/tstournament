# Reference implementation — Problem 9, PSLQ

> **STRIPPED.** This file (and the rest of `reference/`) is removed by
> `infra/strip-for-testing.sh`.

`pslq_reference.py` calls `mpmath.pslq(vec, maxcoeff=max_coeff)` at the
requested decimal precision. mpmath implements the standard PSLQ as in
Ferguson-Bailey-Arno 1999.

## Cross-check inside the verifier

The verifier (`golden/verify.py`) does two things independently:

1. Computes its own reference relation by running PSLQ via mpmath
   internally (yes, the same library — but a *fresh* invocation, not a
   shared object).
2. Checks the candidate's relation directly: bounded magnitude,
   non-zero, small inner product with `x`. A candidate that satisfies
   these three local properties is accepted even if it differs from the
   reference relation by a multiplicative scalar or a different
   primitive choice — both are valid PSLQ answers.

## Generating the golden master

```
python3 problems/09-pslq/golden/generate.py
```
