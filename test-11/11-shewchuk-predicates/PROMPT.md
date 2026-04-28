# Problem 11 — Shewchuk's adaptive-precision geometric predicates

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

**This problem is the hardest in the bench by design.** A naive
`Math.sign(determinant)` evaluator passes ~25% of the test set. A
`bigint`-rational evaluator passes correctness everywhere but **times
out on the speed-gate tier** (Tier H below). Only an IEEE-754
adaptive-precision implementation in the spirit of Shewchuk's `predicates.c`
(staged expansion arithmetic with static + dynamic error-bound
escalation) passes all eight tiers within the **1.5s per-case budget**.

**How** you solve it is up to you, subject to those two constraints.
The canonical reference is Shewchuk 1996 (DCG 18, 305-363) — porting
faithfully is welcome.

## Problem statement

Implement the four robust geometric predicates of Shewchuk 1996:

| Predicate | Inputs | Returns the sign of |
|---|---|---|
| `orient2d(a, b, c)` | three 2D points | `det((a-c), (b-c))` |
| `orient3d(a, b, c, d)` | four 3D points | `det((a-d), (b-d), (c-d))` |
| `incircle(a, b, c, d)` | four 2D points | the 3×3 lift determinant (see below) |
| `insphere(a, b, c, d, e)` | five 3D points | the 4×4 lift determinant (see below) |

For each predicate, the agent's return value must be **sign-equivalent
to the determinant computed in exact rational arithmetic on the
inputs' exact rational values**. Specifically: for any IEEE-754 double
inputs `x_1, …, x_n`, the predicate must return the sign of
`D(x_1, …, x_n)` where `D` is computed by lifting each `x_i` to its
exact `Fraction(x_i)` value and evaluating the determinant in
unbounded-precision arithmetic.

This sign convention is **invariant under any IEEE-754-double-correct
implementation** (Shewchuk's theorem) and is what the verifier
computes via the bigint-rational reference and the canonical
`predicates.c`.

### Sign conventions (Shewchuk 1996)

```
orient2d(a, b, c)        > 0  iff  a, b, c counter-clockwise
                         < 0  iff  clockwise
                         = 0  iff  collinear

orient3d(a, b, c, d)     > 0  iff  d below plane(a, b, c)
                                   ("below" = the side from which
                                    a, b, c appear clockwise)
                         < 0  iff  above
                         = 0  iff  coplanar

incircle(a, b, c, d)     > 0  iff  d inside circle through a, b, c
                                   (provided a, b, c CCW;
                                    sign reversed if CW)
                         < 0  iff  outside
                         = 0  iff  co-circular

insphere(a, b, c, d, e)  > 0  iff  e inside sphere through a, b, c, d
                                   (provided orient3d(a,b,c,d) > 0;
                                    sign reversed otherwise)
                         < 0  iff  outside
                         = 0  iff  co-spherical
```

### The lift determinants

```
incircle(a, b, c, d) = sign of  | adx  ady  adx²+ady² |
                                | bdx  bdy  bdx²+bdy² |
                                | cdx  cdy  cdx²+cdy² |
                       where adx = ax - dx, etc.

insphere(a, b, c, d, e) = sign of | aex  aey  aez  aex²+aey²+aez² |
                                  | bex  bey  bez  bex²+bey²+bez² |
                                  | cex  cey  cez  cex²+cey²+cez² |
                                  | dex  dey  dez  dex²+dey²+dez² |
                          where aex = ax - ex, etc.
```

These are *expanded* (i.e. with `e` or `d` subtracted from the other
points), which is the form that has the cancellation properties
Shewchuk's expansion arithmetic exploits.

## I/O contract (JSON)

Each test case is one JSON object on stdin specifying a *batch* of
queries (the harness amortises `npx tsx` startup over many queries):

```jsonc
{
  "predicate": "orient2d" | "orient3d" | "incircle" | "insphere",
  "queries":   [[<pt>, <pt>, ...], ...]    // explicit batch (Tiers A-G)
}
```

— OR, for the speed-gate tier:

```jsonc
{
  "predicate": "...",
  "format":    "generated",
  "generator": {
    "kind": "uniform_random",
    "n":    <int>,                // queries to generate
    "seed": "<bigint as decimal string>",
    "lo":   <float>,
    "hi":   <float>
  }
}
```

In the `"generated"` form, both your solution and the verifier expand
the descriptor through the **same documented LCG** to produce identical
query sequences (see §Tier H below). This avoids embedding hundreds of
megabytes of random doubles in `inputs.json`.

A point is a JSON array of doubles serialised by Python's `repr(x)` /
JavaScript's `x.toString()` — both round-trip through `parseFloat()`
to the same IEEE-754 double, bit-exact.

Output:

```jsonc
{
  "signs": [<-1 | 0 | 1>, ...]    // one per query, same order
}
```

## Suggested TypeScript signature

```ts
type Vec = number[];                      // 2 or 3 doubles depending on predicate
type Query = Vec[];                       // 3, 4, or 5 points

interface InputExplicit  { predicate: string; queries: Query[]; }
interface InputGenerated { predicate: string; format: "generated"; generator: GenDescriptor; }
type Input = InputExplicit | InputGenerated;
interface Output { signs: number[]; }

function predicates(input: Input): Output;
```

The shape of your internal API is up to you. Suggested decomposition:
implement the four predicates, dispatch on `input.predicate`, expand
the generator descriptor inline if `format === "generated"`.

## Performance contract — **the bigint-rational kill**

Each test case has a **1.5-second wall-clock budget**, enforced by
wrapping the candidate command in `timeout 1.5s`. Recommended invocation:

```bash
verifiers/run_tests.sh 11-shewchuk-predicates timeout 1.5s npx --yes tsx 11-shewchuk-predicates/solution.ts
```

Sizing of the speed-gate tier (Tier H):

| Predicate | n queries | Naive (wrong) | bigint-rational | Shewchuk-port |
|---|---:|---:|---:|---:|
| orient2d | 500 000 | ~50 ms | **~3 s — TIMES OUT** | ~150 ms |
| orient3d | 200 000 | ~30 ms | **~2 s — TIMES OUT** | ~150 ms |
| incircle | 100 000 | ~30 ms | **~3 s — TIMES OUT** | ~250 ms |
| insphere |  50 000 | ~25 ms | **~5 s — TIMES OUT** | ~400 ms |

A `bigint`-numerator/denominator implementation is correct but
**will fail Tier H on every predicate** under the budget. The
implementation must use IEEE-754 doubles in the algorithmic core, with
adaptive-precision expansion arithmetic (Dekker / Knuth two-sum +
two-product, `grow_expansion` / `scale_expansion`, static + dynamic
error bounds gating escalation) for cancellation-prone evaluations.
This is binding.

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
    "sign_correct":   {"pass": true, "detail": "..."}
  }
}
```

The verifier computes ground truth on every query via a bigint-rational
reference that has been cross-validated against Shewchuk's canonical
`predicates.c` to byte-perfect agreement on the entire test set. On
mismatch, the `sign_correct` detail field reports the first 5
disagreeing query indices with the candidate's sign, the truth, and
the query points.

### Files

- `golden/inputs.json` — every test case (~2.4 MB, 27 cases, 860k+ queries).
- `golden/expected.json` — reference outputs (provided; not consulted by the verifier — truth is recomputed live).
- `golden/verify.py` — verifier.
- `golden/verifier_protocol.md` — verifier protocol, including the LCG specification for Tier H.

### Exact shell command

```
infra/verifiers/run_tests.sh problems/11-shewchuk-predicates timeout 1.5s <your-cmd>
```

For example:

```
infra/verifiers/run_tests.sh problems/11-shewchuk-predicates \
    timeout 1.5s npx --yes tsx 11-shewchuk-predicates/solution.ts
```

The `timeout 1.5s` wrapper is essential — without it, a slow but
correct implementation will appear to pass while in fact violating the
performance contract. With it, a timeout manifests as the candidate
exiting non-zero, which the harness reports as a failed case before
the verifier ever runs.

## Test-set tiers (informational)

| Tier | Cases × Queries | What it catches |
|---|---|---|
| A. random_easy | 4 × 100 = 400 | Sanity: I/O handling, well-separated points |
| B. integer_exact_zero | 4 × 200 = 800 | Naive should pass these (integer arithmetic is exact) |
| C. snap_to_grid | 4 × 1000 = 4000 | **Naive fails ~30-46%**: rational degeneracies rounded to doubles |
| D. ulp_perturbation | 4 × ~1000-2000 ≈ 5700 | **Naive fails ~13-30%**: ULP-perturbed degenerate configs |
| E. catastrophic_cancellation | 4 × 500 = 2000 | Operands clustered far from origin |
| F. planted_on_manifold | 3 × 1000 = 3000 (orient3d/incircle/insphere) | **Naive fails ~20-46%**: planted co-circular / co-spherical / coplanar |
| H. speed_gate | 4 × varies, ~850k total | Throughput — bigint-rational TIMES OUT |

See `DESCRIPTION.md` for the per-tier construction rationale.

## Canonical phrasing (informational)

These short excerpts ground the spec. They are **informational, not
restrictive**.

> 1. *The robustness contract:*
>    "The geometric predicates considered in this paper return signs
>    indicating the configuration of input points. … In all four cases,
>    the predicate returns the *correct sign* of the underlying
>    determinant, even in the face of finite-precision arithmetic
>    errors."
>    — Shewchuk_predicates_DCG_18_1996.pdf:p1
> 2. *Adaptive precision strategy:*
>    "Adaptive-precision algorithms compute their results in stages,
>    using only as much precision as is needed to obtain the correct
>    sign. The first stage is a fast approximation; later stages, used
>    only when needed, refine the answer until the sign is certain."
>    — Shewchuk_predicates_DCG_18_1996.pdf:p2
> 3. *Two-sum / two-product primitives:*
>    "If a and b are floating-point numbers, the operations FAST-TWO-SUM
>    and TWO-SUM compute their floating-point sum (rounded to nearest)
>    and the rounding error, exactly representable as a single
>    floating-point number. TWO-PRODUCT does the same for multiplication."
>    — Shewchuk_predicates_DCG_18_1996.pdf:pp9-11

## What you must do

1. Conform to the JSON I/O contract above. Read from stdin, write to stdout.
2. Run the verifier before declaring done:
   ```
   infra/verifiers/run_tests.sh problems/11-shewchuk-predicates \
       timeout 1.5s <your-cmd>
   ```
3. In your final answer, report the verifier's per-check totals
   (e.g. `shape 27/27 · batch_complete 27/27 · sign_correct 27/27`).
4. Ship the implementation **you'd put your name on**. Quality and
   correctness are the grade. Multi-session refinement is welcome;
   janky shortcuts are not. **Bigint-rational implementations will
   fail the speed gate and are therefore not a viable shortcut.**
