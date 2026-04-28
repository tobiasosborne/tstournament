# References — Problem 12, Shortest-round-trip float ↔ string

## Load-bearing ground truth

The implementation tracks a thirty-year algorithmic lineage. The
canonical references for the **forward direction** (double → shortest
decimal) are:

- **Steele & White 1990** — the original "shortest-round-trip" formulation.
  Establishes correctness via a bignum-rational outer loop. Slow but
  provably correct.
- **Burger & Dybvig 1996** — refines Steele-White with the
  "free-format" output strategy that became Dragon4. Same correctness,
  cleaner termination argument.
- **Loitsch 2010 (Grisu)** — fast-path approximation using DiyFp
  (extended-precision floats with explicit error envelope). Grisu2
  produces shortest output for ~99.6% of doubles; Grisu3 detects the
  remaining ~0.4% of cases and falls back to Dragon4.
- **Adams 2018 (Ryu)** — provably shortest, no fallback, ~3× faster
  than Grisu3 via precomputed power-of-5 tables. Now the reference in
  Java (`Double.toString`, since JDK 12), Rust (`ryu` crate, used by
  `f64::to_string` since 1.40), and many others.

For the **reverse direction** (decimal → correctly rounded double):

- **Clinger 1990** — the parsing counterpart to Steele-White. AlgorithmM
  uses bignum quotient arithmetic to produce a correctly rounded
  result for every input.
- **Gay 1990 (`dtoa.c`)** — the canonical David Gay reference C
  implementation, used by Python (until 3.12), Mozilla, and many
  others. Lacks the Eisel-Lemire fast path and is therefore slow on
  long mantissas; correct everywhere.
- **Lemire 2021 (Eisel-Lemire)** — fast strtod via 128-bit integer
  multiplication. Handles >99.9% of inputs in the fast path; falls
  back to a slow path on the remainder. Adopted by Rust's
  `fast-float` crate and Go's `strconv.ParseFloat` (since 1.16).

## Citations

### Forward direction

- **Steele, G. L. Jr.; White, J. L.**
  "How to print floating-point numbers accurately."
  In *Proceedings of the SIGPLAN '90 Conference on Programming Language
  Design and Implementation (PLDI '90)*, pp. 112-126.
  ACM, 1990.
  DOI: 10.1145/93542.93559.
  → `sources/Steele_White_PrintFloats_PLDI_1990.pdf`

- **Burger, R. G.; Dybvig, R. K.**
  "Printing floating-point numbers quickly and accurately."
  In *Proceedings of PLDI '96*, pp. 108-116.
  ACM, 1996.
  DOI: 10.1145/231379.231397.
  → `sources/Burger_Dybvig_PrintFloats_PLDI_1996.pdf`

- **Loitsch, F.**
  "Printing floating-point numbers quickly and accurately with integers."
  In *Proceedings of PLDI '10*, pp. 233-243.
  ACM, 2010.
  DOI: 10.1145/1806596.1806623.
  → `sources/Loitsch_Grisu_PLDI_2010.pdf`

  Includes the §6 catalogue of Grisu2 failure cases.

- **Adams, U.**
  "Ryū: fast float-to-string conversion."
  In *Proceedings of PLDI '18*, pp. 270-282.
  ACM, 2018.
  DOI: 10.1145/3192366.3192369.
  → `sources/Adams_Ryu_PLDI_2018.pdf`

### Reverse direction

- **Clinger, W. D.**
  "How to read floating-point numbers accurately."
  In *Proceedings of PLDI '90*, pp. 92-101.
  ACM, 1990.
  DOI: 10.1145/93542.93557.
  → `sources/Clinger_ReadFloats_PLDI_1990.pdf`

- **Gay, D. M.**
  "Correctly rounded binary-decimal and decimal-binary conversions."
  Numerical Analysis Manuscript 90-10, AT&T Bell Laboratories, 1990.
  Reference C implementation: <https://www.netlib.org/fp/dtoa.c>.
  → not auto-downloaded; the .c source is plain ASCII and is the
    operational canonical reference for `strtod`.

- **Lemire, D.**
  "Number parsing at a gigabyte per second."
  *Software: Practice and Experience* 51 (8), 2021, 1467-1483.
  DOI: 10.1002/spe.2984.
  → `sources/Lemire_NumberParsing_SPE_2021.pdf`

  Describes the Eisel-Lemire fast path; reference C++ implementation
  in `simdjson` and the `fast-float` library.

### Test corpus

- **Tao, N.; et al.**
  *parse-number-fxx-test-data* — Apache 2.0-licensed cross-implementation
  test corpus for `strtod`/`atof`/`StringToDouble`-family functions.
  <https://github.com/nigeltao/parse-number-fxx-test-data>.
  → `sources/canonical-corpora/` (committed: more-test-cases,
    lemire-fast-float, tencent-rapidjson, freetype-2-7, google-wuffs;
    ~21 200 entries; the larger ibm-fpgen / lemire-fast-double-parser /
    ulfjack-ryu / remyoudompheng-fptest files are excluded by size).
  Each line is `<hex16> <hex32> <hex64> <decimal>` — verified
  byte-perfect-equivalent to Python `float()` across all 21 232 lines
  at golden-build time. Used by Rust's `fast-float`, Go's `strconv`
  (since 1.16), simdjson, RapidJSON.

### Background framing

- **Goldberg, D.**
  "What every computer scientist should know about floating-point arithmetic."
  *ACM Computing Surveys* 23 (1), 1991, 5-48.
  DOI: 10.1145/103162.103163.
  Background on IEEE 754 semantics, ulps, and rounding.
  → `sources/Goldberg_FloatingPoint_CSUR_1991.pdf`

### Downstream consumers (informational)

The shortest-round-trip / correctly-rounded pair is the output format
contract for essentially every modern language stdlib's `float-to-
string` and `string-to-float`:

- **Java** uses Ryu since JDK 12 (2019) for `Double.toString`,
  Eisel-Lemire-style fast strtod since JDK 14.
- **Rust** uses Ryu since 1.40 (2019), Eisel-Lemire since 1.55 (via
  the `fast-float` crate as `f64::from_str`).
- **Go** uses Ryu since 1.12 for `strconv.FormatFloat`,
  Eisel-Lemire since 1.16 for `strconv.ParseFloat`.
- **Python** uses David Gay's `dtoa.c` for both directions through
  3.11; switched to a custom Steele-White-shaped implementation in
  3.12. Both are correctly rounded; neither uses Ryu's fast path.
- **JavaScript (V8)** uses Grisu3-with-fallback-to-Dragon4 for
  `Number.prototype.toString`, parses via a hand-tuned algorithm
  conceptually similar to Eisel-Lemire.
- **C++ `std::to_chars`** (since C++17, mandatory shortest-round-trip)
  is universally implemented as Ryu in libc++ and libstdc++ since
  ~2019.

This collective adoption — across the languages that ship to
billions of users — is the load-bearing argument for treating
Steele-White/Ryu and Clinger/Eisel-Lemire as the canonical
implementations.
