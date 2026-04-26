# Verifier protocol — Problem 2, NTT

`verify.py` is self-contained and language-neutral. Modular arithmetic is
exact, so every comparison is bit-equal — no tolerance.

## Invocation

```
cat <case>.json | python3 verify.py
```

with stdin shaped as

```jsonc
{
  "input":     {"n": ..., "modulus": "...", "primitive_root": "...",
                "direction": "...", "x": ["...", ...]},
  "candidate": ["<residue>", ...],
  "id":        "<case id>"
}
```

stdout:

```jsonc
{
  "pass":   true,
  "reason": "all invariants hold",
  "checks": {
    "shape":            {"pass": ..., "detail": "..."},
    "canonical_range":  {"pass": ..., "detail": "..."},
    "modular_equality": {"pass": ..., "detail": "..."},
    "roundtrip":        {"pass": ..., "detail": "..."}
  }
}
```

Verifier exits 0 even when `pass: false`; non-zero exit means the verifier
crashed.

## The four checks

### 1. `shape`

`candidate` must be a JSON list of length `n` whose every element is a
JSON **string**.

### 2. `canonical_range`

Every element of `candidate`, parsed as a decimal integer, must lie in
`[0, p)` (canonical residue). Negative residues, residues `≥ p`, or
non-integer strings fail this check.

### 3. `modular_equality`

The candidate must equal the reference NTT of `x` exactly:

- For power-of-two `n`: compared against an iterative Cooley-Tukey-style
  NTT of the input.
- For non-power-of-two `n` (necessarily `n | (p − 1)`): compared against
  the literal `O(n²)` schoolbook sum.

Both reference paths agree (cross-checked in `golden/generate.py`); they
differ only in cost.

### 4. `roundtrip`

The verifier independently applies the *opposite-direction* reference to
the candidate and asserts the result equals the original input `x`. This
catches, e.g., a candidate that returns the right transform shape with the
wrong primitive-root convention.

## What is *not* checked

- The choice of internal algorithm (Bluestein, Rader, Cooley-Tukey,
  schoolbook) is not visible to the verifier. Only the mathematical output
  is judged.
- Montgomery multiplication, lazy reductions, SIMD: none of these are
  visible. They are quality concerns, not correctness concerns.

## Edge-case rationale

| ID                                | What it catches                                           |
|-----------------------------------|-----------------------------------------------------------|
| `edge_n1_*`                       | Off-by-one in the base case                               |
| `edge_n2_dc` / `edge_n2_alt`      | Sign of `ω` (`ω₂ = p − 1`); convention of the inverse     |
| `edge_n2_impulse` / `edge_n4_*`   | Identity `δ ↔ 1` and `1 ↔ n·δ`                            |
| `edge_n7_*`                       | Forces Bluestein on a non-power-of-two factor of `p − 1`  |
| `edge_n8_inverse_of_fwd_seq`      | Inverse normalisation `n⁻¹` mod `p`                       |
| `rand_blu_n*`                     | Bluestein cases at sizes spanning the divisors of `p − 1` |
| `conv*_n*_*`                      | Convolution-theorem triples — fail if `ω` choice or       |
|                                   | normalisation is silently inconsistent across calls       |
| `stress_n4096_fwd`, `stress_n16384_fwd` | Performance regression boundary; correctness still     |
|                                   | exact-equality                                            |
