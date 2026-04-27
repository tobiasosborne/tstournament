# References — Problem 7, blossom

## Load-bearing ground truth

The implementation tracks Edmonds 1965 *Paths, trees, and flowers* and
its weighted extension as worked out in Edmonds 1965 *Maximum matching
and a polyhedron with 0,1-vertices*. Galil 1986 (the *ACM Computing
Surveys* article on matching) is the standard implementation-level
reference: it pulls together the dual-variable updates, the blossom
shrinking, and the augmenting-path search into a single unified
description.

## Citations

### Original

- **Edmonds, J.**
  "Paths, trees, and flowers."
  *Canadian Journal of Mathematics* 17 (1965), 449–467.
  → `sources/Edmonds_PathsTreesFlowers_CanadJMath_17_1965.pdf`

- **Edmonds, J.**
  "Maximum matching and a polyhedron with 0,1-vertices."
  *Journal of Research of the National Bureau of Standards B* 69
  (1965), 125–130.
  (The weighted extension; not always co-bundled with the unweighted
  paper.)

### Canonical survey / implementation reference

- **Galil, Z.**
  "Efficient algorithms for finding maximum matching in graphs."
  *ACM Computing Surveys* 18 (1986), 23–38.
  → `sources/Galil_MaxMatching_ACMCompSurv_18_1986.pdf`

### Follow-up

- **Kolmogorov, V.**
  "Blossom V: a new implementation of a minimum cost perfect matching
  algorithm."
  *Mathematical Programming Computation* 1 (2009), 43–67.
  Useful even though the problem here is max-weight (not min-cost
  perfect): the dual-variable bookkeeping and the lazy blossom updates
  carry over.
  → `sources/Kolmogorov_BlossomV_MathProgComp_1_2009.pdf`
