# Reference implementation — problem 12

`float_string_reference.py` is the canonical Python reference. It uses
CPython's built-in `repr(float)` for `dtoa` (provably shortest
round-trip since Python 3.1, derived from David Gay's `dtoa.c` mode 0
plus the Python formatter) and built-in `float(str)` for `strtod`
(correctly rounded under round-to-nearest-even).

Run it through the verifier as a sanity check:

```
infra/verifiers/run_tests.sh problems/12-float-string \
    python3 problems/12-float-string/reference/float_string_reference.py
```

Expected output: `shape N/N · batch_complete N/N · bitwise_correct N/N`
across all cases.

The reference is **the same engine that produces the golden master**;
this run validates that the verifier is internally consistent rather
than that the reference is correct (which is established by CPython's
specification and 25+ years of stdlib usage).

## Cross-validation against canonical alternatives

The Python reference is cross-validated by `golden/generate.py` against:

- **`decimal.Decimal`** for halfway-point tie-break: the verifier
  decomposes each Tier-F input via `Decimal(s)`, computes the binary
  mantissa via `Decimal` arithmetic, and confirms the round-to-nearest-
  even result matches `float(s)`. This catches CPython-internal bugs
  that would corrupt the golden.
- **`Number.prototype.toString()`** for cross-check on Tiers A-B
  (where V8's Grisu3 and CPython's repr agree on >99.9% of cases).
  Disagreements are flagged in `generate.py`; any disagreement
  indicates either a generator bug or a known Grisu-corner case (in
  which case the golden uses the CPython value).

## Notes for non-CPython use

`repr(float)` shortest-round-trip behaviour is **CPython-specific** —
PyPy and other Python implementations also implement it (it's part of
the language spec since 3.1), but the *implementation* differs and
edge-case behaviour around NaN payloads, signed zero, and the
smallest subnormal can vary. Run `golden/generate.py` on CPython 3.10
or newer for byte-identical golden masters.
