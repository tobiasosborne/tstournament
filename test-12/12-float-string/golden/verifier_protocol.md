# Verifier protocol — Problem 12

## Output schema

```jsonc
{
  "results": [
    "1.5",                       // dtoa: a decimal string
    "0x3ff8000000000000",        // strtod: bit-pattern hex string (16 lowercase hex digits, prefixed `0x`)
    ...
  ]
}
```

Length must equal `input.queries.length` (or the LCG's `n` for the
generated form). Order must match the input order. Mixed-op batches
are allowed and are exercised by Tier A.

## Per-query verification

For each query, the verifier emits one row of the per-case
`bitwise_correct` check:

### `dtoa` query

The verifier:

1. Parses the candidate string with Python `float()`. If the parse
   raises, the query fails.
2. Decodes the input `bits` to a Python float via `struct.unpack`.
3. Compares `float(candidate)` to the input double bit-exactly, via
   the IEEE-754 64-bit big-endian wire form (this distinguishes `+0`
   from `-0` and any NaN payload).
4. Computes `expected = repr(input_double)` using CPython's
   shortest-round-trip formatter (provably correct since 3.1).
5. Compares the candidate's significand-digit count (per
   `sig_digit_count` below) against the expected's. They must be
   equal.

The query passes iff steps 3 and 5 both hold.

#### `sig_digit_count(s)` — exact procedure

```python
def sig_digit_count(s: str) -> int:
    s = s.strip().lstrip('+-').lower()
    # Special tokens
    if s in ('nan', 'inf', 'infinity', '-inf', '-infinity'):
        return 0   # special-case; not compared by digit count
    # Split on exponent
    if 'e' in s:
        m, _ = s.split('e', 1)
    else:
        m = s
    # Split on decimal point
    if '.' in m:
        ip, fp = m.split('.', 1)
    else:
        ip, fp = m, ''
    # Concatenate, strip leading and trailing zeros (these are not significant)
    digits = (ip + fp).lstrip('0').rstrip('0')
    if not digits:
        return 1   # the number was 0 in some form; single significant zero
    return len(digits)
```

Examples:

| Input string | sig_digit_count |
|---|---|
| `"1"` | 1 |
| `"1.0"` | 1 |
| `"10"` | 1 |
| `"1e3"` | 1 |
| `"1.0e3"` | 1 |
| `"0.001234"` | 4 |
| `"1.234e-3"` | 4 |
| `"3.141592653589793"` | 16 |
| `"-0"` | 1 |
| `"NaN"` | 0 (special) |

For special values (`NaN`, `±Infinity`), the verifier accepts any
casing of `nan` / `inf` / `infinity` (with the appropriate sign for
±∞) and skips the digit-count check.

### `strtod` query

The verifier:

1. Parses the candidate output `0x[0-9a-f]{16}` as a 64-bit unsigned
   integer; rejects if not 16 hex digits.
2. Decodes the unsigned integer to a Python float via `struct.unpack`.
3. Computes `expected = float(input_string)` using CPython's
   correctly-rounded parser. For halfway-point cases (Tier F),
   additionally cross-checks via `decimal.Decimal` arithmetic that
   the result respects round-to-nearest-even on the binary mantissa.
4. Compares the candidate's bit pattern to the expected's, bit-exactly.

The query passes iff the bit patterns match.

For NaN inputs, the verifier accepts any quiet-NaN bit pattern (the
sign bit and payload are implementation-defined; the agent need only
produce *some* NaN). For ±∞ inputs, the verifier requires the exact
canonical bit patterns `0x7ff0000000000000` (+Inf) and
`0xfff0000000000000` (-Inf).

## Tier H expansion

For test cases with `input.format = "generated"`, both the agent and
the verifier expand `input.generator` into an identical query stream
via the LCG below.

### LCG state (MMIX, Knuth)

The state is a 64-bit unsigned integer. The recurrence is:

```
state_{i+1} = (state_i * 6364136223846793005 + 1442695040888963407) mod 2^64
```

Initial state `state_0` is `int(generator.seed) mod 2^64`.

In TypeScript, this can be implemented with `BigInt` (correct but
~5× slower) or with two `Number` halves and `Math.imul`-based 16-bit
chunked multiply (the same approach Shewchuk's predicates trial used
for problem 11). The constants split as:

```
A_HI = 0x5851F42D = 1481765933
A_LO = 0x4C957F2D = 1284865837
C_HI = 0x14057B7E = 335903614
C_LO = 0xF767814F = 4150755663
```

### `kind = "uniform_bits"` (dtoa speed gate)

For each query `i ∈ [0, n)`:

1. Advance the LCG by one step.
2. Take the high 64 bits of `state` (i.e. `state` itself in a 64-bit
   model) as the IEEE-754 bit pattern of the i-th double.
3. **Reject and re-roll** if the bit pattern represents a NaN or ±∞
   (i.e. exponent field equals `0x7FF`); advance the LCG and try
   again. The agent must implement the same rejection.

The query is `{"op": "dtoa", "bits": "0x...sixteenlowercase..."}`.

### `kind = "uniform_strtod"` (strtod speed gate)

For each query `i ∈ [0, n)`:

1. Advance the LCG by one step.
2. Take the bit pattern as in `uniform_bits` (with the same NaN/Inf
   rejection).
3. Format the resulting double via Python `repr(d)` (or, equivalently
   for the agent, any shortest-round-trip dtoa: the result must be
   bitwise-identical to what `repr(d)` would produce on CPython 3.10+).
   This is the input string for the strtod query.

   **Important:** the agent must format via *its own* dtoa to produce
   the strtod input — the strtod-tier exercises the round-trip
   property. If the agent's dtoa is wrong, the strtod input string
   will differ from the verifier's, and bitwise comparison will fail
   on every speed-gate strtod case. This is by design: it makes Tier
   H_strtod a regression test for Tier H_dtoa as well.

The query is `{"op": "strtod", "s": "<repr-format-string>"}`.

The expected output for both Tier H sub-cases is computed by the
verifier via the standard reference (CPython `repr` for dtoa,
`float()` for strtod).

## Failure-detail format

On any failure, the `bitwise_correct` check's `detail` field reports
the first 5 disagreeing query indices in the form:

```
"index 17: op=dtoa, input=0x3ff999999999999a, candidate='0.10000000000000000555', expected_digits=2, got_digits=20"
```

or:

```
"index 23: op=strtod, input='1.5e-323', candidate=0x0000000000000003, expected=0x0000000000000004"
```

This is sufficient to localise the failure to a specific algorithmic
mode (e.g. "boundary at 2^k for k = -1023" or "long mantissa with
trailing 250x").
