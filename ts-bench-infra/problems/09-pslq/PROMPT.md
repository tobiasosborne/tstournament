# Problem 9 — PSLQ Integer Relation Detection

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

Given `x = (x_1, …, x_n)` of high-precision real numbers, a working
precision in decimal digits, and a magnitude bound `M`, find a non-zero
integer vector `r` with `‖r‖_∞ ≤ M` such that

```
|r_1 · x_1 + … + r_n · x_n|  <  ε.
```

If no such relation exists at the given precision and bound, return
`null`.

The construction algorithm is **PSLQ** (Ferguson-Bailey-Arno) operating
in **multi-precision floats**. You will need a high-precision arithmetic
library (or implement one); 60+ decimal digits is the minimum for the
test set, and an elegant implementation will be precision-agnostic.

## I/O contract (JSON)

### Input (one JSON object on stdin)

```jsonc
{
  "x":              ["<decimal float>", ...],
  "precision_dps":  <int>,    // working precision in decimal digits
  "max_coeff":      <int>     // ‖r‖_∞ bound
}
```

`x` strings are written to at least `precision_dps + 20` digits; parse
them at `precision_dps` digits.

### Output (one JSON object on stdout)

```jsonc
{ "relation": [<int>, ...] }    // length n
{ "relation": null }            // no relation found
```

## Suggested TypeScript signature

```ts
interface PSLQInput {
  x:             string[];
  precision_dps: number;
  max_coeff:     number;
}

interface PSLQOutput { relation: number[] | null; }

function pslq(input: PSLQInput): PSLQOutput;
```

You will likely want a `bigfloat` library for the working precision.
JavaScript's `Number` is 64-bit double — insufficient for the precisions
in this benchmark.

## Verifying your solution

`golden/verify.py` runs an internal PSLQ at the same precision as the
candidate, and compares existence (`null` ↔ `null`) plus three local
properties of the candidate relation (bounded magnitude, non-trivial,
small inner product). The candidate is **not required to match** the
reference's exact relation — different primitive relations and sign
flips are accepted. See `golden/verifier_protocol.md`.

### Files

- `golden/inputs.json` — every test case.
- `golden/expected.json` — reference outputs.
- `golden/verify.py` — verifier.

### Exact shell command

```
infra/verifiers/run_tests.sh problems/09-pslq <your-cmd>
```

## Canonical phrasing (informational)

These short excerpts ground definitions. They are **informational, not
restrictive**.

> 1. *Partial-sum + LQ name:*
>    "The name "PSLQ" derives from its usage of a partial sum of squares
>    vector and a LQ (lower-diagonal-orthogonal) matrix factorization."
>    — `Bailey_Broadhurst_ParallelPSLQ_MathComp_70_2001.pdf:p2`
> 2. *Swap criterion (which row to exchange each iteration):*
>    "Select m such that γⁱ |Hᵢᵢ| is maximal when i = m."
>    — `Bailey_Broadhurst_ParallelPSLQ_MathComp_70_2001.pdf:p2`
> 3. *Reduction step inside the iteration:*
>    "Step 3 : Reduction. Perform Hermite reduction on H, producing
>    D ∈ GL(n, O(K)). Replace x by xD⁻¹, H by DH, A by DA, B by BD⁻¹."
>    — `Ferguson_Bailey_Arno_PSLQ_MathComp_68_1999.pdf:p5`
> 4. *Lower bound on any surviving relation (basis of termination):*
>    "any integer relation r of the vector x must satisfy
>    |r| ≥ 1 / max₁≤ⱼ≤ₙ₋₁ |Hⱼ,ⱼ|"
>    — `Bailey_Broadhurst_ParallelPSLQ_MathComp_70_2001.pdf:p3`
> 5. *Iteration bound (proof of polynomial-time termination):*
>    "we prove in the real and complex case that PSLQ(τ) constructs a
>    relation in less than n² logτ(γ^{n−1} Mx) iterations."
>    — `Ferguson_Bailey_Arno_PSLQ_MathComp_68_1999.pdf:p2`

## What you must do

1. Conform to the JSON I/O contract above.
2. Run the verifier before declaring done:
   ```
   infra/verifiers/run_tests.sh problems/09-pslq <your-cmd>
   ```
3. In your final answer, report the verifier's per-check totals
   (e.g. `existence_agrees 14/14, inner_product 14/14, …`).
4. Ship the implementation **you'd put your name on**.
