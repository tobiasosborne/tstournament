# References — Problem 10, Risch

## Load-bearing ground truth

The implementation tracks **Bronstein, *Symbolic Integration I*,
Chapters 5–6**: the transcendental Liouvillian Risch algorithm via
nested exponential and logarithmic extensions, with the polynomial /
simple / reduced decomposition at each level. Risch 1969 / 1970 are the
original papers. Bronstein's 1998 ISSAC tutorial is the most accessible
unified summary.

## Citations

### Original

- **Risch, R. H.**
  "The problem of integration in finite terms."
  *Transactions of the AMS* 139 (1969), 167–189.
  → `sources/Risch_IntegrationFiniteTerms_TransAMS_139_1969.pdf`

- **Risch, R. H.**
  "The solution of the problem of integration in finite terms."
  *Bulletin of the AMS* 76 (1970), 605–608.
  → `sources/Risch_SolutionFiniteTerms_BullAMS_76_1970.pdf`

### Canonical textbook

- **Bronstein, M.**
  *Symbolic Integration I: Transcendental Functions*, 2nd ed.
  Springer, 2005.
  Chapters 5–6 are load-bearing for the implementation: the polynomial
  / simple / reduced decomposition, the integration of simple parts
  via Hermite reduction, and the integration of reduced parts via the
  Risch differential equation.
  → not auto-downloaded; place at
  `sources/Bronstein_SymbolicIntegrationI_Springer_2005.pdf`.

### Follow-up

- **Bronstein, M.**
  "Symbolic integration tutorial."
  *ISSAC '98* course notes.
  → `sources/Bronstein_SymbolicIntegrationTutorial_ISSAC_1998.pdf`

## Reference implementation

Documented in `reference/README.md` (stripped from `ts-bench-test` by the
Phase-2 strip script).
