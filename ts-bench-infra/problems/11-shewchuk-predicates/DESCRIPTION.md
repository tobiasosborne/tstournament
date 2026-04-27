# Problem 11 — Shewchuk's adaptive-precision geometric predicates

## What to implement

Four robust geometric predicates over IEEE-754 double inputs, returning
ternary signs `∈ {-1, 0, +1}`:

- `orient2d(a, b, c)` for 2D points.
- `orient3d(a, b, c, d)` for 3D points.
- `incircle(a, b, c, d)` for 2D points (the in-circle test).
- `insphere(a, b, c, d, e)` for 3D points (the in-sphere test).

For any IEEE-754 double inputs, the returned sign must match the sign
of the determinant computed in **exact rational arithmetic** on the
inputs' exact rational values (i.e. lifting each double to its exact
`Fraction(x)` and evaluating the determinant in unbounded precision).
This is the contract that makes the predicates *robust* — Shewchuk's
1996 paper proves his adaptive-precision technique satisfies it for any
double inputs.

The canonical reference is **Shewchuk's `predicates.c`** (1996, public
domain). Faithful porting is welcome; equivalent designs that satisfy
the contract are also welcome.

## I/O contract (JSON)

Each test case is a *batch* of queries against one predicate. The
batched format amortises `npx tsx` startup over thousands or millions
of queries. Two input shapes:

### Explicit batch (Tiers A through G)

```jsonc
{
  "predicate": "orient2d" | "orient3d" | "incircle" | "insphere",
  "queries":   [[<pt>, <pt>, ...], ...]
}
```

### Generated batch (Tier H — speed gate)

```jsonc
{
  "predicate": "...",
  "format":    "generated",
  "generator": {
    "kind": "uniform_random",
    "n":    <int>,
    "seed": "<bigint as decimal string>",
    "lo":   <float>,
    "hi":   <float>
  }
}
```

The generator is expanded by both the agent and the verifier through
the same documented LCG (see §"LCG specification" below) into `n`
queries. This avoids embedding hundreds of MB of random doubles in
`inputs.json`.

Output:

```jsonc
{ "signs": [<-1 | 0 | 1>, ...] }    // one per query, in order
```

## Invariants the verifier checks

1. **Shape.** `signs` is a JSON list of integers in `{-1, 0, 1}`.
2. **Batch complete.** `len(signs)` equals the number of queries in the
   case (after generator expansion if applicable).
3. **Sign correct.** Every sign matches the canonical Shewchuk-validated
   ground truth. Mismatch is fatal: detail reports the first 5
   disagreeing query indices and the aggregate failure count so
   debugging is targeted.

The wall-clock budget (1.5 s per case, enforced by wrapping the
candidate in `timeout 1.5s`) is a **harness-level** check, not a
verifier check: a timeout exits the candidate non-zero, the harness
reports it as a failed case, and `verify.py` is never invoked.

## Why this problem is hard

Geometric predicates are deceptively simple. The naive reading is
"compute a 2×2, 3×3, or 4×4 determinant in floats and return its
sign." The trap: that algorithm is *wrong*. For inputs near degeneracy
(co-circular, co-spherical, coplanar configurations slightly perturbed
by floating-point rounding), the naive determinant sign is dominated
by accumulated roundoff, not the underlying mathematical sign.
Downstream consumers — Delaunay triangulators, mesh booleans, convex
hull codes — corrupt their internal data structures or loop forever
when fed wrong-signed predicate results.

Shewchuk 1996 solves this with **adaptive-precision expansion
arithmetic**:

1. **Stage 1 (approx).** Compute the determinant in a single double.
   Bound the worst-case roundoff by an *a priori* error term derived
   from the input magnitudes (Shewchuk's `errboundA`). If the
   approximate value exceeds the bound, its sign is provably correct
   and we return.
2. **Stage 2.** If stage 1 was inconclusive, recompute corrections
   (the "tail terms" lost to rounding) using `TWO-PRODUCT` and
   `TWO-SUM` exact-error primitives. Add corrections to the stage-1
   estimate. Tighter error bound (`errboundB`); test sign certainty
   again.
3. **Stage 3.** Higher-order corrections — multi-component
   "expansions" representing exact intermediate values via sorted
   non-overlapping double summands.
4. **Stage 4.** Full exact computation if all earlier stages were
   inconclusive (vanishingly rare in practice).

The adaptive structure means the average case is fast (most queries
return at stage 1 or 2) while the worst case is exact. A
`bigint`-rational implementation gets stage-4 cost on every query and
therefore times out on the speed-gate tier.

The four primitives that make the expansion arithmetic work:

```
FAST-TWO-SUM(a, b)  →  (s, e)  s.t.  a + b = s + e exactly,  |a| ≥ |b|
TWO-SUM(a, b)       →  (s, e)  s.t.  a + b = s + e exactly,  no precondition
SPLIT(a)            →  (a_hi, a_lo) s.t. a = a_hi + a_lo, both fit in 26 bits
TWO-PRODUCT(a, b)   →  (p, e)  s.t.  a * b = p + e exactly
```

Each is a few floating-point operations. Composed via
`grow_expansion`, `scale_expansion`, `expansion_sum_zeroelim`, they
build arbitrary-precision sums of non-overlapping doubles that
faithfully represent the exact intermediate determinant value. The
sign of an expansion is the sign of its largest-magnitude component
when the expansion is non-zero (which the implementation verifies
via the magnitude bound).

## Edge cases the test set covers

The full adversarial test set is in `golden/inputs.json`. Eight tiers:

### Tier A — `_random_easy` (~100 queries / predicate)

Well-separated random points in `[-100, 100]^d`. Sanity floor:
confirms I/O handling and that the agent's predicate doesn't return a
fixed sign.

### Tier B — `_integer_exact_zero` (~200 queries / predicate)

Configurations with small integer coordinates on exact lines / planes
/ circles / spheres. All double arithmetic is bit-exact up to `2^53`,
the determinant is mathematically zero, and a naive evaluator returns
zero correctly. Sanity check that the predicate returns 0 when 0 is
correct.

### Tier C — `_snap_to_grid` (~1000 queries / predicate)

The first discrimination tier. Construction:

1. Build an exactly-degenerate configuration in rationals — three
   collinear points, four coplanar / co-circular points, five
   co-spherical points — using `Fraction` arithmetic.
2. Round each coordinate to its nearest IEEE-754 double.
3. The rounded coordinates are *not* exactly degenerate; their exact
   rational interpretation gives a small but non-zero determinant
   whose sign is determined by the rounding direction of each
   coordinate.

Naive `Math.sign(det)` returns roundoff garbage (often the wrong sign)
on these inputs because the determinant magnitude is small relative to
the cumulative roundoff in the naive formula. Empirical naive failure
rate: 30-46% per predicate (measured against the canonical Shewchuk
oracle).

### Tier D — `_ulp_perturbation` (~1000-2000 queries / predicate)

The second discrimination tier. Construction:

1. Take a double-exact degenerate configuration (Tier B style: small
   integer coords).
2. Perturb one coordinate by `k` ULPs along the IEEE-754 lattice for
   `k ∈ {-3, -1, 0, +1, +3}`.

The exact-rational sign transitions through zero at `k = 0` and is
definite for `k ≠ 0`. Naive evaluators fail when the perturbation is
small relative to cancellation in the naive determinant formula.
Empirical naive failure rate: 13-30% per predicate.

### Tier E — `_catastrophic_cancellation` (~500 queries / predicate)

Coordinates clustered near `(C, C, …)` for large `C` (`2^40`–`2^52`,
`1e10`–`1e15`). The naive expanded determinant accumulates intermediate
products of magnitude `~C^2` and subtracts to recover the desired
value at magnitude `~1`; all bits below `ulp(C^2)` are lost.

Note: this tier passes for evaluators that use the *robust*
pre-subtracted form (`(b-a) * (c-a) - …` rather than expanded
`b*c - b*a - …`). Its purpose is to confirm the agent uses the robust
form, not to discriminate Shewchuk vs naive.

### Tier F — `_planted_on_manifold` (~1000 queries / predicate)

For `orient3d`, `incircle`, `insphere`. Build exactly co-circular /
co-spherical / coplanar k-tuples in rationals via:

- Pythagorean parameterisation `(R(1−t²)/(1+t²), R·2t/(1+t²))` for the
  unit circle, scaled by rational `R` for any rational radius.
- Stereographic-projection parameterisation
  `((2u, 2v, −1+u²+v²) / (1+u²+v²))` for the unit sphere, scaled by
  rational `R`.
- Plane parameterised by rational normal and offset; pick `(x, y)`
  rationally and solve for `z`.

Round each coordinate to nearest double. Empirical naive failure rate:
20-46% per predicate.

### Tier G

Skipped. Redundant with the union of B–F.

### Tier H — `_speed_gate` (~50k–500k queries / predicate)

Pure throughput test. Inputs are random non-degenerate queries
generated from a `{kind, n, seed}` descriptor by the documented LCG
(see verifier_protocol.md). All four predicates have one Tier H case
each.

A correct **naive** implementation passes Tier H on correctness (no
near-degeneracy means no roundoff sign confusion) and well within the
1.5s budget — it would pass H by itself, but it has already failed C/D/F
on correctness.

A correct **bigint-rational** implementation passes correctness on
every tier including H. But Tier H sizes are calibrated such that
bigint per-query cost (~5 µs for orient2d, ~50 µs for insphere) times
the query count (500k for orient2d, 50k for insphere) exceeds the
1.5s budget. Bigint times out.

A correct **Shewchuk-port** implementation passes correctness AND time
budget on every tier.

## Generator determinism

`golden/generate.py` uses `random.seed(20260427)` (the date of
generation as a stable integer). Re-running the generator with the
canonical `predicates.c` build yields byte-identical
`inputs.json` and `expected.json`. Both files are committed to the
repository.

## What the agent does *not* implement

- No predicates beyond the four named (no `orient4d`, no
  `incircumcircle` of more than four points, etc.).
- No exact arithmetic over rational coordinates (Shewchuk's
  predicates work on doubles; rational inputs are out of scope).
- No mesh / triangulation / convex-hull driver code that consumes the
  predicates — that's the downstream user's job.
- No multi-precision libraries beyond what is necessary for the
  expansion arithmetic. Native `bigint` is permitted but discouraged
  (it will fail the speed gate; only useful for an out-of-budget
  fallback or for testing).
