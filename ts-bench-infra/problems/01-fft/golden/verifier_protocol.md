# Verifier protocol — Problem 1, FFT

Plain-language description of what `verify.py` does, what it accepts, what it
rejects, and which invariants it pins.

## Invocation

```
cat <case>.json | python3 verify.py
```

where `<case>.json` is the merge of one element from `inputs.json` (the
`input` field) with the candidate output produced by the test agent's code:

```jsonc
{
  "input":     {"n": ..., "direction": "...", "x": [...]},
  "candidate": [[re, im], ...],
  "id":        "<case id>"   // optional
}
```

The verifier prints one JSON object on stdout:

```jsonc
{
  "pass":   true,
  "reason": "all invariants hold",
  "checks": {
    "shape":     {"pass": ..., "detail": "..."},
    "equality":  {"pass": ..., "detail": "..."},
    "parseval":  {"pass": ..., "detail": "..."},
    "naive_dft": {"pass": ..., "detail": "..."}
  }
}
```

The verifier exits 0 even if `pass` is false. Non-zero exit means the
verifier itself crashed.

## The four checks

### 1. `shape`

`candidate` must be a JSON list of `[re, im]` pairs of length exactly `n`.
Anything else fails immediately, before the other checks run.

### 2. `equality`

The candidate must match the reference forward (resp. inverse) DFT
componentwise within mixed tolerance:

```
|cand[k] − ref[k]|  ≤  1e-9 + 1e-10 · |ref[k]|     for all k
```

### 3. `parseval`

For the engineering FFT convention (forward un-normalised, inverse `1/n`):

- `direction == "forward"` ⇒ `||x||² ≈ ||candidate||² / n`.
- `direction == "inverse"` ⇒ `n · ||candidate||² ≈ ||x||²`.

Tolerance:

```
|lhs − rhs|  ≤  1e-7  +  1e-9 · max(1, |lhs|, |rhs|)
```

This catches normalisation mistakes (`1/n` on the wrong side, missing factor,
`1/√n` symmetric variant) even when the candidate is otherwise the right
shape.

### 4. `naive_dft`

For `n ≤ 64`, the verifier recomputes the literal `O(n²)` DFT/IDFT sum

```
naive[k]  =  Σ_{j=0}^{n−1} x_j · exp(±2πi j k / n)        (÷ n if inverse)
```

and checks `|cand[k] − naive[k]| ≤ 1e-9 + 1e-10 · |naive[k]|`.

This is independent of any library: it pins the *definition*. For `n > 64`
the check is auto-passed (the equality check still runs at large `n`).

## What is *not* checked at the JSON level

The structural constraints of the algorithm — iterative, in-place,
bit-reversal — are not visible to the verifier, since the JSON wrapper hides
them. They are pinned in `DESCRIPTION.md` and would be enforced by manual
inspection if a borderline submission required it.

## Edge-case rationale

Every hand-crafted edge case in `generate.py` exists because it kills a
specific class of bug:

| ID                              | What it catches                                           |
|---------------------------------|-----------------------------------------------------------|
| `edge_n1_*`                     | Off-by-one in the base case; `log₂(1) = 0` butterfly loop |
| `edge_n2_dc`                    | Missing twiddle at the bottom level                       |
| `edge_n2_nyquist`               | Sign of the twiddle exponent                              |
| `edge_n2_impulse`               | Bit-reversal trivial-permutation case                     |
| `edge_n8_dc`                    | Verifies the `[n, 0, …, 0]` identity at composite depth   |
| `edge_n8_impulse`               | Verifies the `[1, 1, …, 1]` identity at composite depth   |
| `edge_n16_root_of_unity`        | Concentrates all energy in bin 1; fails on swapped bins   |
| `edge_n8_real_only`             | Catches Hermitian-symmetry violations                     |
| `edge_n8_pure_imag`             | Catches sign-flip between re/im channels                  |
| `edge_n8_inverse_of_real_fft`   | Catches missing `1/n` normalisation on inverse            |

## Random and stress cases

- 25 seeded Gaussian-complex random cases, sizes `2, 4, …, 1024`, both
  directions. Seed `20260426`, PCG64.
- 2 stress cases at `n = 16384` and `n = 65536` (forward only — the inverse
  is implicitly checked by Parseval at these sizes).
