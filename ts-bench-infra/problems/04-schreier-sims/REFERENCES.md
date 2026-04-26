# References — Problem 4, Schreier-Sims

## Load-bearing ground truth

The implementation tracks Sims 1970, with the **Sims filter** (incremental
sift of Schreier generators against a partial chain) as the canonical
algorithmic form. **Holt-Eick-O'Brien**, *Handbook of Computational Group
Theory*, Chapter 4, is the standard textbook reference for the
deterministic, sift-based variant. **Seress**, *Permutation Group
Algorithms*, Chapters 4–5, gives the most careful contemporary
exposition, including the version that handles a redundant initial
generator list correctly.

## Citations

### Original

- **Sims, C. C.**
  "Computational methods in the study of permutation groups."
  *Computational Problems in Abstract Algebra* (Pergamon, 1970), 169–183.
  → `sources/Sims_PermutationGroups_1970.pdf`

### Canonical textbook

- **Holt, D. F.; Eick, B.; O'Brien, E. A.**
  *Handbook of Computational Group Theory*. CRC Press, 2005.
  Chapter 4: base, strong generating set, Schreier-Sims with Sims' filter.
  → not auto-downloaded; place at
  `sources/Holt_Eick_OBrien_HandbookCGT_CRC_2005.pdf`.

- **Seress, Á.**
  *Permutation Group Algorithms*. Cambridge University Press, 2003.
  Chapters 4–5: deterministic and randomised Schreier-Sims, sift,
  Schreier vector representation, complexity analysis.
  → `sources/Seress_PermutationGroupAlgorithms_CUP_2003_Ch4-5.pdf` (best
  effort — institutional access required).

## Reference implementation

Documented in `reference/README.md` (stripped from `ts-bench-test` by the
Phase-2 strip script).
