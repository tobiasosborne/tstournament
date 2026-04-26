# Reference implementation — Problem 8, Buchberger

> **STRIPPED.** This file (and the rest of `reference/`) is removed by
> `infra/strip-for-testing.sh`.

`buchberger_reference.py` calls SymPy's `groebner(...)` to produce the
reduced Gröbner basis of the input ideal in the requested order. SymPy
implements Buchberger with the normal selection strategy and the two
classical criteria; the result is the canonical reduced GB.

The verifier (`golden/verify.py`) does **not** require the candidate to
match SymPy's reduced GB byte-for-byte. It checks ideal equality (in
both directions) plus the Gröbner basis property (S-pairs reduce to 0
mod candidate). Multiple Gröbner bases of the same ideal in the same
order all pass — the canonical reduced GB is just one of them.

## Generating the golden master

```
python3 problems/08-buchberger/golden/generate.py
```
