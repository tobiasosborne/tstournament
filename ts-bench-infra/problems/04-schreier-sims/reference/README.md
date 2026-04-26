# Reference implementation — Problem 4, Schreier-Sims

> **STRIPPED.** This file (and the rest of `reference/`) is removed by
> `infra/strip-for-testing.sh`.

`ss_reference.py` wraps `sympy.combinatorics.PermutationGroup`. SymPy's
`PermutationGroup` runs Schreier-Sims internally on first access to
`.base`, `.strong_gens`, `.basic_orbits`, `.order()`, or `.contains()`.

## Notes on what the reference returns

- `base`: the base sympy populates by its own Schreier-Sims pass. The
  agent is **not required to match this base** — different bases give
  different transversal sizes but the same order. The verifier checks
  `prod(transversal_sizes) == order` and `order == reference_order` and
  does not compare bases.
- `strong_gens`: pulled from sympy's strong-generating-set field.
- `transversal_sizes`: the orbit sizes `|U_i|`.
- `membership_results`: `G.contains(p)` for each query.

## Cross-check

The known orders for the test groups are pinned in `golden/generate.py`
and asserted against sympy on every regeneration:

| group | order        |
|-------|--------------|
| `Z_n` | `n`          |
| `D_{2n}` | `2n`      |
| `S_n` | `n!`         |
| `A_n` | `n!/2`       |
| `M_11`| `7920`       |
| `M_12`| `95040`      |

## Generating the golden master

```
python3 problems/04-schreier-sims/golden/generate.py
```
