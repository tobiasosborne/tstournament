# Reference implementation — Problem 2, NTT

> **STRIPPED.** This file (and the rest of `reference/`) is removed by
> `infra/strip-for-testing.sh`.

`ntt_reference.py` is a literal `O(n²)` schoolbook NTT mod `p` defined by
the formula in `DESCRIPTION.md`. It exists to:

1. Define the unambiguous correct answer for every test case (no rounding,
   no normalisation ambiguity — modular arithmetic is exact).
2. Seed `golden/expected.json` from `golden/generate.py`.
3. Be re-used inside `golden/verify.py` for both the equality check and the
   independent roundtrip / convolution-theorem checks.

It is intentionally slow (no Bluestein, no Montgomery, no NTT butterflies).
Speed is the *agent's* problem; correctness is the *reference's* problem.

## Cross-check

Cross-checked against `sympy.discrete.transforms.ntt` for power-of-two
lengths:

```
from sympy.discrete.transforms import ntt as sympy_ntt
assert schoolbook_forward([1,2,3,4,5,6,7,8], 8) == sympy_ntt([1,2,3,4,5,6,7,8], 998244353)
```

(`sympy.ntt` does not handle non-power-of-two lengths, so for those, the
schoolbook is the only reference.)

## Generating the golden master

```
python3 problems/02-ntt/golden/generate.py
```
