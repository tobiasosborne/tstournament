# References — Problem 5, LLL

## Load-bearing ground truth

The implementation tracks Lenstra-Lenstra-Lovász 1982 with the integer
arithmetic specialisation in **Cohen 1993, §2.6** (*A Course in
Computational Algebraic Number Theory*). Cohen's exposition is the
standard reference for the exact-integer / rational form of LLL — every
divide-and-multiply step is replaced by an exact rational equivalent so
the algorithm runs in `ℚ` without rounding loss. Stehlé's chapter in
**Nguyen-Vallée 2010** explains why floating-point variants are tricky
to verify and motivates the exact form preferred for ground truth here.

## Citations

### Original

- **Lenstra, A. K.; Lenstra, H. W., Jr.; Lovász, L.**
  "Factoring polynomials with rational coefficients."
  *Mathematische Annalen* 261 (1982), 515–534.
  → `sources/Lenstra_Lenstra_Lovasz_FactoringPolys_MathAnn_261_1982.pdf`

### Canonical textbook

- **Cohen, H.**
  *A Course in Computational Algebraic Number Theory*. Springer GTM 138, 1993.
  Section 2.6: integer / rational LLL.
  → not auto-downloaded; place at `sources/Cohen_CCANT_GTM138_Springer_1993.pdf`
  if institutional access permits.

### Follow-up

- **Stehlé, D.**
  "Floating-point LLL: theoretical and practical aspects."
  In *The LLL Algorithm: Survey and Applications*, ed. Nguyen, Vallée.
  Springer, 2010.
  Useful context on the differences between floating-point and exact
  variants, and on which reductions remain approximations vs. exact
  guarantees.
  → `sources/Stehle_LLL_FloatingPoint_2010.pdf`
