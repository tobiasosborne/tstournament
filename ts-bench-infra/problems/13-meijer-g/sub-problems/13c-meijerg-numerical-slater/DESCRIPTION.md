# 13c — MeijerG numerical Slater path

The first numerical implementation of MeijerG. Composes 13a's
bigfloat substrate and 13b's pFq evaluator to produce the
Slater-residue-summation path. Passes Tiers C, D, and G of the
problem-13 verifier.

## Algorithm — Slater 1966 ch. 5

Slater's residue theorem: closing the Mellin–Barnes contour around
the `b_j`-poles (Series 1) or the `a_j`-poles (Series 2) converts
the contour integral into a finite sum of `pFq` series.

### Series 1 (residues at `Γ(b_j − s)` poles)

```
G^{m,n}_{p,q}(a_p; b_q | z) = Σ_{k=1}^m  Γ_k · z^{b_k} ·
                                          pFq[ ... ; ... ; (−1)^{p−m−n} z ]
```

where each term has its `b_k` "promoted" to the prefactor and the
remaining parameters reorganised. Convergent for `|z| < 1` when
`p == q`; for all `z ≠ 0` when `p < q`. Carries a `(−1)^{p−m−n}` sign
from the contour orientation.

### Series 2 (residues at `Γ(1 − a_j + s)` poles)

```
G^{m,n}_{p,q}(a_p; b_q | z) = Σ_{j=1}^n  Δ_j · z^{a_j − 1} ·
                                         pFq[ ... ; ... ; (−1)^{q−m−n} / z ]
```

Convergent for `|z| > 1` when `p == q`; for all `z ≠ 0` when `p > q`.

### Series-selection rule (per mpmath, Johansson 2009)

```
if p < q:               series = 1
elif p > q:             series = 2
elif p == q == m + n:   series = (2 if |z| > 1 else 1)
else:                   series = 1   (with caveats — see Tier G refusal cases)
```

When `p == q == m + n` and `|z| ≈ 1` (the quarantine band), neither
series converges; ship to layer 5 (Mellin–Barnes contour quadrature)
or refuse per ORACLE-STRATEGY.md.

## Parameter-coalescence handling

Critical part — what makes implementations *correct* vs *naive*. When
two `b_j` differ by an integer (or two `a_j` do), Slater's simple-pole
formula develops `Γ(0)`, `1/0`, or `(−1)^∞`-style indeterminates.

Two correct approaches:

### Option (i) — Closed-form higher-order residues (textbook)

Replace the simple-pole `Γ(b_j − s)` residue at `s = b_j + k` with
the higher-order residue formula involving `digamma` (`ψ`) and
potentially `polygamma` (`ψ^{(n)}`). This is what every textbook
account of Slater's theorem does. Requires careful bookkeeping;
combinatorial complexity grows with the multiplicity.

### Option (ii) — Johansson's `hmag` perturbation (mpmath)

Detect coalescence (any pair of relevant parameters within `≤ 2^{−hmag}`
of integer difference). Perturb every parameter by an independent
random multiple of `2^{−hmag}` and retry. The perturbation breaks the
coalescence; the result is the limit as `hmag → ∞`. Cancellation
between the perturbed terms is monitored; if the working precision
loses too many digits, retry at higher precision.

Mathematically, this *is* the L'Hôpital limit — the same answer the
closed-form higher-order residue would give. Numerically much simpler
to code. Both options accepted; Johansson's is recommended for
robustness.

## Cancellation detection

The `m` Slater terms can be exponentially large with their sum
exponentially small. The implementation tracks the magnitude of the
running sum vs the largest term. When `|sum| / max_k |term_k| < 2^{-target_precision}`,
catastrophic cancellation has occurred; re-run with `working_precision = 2 ·
target_precision + spare`.

This is documented in mpmath's `hypercomb` (forbidden as porting
source) but the algorithmic principle is universal — present in
Higham's *Accuracy and Stability of Numerical Algorithms* (Ch 1) and
Johansson 2017 Arb paper §4 with rigorous interval-arithmetic
implementation.

## I/O contract — Slater path only (subset of full MeijerG)

```json
input:  {"an": ["..."],
         "ap": ["..."],
         "bm": ["..."],
         "bq": ["..."],
         "z": {"kind": "complex", ...},
         "precision": 50,
         "force_series": null  // or 1 / 2 to override auto
        }
output: {"value": {"kind": "complex", ...},
         "achieved_precision": 50,
         "method": "slater-series-1" | "slater-series-2",
         "series_terms": <n>,
         "perturbation_applied": <bool>,
         "cancellation_digits_lost": <int>,
         "warnings": []}
      | tagged "meijerg-slater/quarantine-band"   (|z| in [0.99, 1.01]
                                                   ∧ p == q ∧ m + n == p)
      | tagged "meijerg-slater/no-convergent-series" (rare;
                                                       both series fail)
```

## Acceptance

- Passes Tier C (60 cases, generic non-coalescent, `|z| ∈ [0.1, 10]`)
  to relative tolerance `1e-(precision − 5)`.
- Passes Tier D (30 cases, `|z| ∈ {0.95, 1.05}`, anti-Stokes rays)
  to relative tolerance `1e-(precision − 8)`. Note: the quarantine
  band (|z|≈1 ∧ p=q ∧ m+n=p) is split off into Tier-D-quarantine,
  handled by 13e contour layer.
- Passes Tier G refusal cases (15 cases) — emits
  `tagged "meijerg-slater/quarantine-band"` correctly.
- Self-test: invariance under series-selection override
  (`force_series=1` and `force_series=2` agree to precision when both
  converge in the case's region).
- Self-test: invariance under permutation of parameters within `an`,
  `ap`, `bm`, `bq` (except for the m / n / p / q split itself, which
  is structural).

## Workbench landing

- Algorithm lives in `scientist-workbench/packages/meijer-core/src/slater.ts`.
- Public face is one component of `tools/meijer-g`'s composite
  algorithm (the full tool ships in 13e). Independently exercisable
  via a thin `tools/meijer-g-slater-only` for benching the Slater
  path alone.
- Bench: extends `bench/meijer-g/` with Tier C / D / G subset.

## Reference

- L. J. Slater 1966 ch. 5 — algorithm.
- F. Johansson 2009 mpmath blog post — series-selection + perturbation.
- N. J. Higham 2002 *Accuracy and Stability* ch. 1 — cancellation
  detection.

## Bead

`bd show ts-bench-meijer-g-13c` (or assigned ID).
