# References — Problem 2, NTT

## Load-bearing ground truth

The implementation tracks the literal NTT formula in `DESCRIPTION.md`,
which fixes the prime `p = 998244353`, the primitive root `g = 3`, and the
convention `ω_n = g^((p−1)/n) mod p`. **Bluestein 1970** is the canonical
chirp-z reduction from arbitrary length to power-of-two convolution; with
the 2N-th root requirement, this is what makes "arbitrary length" a
well-defined operation over `ℤ/p` for our prime. **Montgomery 1985** is the
canonical fast modular multiplication; for the inner butterfly loop on
30-bit residues, Montgomery (or a comparable constant-time Barrett /
Shoup-style reduction) is the technique a polished implementation uses.
**Pollard 1971** is the original NTT (FFT in finite fields).

## Citations

### Originals

- **Pollard, J. M.**
  "The fast Fourier transform in a finite field."
  *Mathematics of Computation* 25 (1971), 365–374.
  → `sources/Pollard_FFT_FiniteField_MathComp_25_1971.pdf`

- **Bluestein, L. I.**
  "A linear filtering approach to the computation of the discrete Fourier
  transform."
  *IEEE Transactions on Audio and Electroacoustics* 18 (1970), 451–455.
  → `sources/Bluestein_LinearFiltering_IEEE_AU_18_1970.pdf`

- **Montgomery, P. L.**
  "Modular multiplication without trial division."
  *Mathematics of Computation* 44 (1985), 519–521.
  → `sources/Montgomery_ModularMultiplication_MathComp_44_1985.pdf`

### Canonical textbook

- **Crandall, R., and Pomerance, C.**
  *Prime Numbers: A Computational Perspective*, 2nd ed. Springer, 2005.
  Chapter 9, "Fast algorithms for large-integer arithmetic" — covers
  power-of-two NTT, Bluestein, Rader, and the choice of NTT-friendly
  primes.
  → not auto-downloaded; place at `sources/Crandall_Pomerance_PrimeNumbers_2ed_Springer_2005.pdf`
  if institutional access permits.

## Notes

The Pollard and Montgomery papers are openly available from the AMS
archive (Math. Comp.). The Bluestein paper is on IEEE Xplore (covered by
TIB Hannover VPN). Crandall-Pomerance is institutional-access only.
