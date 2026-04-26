# Verifier protocol — Problem 9, PSLQ

`verify.py` runs an internal high-precision PSLQ as the existence
oracle, and validates the candidate's relation by re-computing the
inner product `r · x` at `dps + 20` digits.

## Invocation

```
cat <case>.json | python3 verify.py
```

stdin shape:

```jsonc
{
  "input":     {"x": ["...", ...], "precision_dps": ..., "max_coeff": ...},
  "candidate": {"relation": [<int>, ...] | null},
  "id":        "<case id>"
}
```

stdout:

```jsonc
{
  "pass":   true,
  "reason": "all invariants hold",
  "checks": {
    "shape":             {"pass": ..., "detail": "..."},
    "existence_agrees":  {"pass": ..., "detail": "..."},
    "bounded_magnitude": {"pass": ..., "detail": "..."},
    "non_trivial":       {"pass": ..., "detail": "..."},
    "inner_product":     {"pass": ..., "detail": "..."}
  }
}
```

## The five checks

### 1. `shape`

Either `relation: null` or a list of `n` JSON integers. Booleans are
rejected; strings are rejected.

### 2. `existence_agrees`

Either both the candidate and the verifier's reference find a relation,
or both decline (`null`). This rules out a "the agent found a relation
that doesn't actually exist" failure mode (and the reverse).

### 3. `bounded_magnitude`

If non-null: `‖relation‖_∞ ≤ max_coeff`.

### 4. `non_trivial`

If non-null: at least one entry of `relation` is non-zero.

### 5. `inner_product`

If non-null: `|r · x|` evaluated at `dps + 20` decimal digits is below

```
10^(−dps/2)  ·  n  ·  max_coeff.
```

This bound is loose enough that any genuine PSLQ result passes — PSLQ
outputs typically have inner product near machine epsilon — but tight
enough that an arbitrary integer vector with `‖r‖_∞ ≤ max_coeff` will
not pass for transcendentally-independent inputs.

## What is *not* checked

- The candidate's relation is **not required to match the reference's
  relation** sign-for-sign. Two distinct integer relations both having
  small `r · x` and bounded magnitude both pass — for instance
  `[2, 0, −1]` and `[−2, 0, 1]` are both valid for `[1, √2, 2]`.
- Multiple distinct primitive relations might exist when `n` is large
  relative to the rank of the relation lattice; PSLQ finds *one* of
  them. The verifier accepts any that pass checks 2–5.
