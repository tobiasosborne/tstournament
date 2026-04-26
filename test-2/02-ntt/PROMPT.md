# Problem 2 — Number-Theoretic Transform (arbitrary length)

## ⚠ How you will be graded

You will be graded on **QUALITY** and **CORRECTNESS**.

Produce the **most elegant, most efficient, most perfect, most impressive**
TypeScript implementation you can. This is a portfolio piece. The verifier
is a *floor*, not a ceiling — passing it is necessary but not sufficient.

**Dev time is infinite.** Take as long as you need. Use multiple sessions
if that helps. Refactor. Re-architect. Profile. Polish. **Prefer
multi-session quality over quick-fix janky band-aid shortcuts.** Do not
ship the first thing that passes the verifier — ship the version you'd put
your name on.

**How** you solve it is up to you: search the web, use libraries, port
from another language, copy patterns from prior art — whatever you'd do
normally. The JSON I/O contract is the only hard interface constraint.

## Problem statement

Implement a Number-Theoretic Transform (NTT) over `ℤ/p` for the prime
`p = 998244353`, supporting **arbitrary length** `n` (not only powers of
two). Both directions are required.

The implementation is expected to use **Bluestein's chirp-z** to reduce
arbitrary-length NTT to a power-of-two circular convolution evaluated by a
power-of-two NTT, and **Montgomery multiplication** (or a comparable fast
modular reduction) in the inner loop. Neither is checked at the verifier
level — they are quality choices that distinguish a polished implementation
from a slow one.

### Definitions

- `p = 998244353`, `p − 1 = 2²³ · 7 · 17`.
- `g = 3` is the smallest primitive root of `(ℤ/p)*`.
- `ω_n = g^((p−1)/n) mod p`, defined for every `n` that divides `p − 1`.
  The verifier picks `n` only from this set; you may assume `n | (p − 1)`.

### Mathematical specification

For `x = (x_0, …, x_{n−1}) ∈ (ℤ/p)^n`:

- **Forward**:  `X_k = Σ_{j=0}^{n−1} x_j · ω_n^{j·k} (mod p)`.
- **Inverse**:  `x_j = n⁻¹ · Σ_{k=0}^{n−1} X_k · ω_n^{−j·k} (mod p)`,

with `n⁻¹` and `ω_n⁻¹` taken in `(ℤ/p)*`. `n = 1` is the identity.

## I/O contract (JSON)

### Input (one JSON object on stdin)

```jsonc
{
  "n":              <int, ≥ 1, divides p−1>,
  "modulus":        "998244353",
  "primitive_root": "3",
  "direction":      "forward" | "inverse",
  "x":              ["<a_0>", "<a_1>", …]   // length n, decimal residues in [0, p)
}
```

### Output (one JSON array on stdout)

```jsonc
["<b_0>", "<b_1>", …]   // length n, decimal residues in [0, p)
```

Residues are decimal **strings** in canonical form (no leading zeros, no
sign, no surrounding whitespace). See `infra/verifiers/encoding.md`.

## Suggested TypeScript signature

```ts
interface NTTInput {
  n:              number;
  modulus:        string;
  primitive_root: string;
  direction:      "forward" | "inverse";
  x:              string[];
}

function ntt(input: NTTInput): string[];
```

The shape of your internal API is up to you. The JSON in/out contract is
mandatory; how you represent residues internally (`bigint`, Montgomery
form, packed `number`s with lazy reduction, …) is your call.

## Verifying your solution

`golden/verify.py` reads `{"input": ..., "candidate": ..., "id": ...}` on
stdin and emits

```jsonc
{
  "pass":   true,
  "reason": "all invariants hold",
  "checks": {
    "shape":            {"pass": true, "detail": "..."},
    "canonical_range":  {"pass": true, "detail": "..."},
    "modular_equality": {"pass": true, "detail": "..."},
    "roundtrip":        {"pass": true, "detail": "..."}
  }
}
```

Modular arithmetic is exact: there is no tolerance. See
`golden/verifier_protocol.md` for what each check pins.

### Files

- `golden/inputs.json` — every test case.
- `golden/expected.json` — reference outputs (provided; not required by the
  verifier).
- `golden/verify.py` — verifier.

### Exact shell command

```
infra/verifiers/run_tests.sh problems/02-ntt <your-cmd>
```

For example:

```
infra/verifiers/run_tests.sh problems/02-ntt npx tsx solution.ts
```

The harness pipes each test case through your program and through the
verifier, and prints a per-check summary. It exits 0 only if every case is
`"pass": true`.

## Canonical phrasing (informational)

These short excerpts ground definitions and conventions so you don't have
to reverse-engineer them. They are **informational, not restrictive**.

> 1. *NTT-as-DFT-in-finite-field:*
>    "A transform analogous to the discrete Fourier transform may be
>    defined in a finite field, and may be calculated efficiently by the
>    'fast Fourier transform' algorithm."
>    — `Pollard_FFT_FiniteField_MathComp_25_1971.pdf:p1`
> 2. *Convolution via NTT:*
>    "the calculation of the 'cyclic convolution' of the sequences (aᵢ)
>    and (bᵢ), as defined by (5), may be obtained by transforming the
>    sequences, multiplying the results term-by-term as in (4), and
>    performing the inverse transform (2)."
>    — `Pollard_FFT_FiniteField_MathComp_25_1971.pdf:p2`
> 3. *Bluestein chirp-filter / linear-filtering DFT:*
>    "It is shown in this paper that the discrete equivalent of a chirp
>    filter is needed to implement the computation of the discrete Fourier
>    transform (DFT) as a linear filtering process."
>    — `Bluestein_LinearFiltering_IEEE_AU_18_1970.pdf:p1`
> 4. *Montgomery REDC:*
>    "The rationale behind this selection is our ability to quickly
>    compute TR⁻¹ mod N from T if 0 ≤ T < RN, as shown in Algorithm REDC."
>    — `Montgomery_ModularMultiplication_MathComp_44_1985.pdf:p1`

## What you must do

1. Conform to the JSON I/O contract above. Read from stdin, write to
   stdout; that's how the verifier sees you.
2. Run the verifier before declaring done:
   ```
   infra/verifiers/run_tests.sh problems/02-ntt <your-cmd>
   ```
3. In your final answer, report the verifier's per-check totals
   (e.g. `modular_equality 64/64, roundtrip 64/64, …`).
4. Ship the implementation **you'd put your name on**, not the first thing
   that passes. Quality and correctness are the grade. Multi-session
   refinement is welcome; janky shortcuts are not.
