# References — Problem 3, suffix automaton

## Load-bearing ground truth

The construction tracks Blumer et al. 1985 (Theorem 4.1 — the bound
`|states| ≤ 2|s| − 1`, and the existence of a unique smallest acyclic
deterministic automaton accepting exactly the suffixes of `s`). The
extension procedure used in the reference is the standard `link, len`
formulation that has become the canonical exposition in Crochemore-Hancart
1997 ("Automata for matching patterns") and in the contemporary
competitive-programming literature.

## Citations

### Original

- **Blumer, A.; Blumer, J.; Ehrenfeucht, A.; Haussler, D.; Chen, M. T.;
  Seiferas, J.**
  "The smallest automaton recognizing the subwords of a text."
  *Theoretical Computer Science* 40 (1985), 31–55.
  → `sources/Blumer_etal_SmallestAutomaton_TCS_40_1985.pdf`

### Canonical textbook

- **Crochemore, M.; Hancart, C.; Lecroq, T.**
  *Algorithms on Strings*. Cambridge University Press, 2007.
  Chapter 6, "Automata for matching patterns": the suffix-automaton
  construction and its proof of correctness.
  → not auto-downloaded; place at
  `sources/Crochemore_Hancart_Lecroq_AlgsOnStrings_CUP_2007.pdf` if
  institutional access permits.

### Follow-up

- **Crochemore, M.; Vérin, R.**
  "On compact directed acyclic word graphs."
  *LNCS* 1261 (1997).
  Useful for understanding the state-cloning step and the relationship to
  the compact DAWG.
  → `sources/Crochemore_Verin_CDAWG_LNCS_1261_1997.pdf`
