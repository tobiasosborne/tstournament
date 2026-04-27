# Problem 4 — Schreier-Sims with Sims' filter (BSGS + group order)

## What to implement

Given a permutation group `G ≤ Sym(n)` by a list of generators on
`{0, 1, …, n−1}`, compute:

1. A **base** `B = (b_1, …, b_k)`: a sequence of points such that the
   pointwise stabiliser of `B` in `G` is trivial. Empty base is acceptable
   only when `G = {e}`.
2. The **strong generating set (SGS)** with respect to `B`: a generating
   set whose intersection with each stabiliser `G_{b_1, …, b_{i−1}}`
   generates that stabiliser.
3. The order `|G|` and the sizes `|U_i|` of the basic transversals (the
   orbits `b_i^{G_{b_1, …, b_{i−1}}}`). By the orbit-stabiliser theorem,

   ```
   |G|  =  ∏ |U_i|.
   ```

4. **Membership decisions** for a list of query permutations: for each
   query `g`, decide whether `g ∈ G`. This is the sift / strip operation
   on the SGS.

The construction algorithm is **Schreier-Sims** with **Sims' filter** (the
incremental version that, given a list of generators, builds a BSGS by
sifting Schreier generators against a partial chain and adding non-trivial
residues to the strong generating set at the appropriate level). See
Sims 1970 / Holt-Eick-O'Brien Ch. 4 / Seress Ch. 4–5.

## I/O contract (JSON)

### Input

```jsonc
{
  "degree":              <int, ≥ 1>,
  "generators":          [[<image array of length degree>], …],
  "membership_queries":  [[<image array>], …]   // possibly empty
}
```

A permutation on `n` points is encoded as its **0-indexed image array** of
length `n`: `perm = [perm(0), perm(1), …, perm(n−1)]`. The identity is
`[0, 1, …, n−1]`. Generators may be redundant or include the identity; the
agent must not assume otherwise.

### Output

```jsonc
{
  "base":                [<int>, …],
  "strong_generators":   [[<image array>], …],
  "transversal_sizes":   [<int>, …],     // |U_1|, |U_2|, …, length = len(base)
  "order":               "<decimal string>",
  "membership_results":  [<bool>, …]      // same length as input membership_queries
}
```

`order` is a decimal **string** because for groups like `M_24` it exceeds
`2³²`. `strong_generators` are informational (the verifier checks they are
valid permutations but not the strata-by-strata generation property — the
order and transversal-size checks pin the BSGS structurally).

## Invariants the verifier checks

1. **Shape.** All five keys present with the right types; `image arrays`
   are valid permutations of `degree` (values in `[0, degree)`, all
   distinct, length exactly `degree`).
2. **Base validity.** Base elements are distinct integers in
   `[0, degree)`; empty base is accepted only if `|G| = 1`.
3. **Order ↔ transversals.** `len(transversal_sizes) == len(base)` and
   `prod(transversal_sizes) == int(order)`.
4. **Order correctness.** `int(order)` equals the order of the group
   computed independently inside the verifier.
5. **Membership correctness.** For every query, the agent's bool agrees
   with the verifier's membership decision.

## Edge cases the test set covers

- Trivial group `G = {e}` (single generator = identity).
- Cyclic groups `Z_n` for `n ∈ {5, 10, 30}`.
- Dihedral groups `D_2n` for `2n ∈ {8, 12, 20}`.
- Symmetric groups `S_n` for `n ∈ {3, 4, 5, 6, 8}`.
- Alternating groups `A_n` for `n ∈ {4, 5, 6, 7}`.
- The Mathieu groups `M_11` (degree 11, order 7920) and `M_12` (degree
  12, order 95040), built from their classical generators.
- Membership queries: for each group, a mix of permutations known to be
  in `G` (random products of generators) and permutations known to be out
  (random `Sym(degree)` elements rejected by the reference).

## What the agent does *not* implement

- No randomised Schreier-Sims (Holt's "random Schreier" or Babai's nearly
  linear-time algorithm). The test set is small enough that the
  deterministic Sims-filter version is the expected algorithm.
- No element representation other than image arrays (no cycle notation
  output, no compressed forms).
- No subgroup constructions beyond what the BSGS supports natively
  (no homomorphism / quotient / coset enumeration machinery).
