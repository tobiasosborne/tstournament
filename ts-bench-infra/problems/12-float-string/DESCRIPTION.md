# Description — Problem 12, Shortest-round-trip float ↔ string

## What is being tested

Two predicates over IEEE-754 binary64:

- **`dtoa(d)`** — given a finite double, return the shortest decimal
  string that round-trips through `parseFloat`.
- **`strtod(s)`** — given a decimal string, return the IEEE-754 double
  obtained by correctly rounded round-to-nearest-even decoding.

This is the shortest-round-trip / correctly-rounded parsing pair that
underlies essentially every modern language's stdlib float printer and
parser. The canonical algorithms span thirty years of refinement, and
the test set is constructed to expose the failure modes that
distinguish naive ports from production-grade implementations.

## Why this is hard

### Dtoa

The naive approach `(d * 1e17 | 0) / 1e17` plus retry-shorter-until-it-
breaks works for ~99% of doubles by accident. It fails on:

- **Powers of two and their boundaries**, where the asymmetric rounding
  region around `2^k` (`(2^k − 0.5·ulp_low, 2^k + 0.5·ulp_high)` with
  `ulp_low = 0.5·ulp_high`) means the shortest-decimal procedure must
  treat the lower and upper bound separately. Get this wrong and the
  output rounds to a different double on parse-back.
- **Subnormals**, where `ulp` doesn't follow the regular pattern; in
  particular the smallest subnormal `5e-324` has `ulp = 5e-324` itself,
  and many algorithms divide by zero or overflow when computing
  bounds.
- **The Grisu2 corner cases** (Loitsch 2010 §6): a documented set of
  ~0.4% of doubles for which Grisu2's fixed-precision DiyFp arithmetic
  produces a non-shortest output. Grisu3 detects this internally and
  falls back to Dragon4. Ryu eliminates the fallback entirely. A
  TypeScript port that copies Grisu2 verbatim will fail those cases.

### Strtod

Naive `parseFloat(s)` (or `Number(s)`) is correct on the V8 hot path
for short inputs but degrades on:

- **Long mantissas** (50+ digits): IEEE 754 binary64 has 53 bits of
  significand (~15-17 decimal digits). A correct strtod must not
  truncate the input prematurely; the digits past position 17 still
  contribute to the sign of the rounding error and must be examined.
- **Halfway points**: decimals that fall exactly between two
  consecutive doubles. Round-to-nearest-even is the IEEE 754 default;
  pick the wrong neighbour and you fail on every halfway test case.
- **The PHP DoS string** (`2.2250738585072011e-308` and a small
  family of similar boundary inputs at the smallest-normal /
  smallest-subnormal boundaries): historically caused infinite loops
  in PHP's strtod, browsers' parsers, and various other production
  systems before being fixed in 2010-2011.
- **Edge magnitudes**: very large mantissas (billions of digits) at
  small exponents that nonetheless represent denormals. Eisel-Lemire's
  fast path explicitly refuses these and the implementation must fall
  through cleanly to a bignum slow path.

## The three implementation tiers we discriminate

The benchmark expects to observe one of three classes of behaviour:

- **Tier 1 — naive**: writes `Number.prototype.toString()` for `dtoa`
  and `parseFloat` for `strtod`. Passes Tier A, mostly passes Tier B,
  fails 30-60% on Tiers C/D/E (powers of two / boundary doubles /
  denormals), fails ~95% on Tiers F/G/I/J (halfway points / long
  mantissas / Grisu corners / infamous strings).
- **Tier 2 — bignum-rational**: writes Steele-White Dragon4 in pure
  bignum + Clinger AlgorithmM with bignum quotient arithmetic.
  Correct everywhere; **times out on Tier H** (200k of each direction
  in 1.5s; bignum runs at ~70k/s on dtoa, ~50k/s on strtod under V8).
- **Tier 3 — Ryu / Eisel-Lemire**: precomputed power-of-5 tables for
  Ryu, 128-bit integer multiplication for Eisel-Lemire, falling back
  to bignum only on the cases the fast path explicitly refuses to
  handle. Passes everything within budget.

## Tier-by-tier construction

### A. random_easy (sanity, 400 queries / 4 cases)

Random doubles in `[-100, 100]` (dtoa) and short decimals like
`"3.14159"`, `"1e10"` (strtod). Catches I/O bugs, batch-handling bugs,
basic arithmetic, sign-of-zero. Anyone using `Number.prototype.toString`
and `Number()` survives this tier.

### B. integer_doubles (400 queries / 2 cases)

Integers `n` for `n ∈ [-2^53, 2^53]` (the range exactly representable
in binary64, with the boundary at the ±2^53 transition where every
*other* integer becomes representable). Tests:

- dtoa: must not emit a spurious decimal point (`"1.0"` and `"1"` both
  round-trip but only `"1"` has 1 sig digit; `"1.0"` has 1 sig digit
  too — but the conventional CPython output is `"1.0"` and we accept
  any sig-count-1 form). Boundary at `2^53 + 1` (which rounds to
  `2^53`) tests the model's handling of the integer/double mismatch.
- strtod: `"1"`, `"1e0"`, `"10e-1"`, `"0.1e1"` all parse to the same
  double `1.0`. The model must canonicalise correctly through the
  exponent.

### C. powers_of_two (4300 queries / 2 cases)

Every `2^k` for k in `[-1074, 1023]` — 2098 cases — converted to
the corresponding double. Expected:

- dtoa: shortest representation of `2^k` is what `repr(2.0**k)`
  produces. For most k this is short (`"4"`, `"8"`, `"1024"`); for
  large positive k it switches to exponent notation; for large
  negative k it tests subnormal printing.
- strtod: parsing `repr(2**k)` must round-trip exactly to `2^k`.

These cases exercise the asymmetric ulp boundary directly.

### D. boundary_doubles (~13000 queries / 2 cases)

For each `2^k` in tier C, the three doubles `(prev, exact, next)` —
the largest double less than `2^k`, the exact value, the smallest
double greater. ~6500 doubles total, dtoa and strtod each.

This tier specifically tests the boundary-ulp asymmetry: at `2^k`,
`prev` differs from `exact` by `ulp/2` (where `ulp` is the gap in the
lower binade) but `next` differs by `ulp` (in the upper binade).
Naive shortest-digit algorithms that don't track this asymmetry will
mis-round at every boundary.

### E. denormals (1200 queries / 2 cases)

- All "round" subnormals: `1·2^-1074, 2·2^-1074, 4·2^-1074, …,
  2^52·2^-1074 = 2^-1022 (smallest normal)`. ~70 cases per direction.
- Random subnormals: 500 random `n·2^-1074` for `n ∈ [1, 2^52)`.
- Boundary at `2^-1022` (smallest normal) and one ulp either side.

Naive Grisu implementations divide by `m_minus`/`m_plus` distances
that go to zero at the smallest-subnormal boundary; many TS ports of
Grisu2 fail this tier specifically because the original Loitsch C
code uses careful conditional logic for `m_minus = m/2` (when `m` is
the smallest in its binade) that's easy to miss.

### F. halfway_points (1000 queries / 1 strtod case)

For each of 1000 randomly-chosen consecutive double pairs `(d, d')`,
compute the exact decimal value at the midpoint
`(Decimal(d) + Decimal(d'))/2` and emit it as a string. The correct
strtod result is determined by ties-to-even on the binary mantissa:
return whichever of `d, d'` has an even significand low bit.

This tier is **fatal** to any strtod that uses `parseFloat`'s native
behaviour without explicit halfway handling. V8's `parseFloat`
implements correct ties-to-even; many hand-rolled implementations do
not, particularly those that round during digit accumulation.

### G. long_mantissa (500 queries / 1 strtod case)

Decimal strings with 50-200 significant digits, generated by:

- Take a random double `d`.
- Compute `Decimal(d)` exactly (binary64 → exact decimal — always finite,
  exact decimal length is `~k+52` digits where `d = m·2^-k`).
- Append random trailing digits past the 17-digit cutoff such that
  rounded back to binary64, the result is **either** `d` or its
  next/prev neighbour, depending on the trailing digits.

This tests that the implementation actually examines digits past the
17-digit cutoff. A correct strtod must distinguish e.g.

```
"0.10000000000000000555111512312578270211815834045410156250"  → 0.1
"0.10000000000000000555111512312578270211815834045410156249"  → next-down(0.1)
"0.10000000000000000555111512312578270211815834045410156251"  → next-up(0.1)
```

(All three strings are 56 digits. The first is the exact decimal value
of the binary64 nearest to 0.1; the others differ by ±1 in the last
place and thus round to different doubles. Naive strtod that
truncates after 17 digits will get all three wrong.)

### I. grisu_failure_corners (200 queries / 1 dtoa case)

Hand-curated doubles known to break Grisu2 — the corner cases that
forced Loitsch to publish Grisu3 with a fallback flag. The Loitsch
2010 paper §6 cites the catalogue:

- Doubles where Grisu2 produces a digit too many because the DiyFp
  approximation's error envelope straddles a digit boundary.
- Includes specific catalog entries: `1.0e-23, 9.5367431640625e-7,
  1.7976931348623157e+308 (max normal), 2.2250738585072014e-308
  (smallest normal), 2.2250738585072009e-308 (the PHP DoS denormal-
  boundary)`.
- Includes the random Grisu-failure cases discovered by Adams while
  validating Ryu against Grisu3 across all 2^64 doubles.

A TS Grisu2 port without the round-trip verification step will
produce a non-shortest output here. Grisu3 must detect the
out-of-bounds case and bail; Ryu produces shortest unconditionally.

### J. infamous_strings (30 queries / 1 strtod case)

A small set of strtod inputs that broke production parsers in well-
publicised CVEs:

- `"2.2250738585072011e-308"` — the PHP DoS string (CVE-2010-4645).
- `"2.2250738585072012e-308"` — Java DoS string.
- `"0.0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000049406564584124654417656879286822137236505980261432476442558568250067550727020875186529983636163599237979656469544571773092665671035593979639877479601078187812630071319031140452784581716784898210368871863605699873072305000638740915356498438731247339727316961514003171538539807412623856559117102665855668676818703956031062493194527159149245532930545654440112748012970999954193198940908041656332452475714786901472678015935523861155013480352649347201937902681071074917033322268447533357208324319360923828934583680601060115061698097530783422773183292479049825247307763759272478746560847782037344696995336470179726777175851256605511991315048911014510378627381672509558373897335989936648099411642057026370902792427675445652290875386825064197182655334472656e-1075"` — a 1700-character string for `5e-324` (smallest subnormal). Tests that the implementation handles enormously verbose inputs without going quadratic on length.
- `"1.7976931348623157e+308"` (MAX), `"1.7976931348623158e+308"`
  (rounds to MAX under ties-to-even), `"1.7976931348623159e+308"`
  (overflows to +Inf).
- `"4.9406564584124654e-324"` (smallest subnormal in alternative
  exponent form).
- A few JavaScript-engine-specific edges: numbers near the
  Number.MAX_SAFE_INTEGER boundary, `"-0.0"`, `"+.5"`,
  `"1.0e+0001"` (multi-digit exponent with leading zeros).

### K. canonical_corpus (~21 200 queries / 5 strtod cases)

The Apache-2.0 / CC0 `nigeltao/parse-number-fxx-test-data` corpus —
the canonical cross-implementation strtod test set, used by Rust's
`fast-float`, Go's `strconv` (since 1.16), simdjson, RapidJSON,
FreeType, and the C++ `<charconv>` implementations.

Five sub-corpora, each shipped as a separate verifier case so failures
are localised by source:

| Sub-corpus | Lines | Origin |
|---|---:|---|
| `more-test-cases.txt`     |     60 | Wuffs hand-curated edge cases |
| `lemire-fast-float.txt`   |  3 299 | Lemire's `fast_float` regression set (post-Eisel-Lemire-fastpath) |
| `tencent-rapidjson.txt`   |  3 563 | RapidJSON's strtod tests |
| `freetype-2-7.txt`        |  3 566 | FreeType-extracted decimals (rendering-engine corner cases) |
| `google-wuffs.txt`        | 10 744 | Wuffs project corpus (covers IBM-fpgen-style hard cases) |

Each line is `<hex16> <hex32> <hex64> <decimal-string>`; we use the
decimal as the strtod input and recompute truth via Python `float()`
(verified against `<hex64>` at golden-build time — zero disagreements
across all 21 232 lines).

This tier is the **single biggest correctness signal in the suite**.
Any strtod weakness will manifest here, localised to a specific
sub-corpus by the per-case verdict.

### M. ryu_regressions (5300 queries / 3 cases — dtoa heavy)

Hand-curated dtoa cases from Adams 2018 §5's Ryu-vs-Grisu3 validation
plus an exhaustive subnormal-binade sweep. Three sub-cases:

- **M_dtoa_ryu_regressions** (~125 dtoa queries): all powers of 10
  in `[10^-30, 10^+30]`, all powers of 10 in subnormal range, doubles
  at the 17-digit-boundary, plus specific failure cases cited in the
  Ryu paper (e.g. `9.0376714378586123e+216`, `8.348771003172784e-152`)
  and the published prior-art validation work.
- **M_dtoa_subnormal_sweep** (5 000 dtoa queries): every `2^k` for
  k ∈ [-1074, -1023] (the full subnormal binade) plus 5 000 random
  subnormals via direct mantissa bit-pattern construction. Exercises
  the smallest-binade ulp irregularity that breaks naive Grisu.
- **M_strtod_round_trip_coupling** (~125 strtod queries): the strtod
  inverse of the M1 dtoa outputs (computed via Python repr). Catches
  the regression-coupling case where a model's strtod is correct but
  its dtoa produces a bad input string — visible as a strtod failure
  even though the strtod algorithm is right.

The list is constructed analytically rather than copied verbatim from
any reference implementation's tests, deliberately.

### H. speed_gate (~400k queries / 2 cases)

Generator-driven via the LCG specified in `golden/verifier_protocol.md`:

- `dtoa_speed`: 200 000 random doubles drawn uniformly from the
  IEEE-754 bit pattern space (so the magnitude distribution is
  log-uniform across all binades, including subnormals and very
  large normals).
- `strtod_speed`: 200 000 random doubles formatted via Python `repr`
  to produce the input strings. Both agent and verifier expand the
  same LCG to produce identical input streams.

A bignum-rational implementation runs at roughly:
- `dtoa`: ~70 000 queries / second under V8 → ~3 seconds for 200k.
- `strtod`: ~50 000 queries / second → ~4 seconds for 200k.

Both blow the 1.5 s budget.

A Ryu / Eisel-Lemire implementation runs at roughly:
- `dtoa`: ~1 500 000 queries / second → ~150 ms for 200k.
- `strtod`: ~2 000 000 queries / second → ~100 ms for 200k.

Both fit comfortably under the 1.5 s budget with ~1 s headroom for
JS startup amortisation.

## Discrimination value

Within the benchmark, problem 12 sits next to problem 11 (Shewchuk
predicates) as a "correctness vs speed" probe — both are problems where
the canonical textbook expression *is* a viable correctness solution
but fails the speed gate. The two problems differ in surface area:

- Problem 11 has a dense numerical core (`predicates.c`'s expansion
  arithmetic) and the surface decomposition (orient2d/3d/incircle/
  insphere) is concentrated.
- Problem 12 has a sparse but heterogeneous surface: dtoa and strtod
  are independently complex, the test tiers exercise unrelated failure
  modes (boundary-rounding vs halfway-point vs long-mantissa vs
  Grisu-corner), and the optimal Tier-3 implementation needs *two*
  separate fast-path algorithms (Ryu for dtoa, Eisel-Lemire for
  strtod) plus a bignum slow-path for both.

The expected discrimination is similar in flavour — naive fails
correctness, bignum-rational fails Tier H, only Ryu / Eisel-Lemire
class implementations pass everything. Cross-model behaviour is
unknown; this is why the problem exists.
