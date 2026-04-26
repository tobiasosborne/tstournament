# Problem 1 — Iterative Radix-2 FFT (in-place, bit-reversal)

## What to implement

An iterative radix-2 Cooley-Tukey Fast Fourier Transform, working in-place on
a complex array whose length is a power of two. Both directions (forward and
inverse) are required.

## Mathematical specification

Let `x = (x_0, …, x_{N−1}) ∈ ℂ^N` with `N = 2^m`, `m ≥ 0`. Define

- **Forward** `X_k = Σ_{j=0}^{N−1} x_j · exp(−2πi j k / N)`, for `k = 0, …, N−1`.
- **Inverse** `x_j = (1/N) · Σ_{k=0}^{N−1} X_k · exp(+2πi j k / N)`, for `j = 0, …, N−1`.

The forward transform has **no `1/N` factor**; the `1/N` lives entirely on the
inverse. (This is the "engineering" convention with the forward unscaled.
The verifier will reject the unitary-symmetric `1/√N` convention.)

`N = 1` is the identity in both directions.

## Algorithmic constraints

The implementation must be:

1. **Iterative.** No recursive calls. (A recursive implementation will satisfy
   the I/O contract but does not meet the spec; this will be checked
   structurally only by inspection — the JSON-level verifier cannot detect it.)
2. **Radix-2.** Inputs whose length is not a power of two must be rejected
   with a clear error. The verifier will not feed non-power-of-two inputs.
3. **In-place.** The transform writes into the input buffer. (Same caveat as
   "iterative" — checked by inspection.)
4. **Bit-reversal permutation.** The standard decimation-in-time pattern: a
   bit-reversal pre-permutation, then `log₂ N` butterfly passes with twiddles
   `exp(±2πi · k / 2^s)`.

The interface below treats inputs and outputs as immutable JSON arrays for the
sake of language-neutral testing; the in-place property is a property of the
algorithm, not of the JSON wrapper.

## I/O contract (JSON)

### Input

```jsonc
{
  "n":         <int, power of two, ≥ 1>,
  "direction": "forward" | "inverse",
  "x":         [[re, im], [re, im], …]   // length n, JSON numbers
}
```

### Output

```jsonc
[[re, im], [re, im], …]   // length n, JSON numbers
```

Real and imaginary parts are JSON numbers (machine-precision floats). See
`infra/verifiers/encoding.md` for the rationale.

## Invariants the verifier checks

1. **Length.** `len(candidate) == n`.
2. **Equality.** `candidate ≈ ref(x, direction)` componentwise, with absolute
   tolerance `1e-9` and relative tolerance `1e-10` (mixed: `|a − b| ≤ atol + rtol · |b|`).
3. **Parseval.** `Σ |x_j|² ≈ (1/n) · Σ |candidate_k|²` if `direction == "forward"`;
   `n · Σ |candidate_j|² ≈ Σ |x_k|²` if `direction == "inverse"`.
4. **Naive DFT match.** For `n ≤ 64`, `candidate ≈ naive_dft(x, direction)`
   computed as the literal `O(n²)` sum.

The Parseval check uses absolute tolerance `1e-7 · max(1, ||x||²)`.

## Edge cases the test set covers

- `n = 1`, both directions (identity).
- `n = 2`, all-ones, impulse, Nyquist `[1, −1]`.
- DC vector `[1, 1, …, 1]` of length `n` — forward must be `[n, 0, …, 0]`.
- Impulse `[1, 0, …, 0]` of length `n` — forward must be `[1, 1, …, 1]`.
- Single root of unity `x_j = exp(2πi j / n)` — forward must be `n · δ_{k,1}`.
- Real-valued input (`im = 0` everywhere); the verifier checks Hermitian
  symmetry of the forward transform up to tolerance.
- Pure imaginary input.
- Large random Gaussian complex vectors at `n ∈ {16, 32, …, 1024}`.
- Stress at `n = 16384` and `n = 65536`.

## What the agent does *not* implement

- No real-input optimisations (rfft).
- No mixed-radix, prime-factor, Bluestein, or Rader — those are problems 2 and
  beyond.
- No multidimensional transforms.
- No streaming / overlap-add.
