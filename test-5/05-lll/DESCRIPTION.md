# Problem 5 — LLL lattice reduction (exact rationals, δ = 3/4)

## What to implement

Given a basis `B = (b_1, …, b_n)` of an integer lattice `Λ ⊂ ℤ^d`,
compute an **LLL-reduced basis** `B′ = (b′_1, …, b′_n)` of the same
lattice, with reduction parameter `δ = 3/4`. Arithmetic must be **exact**
(rational / integer) — no floating point in the inner loop.

A basis `(b′_1, …, b′_n)` with Gram-Schmidt orthogonalisation
`(b′*_1, …, b′*_n)` and Gram-Schmidt coefficients
`μ_{i,j} = ⟨b′_i, b′*_j⟩ / ⟨b′*_j, b′*_j⟩` is **LLL-reduced** with
parameter `δ` iff:

- **Size-reduction:**     `|μ_{i,j}| ≤ ½`     for all `1 ≤ j < i ≤ n`.
- **Lovász condition:**   `‖b′*_i‖²  ≥  (δ − μ_{i,i−1}²) · ‖b′*_{i−1}‖²`
  for all `2 ≤ i ≤ n`.

Both conditions must hold **exactly**, evaluated in `ℚ`. The standard LLL
algorithm (Lenstra-Lenstra-Lovász 1982) achieves this in polynomial time;
the exact integer / rational variant is described in Cohen, *A Course in
Computational Algebraic Number Theory*, §2.6.

## I/O contract (JSON)

### Input

```jsonc
{
  "n":         <int, ≥ 1>,
  "d":         <int, ≥ n>,
  "basis":     [["<int>", "<int>", …], …],   // n rows, d columns, decimal-string ints
  "delta":     {"num": "3", "den": "4"}      // pinned to 3/4
}
```

Basis vectors are **rows**. Entries are decimal strings (signed integers).
The verifier currently always sends `δ = 3/4`; the agent should support an
arbitrary `δ ∈ (1/4, 1)` as a rational, but only `3/4` is exercised.

### Output

```jsonc
{
  "reduced_basis": [["<int>", "<int>", …], …]   // n rows, d columns
}
```

The reduced basis is integer-valued (LLL on an integer basis produces an
integer-coefficient transformation). Decimal-string encoding matches the
input.

## Invariants the verifier checks

1. **Shape.** Output is an `n × d` matrix of decimal-string integers.
2. **Same lattice.** The `ℤ`-row span of `reduced_basis` equals the
   `ℤ`-row span of `basis`. Verified by Hermite normal form equality.
3. **Size-reduction.** Computed in exact rational arithmetic on the
   candidate basis: `|μ_{i,j}| ≤ ½` for every `j < i`.
4. **Lovász condition.** Computed in exact rational arithmetic:
   `‖b′*_i‖² ≥ (3/4 − μ_{i,i−1}²) · ‖b′*_{i−1}‖²` for every `i ≥ 2`.
5. **Gram determinant preserved.** `det(B′ B′ᵀ) = det(B Bᵀ)` exactly.
   (Strictly redundant given check 2, but a useful independent signal:
   a candidate that returns a *different* lattice with the same volume
   would still fail check 2 but pass this one.)

## Edge cases the test set covers

- `n = 1`: single-row "lattice" — already reduced.
- `n = 2`: textbook `((1, 1), (1, 2))`-style examples.
- Identity basis `I_n` for `n ∈ {2, 3, 5, 8}` — already reduced.
- Random integer bases at `n ∈ {3, 4, 5, 6, 8}` with entries
  drawn from `[-50, 50]` and from `[-2¹⁵, 2¹⁵]`.
- Bases that are LLL-reduced already (idempotent test).
- Bases with one row a small multiple of another (near-degenerate but
  full rank) — LLL must split the dependency.
- "Knapsack-style" bases with a planted short vector at `n ∈ {4, 6}`,
  recovered by the LLL approximation factor.
- Stress at `n = 12` with `d = 12` and entries `≤ 2³⁰` — requires
  multi-precision integers in the agent's inner loop.

## What the agent does *not* implement

- No floating-point variant (Schnorr-Euchner, fpLLL). The "exact" part of
  the spec is mandatory.
- No BKZ, BKZ-2.0, or any post-LLL improvement.
- No segment / blockwise reduction.
- No SVP / CVP solvers.
