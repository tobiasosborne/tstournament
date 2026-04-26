# References — Problem 8, Buchberger

## Load-bearing ground truth

The implementation tracks Buchberger's 1965 thesis (English translation
in J. Symb. Comput. 41, 2006): `n − 1` rounds of S-polynomial reduction,
adding non-trivial residues to the basis until the criterion stabilises.
**Buchberger 1979** introduces the two pruning criteria (coprime LMs,
chain criterion) that are required by the spec. **Cox-Little-O'Shea**,
*Ideals, Varieties, and Algorithms*, Chapter 2 §§7–10 is the standard
textbook treatment of the algorithm and the two criteria; **Becker &
Weispfenning**, *Gröbner Bases* Ch. 5–6, gives the canonical exposition
of the normal selection strategy.

## Citations

### Original

- **Buchberger, B.**
  PhD thesis, Universität Innsbruck (1965). English translation:
  "An algorithm for finding the basis elements of the residue class ring
  modulo a zero-dimensional polynomial ideal."
  *J. Symb. Comput.* 41 (2006).
  → `sources/Buchberger_Thesis_1965_English_JSC_2006.pdf`

- **Buchberger, B.**
  "A criterion for detecting unnecessary reductions in the construction
  of Gröbner bases." *EUROSAM '79*, LNCS 72.
  → `sources/Buchberger_TwoCriteria_EUROSAM_1979.pdf`

### Canonical textbook

- **Cox, D.; Little, J.; O'Shea, D.**
  *Ideals, Varieties, and Algorithms*, 4th ed. Springer, 2015.
  Chapter 2 §§7–10: Buchberger's algorithm and the two criteria.
  → not auto-downloaded; place at
  `sources/Cox_Little_OShea_IVA_4ed_Springer_2015.pdf`.

- **Becker, T.; Weispfenning, V.**
  *Gröbner Bases: A Computational Approach to Commutative Algebra*.
  Springer GTM 141, 1993.
  Chapters 5–6: selection strategies and reductions.
  → not auto-downloaded; place at
  `sources/Becker_Weispfenning_GroebnerBases_GTM141_Springer_1993.pdf`.

## Reference implementation

Documented in `reference/README.md` (stripped from `ts-bench-test` by the
Phase-2 strip script).
