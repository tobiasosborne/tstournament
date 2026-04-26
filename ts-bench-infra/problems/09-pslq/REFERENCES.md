# References — Problem 9, PSLQ

## Load-bearing ground truth

The implementation tracks Ferguson-Bailey-Arno 1999. **Bailey-Borwein
2007**, *Experimental Mathematics in Action*, Chapter 6, gives a
self-contained presentation including the multi-precision floating-
point requirements, the choice of `γ`, and the termination criterion.
**Bailey-Broadhurst 2001** is the standard reference for PSLQ at
working precisions of thousands of digits and for stable
implementations of the inner reductions.

## Citations

### Original

- **Ferguson, H. R. P.; Bailey, D. H.; Arno, S.**
  "Analysis of PSLQ, an integer relation finding algorithm."
  *Mathematics of Computation* 68 (1999), 351–369.
  → `sources/Ferguson_Bailey_Arno_PSLQ_MathComp_68_1999.pdf`

### Canonical textbook

- **Bailey, D. H.; Borwein, J. M.**
  *Experimental Mathematics in Action*. A K Peters, 2007.
  Chapter 6, "PSLQ and integer relations."
  → not auto-downloaded; place at
  `sources/Bailey_Borwein_ExperimentalMath_AKPeters_2007.pdf`.

### Follow-up

- **Bailey, D. H.; Broadhurst, D. J.**
  "Parallel integer relation detection: techniques and applications."
  *Mathematics of Computation* 70 (2001), 1719–1736.
  → `sources/Bailey_Broadhurst_ParallelPSLQ_MathComp_70_2001.pdf`

## Reference implementation

Documented in `reference/README.md` (stripped from `ts-bench-test` by the
Phase-2 strip script).
