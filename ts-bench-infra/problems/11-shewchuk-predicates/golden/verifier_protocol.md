# Verifier protocol — Problem 11, Shewchuk's predicates

`verify.py` reads `{"input": ..., "candidate": ..., "id": ...}` on
stdin and emits a JSON verdict. The verifier is **canon-validated**:
the bigint-rational reference (`predicates_reference.py`) it consults
for ground truth has been cross-checked against Shewchuk's canonical
`predicates.c` to byte-perfect agreement on the entire test set.

## Invocation

```
cat <case>.json | python3 verify.py
```

with stdin shaped as

```jsonc
{
  "input":     {"predicate": "...", "queries": [...] | "format": "generated", "generator": {...}},
  "candidate": {"signs": [<int>, ...]},
  "id":        "<case-id>"
}
```

stdout:

```jsonc
{
  "pass":   true,
  "reason": "all invariants hold",
  "checks": {
    "shape":          {"pass": ..., "detail": "..."},
    "batch_complete": {"pass": ..., "detail": "..."},
    "sign_correct":   {"pass": ..., "detail": "..."}
  }
}
```

`verify.py` exits 0 even on `pass: false`; non-zero exit is a verifier
crash (e.g. malformed JSON). The harness treats `pass: false` as a
failed case.

## The three checks

### 1. `shape`

Candidate is a JSON object with key `signs` whose value is a list of
ternary integers in `{-1, 0, 1}`. The first up-to-eight entries are
type-checked; the remainder are checked element-wise during the
`sign_correct` pass.

### 2. `batch_complete`

`len(candidate.signs)` equals the number of queries in the case. For
explicit batches this is `len(input.queries)`; for `format:
"generated"` cases the verifier expands the descriptor through the
documented LCG (below) and counts.

### 3. `sign_correct`

For each query in the batch, the candidate's sign must equal the
ground-truth sign computed via the bigint-rational reference (which
has been cross-validated against canonical Shewchuk for the entire
test set). On any mismatch this check fails; the detail field reports

- the aggregate mismatch count, and
- the first 5 mismatched queries with `i, candidate sign, truth sign,
  query points`.

## Time budget — *not* a verifier check

The 1.5-second per-case wall-clock budget is enforced **at the
harness level** by wrapping the candidate command in `timeout 1.5s`:

```bash
infra/verifiers/run_tests.sh problems/11-shewchuk-predicates \
    timeout 1.5s npx --yes tsx 11-shewchuk-predicates/solution.ts
```

A budget breach manifests as the candidate exiting non-zero. The
harness reports `FAIL <case_id>: candidate command exited non-zero`
and `verify.py` is never invoked. The verifier therefore has no
"time budget" check; it cares only about correctness conditional on
the candidate having produced output.

## Tier H expansion — LCG specification

For cases where `input.format === "generated"`, both the agent and the
verifier expand the descriptor through the **identical LCG** below.
The LCG is a 64-bit linear congruential generator with constants from
MMIX (Knuth):

```python
A    = 6364136223846793005
C    = 1442695040888963407
MASK = (1 << 64) - 1

def lcg_next(state):
    return (state * A + C) & MASK
```

To produce a stream of doubles in `[lo, hi)`:

```python
def lcg_doubles(seed, n, lo, hi):
    state = seed & MASK
    span  = hi - lo
    out   = []
    for _ in range(n):
        state = lcg_next(state)
        u     = (state >> 11) / 9007199254740992.0    # top 53 bits / 2**53
        out.append(lo + span * u)
    return out
```

In TypeScript / JavaScript:

```ts
const MASK   = (1n << 64n) - 1n;
const A      = 6364136223846793005n;
const C_     = 1442695040888963407n;

function lcgNext(state: bigint): bigint {
  return (state * A + C_) & MASK;
}

function lcgDoubles(seed: bigint, n: number, lo: number, hi: number): number[] {
  let state = seed & MASK;
  const out: number[] = new Array(n);
  const span = hi - lo;
  for (let i = 0; i < n; i++) {
    state = lcgNext(state);
    const u = Number(state >> 11n) / 9007199254740992;     // 2^53
    out[i] = lo + span * u;
  }
  return out;
}
```

Both produce the same byte-exact stream of doubles for any seed.

To convert a flat `lcg_doubles(seed, n_total, lo, hi)` stream into
queries, group sequentially:

| Predicate | doubles per query |
|---|---:|
| orient2d | 6 (3 points × 2 coords) |
| orient3d | 12 (4 points × 3 coords) |
| incircle | 8 (4 points × 2 coords) |
| insphere | 15 (5 points × 3 coords) |

Total doubles to draw = `n × pts_per_query × dim`. Group into queries,
each query into points, each point into coords — all in row-major
order. The agent and verifier must produce identical query lists from
the same descriptor; any divergence will manifest as widespread
`sign_correct` failures.

The descriptor used in `inputs.json` looks like:

```jsonc
{
  "kind":  "uniform_random",
  "n":     500000,
  "seed":  "9876543210123456789",
  "lo":    -100.0,
  "hi":    100.0
}
```

## Sign convention reminder

```
orient2d(a,b,c)        > 0  ⇔  CCW
orient3d(a,b,c,d)      > 0  ⇔  d below plane(a,b,c)
                                ("below" = side where a,b,c appear CW)
                                Computed as sign of det((a-d),(b-d),(c-d))
incircle(a,b,c,d)      > 0  ⇔  d inside circle(a,b,c) (provided a,b,c CCW;
                                sign reversed if CW)
insphere(a,b,c,d,e)    > 0  ⇔  e inside sphere(a,b,c,d) (provided
                                orient3d(a,b,c,d) > 0; sign reversed otherwise)
```

These conventions match Shewchuk's `predicates.c` byte-for-byte. The
verifier consults `predicates_reference.py`, which has been
cross-validated against `predicates.c` on the entire 860k-query test
set — the orient3d row-order convention `(a-d, b-d, c-d)` was
specifically validated, since the alternative `(b-a, c-a, d-a)`
convention produces an opposite-sign answer.
