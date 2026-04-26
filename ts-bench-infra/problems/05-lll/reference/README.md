# Reference implementation — Problem 5, LLL

> **STRIPPED.** This file (and the rest of `reference/`) is removed by
> `infra/strip-for-testing.sh`.

`lll_reference.py` wraps SymPy's exact-integer LLL implementation:
`sympy.polys.matrices.DomainMatrix.lll(delta=...)` over `ZZ`. SymPy's
implementation is the textbook integer LLL with rational arithmetic; it
matches the algorithmic form in Cohen §2.6.

## Cross-check inside the verifier

The verifier (`golden/verify.py`) does **not** import this reference.
Instead, it independently verifies that the candidate's output satisfies
the size-reduction and Lovász conditions in exact rationals, that the row
span is preserved (Hermite normal form), and that the Gram determinant is
preserved. This is *stronger* than comparing against another LLL impl:
many distinct LLL-reduced bases can exist for the same lattice; the
verifier accepts any of them.

The reference is used only to seed `golden/expected.json` for audit.

## Generating the golden master

```
python3 problems/05-lll/golden/generate.py
```
