# References — Problem 1, FFT

## Load-bearing ground truth

The problem statement tracks the **iterative decimation-in-time radix-2**
form described in Cooley & Tukey 1965 §§I–II (the recurrence
`T(N) = 2 T(N/2) + N`, the bit-reversal permutation, and the unscaled
forward / `1/N` inverse convention). Van Loan's *Computational Frameworks
for the FFT*, Ch. 1 ("Direct Algorithms"), is the reference for the in-place
butterfly indexing.

## Citations

### Original

- **Cooley, J. W., and Tukey, J. W.**
  "An Algorithm for the Machine Calculation of Complex Fourier Series."
  *Mathematics of Computation* 19 (1965), 297–301.
  AMS / `Math. Comp.` open archive.
  → `sources/Cooley_Tukey_MathComp_19_297_1965.pdf`

### Canonical textbook

- **Van Loan, C.**
  *Computational Frameworks for the FFT*. SIAM, 1992.
  Chapters 1–2: direct algorithms and the Stockham / Pease frameworks.
  → not auto-downloaded; place a copy at `sources/VanLoan_CompFrameworks_SIAM_1992.pdf`
  if institutional access permits.

### Follow-up / erratum

- **Frigo, M., and Johnson, S. G.**
  "The Design and Implementation of FFTW3."
  *Proceedings of the IEEE* 93, no. 2 (2005), 216–231.
  Useful for in-place / bit-reversal subtleties (split-radix, twiddle
  ordering, buffer reuse) that the test agent does not have to reproduce
  but should be aware of as the failure modes a robust implementation
  must avoid.
  → `sources/Frigo_Johnson_FFTW3_ProcIEEE_93_2005.pdf`

## Reference implementation

Documented in `reference/README.md` (stripped from `ts-bench-test` by the
Phase-2 strip script).

## Notes

The Cooley-Tukey paper is openly available from the AMS archive
(Math. Comp.). The FFTW3 paper requires IEEE Xplore (covered by TIB
Hannover VPN). Van Loan's SIAM book is institutional-access only — fetch
manually if desired. The PDFs themselves are not shipped to the test repo;
short verbatim excerpts in `PROMPT.md` ground the canonical phrasing.
