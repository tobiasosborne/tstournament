# Reference implementation — Problem 7, blossom

> **STRIPPED.** This file (and the rest of `reference/`) is removed by
> `infra/strip-for-testing.sh`.

`blossom_reference.py` is **not** Edmonds' blossom algorithm. It is the
exact bitmask DP over vertex subsets:

```
f[mask]  =  max( f[mask \ {i}],
                  max_{j ∈ adj(i) ∩ mask}  f[mask \ {i, j}] + w(i, j) )
```

at `O(2^n · n)` time. This is purely a definitional reference — it
returns the unique optimal matching weight by enumeration, with no
algorithmic shortcuts. The test set is therefore capped at `n ≤ 16` so
the DP runs in milliseconds inside the verifier.

The agent's task is still to implement Edmonds' blossom algorithm: the
DP is too slow at any larger `n`, and at the test sizes a working
Edmonds implementation will return the same weight (ties may give a
different matching set, which the verifier accepts).

## Cross-check

The DP is sanity-checked against scipy's bipartite assignment
(`scipy.optimize.linear_sum_assignment`) on the bipartite-only test
cases, in `golden/generate.py`.

## Generating the golden master

```
python3 problems/07-blossom/golden/generate.py
```
