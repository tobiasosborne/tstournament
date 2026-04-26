# Reference implementation — Problem 6, Stoer-Wagner

> **STRIPPED.** This file (and the rest of `reference/`) is removed by
> `infra/strip-for-testing.sh`.

`sw_reference.py` is a straight Python port of Stoer-Wagner 1997: `n − 1`
maximum-adjacency phases, each producing a "cut-of-phase" between the
last vertex added (`t`) and the rest, followed by merging `t` into the
penultimate vertex (`s`). The minimum cut is the smallest phase cut.

The port follows the original Stoer-Wagner J. ACM 1997 pseudocode
verbatim; it has no algorithmic novelty.

## Cross-check inside the verifier

The verifier (`golden/verify.py`) does **not** import this reference; it
contains its own copy of Stoer-Wagner (so verify.py is self-contained
after the strip). The candidate's cut value is checked against
verify.py's internal computation. The candidate's partition is verified
independently by re-summing the edges that cross it.

## Generating the golden master

```
python3 problems/06-stoer-wagner/golden/generate.py
```
