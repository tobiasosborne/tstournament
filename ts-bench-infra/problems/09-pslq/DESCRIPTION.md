# Problem 9 — PSLQ Integer Relation Detection

## What to implement

Given a vector of high-precision real numbers `x = (x_1, …, x_n)` and a
working precision (in decimal digits), find a non-zero integer vector
`r = (r_1, …, r_n)` such that

```
| r_1 · x_1 + r_2 · x_2 + … + r_n · x_n |   <   ε
```

where `ε` is appropriate for the working precision, and `‖r‖_∞ ≤ M` for
the supplied bound `M`. If no such relation exists within precision and
the bound, return the absence sentinel.

The construction algorithm is **PSLQ** (Ferguson-Bailey-Arno 1992/1999),
operating in **multi-precision floats**. Bailey-Borwein 2007, Chapter 6,
gives a self-contained presentation.

## I/O contract (JSON)

### Input

```jsonc
{
  "x":              ["<decimal float>", …],   // length n ≥ 2
  "precision_dps":  <int>,                    // decimal digits of working precision
  "max_coeff":      <int>                     // ‖r‖_∞ bound on the relation
}
```

`x` entries are decimal floats (e.g. `"3.14159265358979323846…"`)
written to **at least** `precision_dps + 20` digits — the verifier and
agent agree to parse them at `precision_dps` digits internally and use
those extra digits as headroom.

### Output

```jsonc
{
  "relation": [<int>, …]    // length n, or
  "relation": null          // no relation within bound and precision
}
```

Returning `null` is a positive answer too: it is a claim that no
integer relation with `‖r‖_∞ ≤ max_coeff` exists at the given
precision. The verifier checks this against an independent PSLQ run.

## Invariants the verifier checks

1. **Shape.** Either `null`, or a list of `n` JSON integers (no
   booleans, no strings).
2. **Bounded magnitude.** `‖relation‖_∞ ≤ max_coeff`. Skipped if
   `relation == null`.
3. **Non-trivial.** The relation is not the zero vector. Skipped if
   `relation == null`.
4. **Inner product near zero.** `|r · x| < ε(precision_dps,
   ‖r‖_∞, n)`, where the threshold is `10^(−precision_dps/2) · n ·
   max_coeff` (i.e., loose enough to accept any genuine PSLQ output but
   tight enough to reject random integers).
5. **Existence agrees with reference.** Either both candidate and
   reference find a relation, or both decline. (Two distinct relations
   may both satisfy the inner-product bound — see "what is not
   checked".)

## Edge cases the test set covers

- `[1, ln 2, ln 3, ln 6]` — relation `[0, 1, 1, −1]` (since `ln 6 =
  ln 2 + ln 3`).
- `[1, √2, 2]` — relation `[2, 0, −1]` (minimal polynomial of `√2`).
- `[1, ∛2, ∛4, 2]` — relation `[−2, 0, 0, 1]` (minimal polynomial of `∛2`).
- `[1, φ, φ²]` — relation `[−1, −1, 1]` (Fibonacci recurrence).
- `[π, atan(1/5), atan(1/239)]` — relation `[1, −16, 4]` (Machin's
  formula for π).
- `[1, π, e]` — no relation expected at the given precision and bound.
- `[1, √2, √3]` — no relation expected.
- Random unrelated reals — no relation expected.

## What the agent does *not* implement

- No multi-pair PSLQ (parallel variants — Bailey-Broadhurst 2001).
- No Hermite / HJLS / general lattice-reduction substitutes (LLL is
  problem 5; PSLQ is its own algorithm).
- No symbolic recognition of constants (no AGI-style "this looks like
  ln 2"). The agent receives numbers; the answer is an integer vector.
