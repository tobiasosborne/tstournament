# References — Problem 6, Stoer-Wagner

## Load-bearing ground truth

The implementation tracks Stoer & Wagner 1997 (J. ACM): `n − 1` minimum-
cut phases, each consisting of a maximum-adjacency ordering followed by a
merge of the last two vertices added. The "cut-of-phase" lemma — that
the cut between the last vertex `t` and the rest is a minimum `s,t`-cut
in the *uncontracted* graph for the phase's `s` and `t` — is the load-
bearing claim that makes the algorithm correct without solving any
explicit `s,t`-flow problem.

## Citations

### Original

- **Stoer, M.; Wagner, F.**
  "A simple min-cut algorithm."
  *Journal of the ACM* 44 (1997), 585–591.
  → `sources/Stoer_Wagner_SimpleMinCut_JACM_44_1997.pdf`

  An earlier conference version (ESA 1994) describes the same algorithm
  but with less complete proofs.

### Canonical textbook

- **Schrijver, A.**
  *Combinatorial Optimization: Polyhedra and Efficiency*. Springer, 2003.
  Volume A, Section 15.3, "Minimum Cuts."
  → not auto-downloaded; place at
  `sources/Schrijver_CombinatorialOptimization_Springer_2003.pdf`.

## Reference implementation

Documented in `reference/README.md` (stripped from `ts-bench-test` by the
Phase-2 strip script).
