# Verifier protocol — Problem 5, LLL

`verify.py` is self-contained and uses **exact rational arithmetic
(`fractions.Fraction`)** throughout. There is no LLL implementation
inside the verifier; it works directly from the LLL definition, so any
basis satisfying the size-reduction and Lovász conditions over the same
lattice is accepted.

## Invocation

```
cat <case>.json | python3 verify.py
```

stdin shape:

```jsonc
{
  "input":     {"n": ..., "d": ..., "basis": [["...", ...], ...],
                "delta": {"num": "3", "den": "4"}},
  "candidate": {"reduced_basis": [["...", ...], ...]},
  "id":        "<case id>"
}
```

stdout:

```jsonc
{
  "pass":   true,
  "reason": "all invariants hold",
  "checks": {
    "shape":          {"pass": ..., "detail": "..."},
    "same_lattice":   {"pass": ..., "detail": "..."},
    "size_reduction": {"pass": ..., "detail": "..."},
    "lovasz":         {"pass": ..., "detail": "..."},
    "det_preserved":  {"pass": ..., "detail": "..."}
  }
}
```

Verifier exits 0 even on `pass: false`.

## The five checks

### 1. `shape`

`reduced_basis` is an `n × d` matrix; every entry is a decimal-string
signed integer.

### 2. `same_lattice`

The verifier computes the Hermite normal form (row-style HNF) of both
the input basis and the candidate basis and asserts they are equal. This
pins that the candidate spans the same `ℤ`-lattice as the input — any
unimodular transformation is permitted.

### 3. `size_reduction`

Compute the Gram-Schmidt orthogonalisation of the candidate over `ℚ`.
For every `j < i`, the Gram-Schmidt coefficient

```
μ_{i,j}  =  ⟨b_i, b*_j⟩ / ⟨b*_j, b*_j⟩
```

must satisfy `|μ_{i,j}| ≤ ½` exactly. The check uses
`fractions.Fraction`; there is no tolerance.

### 4. `lovasz`

For every `i ≥ 1`, with `δ = 3/4`:

```
‖b*_i‖²  ≥  (δ − μ_{i,i−1}²) · ‖b*_{i−1}‖²
```

evaluated exactly in `ℚ`.

### 5. `det_preserved`

`det(B Bᵀ)` is invariant under unimodular row operations. Check
`det(B_in B_inᵀ) == det(B_out B_outᵀ)` exactly. Strictly redundant given
`same_lattice`, but a useful independent diagnostic.

## What is *not* checked

- The candidate is **not required** to match the reference's reduced
  basis. Many distinct LLL-reduced bases exist for a single lattice;
  any of them is accepted.
- The implementation strategy (de Weger, Schnorr-Euchner, integer-only,
  rational-only, …) is invisible to the verifier. Floating-point internal
  routines that nonetheless emit a basis satisfying the four checks above
  will pass. The "exact rationals" requirement in `DESCRIPTION.md` is a
  spec, not a verifier check.
