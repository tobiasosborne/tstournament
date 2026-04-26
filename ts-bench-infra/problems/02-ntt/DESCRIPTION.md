# Problem 2 — Number-Theoretic Transform (arbitrary length)

## What to implement

A Number-Theoretic Transform (NTT) over the prime field `ℤ/p` for a fixed
prime `p = 998244353`, supporting **arbitrary length** `n` (not only powers
of two). Both directions (forward and inverse) are required.

The implementation is expected to use:

- **Bluestein's chirp-z transform** to reduce arbitrary-length NTT to a
  circular convolution of a power-of-two length, evaluated by a power-of-two
  NTT.
- **Montgomery multiplication** (or an equivalently fast modular reduction)
  so the inner loop avoids a literal `% p` on every multiply. The verifier
  cannot enforce this, but it is the canonical fast modular-arithmetic
  primitive for the inner loop and what an "elegant, efficient" solution is
  expected to use.

## The prime and root of unity

- **`p = 998244353`** (a 30-bit prime; `p − 1 = 2²³ · 7 · 17`).
- **`g = 3`** — the smallest primitive root of `(ℤ/p)*`.
- For any `n` that **divides `p − 1`** (i.e., `n = 2ᵃ · 7ᵇ · 17ᶜ` with
  `0 ≤ a ≤ 23`, `0 ≤ b ≤ 1`, `0 ≤ c ≤ 1`), there is a primitive `n`-th root
  of unity in `ℤ/p`, canonically taken to be

  ```
  ω_n  =  g^((p−1)/n)  mod p
  ```

  in the canonical residue `[0, p)`. The verifier picks `n` only from this
  set.
- `n = 1` is the identity.

## Mathematical specification

For `x = (x_0, …, x_{n−1}) ∈ (ℤ/p)^n` with `n` valid as above and
`ω = ω_n`:

- **Forward**
  `X_k  =  Σ_{j=0}^{n−1}  x_j · ω^{j·k}  (mod p)`,    `k = 0, …, n−1`.
- **Inverse**
  `x_j  =  n⁻¹ · Σ_{k=0}^{n−1}  X_k · ω^{−j·k}  (mod p)`,   `j = 0, …, n−1`,

where `n⁻¹` and `ω⁻¹` are computed in `(ℤ/p)*` (e.g. by Fermat:
`a⁻¹ ≡ a^{p−2} mod p`).

## I/O contract (JSON)

### Input

```jsonc
{
  "n":              <int, ≥ 1, must divide p−1>,
  "modulus":        "998244353",
  "primitive_root": "3",
  "direction":      "forward" | "inverse",
  "x":              ["<a_0>", "<a_1>", …]   // length n, decimal residues in [0, p)
}
```

`modulus` and `primitive_root` are constants pinned in this contract. They
are restated in every test case so the I/O is self-contained for the agent
that wants to read just one record.

### Output

```jsonc
["<b_0>", "<b_1>", …]   // length n, decimal residues in [0, p)
```

Residues are JSON strings, even though they fit in a 32-bit integer. This
matches the rest of the bench (see `infra/verifiers/encoding.md`) and avoids
ambiguity if `p` is ever raised to a wider modulus.

## Invariants the verifier checks

1. **Shape.** `len(candidate) == n`; every element is a decimal-string
   residue in `[0, p)`.
2. **Modular equality.** `candidate ≡ schoolbook_ntt(x, ω, p)` exactly,
   componentwise. (No tolerance — modular arithmetic is exact.)
3. **Roundtrip identity.** For every test case, the verifier independently
   computes `inverse(candidate)` (resp. `forward(candidate)`) via the
   schoolbook reference and asserts it equals the original input.
4. **Convolution theorem (small `n`).** For paired `convolution_*` cases
   (a triple of inputs `a`, `b`, `a ★ b` where `★` is circular convolution),
   the verifier checks the candidate's transforms satisfy
   `NTT(a ★ b)_k ≡ NTT(a)_k · NTT(b)_k (mod p)` for all `k`.

## Edge cases the test set covers

- `n = 1`, both directions (identity).
- `n = 2`, all-ones, alternating, impulse.
- DC `(1, …, 1)` of length `n`: forward is `(n mod p, 0, …, 0)`.
- Impulse `(1, 0, …, 0)`: forward is `(1, 1, …, 1)`.
- Pure-power-of-two lengths: `n ∈ {2, 4, 8, 16, …, 1024}`.
- Lengths involving the odd factors of `p − 1`: `n ∈ {7, 14, 17, 28, 34,
  56, 68, 112, 119, 136, 224, 238, 476, 952, 1904}`. Each forces
  Bluestein on a non-power-of-two.
- Convolution-theorem triples `(a, b, a ★ b)` at small `n`.
- Stress at `n = 4096` and `n = 16384` (power of two).

## What the agent does *not* implement

- No multi-prime CRT-NTT (we fix one prime).
- No SIMD / GPU / WebAssembly assumptions.
- No multidimensional transforms.
- No streaming / online updates.
