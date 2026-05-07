# Problem 13 — References

The bibliography is grounded in a deep Semantic Scholar / OpenAlex trawl
(~95 distinct works catalogued; full version archived alongside the
orchestrator's research record). What follows is the **load-bearing
subset** the brief and the verifier are built against.

## The four-corner foundation

These five works are the algorithmic spine. Any from-scratch implementation
should derive from them.

- **L. J. Slater 1966.** *Generalized Hypergeometric Functions*, Cambridge
  University Press. Chapter 5 — the function definition, the differential
  equation, and **Slater's theorem** (residue summation expressing G as a
  finite linear combination of `pFq` series). The practical numerical
  evaluation kernel in every published implementation that does not use
  a Mellin–Barnes contour quadrature directly.

- **V. Adamchik & O. I. Marichev 1990.** "The algorithm for calculating
  integrals of hypergeometric type functions and its realization in
  REDUCE system." *Proc. ISSAC '90*, Tokyo, 212–224.
  DOI [10.1145/96877.96930](https://doi.org/10.1145/96877.96930). The
  three-step symbolic algorithm: integrand factors → Meijer G via Mellin
  transforms → Slater residue summation → reduction back to named
  special functions. What Mathematica's `Integrate` does internally.

- **K. Roach 1996, 1997.** "Hypergeometric Function Representations"
  (*Proc. ISSAC '96*, 301–308) and "Meijer G Function Representations"
  (*Proc. ISSAC '97*, 205–211, DOI
  [10.1145/258726.258784](https://doi.org/10.1145/258726.258784)).
  The inverse direction — given a Meijer G instance, find a closed-form
  representation. Open-citable; what SymPy's `meijerint` actually
  implements. The most realistic spec for a from-scratch symbolic
  dispatcher.

- **B. L. J. Braaksma 1964.** "Asymptotic expansions and analytic
  continuations for a class of Barnes-integrals." *Compositio
  Mathematica* 15: 239–341. Rigorous full asymptotic expansion of the
  Meijer G integral as `|z| → ∞` in any sector, including the
  Stokes-line directions and the connection coefficients between
  fundamental ODE solutions.

- **F. Johansson 2009.** "Meijer G, more hypergeometric functions,
  fractional differentiation." Personal blog post,
  [fredrikj.net/blog/2009/06](https://fredrikj.net/blog/2009/06/meijer-g-more-hypergeometric-functions-fractional-differentiation/).
  The **only published high-precision Meijer G algorithm description
  outside Wolfram and Maple**. Documents the design choices in mpmath's
  `meijerg`: Slater Series 1 / Series 2 dispatch by `(p, q, m, n, |z|)`,
  the **`hmag` parameter-perturbation mechanism** for handling
  parameter coalescence (an implementation of the L'Hôpital limit),
  and the cancellation-detection retry-at-higher-precision strategy.

## Identity catalogues (the test-set source)

- **A. Erdélyi, W. Magnus, F. Oberhettinger, F. G. Tricomi 1953.**
  *Higher Transcendental Functions Vol. I* (Bateman Manuscript Project),
  McGraw-Hill (reissued Krieger 1981). Chapter 5, especially **§5.6
  pp. 215–222** — the canonical elementary / Bessel / Whittaker /
  Legendre reductions.

- **A. P. Prudnikov, Yu. A. Brychkov, O. I. Marichev 1990.** *Integrals
  and Series Vol. 3: More Special Functions*, Gordon & Breach. **§§8.2,
  8.3, 8.4** — the canonical Meijer G identity tables; § 8.4 is the
  reduction-formula compendium.

- **Y. L. Luke 1969.** *The Special Functions and Their Approximations
  Vol. I*, Academic Press. Chapter 5 — DLMF §16.17–16.21's preferred
  citation for Meijer G identities.

- **A. M. Mathai 1993.** *A Handbook of Generalized Special Functions
  for Statistical and Physical Sciences*, Oxford University Press.
  Modern handbook; cited by DLMF §16.18, §16.19.

- **NIST DLMF Chapter 16** "Generalized Hypergeometric Functions and
  Meijer G-Function" (R. A. Askey, A. B. Olde Daalhuis eds.),
  [dlmf.nist.gov/16](https://dlmf.nist.gov/16). The contemporary
  authoritative definition. **§16.17** definition and contour-existence
  conditions; **§16.18** reductions to `pFq` (16.18.1 is *the* bridge
  identity); **§16.19** identities; **§16.20** integrals; **§16.21** ODE.

- **The Wolfram Functions Site**,
  [functions.wolfram.com/HypergeometricFunctions/MeijerG/](https://functions.wolfram.com/HypergeometricFunctions/MeijerG/).
  The "1363 formulas in 14 categories" — the largest formula warehouse
  for the function. Permitted reading (formulas, not source).

## Numerical-evaluation literature

- **F. Johansson 2017.** "Arb: efficient arbitrary-precision
  midpoint-radius interval arithmetic." *IEEE Trans. Computers* 66(8):
  1281–1292; arXiv [1611.02831](https://arxiv.org/abs/1611.02831). The
  rigorous ball-arithmetic substrate. Arb does **not** implement Meijer
  G natively (only `acb_hypgeom_pfq`), so the framework is relevant but
  the user-facing function is not directly available.

- **F. Johansson 2019.** "Computing hypergeometric functions
  rigorously." *ACM Trans. Math. Software* 45(3): 30; arXiv
  [1606.06977](https://arxiv.org/abs/1606.06977). The rigorous
  inner-loop `pFq` evaluator that any Meijer G implementation depends on.

- **J. W. Pearson 2009.** "Computation of Hypergeometric Functions."
  MSc thesis, University of Oxford, supervisors Mason Porter & Sheehan
  Olver. Available at
  [math.ucla.edu/~mason/research/pearson_final.pdf](https://www.math.ucla.edu/~mason/research/pearson_final.pdf).
  73-reference bibliography; comprehensive numerical-methods survey.

- **J. W. Pearson, S. Olver, M. A. Porter 2017.** "Numerical methods
  for the computation of the confluent and Gauss hypergeometric
  functions." *Numer. Algorithms* 74: 821–866;
  [DOI 10.1007/s11075-016-0173-0](https://doi.org/10.1007/s11075-016-0173-0).
  The which-method-where-in-(parameter × argument)-space taxonomy for
  `1F1` and `2F1`. Directly transferable to Meijer G's inner loop.

- **R. C. Forrey 1997.** "Computing the hypergeometric function."
  *J. Comput. Phys.* 137: 79–100;
  [DOI 10.1006/jcph.1997.5794](https://doi.org/10.1006/jcph.1997.5794).
  Classic numerical `2F1`.

- **W. Bühring 1987.** "An analytic continuation of the hypergeometric
  series." *SIAM J. Math. Anal.* 18: 884–889. The seminal `2F1`
  continuation across `z = 1`. Directly relevant to Meijer G's `|z| ≈ 1`
  in the balanced `p = q` case.

- **W. Becken & P. Schmelcher 2000.** "The analytic continuation of the
  Gaussian hypergeometric function 2F1(a,b;c;z) for arbitrary
  parameters." *J. Comput. Appl. Math.* 126: 449–478. Extends Bühring
  1987 to all parameter regimes.

- **N. M. Temme 2003.** "Large parameter cases of the Gauss
  hypergeometric function." *J. Comput. Appl. Math.* 153: 441–462.
  Large-parameter asymptotics, needed when Slater is applied to
  high-order G.

- **A. Gil, J. Segura, N. M. Temme 2007.** *Numerical Methods for
  Special Functions*, SIAM. Textbook account.

## Asymptotics & Stokes-line literature

- **J. L. Fields 1972.** "The asymptotic expansion of the Meijer
  G-function." *Math. Comp.* 26(119): 757–765;
  [DOI 10.2307/2005104](https://doi.org/10.2307/2005104). Explicit
  asymptotic working formula.

- **R. B. Paris & D. Kaminski 2001.** *Asymptotics and Mellin–Barnes
  Integrals.* Encyclopedia of Mathematics and its Applications 85,
  Cambridge University Press. ISBN 0-521-79001-8; 422 pp.
  Comprehensive modern Mellin–Barnes asymptotics treatise. Chapter 2
  redoes Braaksma 1964 in modern notation.

- **M. V. Berry & C. J. Howls 1991.** "Hyperasymptotics."
  *Proc. R. Soc. London A* 430: 653–668. Foundational hyperasymptotics
  paper.

- **A. B. Olde Daalhuis & F. W. J. Olver 1995.** "Hyperasymptotic
  solutions of second-order linear differential equations I."
  *Methods Appl. Anal.* 2: 173–197. ODE-solution hyperasymptotics;
  directly applicable to Meijer G's ODE.

- **F. W. J. Olver 1974.** *Asymptotics and Special Functions*,
  Academic Press. Classic textbook.

- **O. I. Marichev 1984.** "On the representation of Meijer's
  G-function in the vicinity of singular unity." (Print citation, not
  robustly indexed online.) Cited by DLMF §16.21 as the only published
  explicit treatment of the `|z| = 1` boundary in the balanced `p = q`
  case.

## Pedagogical / orientation

- **R. Beals & J. Szmigielski 2013.** "Meijer G-Functions: A Gentle
  Introduction." *Notices AMS* 60(7): 866–872;
  [DOI 10.1090/noti1016](https://doi.org/10.1090/noti1016). The most
  pedagogical 8-page exposition. First-read recommendation.

- **V. S. Adamchik 1997.** "Definite Integration in Mathematica V3.0."
  Self-published preprint at
  [viterbi-web.usc.edu/~adamchik/articles/integr/mier.pdf](https://viterbi-web.usc.edu/~adamchik/articles/integr/mier.pdf).
  The most accessible exposition of Mathematica's Adamchik–Marichev
  integration pipeline. References [1]–[6] are the canonical chain
  (Marichev 1983; Adamchik–Kölbig 1988; Adamchik–Marichev 1990;
  Adamchik 1995 J. Comput. Appl. Math.; Slater 1966; Luke 1969a).

- **A. M. Mathai, R. K. Saxena, H. J. Haubold 2009.** *The H-Function:
  Theory and Applications*, Springer.
  [DOI 10.1007/978-1-4419-0916-9](https://doi.org/10.1007/978-1-4419-0916-9).
  Comprehensive modern reference for the H-function (G's
  rational-step generalisation).

## Software / implementation references (permitted reading: papers; FORBIDDEN: source)

- **mpmath documentation.** `meijerg` page,
  [mpmath.org/doc/current/functions/hypergeometric.html](https://mpmath.org/doc/current/functions/hypergeometric.html).
  Permitted: API documentation, parameter list. **FORBIDDEN: the
  Python source** (`mpmath/functions/hypergeometric.py:1005-1064`,
  `hypercomb`, `hyper`, `_hyp_borel`).

- **SymPy documentation.** "Computing Integrals using Meijer G-Functions"
  at [docs.sympy.org/latest/modules/integrals/g-functions.html](https://docs.sympy.org/latest/modules/integrals/g-functions.html).
  Permitted: design rationale documentation. **FORBIDDEN: the
  Python source** (`sympy/simplify/hyperexpand.py`,
  `sympy/integrals/meijerint.py`).

- **Wolfram MeijerG reference.** [reference.wolfram.com/language/ref/MeijerG.html](https://reference.wolfram.com/language/ref/MeijerG.html).
  Permitted: documentation. **Mathematica source code is closed; not
  an issue for the no-direct-porting clause.**

- **NIST DLMF Chapter 16.** [dlmf.nist.gov/16](https://dlmf.nist.gov/16).
  Permitted in full.

## Historical / contextual

- **C. S. Meijer 1936, 1941, 1946.** Original defining sequence
  (*Nieuw Archief voor Wiskunde* 1936; *Proc. Nederl. Akad. Wetensch.*
  1941, 1946 "On the G-function I–VIII"). Print citations only.

- **E. W. Barnes 1908.** "A new development of the theory of the
  hypergeometric function." *Proc. London Math. Soc.* (2) 6: 141–177.
  The Mellin–Barnes contour-integral toolkit predecessor.

- **N. E. Nørlund 1955.** "Hypergeometric functions." *Acta Mathematica*
  94: 289–349; [DOI 10.1007/BF02392494](https://doi.org/10.1007/BF02392494).
  Foundational `pFq` connection coefficients across `|z| = 1`.

- **E. M. Wright 1935, 1940, 1948.** Asymptotic-expansion paper sequence
  for `pFq` that precedes Braaksma 1964.

## Note on the no-direct-porting clause

All papers above are **permitted reading** (in fact, expected — the
brief is paper-grounded). The source of any open-source implementation
(`mpmath`, SymPy, FriCAS, Maxima, REDUCE) is **forbidden**. The
distinction is: the candidate must derive from primary literature, not
transliterate from Python or Lisp. See `PROMPT.md` § "Audit grep
dimensions" for the four-axis source audit applied at trial close.

## Genuine-gap honest note

Outside Mathematica (Adamchik 1997, the open preprint) and mpmath
(Johansson 2009, the personal blog post), there is **no peer-reviewed
published design paper for any open-source MeijerG implementation**.
SymPy's design lives in Tom Bachmann's 2011 GSoC final report (no
DOI). FriCAS / Maxima / REDUCE have implementations but no published
methodology papers. The brief's "derive from papers" clause is fair
because the literature *is* sufficient — the symbolic algorithm
(Adamchik–Marichev + Roach) and the numerical algorithm (Slater +
Johansson hmag perturbation + Bühring continuation + Braaksma
asymptotics) are all in the public record. What is *not* in the public
record is the curated reduction table; that has to be extracted from
Bateman §5.6, PBM Vol 3 §8.4, Mathai 1993, and the Wolfram Functions
site.
