# Reference implementation — Problem 1, FFT

> **STRIPPED.** This file (and the rest of `reference/`) is removed by
> `infra/strip-for-testing.sh`. Do not put information here that the test
> agent should see.

`fft_reference.py` wraps `numpy.fft.fft` and `numpy.fft.ifft` behind the
JSON I/O contract from `DESCRIPTION.md`. NumPy uses the engineering
convention (forward unscaled, inverse `1/N`) that this problem fixes.
NumPy is built on pocketfft, a mixed-radix Stockham-style implementation;
the verifier (`golden/verify.py`) tolerates the rounding-order differences
between pocketfft and a textbook radix-2 Cooley-Tukey via mixed
absolute/relative tolerance.

## Why a separate reference at all?

For Problem 1, `golden/verify.py` already calls `numpy.fft.fft` /
`numpy.fft.ifft` to compare against the candidate, so `reference/` is
nominally redundant — it exists to keep the cross-problem layout uniform
(later problems have heavier references that shell out to SymPy / Sage /
GAP / Mathematica, where keeping the reference separate from the verifier
matters).

## Generating the golden master

```
python3 problems/01-fft/golden/generate.py
```

This calls `numpy.fft.fft` / `ifft` to fill `expected.json` from the seeded
inputs in `inputs.json`.
