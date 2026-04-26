# Problem 1 — Iterative Radix-2 FFT (in-place, bit-reversal)

## ⚠ How you will be graded

You will be graded on **QUALITY** and **CORRECTNESS**.

Produce the **most elegant, most efficient, most perfect, most impressive**
TypeScript implementation you can. This is a portfolio piece. The verifier
is a *floor*, not a ceiling — passing it is necessary but not sufficient.

**Dev time is infinite.** Take as long as you need. Use multiple sessions if
that helps. Refactor. Re-architect. Profile. Polish. **Prefer multi-session
quality over quick-fix janky band-aid shortcuts.** Do not ship the first
thing that passes the verifier — ship the version you'd put your name on.

**How** you solve it is up to you: search the web, use libraries, port from
another language, copy patterns from prior art — whatever you'd do normally.
The JSON I/O contract is the only hard interface constraint.

## Problem statement

Implement an iterative radix-2 Cooley-Tukey Fast Fourier Transform, in-place,
with explicit bit-reversal pre-permutation. Both directions are required.

Let `x = (x_0, …, x_{N−1}) ∈ ℂ^N` with `N = 2^m`, `m ≥ 0`. Compute:

- **Forward:** `X_k = Σ_{j=0}^{N−1} x_j · exp(−2πi · j · k / N)`, `k = 0, …, N−1`.
- **Inverse:** `x_j = (1/N) · Σ_{k=0}^{N−1} X_k · exp(+2πi · j · k / N)`, `j = 0, …, N−1`.

The forward transform has **no `1/N` factor**; the `1/N` lives entirely on
the inverse (the "engineering" convention). `N = 1` is the identity.

The implementation must be:

1. **Iterative** — no recursive calls.
2. **Radix-2** — input lengths must be powers of two; reject otherwise.
3. **In-place** — the transform writes into the input buffer.
4. **Bit-reversal pre-permutation**, then `log₂ N` butterfly passes with
   twiddles `exp(±2πi · k / 2^s)`.

## I/O contract (JSON)

Your program reads one JSON object on stdin and writes one JSON array on
stdout.

### Input

```jsonc
{
  "n":         <integer, power of two, ≥ 1>,
  "direction": "forward" | "inverse",
  "x":         [[re, im], [re, im], …]   // length n, JSON numbers
}
```

### Output

```jsonc
[[re, im], [re, im], …]   // length n, JSON numbers
```

Real and imaginary parts are JSON numbers (machine-precision floats). No
strings, no NaN, no Infinity.

## Suggested TypeScript signature

```ts
type Complex = [number, number];   // [re, im]

interface FFTInput {
  n:         number;
  direction: "forward" | "inverse";
  x:         Complex[];
}

function fft(input: FFTInput): Complex[];
```

The shape of your internal API is up to you, but the JSON in/out contract
above is mandatory.

## Verifying your solution

The verifier `golden/verify.py` reads a JSON object on stdin:

```jsonc
{ "input": <FFTInput>, "candidate": <Complex[]>, "id": "<test id>" }
```

and writes:

```jsonc
{
  "pass":   true,
  "reason": "all invariants hold",
  "checks": {
    "shape":     {"pass": true, "detail": "..."},
    "equality":  {"pass": true, "detail": "..."},
    "parseval":  {"pass": true, "detail": "..."},
    "naive_dft": {"pass": true, "detail": "..."}
  }
}
```

The four checks pin: output shape; componentwise agreement with NumPy's FFT
to mixed tolerance `1e-9 + 1e-10 · |ref|`; the Parseval energy identity;
agreement with the literal `O(n²)` DFT sum for `n ≤ 64`. See
`golden/verifier_protocol.md` for full details.

### Files

- `golden/inputs.json` — every test case (`{"cases": [{"id", "input"}, …]}`).
- `golden/expected.json` — reference outputs (provided for sanity, not
  required by the verifier).
- `golden/verify.py` — verifier; consumes `(input, candidate)` JSON, emits
  the verdict described above.

### Exact shell command

After your solution reads JSON from stdin and writes the candidate output
to stdout, run:

```
infra/verifiers/run_tests.sh problems/01-fft <your-cmd...>
```

For example, with a TypeScript file `solution.ts`:

```
infra/verifiers/run_tests.sh problems/01-fft npx tsx solution.ts
```

The harness pipes each test case through your solution, then through
`verify.py`, and prints a per-check summary. It exits 0 only if every
case is `"pass": true`.

## Canonical phrasing (informational)

These short excerpts ground the convention so you don't have to guess which
of the several FFT formulations this problem is asking for. They are
**informational, not restrictive** — you don't have to derive your solution
from them.

> 1. *Iterative + in-place + O(N log N):*
>    "The algorithm described here iterates on the array of given complex
>    Fourier amplitudes and yields the result in less than 2N log₂ N
>    operations without requiring more data storage than is required for
>    the given array A." — `Cooley_Tukey_MathComp_19_297_1965.pdf:p1`
> 2. *Radix-2 / power-of-two:*
>    "Whenever possible, the use of N = rᵐ with r = 2 or 4 offers important
>    advantages for computers with binary arithmetic, both in addressing
>    and in multiplication economy."
>    — `Cooley_Tukey_MathComp_19_297_1965.pdf:p3`
> 3. *Bit-reversal output order:*
>    "in such an order that the index of an X must have its binary bits put
>    in reverse order to yield its index in the array Aₘ"
>    — `Cooley_Tukey_MathComp_19_297_1965.pdf:p4`

(Excerpts are verbatim ≤-one-sentence quotes. Note: Cooley & Tukey 1965 use
the convention W = exp(2πi/N) with the `1/N` factor on the *negative-exponent*
direction; this is the **opposite** sign convention to the engineering
convention specified above for this problem. The convention to implement is
the one in *Problem statement* / *I/O contract*, not the one in the source
paper.)

## What you must do

1. Conform to the JSON I/O contract above. Reading from stdin and writing
   to stdout is mandatory; that's how the verifier sees you.
2. Run the verifier before declaring done:
   ```
   infra/verifiers/run_tests.sh problems/01-fft <your-cmd>
   ```
3. In your final answer, report the verifier's per-check totals
   (e.g. `equality 39/39, parseval 39/39, naive_dft 39/39, shape 39/39`).
4. Ship the implementation **you'd put your name on**, not the first thing
   that passes. Quality and correctness are the grade. Multi-session
   refinement is welcome; janky shortcuts are not.
