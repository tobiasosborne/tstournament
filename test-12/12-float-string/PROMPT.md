# Problem 12 — Shortest-round-trip float ↔ string

## ⚠ How you will be graded

You will be graded on **CORRECTNESS** and **SPEED**.

Produce the **most elegant, most efficient, most perfect, most impressive**
TypeScript implementation you can. This is a portfolio piece. The verifier
is a *floor*, not a ceiling — passing it is necessary but not sufficient.

**Dev time is infinite.** Take as long as you need. Use multiple sessions
if that helps. Refactor. Re-architect. Profile. Polish. **Prefer
multi-session quality over quick-fix janky band-aid shortcuts.** Do not
ship the first thing that passes the verifier — ship the version you'd put
your name on.

This problem has the same correctness/speed tension as problem 11. A
naive `Number.prototype.toString()` evaluator looks plausible — and is
even shortest-round-trip *almost everywhere* — but fails on the
adversarial test set whenever the JavaScript engine ships a Grisu2-
without-fallback formatter (V8 historically did, until ~2018) or a
broken `Number(s)` parser. A bignum-rational `dtoa`/`strtod` based on
Steele-White 1990 / Clinger 1990 is correct everywhere but **times out
on the speed-gate tier (Tier H)** under the **1.5-second per-case
budget**. Only a Ryu / Grisu3-with-fallback / Eisel-Lemire-class
implementation in pure TypeScript passes everything.

**How** you solve it is up to you, subject to those constraints and the
no-porting constraint below. The canonical references are Steele &
White 1990 (the original "Print Floating-Point Numbers Accurately"),
Burger & Dybvig 1996 (the "Free-format" refinement that became
Dragon4), Loitsch 2010 (Grisu), Adams 2018 (Ryu), Clinger 1990 (the
parsing counterpart), and Lemire 2021 (Eisel-Lemire fast strtod). Read
the papers; derive your implementation from their pseudocode and
constant tables.

## ⚠ NO DIRECT PORTING — derive from the papers, not from the canonical reference code

The benchmark measures **algorithmic implementation from published
specifications**, not transliteration from existing reference
implementations. Public-domain reference C / C++ / Java / Go
implementations of every algorithm in scope exist
(`ulfjack/ryu`, `lemire/fast_float`, David Gay's `dtoa.c`, OpenJDK
`jdk.internal.math.DoubleToDecimal`, Go `strconv.formatBits`,
simdjson's number parser, Rust's `ryu` and `fast-float` crates,
Abseil, …). You must NOT consult or transliterate any of them.

❌ Do not fetch, view, or paste from `ulfjack/ryu`, `lemire/fast_float`,
   `simdjson`, OpenJDK source, Go stdlib source, Rust crates, Boost,
   Abseil, V8, SpiderMonkey, JavaScriptCore, dtoa.c, or any other
   language's built-in `to_chars`/`from_chars` / `String.format` /
   `parseFloat` source.
❌ Do not search the web for "ryu typescript port", "fast_float port",
   "grisu javascript", "dtoa typescript", or analogous queries.
❌ Do not request canonical-implementation source via tool calls. The
   `sources/` directory in this problem committed PDFs of the four
   papers and **no code**, deliberately.
✅ Read the papers in `sources/`. Use their pseudocode, equations, and
   constant tables (e.g. Adams 2018 Tables 1-4 for Ryu's power-of-5
   lookup multipliers; Lemire 2021 Algorithm 1 for the
   128-bit-multiplication fast path; Loitsch 2010 §3 for DiyFp).
✅ Derive your own constant tables from the paper's mathematical
   description. The agent's value is in producing the table, not in
   copying it.
✅ The orchestrator will audit your source for transliteration markers
   (function names that match a canonical reference verbatim — e.g.
   `d2s_buffered_n`, `compute_float`, `multiply_high_64`, `umul128`;
   variable names with C-idiomatic short forms — `m2`, `e2`, `vp`,
   `vm`, `vr`; comment-by-comment correspondence with a known
   reference's structure; constant tables byte-identical to a known
   reference's `.h` file). Detected transliteration is an automatic
   fail of the "engineering judgment" scorecard dimension and a
   downgrade of "algorithmic depth".

This constraint exists because every canonical Ryu / Eisel-Lemire
implementation already encodes ~30 years of accumulated translation
work. A faithful port would reduce the trial to "transliterate from
C to TypeScript" — a different and shallower skill than the
"derive from paper" skill the benchmark intends to measure. The
papers contain everything needed; the rest is your engineering work.

## Problem statement

Implement two predicates over IEEE-754 binary64 (`double`):

| Predicate | Inputs | Returns |
|---|---|---|
| `dtoa(d)` | one finite double | the **shortest** decimal string `s` such that `parseFloat(s) === d`, with ties broken by round-to-nearest-even |
| `strtod(s)` | one decimal string | the IEEE-754 double obtained by **correctly rounded** round-to-nearest-even decoding of `s` |

Both directions are bidirectional inverses on the round-trip:
`strtod(dtoa(d)) === d` for every finite double `d`, including
subnormals, ±0, and the boundary cases at powers of two.

### `dtoa` precise specification

Given a finite IEEE-754 double `d` (possibly ±0, possibly subnormal,
possibly a power of 2):

- Return a decimal string `s` such that:
  1. `parseFloat(s) === d` (round-trip; bit-exact, including the sign of zero).
  2. `s` has the **minimum number of significant decimal digits** among
     all strings satisfying (1). The verifier compares the candidate's
     significand-digit count against Python's `repr(d)` (CPython 3.1+,
     which is provably shortest-round-trip per Steele-White / Burger-
     Dybvig). Equality required.
- The string format is otherwise free. Acceptable forms include
  `"1"`, `"1.0"`, `"1e0"`, `"0.001234"`, `"1.234e-3"` — the verifier
  parses with Python `float()` and counts significand digits via the
  procedure documented in `golden/verifier_protocol.md` §"sig_digit_count".
- Special values: NaN must produce `"NaN"`. ±∞ must produce `"Infinity"`
  or `"-Infinity"`. Negative zero must be distinguished from positive
  zero in the output (`"-0"` is acceptable; `"0"` is not for `-0.0`).

### `strtod` precise specification

Given a decimal string `s`:

- Return the IEEE-754 double `d` such that `d` is the value `Decimal(s)`
  rounded to nearest binary64 with **ties to even** in the binary
  significand.
- The accepted input grammar:
  ```
  decimal := sign? digits ( '.' digits )? ( ('e'|'E') sign? digits )?
          |  sign? '.' digits ( ('e'|'E') sign? digits )?
  sign   := '+' | '-'
  digits := [0-9]+
  ```
  with an optional leading sign, optional fractional part, and optional
  exponent. Mantissa length is unbounded (the test set includes 50+
  digit mantissas; naive `parseFloat` chunking is insufficient).
- Special inputs: `"NaN"`, `"Infinity"`, `"-Infinity"` (exact case) must
  parse correctly. The verifier does not exercise leading whitespace,
  hex floats (`0x1.fp3`), or arbitrary unicode digits.
- Magnitudes outside `[5e-324, 1.7976931348623157e308]` round to
  `±0.0` (underflow) or `±Infinity` (overflow), respectively.
- Output is the resulting double's IEEE-754 bit pattern as a
  16-character lowercase hex string prefixed by `0x` —
  e.g. `"0x3ff0000000000000"` for `1.0`.

## I/O contract (JSON)

Each test case is one JSON object on stdin:

```jsonc
{
  "queries": [
    {"op": "dtoa",   "bits": "0x3ff0000000000000"},
    {"op": "strtod", "s":    "0.1"},
    ...
  ]
}
```

— OR, for the speed-gate tier:

```jsonc
{
  "format":    "generated",
  "generator": {
    "kind":  "uniform_bits" | "uniform_strtod",
    "n":     <int>,
    "seed":  "<bigint as decimal string>",
    "lo":    <int, optional, only for uniform_bits>,
    "hi":    <int, optional, only for uniform_bits>
  }
}
```

In the `"generated"` form, both your solution and the verifier expand
the descriptor through the **same documented LCG** (see
`golden/verifier_protocol.md` §"Tier H expansion") to produce identical
input streams. This avoids embedding hundreds of megabytes of test
data.

Output:

```jsonc
{
  "results": [
    "1",                       // dtoa: a decimal string
    "0x3fb999999999999a",      // strtod: bit-pattern hex string
    ...
  ]
}
```

The output array length and ordering must match the input queries.

## Suggested TypeScript signature

```ts
type Query =
  | { op: "dtoa";   bits: string }
  | { op: "strtod"; s:    string };

interface InputExplicit  { queries: Query[]; }
interface InputGenerated { format: "generated"; generator: GenDescriptor; }
type Input = InputExplicit | InputGenerated;
interface Output { results: string[]; }

function floatString(input: Input): Output;
```

The shape of your internal API is up to you. The bit-pattern conversion
between `number` and `bigint` IEEE-754 word can be done via
`DataView` + `BigUint64Array`, by `Float64Array.buffer` aliasing, or by
hand. The conversion is a fixed cost, not the hot loop.

## Performance contract — **the bignum-rational kill**

Each test case has a **1.5-second wall-clock budget**, enforced by
wrapping the candidate command in `timeout 1.5s`. Recommended
invocation:

```bash
verifiers/run_tests.sh 12-float-string \
    timeout 1.5s npx --yes tsx 12-float-string/solution.ts
```

Sizing of the speed-gate tier (Tier H):

| Direction | n queries | Naive (often wrong) | bignum-rational | Ryu / Eisel-Lemire |
|---|---:|---:|---:|---:|
| `dtoa`   | 200 000 | ~30 ms | **~3 s — TIMES OUT** | ~150 ms |
| `strtod` | 200 000 | ~30 ms | **~4 s — TIMES OUT** | ~150 ms |

A `bignum`-numerator/denominator implementation of Steele-White's
algorithm and Clinger's `AlgorithmM` is correct everywhere but
**will fail Tier H** under the budget. The implementation must use a
fast path (Ryu's precomputed power-of-5 tables for `dtoa`, the
Eisel-Lemire 128-bit fast path for `strtod`) and only fall back to
bignum on the cases the fast path explicitly refuses to handle. This
is binding.

## Verifying your solution

`golden/verify.py` reads `{"input": ..., "candidate": ..., "id": ...}`
on stdin and emits three checks per case:

```jsonc
{
  "pass":   true,
  "reason": "all invariants hold",
  "checks": {
    "shape":          {"pass": true, "detail": "..."},
    "batch_complete": {"pass": true, "detail": "..."},
    "bitwise_correct":{"pass": true, "detail": "..."}
  }
}
```

The verifier computes ground truth via:

- **`dtoa`**: CPython `repr(d)` is provably shortest-round-trip since
  Python 3.1 (and is what David Gay's `dtoa.c` mode 0 plus Python's
  formatter emit). The candidate must round-trip and have the same
  significand-digit count.
- **`strtod`**: CPython `float(s)` is correctly rounded. For
  halfway-point cases, the verifier additionally cross-checks via
  `decimal.Decimal` arithmetic against the true round-to-nearest-even
  result (this is the Lemire/Clinger correctness condition).

On mismatch, the `bitwise_correct` detail field reports the first 5
disagreeing query indices with `(input, candidate, truth)` triples.

### Files

- `golden/inputs.json` — every test case (~3 MB; mostly the curated
  edge-case tiers and a snippet of representative speed-gate seeds).
- `golden/expected.json` — reference outputs (provided; not consulted
  by the verifier — truth is recomputed live for every query).
- `golden/verify.py` — verifier.
- `golden/verifier_protocol.md` — protocol notes including the LCG
  specification for Tier H and the exact `sig_digit_count` algorithm.

### Exact shell command

```
infra/verifiers/run_tests.sh problems/12-float-string \
    timeout 1.5s <your-cmd>
```

For example:

```
infra/verifiers/run_tests.sh problems/12-float-string \
    timeout 1.5s npx --yes tsx 12-float-string/solution.ts
```

The `timeout 1.5s` wrapper is essential — without it, a slow but
correct implementation will appear to pass while in fact violating the
performance contract. With it, a timeout manifests as the candidate
exiting non-zero, which the harness reports as a failed case before
the verifier ever runs.

## Test-set tiers (informational)

| Tier | Cases × queries | What it catches |
|---|---|---|
| A. random_easy | 4 × 100 = 400 | Sanity: I/O handling, well-separated values |
| B. integer_doubles | 2 × 200 = 400 | Integers up to 2^53; trivial conceptually, easy to mis-format |
| C. powers_of_two | 2 × ~2150 = 4300 | All `2^k` for k ∈ [-1074, 1023]: subnormals through max-normal. Asymmetric rounding boundaries — naive shortest-digit algorithms misround |
| D. boundary_doubles | 2 × ~6500 ≈ 13000 | Triples `(prev, exact, next)` around each tested 2^k boundary; tests dtoa boundary handling and strtod tie-break |
| E. denormals | 2 × 600 = 1200 | Subnormals (`2^-1074` through `2^-1022`), the smallest normals, the underflow corner. Naive Grisu fails on subnormals |
| F. halfway_points (strtod) | 1 × 1000 | Decimal strings exactly midway between two doubles. Round-to-nearest-even must select the even-mantissa neighbour |
| G. long_mantissa (strtod) | 1 × 500 | 50-200 digit decimals where naive parseFloat chunking accumulates error; includes the Lemire test-vectors |
| I. grisu_failure_corners (dtoa) | 1 × 200 | Hand-curated doubles known to break Grisu2 (Loitsch 2010 §6 catalog: cases where Grisu2 produces a non-shortest output). Grisu3 must detect and fall back; Ryu always shortest |
| J. infamous_strings (strtod) | 1 × 30 | The PHP DoS string (`2.2250738585072011e-308` and friends), Java DoS strings, very long mantissas at MAX/MIN_NORMAL boundaries |
| K. canonical_corpus (strtod) | 5 × ~4200 ≈ 21 200 | The Apache-2.0 `parse-number-fxx-test-data` corpus (more-test-cases / lemire-fast-float / tencent-rapidjson / freetype / google-wuffs). The canonical cross-implementation strtod test set. **Single biggest correctness signal in the suite.** |
| M. ryu_regressions (dtoa+strtod) | 3 × ~5300 | Adams 2018 §5 Ryu-vs-Grisu3 published failure cases + full subnormal binade sweep + round-trip coupling check |
| H. speed_gate | 2 × ~200k each = 400k | Throughput — bignum-rational TIMES OUT |

See `DESCRIPTION.md` for the per-tier construction rationale.

## Canonical phrasing (informational)

These short excerpts ground the spec. They are **informational, not
restrictive**.

> 1. *The shortest-round-trip contract (Steele-White):*
>    "We give algorithms for converting between decimal and floating-
>    point representations of numerical values. Free-format conversion
>    of a floating-point value to decimal produces the shortest decimal
>    representation that converts back to the original floating-point
>    value."
>    — Steele-White-PrintFloats-PLDI-1990 §1
> 2. *The Grisu fast path (Loitsch):*
>    "Grisu2 is a fast algorithm to convert floating-point numbers to
>    decimal strings. It is much faster than the algorithms used in
>    most current implementations. Grisu2 produces a result for which
>    99.6% of all numbers it is the shortest representation."
>    — Loitsch-Grisu-PLDI-2010 §1
> 3. *Ryu's correctness guarantee (Adams):*
>    "We present Ryu, a new algorithm for the conversion of binary
>    floating-point numbers to their shortest, round-trip-safe decimal
>    representations. Unlike Grisu, Ryu always produces the shortest
>    representation, without requiring a fallback algorithm."
>    — Adams-Ryu-PLDI-2018 §1
> 4. *Correctly-rounded parsing (Clinger):*
>    "We present an algorithm for converting decimal scientific
>    notation to floating-point numbers, with the property that the
>    result is the floating-point number nearest the true value of the
>    decimal input."
>    — Clinger-ReadFloats-PLDI-1990 §1
> 5. *Eisel-Lemire fast strtod:*
>    "We present a fast algorithm for parsing floating-point numbers
>    using SIMD-friendly 128-bit integer multiplication. It produces
>    correctly rounded results in the cases it accepts (>99.9% of
>    inputs in practice) and falls back to a slow path otherwise."
>    — Lemire-NumberParsing-SP&E-2021 §1

## What you must do

1. Conform to the JSON I/O contract above. Read from stdin, write to stdout.
2. Run the verifier before declaring done:
   ```
   infra/verifiers/run_tests.sh problems/12-float-string \
       timeout 1.5s <your-cmd>
   ```
3. In your final answer, report the verifier's per-check totals
   (e.g. `shape 19/19 · batch_complete 19/19 · bitwise_correct 19/19`).
4. Ship the implementation **you'd put your name on**. Quality and
   correctness are the grade. Multi-session refinement is welcome;
   janky shortcuts are not. **Bignum-rational implementations will
   fail the speed gate and are therefore not a viable shortcut.**
