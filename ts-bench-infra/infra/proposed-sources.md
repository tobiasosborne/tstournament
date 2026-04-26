# Proposed Source List (Phase 1, Task A) — awaiting confirmation

Per problem: original paper(s) + at least one canonical textbook treatment +
follow-up/erratum where one is widely cited. All to be downloaded as PDFs to
`problems/NN-name/sources/` via the Playwright headed-Chrome harness.

Confirm or amend before I spawn research subagents.

---

## 01-fft — radix-2 Cooley-Tukey, in-place, bit-reversal

- **Original.** Cooley & Tukey, "An Algorithm for the Machine Calculation of
  Complex Fourier Series", *Math. Comp.* 19 (1965), 297–301. (AMS / JSTOR)
- **Textbook.** Van Loan, *Computational Frameworks for the FFT*, SIAM (1992),
  Ch. 1–2. *Or* CLRS, *Introduction to Algorithms*, 4th ed., Ch. 30.
- **Follow-up.** Frigo & Johnson, "The design and implementation of FFTW3",
  *Proc. IEEE* 93 (2005) — useful for in-place / bit-reversal subtleties.

## 02-ntt — arbitrary length, Bluestein chirp-z, Montgomery multiplication

- **Original (NTT).** Pollard, "The fast Fourier transform in a finite field",
  *Math. Comp.* 25 (1971), 365–374.
- **Original (Bluestein).** Bluestein, "A linear filtering approach to the
  computation of discrete Fourier transform", *IEEE Trans. AU* (1970).
- **Original (Montgomery).** Montgomery, "Modular multiplication without trial
  division", *Math. Comp.* 44 (1985), 519–521.
- **Textbook.** Crandall & Pomerance, *Prime Numbers: A Computational
  Perspective*, 2nd ed., Springer (2005), Ch. 9 (FFT-based arithmetic).

## 03-suffix-automaton — online (Blumer et al. 1985)

- **Original.** Blumer, Blumer, Ehrenfeucht, Haussler, Chen, Seiferas, "The
  smallest automaton recognizing the subwords of a text", *Theoret. Comput.
  Sci.* 40 (1985), 31–55.
- **Textbook.** Crochemore, Hancart, Lecroq, *Algorithms on Strings*, CUP
  (2007), Ch. 6. *Or* Gusfield, *Algorithms on Strings, Trees, and Sequences*,
  CUP (1997).
- **Follow-up.** Crochemore, Vérin, "On compact directed acyclic word graphs",
  *LNCS* 1261 (1997).

## 04-schreier-sims — Sims' filter, BSGS + group order

- **Original.** Sims, "Computational methods in the study of permutation
  groups", in *Computational Problems in Abstract Algebra* (Pergamon, 1970),
  169–183.
- **Textbook.** Holt, Eick, O'Brien, *Handbook of Computational Group Theory*,
  CRC (2005), Ch. 4.
- **Follow-up.** Seress, *Permutation Group Algorithms*, CUP (2003), Ch. 4–5
  (covers Sims' filter and the deterministic version explicitly).

## 05-lll — exact rationals, δ = 3/4

- **Original.** Lenstra, Lenstra, Lovász, "Factoring polynomials with rational
  coefficients", *Math. Ann.* 261 (1982), 515–534.
- **Textbook.** Cohen, *A Course in Computational Algebraic Number Theory*,
  Springer GTM 138 (1993), §2.6 (the integral version is what we want).
- **Follow-up.** Nguyen & Vallée (eds), *The LLL Algorithm: Survey and
  Applications*, Springer (2010), Ch. 1–2 (Stehlé's exposition of the exact
  variant + numerical pitfalls).

## 06-stoer-wagner — global minimum cut

- **Original.** Stoer & Wagner, "A simple min-cut algorithm", *J. ACM* 44
  (1997), 585–591. (Also the 1994 ESA conference version.)
- **Textbook.** Mehlhorn & Sanders, *Algorithms and Data Structures: The
  Basic Toolbox*, Springer (2008), Ch. 12. *Or* Schrijver, *Combinatorial
  Optimization*, Springer (2003), §15.3.

## 07-blossom — Edmonds, max-weight matching in general graphs

- **Original.** Edmonds, "Paths, trees, and flowers", *Canad. J. Math.* 17
  (1965), 449–467; *and* Edmonds, "Maximum matching and a polyhedron with
  0,1-vertices", *J. Res. NBS B* 69 (1965), 125–130 (weighted version).
- **Textbook / survey.** Galil, "Efficient algorithms for finding maximum
  matching in graphs", *ACM Comput. Surv.* 18 (1986), 23–38. **(load-bearing
  for implementation)**
- **Follow-up.** Kolmogorov, "Blossom V: a new implementation of a minimum
  cost perfect matching algorithm", *Math. Prog. Comput.* 1 (2009) — useful
  edge cases / dual updates, even though we are doing max-weight not
  min-cost-perfect.

## 08-buchberger — Gröbner bases over ℚ[x₁,…,xₙ], lex + degrevlex, normal selection + two criteria

- **Original.** Buchberger, "Ein Algorithmus zum Auffinden der Basiselemente
  des Restklassenringes nach einem nulldimensionalen Polynomideal",
  PhD thesis, Univ. Innsbruck (1965); English translation in *J. Symb.
  Comput.* 41 (2006). *Plus* Buchberger, "A criterion for detecting
  unnecessary reductions in the construction of Gröbner bases", *EUROSAM '79*
  (the two criteria paper).
- **Textbook.** Cox, Little, O'Shea, *Ideals, Varieties, and Algorithms*, 4th
  ed., Springer (2015), Ch. 2 §§7–10.
- **Follow-up.** Becker & Weispfenning, *Gröbner Bases*, Springer GTM 141
  (1993), Ch. 5–6 (for selection strategies).

## 09-pslq — Ferguson-Bailey, multi-precision

- **Original.** Ferguson, Bailey, Arno, "Analysis of PSLQ, an integer relation
  finding algorithm", *Math. Comp.* 68 (1999), 351–369.
- **Textbook.** Bailey & Borwein, *Experimental Mathematics in Action*, A K
  Peters (2007), Ch. 6.
- **Follow-up.** Bailey & Broadhurst, "Parallel integer relation detection:
  techniques and applications", *Math. Comp.* 70 (2001), 1719–1736 (numeric
  stability and stopping criteria).

## 10-risch — transcendental Liouvillian case

- **Original.** Risch, "The problem of integration in finite terms",
  *Trans. AMS* 139 (1969), 167–189; *and* Risch, "The solution of the problem
  of integration in finite terms", *Bull. AMS* 76 (1970), 605–608.
- **Textbook.** Bronstein, *Symbolic Integration I: Transcendental
  Functions*, 2nd ed., Springer (2005), Ch. 5–6. **(load-bearing — this is
  what the implementation tracks line-by-line)**
- **Follow-up.** Bronstein, "Symbolic integration tutorial", ISSAC '98
  course notes (concise statement of the algorithm and worked examples).

---

## What I need from you

1. ✅ / ✗ each entry, or substitute. In particular flag if any of the
   "follow-ups" are not worth the bandwidth.
2. Confirm I should download them to `problems/NN-name/sources/` only (no
   shared `infra/sources/`).
3. Confirm the citation style for `REFERENCES.md` (currently I'd use the
   format above: short bibliographic line + load-bearing-section sentence).
