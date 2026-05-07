# 13e — Integrated MeijerG: branch + asymptotic + dispatcher

The final sub-problem. Composes 13a / 13b / 13c / 13d into the
top-level `tools/meijer-g`. Adds the asymptotic path for `|z| → ∞`
and `|z| → 0`, the principal-branch convention pin, the
Mellin–Barnes contour-quadrature fallback at the quarantine
boundary, and the dispatcher logic. Closes Tiers E, F, H, plus the
final integration of all prior tiers.

## Three new pieces

### Piece 1 — Mellin–Barnes contour quadrature (layer 5)

For test cases falling in the quarantine band (|z|≈1 ∧ p=q ∧ m+n=p),
neither Slater series converges, and no symbolic reduction applies.
The fallback is direct numerical evaluation of the Mellin–Barnes
contour integral

```
              1     ⌠   ∏Γ(b_j − s) · ∏Γ(1 − a_j + s)
G(...; z) = ─────  ⎮  ──────────────────────────────────  z^s ds
            2πi    ⌡L  ∏Γ(1 − b_j + s) · ∏Γ(a_j − s)
```

Algorithm:

1. Choose contour `L` per DLMF §16.17.2: vertical line `Re(s) = c`
   with `c ∈ (max{Re(a_j) − 1}, min{Re(b_j)})`, deformed to the
   nearest steepest-descent saddle.
2. Quadrature: adaptive Gauss-Kronrod G7K15 (the `integrate-1d`
   shape, **generalised to arb-prec**). Re-shape `integrate-1d`'s
   algorithm to take a `precision` parameter; `integrate-1d-arbprec`
   sibling tool may share `packages/quadrature` infrastructure with
   the float64 version.
3. Tail handling: gamma functions decay exponentially along the
   vertical axis; truncate when integrand magnitude falls below
   `2^{-(precision + 20)}` of the integrand peak.

### Piece 2 — Asymptotic / hyperasymptotic (layer 6)

For very large `|z|`, both Slater and direct contour quadrature
become numerically expensive. Switch to the Braaksma 1964 sectorial
asymptotic expansion:

```
G(...; z) ~ Σ_k  C_k · z^{σ_k} · (formal series in 1/z)
```

with the connection coefficients depending on `(m, n, p, q)` and the
sector containing `arg z`. Stokes-line behaviour requires the
hyperasymptotic refinement of Olde Daalhuis–Olver 1995 to recover
exponentially small terms across Stokes lines.

For very small `|z|`, the symmetric expansion at `s → +∞` (Series 2
in `1/z`) is asymptotic; same machinery flipped.

### Piece 3 — Top-level dispatcher (layer 7)

Same shape as `tools/solve` in the workbench (worklog 054). Tries
methods in cost-ascending order; tags refusal honestly:

```
1. symbolic dispatch (13d):              fastest if it matches.
   If matched → return symbolic.
   If no rule matches → continue.

2. Slater numerical (13c):               for generic non-coalescent.
   If z is in convergent region for Series 1 or 2 → evaluate; return.
   If z is in quarantine band → continue.

3. Mellin–Barnes contour quadrature (Piece 1, this sub-problem):
   for the quarantine band.
   If contour exists → evaluate; return.
   Else → continue.

4. Asymptotic (Piece 2, this sub-problem):  for |z| → 0 or |z| → ∞.
   If |z| > magnitude_threshold → evaluate; return.
   Else → continue.

5. Honest refusal:                        no method applies.
   Return tagged "meijer-g/out-of-region" with diagnosis.
```

Each method's "I can handle this" check is a fast pre-filter; the
dispatcher does not try methods speculatively.

## Branch-cut convention pin

The integral definition (DLMF 16.17.1) contains `z^s = exp(s · log z)`.
The principal branch is `log z = log|z| + i·arg z` with
`arg z ∈ (−π, π]`. **All evaluation paths must use this convention**;
candidates whose Series 1 / Series 2 / contour / asymptotic
implementations use different cuts will produce inconsistent
imaginary parts on the negative real axis.

`tools/meijer-g` documents the convention at the top of its module
docblock and includes a per-evaluation invariant check: at any `z`
with `|Im(z)| < 10^{-50}` (effectively on the cut), the result is
required to match the value at `z + i·10^{-100}` (immediately above
the cut) to within the precision target. Mismatch → warning emitted.

Tier F test cases probe this directly: every case has its mirror at
`z̄`, and the verifier checks `G(z̄) = conj(G(z))` (Schwarz reflection
modulo the cut convention).

## I/O contract — full tool

```json
input:  {"kind": "MeijerG-eval-request",
         "an": [...], "ap": [...],
         "bm": [...], "bq": [...],
         "z": {"kind": "complex" | "rational"},
         "request_mode": "auto" | "symbolic-required" | "numerical-required",
         "request_precision": 50}
output: one of:
   {"kind": "symbolic", "expr": <AST>, "rule_source": "...", "method": "symbolic-dispatch"}
   {"kind": "numerical", "value": {"kind": "complex", ...},
    "achieved_precision": ..., "method": "slater-1" | "slater-2" | "mellin-barnes" | "asymptotic",
    "warnings": [...]}
   tagged "meijer-g/out-of-region" {reason, ruled_out_methods}
   tagged "meijer-g/{branch-cut-on-axis,non-finite-input,degenerate-shape}"
                                                                  (boundary failures)
```

## Acceptance

The full problem-13 verifier passes:

| Tier | Cases | Pass condition |
|---|---|---|
| 0 | ~35 | Symbolic match (Tier 0 anchors via 13d). |
| A | 12 | Symbolic match. |
| B | 25 | Symbolic match. |
| C | 60 | Numerical, rel ≤ `1e-(precision − 5)`. |
| D | 30 | Numerical, rel ≤ `1e-(precision − 8)`. |
| E | 25 | Numerical at coalescence, rel ≤ `1e-(precision − 8)`. Johansson hmag perturbation in 13c plus higher-order residue handling. |
| F | 20 | Branch-cut sensitivity, rel ≤ `1e-(precision − 8)`. Schwarz reflection invariant. |
| G | 15 | Refusal tag match. |
| H | 200 | Speed gate: 50 dps in ≤ 1.5 s/case. Includes symbolic-dispatch-myopia traps. |

## Self-tests

- Method-agreement invariant: in regions where multiple methods
  apply, force each method (`--force-method=slater-1`,
  `--force-method=slater-2`, `--force-method=mellin-barnes`,
  `--force-method=asymptotic`) and verify they agree to precision.
  Catches any disagreement *before* the verifier sees it.
- Schwarz reflection: `G(z̄) = conj(G(z))` for non-cut `z`.
- DLMF identity tests: differential equation
  (DLMF §16.21.1) is satisfied to numerical precision (compute
  `G(z)` via `tools/meijer-g`, compute the ODE via `cas-diff`
  symbolically + arb-prec eval, verify the residual is ≤
  `1e-(precision − 5)` of the leading term).

## Workbench landing

- `tools/meijer-g/tool.ts` — the top-level tool with the
  dispatcher.
- `packages/meijer-core/src/{contour, asymptotic, dispatcher}.ts`
  — the new layers.
- `packages/quadrature` — the arb-prec generalisation of
  `integrate-1d`'s G7K15 quadrature. Possibly factored out of
  `tools/integrate-1d` cleanly, possibly shared via composition.
  ADR for the refactor.
- `bench/meijer-g/` — the full battery (the contents of
  `ts-bench-infra/problems/13-meijer-g/golden/`) lifted to the
  workbench's bench-discipline format (per ADR-0019).

## Reference

- B. L. J. Braaksma 1964 — asymptotic theory.
- R. B. Paris & D. Kaminski 2001 — modern Mellin–Barnes treatise.
- A. B. Olde Daalhuis & F. W. J. Olver 1995 — hyperasymptotic.
- DLMF §16.17.2 — contour-existence conditions.
- DLMF §16.17.1 — branch convention (implicit in `z^s = exp(s log z)`).

## Bead

`bd show ts-bench-meijer-g-13e` (or assigned ID).
