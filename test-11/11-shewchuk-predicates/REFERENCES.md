# References — Problem 11, Shewchuk's adaptive-precision predicates

## Load-bearing ground truth

The implementation tracks **Shewchuk 1996** — the paper that introduced
adaptive-precision floating-point predicates and the supporting
expansion arithmetic. Shewchuk's `predicates.c` is the canonical C
implementation (public domain); the golden master for this problem is
generated from a compiled build of that file via ctypes.
**Devillers-Pion 2003** describes a refinement
of the static error-bound technique that produces tighter stage-1
filters for the same predicates; useful as polish, not load-bearing.
**Hoffmann 1989** gave the original "robustness" framing for
geometric algorithms that motivated the work.

## Citations

### Original

- **Shewchuk, J. R.**
  "Adaptive Precision Floating-Point Arithmetic and Fast Robust
  Geometric Predicates."
  *Discrete & Computational Geometry* 18 (1997), 305-363.
  → `sources/Shewchuk_AdaptivePredicates_DCG_18_1997.pdf`

  The 1996 technical-report version (CMU CS-96-140) is the same content
  with minor edits; either is acceptable as the reference text.

### Canonical implementation

- **Shewchuk, J. R.**
  *predicates.c* — the public-domain reference C source.
  Source: <https://www.cs.cmu.edu/~quake/robust.html>.
  → `sources/Shewchuk_predicates_DCG_18_1996.c` (committed; the .c is
  ASCII source, not a copyrighted PDF).

  This file is the canonical oracle for the golden master.

### Follow-up

- **Devillers, O.; Pion, S.**
  "Efficient exact geometric predicates for Delaunay triangulations."
  In *Proceedings of the 5th Workshop on Algorithm Engineering and
  Experiments (ALENEX)*, 2003.
  Tighter static error bounds for the same four predicates,
  performance-relevant for the stage-1 filter.
  → `sources/Devillers_Pion_EfficientExactPredicates_ALENEX_2003.pdf`

- **Hoffmann, C. M.**
  "The problems of accuracy and robustness in geometric computation."
  *IEEE Computer* 22(3) (1989), 31-41.
  Background framing on why naive `Math.sign(det)` is insufficient.
  → not auto-downloaded; place at
  `sources/Hoffmann_Robustness_IEEE_Computer_1989.pdf` if institutional
  access permits.

### Downstream consumers (informational)

The four Shewchuk predicates are used essentially-unchanged by:

- **CGAL** (Computational Geometry Algorithms Library), the dominant
  C++ geometry library — uses Shewchuk's predicates with
  Devillers-Pion error bounds.
- **Triangle** (Shewchuk's own 2D mesh generator).
- **TetGen** (3D Delaunay tetrahedraliser).
- **libigl** (geometry-processing library).
- **Geogram** (INRIA geometric kernel).
- **Voro++** (Voronoi tessellator).

This collective usage — twenty-nine years and counting — is the
load-bearing argument for treating Shewchuk's predicates as the
canonical robust-predicates implementation.
