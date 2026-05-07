# Problem 13 — Implementation plan

The seven-layer stack. Reuse `scientist-workbench` substrate wherever it
already exists; only build what is genuinely new. Each layer below is
labelled **NEW** (no overlap with workbench), **EXTEND** (extend an existing
workbench substrate), or **GENERALISE** (re-shape an existing tool to a
larger contract).

| # | Layer | Verdict | Approx. LOC | Lands as |
|---|---|---|---|---|
| 0 | Arbitrary-precision bigfloat (BigInt mantissa + i32 binary exp) | **NEW** | 2–3 k | `packages/bigfloat` |
| 1 | Symbolic AST vocabulary (Bessel/Whittaker/PFQ/Erf/…) | **EXTEND** `cas-core` | 1–1.5 k | `packages/cas-core/src/special-functions.ts` |
| 2 | `pFq(a₁..aₚ; b₁..b_q; z)` evaluator at arb-prec | **NEW** | 1.5 k | `tools/hypergeometric-pfq` |
| 3 | Slater residue evaluator (Series 1 / Series 2) + Johansson perturbation | **NEW** | 1 k | `packages/meijer-core` (Slater layer) |
| 4 | Symbolic dispatch (Adamchik–Marichev + Roach) | **EXTEND** `cas-simplify` pattern-matcher | 3 k (incl. ~1300-rule table) | `packages/meijer-core` (dispatch layer) + `tools/cas-simplify` rule extension |
| 5 | Mellin–Barnes contour quadrature at arb-prec | **GENERALISE** `integrate-1d` (currently float64) | 0.8 k | `packages/quadrature` arb-prec mode + `packages/meijer-core` (contour layer) |
| 6 | Asymptotic & hyperasymptotic (Braaksma 1964; Olde Daalhuis–Olver 1995) | **NEW** | 0.8 k | `packages/meijer-core` (asymptotic layer) |
| 7 | Top-level dispatcher (symbolic → Slater → contour → asymptotic → refuse) | **NEW** | 0.5 k | `tools/meijer-g` |

Total ≈ 10–12 k LOC. ~5× test-12.

## Workbench reuse map (vital — do not duplicate)

The user's directive: *"it is vital that we reuse scientist-workbench where
possible (undesirable to duplicate functionality)"*.

| Existing workbench substrate | How problem 13 uses it |
|---|---|
| `@workbench/protocol` value protocol (10 primitive kinds) | Inputs/outputs to `tools/meijer-g`, `tools/hypergeometric-pfq` are protocol Values; bigfloat representation is a `record` with `{mantissa: integer, exponent: integer, precision: integer}` fields, not a new primitive (PRD §0.1: `null` reserved/unused, no raw JSON numbers). |
| `cas-core` AST | Layer 1 *extends* this. Adds heads `BesselJ / BesselY / BesselI / BesselK / HypergeometricPFQ / WhittakerM / WhittakerW / ParabolicCylinderD / Erf / Erfc / ExpIntegralEi / Polylog / Gamma / Digamma / Polygamma / MeijerG` plus the existing closed numerical vocabulary. Does *not* roll a new AST. |
| `cas-simplify` pattern-matching engine | Layer 4 reuses the rewriter to apply Adamchik–Marichev / Roach reduction rules. The ~1300 rules are new data; the engine is existing. |
| `cas-verify` (cross-multiplication equality over ℚ(x)) | Verifier-side: when the candidate emits a symbolic answer that lies in ℚ(x), compose `cas-verify` for byte-equal symbolic check. |
| `cas-diff` closed numerical vocabulary | Layer 1's vocabulary extension cascades into `cas-diff` — adds derivative rules for the new heads (Bessel: `d/dz J_ν(z) = (J_{ν−1}(z) − J_{ν+1}(z))/2`; Γ: `d/dz Γ(z) = ψ(z)·Γ(z)`; etc.). |
| `integrate-1d` (adaptive G7K15 Gauss-Kronrod, float64) | Layer 5 *generalises* the algorithm shape (G7K15 nodes, recursive subdivision, error estimator) to arb-prec. Either parameterise `integrate-1d` on precision *or* split into `integrate-1d-float64` + `integrate-1d-arbprec` sharing `packages/quadrature`. ADR required. |
| ADR-0014 first numerical tier; ADR-0015 determinism tier (`numerical: true` is bit-identical given platform fingerprint at float64) | New ADR extends to `numerical: true; precision: <N>` — bit-identical given `(precision, platform)`. The agent-honest output convention (warnings, claimed precision, error estimate) holds. |
| ADR-0016 warning-based scaling | Used by all arb-prec tools — large `(p, q)` or `|z| → boundary` cases run with scale-advisory warnings. |
| ADR-0010 tool module shape (`if (import.meta.main) void runTool(def);`) | Mandatory; all new tools follow. |
| `linalg-core` (LAPACK-style numerics, Float64Array) | Not directly used by MeijerG, but the `numerical: true` ADR pattern is the precedent. |
| `expr-parse` (text → AST) | Not used by MeijerG itself; useful for verifier-side input parsing. |
| `solve` dispatcher shape | Layer 7's top-level dispatcher follows the same pattern (try cheapest method first; tag refusal honestly). |

## What is genuinely new

- **`packages/bigfloat`** — arbitrary-precision binary-radix floating point.
  No workbench substrate. The single largest new piece. Becomes a
  load-bearing package for *any* future arb-prec tool (numerical-tier-2 in
  the workbench's lineage).
- **`tools/hypergeometric-pfq`** — first arb-prec numerical tool. The
  Pearson–Olver–Porter 2017 taxonomy: direct power series, asymptotic Borel
  resummation, `0F1 / 1F1 / 2F1` closed forms, Bühring 1987 / Becken–Schmelcher
  2000 connection at `z ≈ 1`. Reused by every Slater-summation downstream.
- **`packages/meijer-core`** — the MeijerG-specific algorithmic layers
  (Slater 3, contour 5, asymptotic 6). Composable; the layers can be
  exercised independently for test purposes.
- **`tools/meijer-g`** — top-level dispatcher.

## What stays in tstournament

The benchmark verifier (`golden/inputs.json`, `golden/expected.json`,
`golden/verify.py`, the tiered test set) lives only in `ts-bench-infra/`.
The workbench gets the algorithmic substrate; the tournament gets the
correctness witness.

## Sub-problem dependency DAG

```
                 ┌──────────────────┐
                 │ 13a packages/    │
                 │     bigfloat     │
                 └────────┬─────────┘
                          │
                          ▼
                ┌────────────────────────┐
                │ 13b cas-core AST ext   │
                │     + hypergeometric-  │
                │     pfq tool           │
                └────────┬───────────────┘
                          │
              ┌───────────┴────────────┐
              ▼                        ▼
   ┌──────────────────────┐  ┌──────────────────────┐
   │ 13c MeijerG numerical│  │ 13d MeijerG symbolic │
   │     Slater path      │  │     dispatch (A-M +  │
   │     (Tiers C/D/G)    │  │     Roach)           │
   └──────────┬───────────┘  │     (Tiers A/B)      │
              │              └─────────┬────────────┘
              └─────────┬─────────────┘
                        ▼
            ┌────────────────────────────┐
            │ 13e MeijerG integrated:    │
            │   coalescence + branch +   │
            │   asymptotic + dispatcher  │
            │   (Tiers E/F/H + final)    │
            └────────────────────────────┘
```

13a is the foundation; 13b lifts AST + first arb-prec tool on top of
13a; 13c and 13d are independent algorithmic siblings (one numerical,
one symbolic) that can ship in parallel; 13e integrates everything,
adds the residual hard-region handling, and ships the final
`tools/meijer-g`.

## Workbench landing (post-trial graduation)

After problem 13 closes green:

1. **`packages/bigfloat`** lands as a first-class workbench package
   (sibling of `cas-core`, `linalg-core`). New ADR: arb-prec tier
   convention, precision contract, value-protocol encoding.
2. **`cas-core` AST extension** lands as additions to `cas-core`'s
   exposition source files. New ADR: special-function vocabulary
   contract (closed-vocabulary like the existing `cas-diff` numerical
   vocabulary, but extended; cascades into `cas-diff` derivative
   rules). All existing tools' `cas-diff` / `integrate-1d` /
   `optimize-lbfgs-projected` calls continue to work — the extension is
   additive.
3. **`tools/hypergeometric-pfq`** lands as a `numerical: true` tool with
   explicit `precision` parameter. Bench: `bench/hypergeometric-pfq` —
   parallel to the existing `bench/linalg-{qr,svd,eigh}` / `bench/
   integrate-ode-*` lineage.
4. **`tools/meijer-g`** lands with two output modes (symbolic /
   arb-prec numerical) + tagged refusal. Bench: `bench/meijer-g` —
   the test set from `golden/`.
5. **`packages/meijer-core`** lands as workbench substrate; reused by
   any future special-function tool that needs the Slater / contour /
   asymptotic machinery.

The benchmark-then-tool graduation is the inverse of the original
test-1 → workbench `tools/ntt` flow (worklog 001 in the workbench
repo): there the tournament problem's solution was ported into the
workbench *after* the fact; here the substrate is grown for the
tournament *and* the workbench in lockstep.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Bigfloat substrate is the long-pole. Wrong representation cascades into every layer. | Stage 13a alone; design ADR before any code; cross-validate against mpmath at hundreds of dps for every primitive (add/mul/Γ/log/sin) before lifting. |
| The ~1300-formula reduction table is curation-heavy. | Use Bateman §5.6, PBM Vol 3 §8.4, Wolfram Functions site (1363 formulas across 14 categories — verified by reference-impl trawl) as the canonical sources. Each rule cited by paper page. |
| Stokes-line region (`|z| ≈ 1, p = q, m + n = p`) is where Wolfram and mpmath can disagree (Slater boundary divergence). | Quarantine that band from the golden master; supply third witness (direct Mellin–Barnes contour quadrature) for cases that fall there; document the convention pin in `ORACLE-STRATEGY.md`. |
| Multi-session continuation across orchestrator runs is novel. | Maintain a `WORKLOG-13.md` in this directory tracking which sub-problem is in progress, what the on-disk artefact is, and what's open. Standard tstournament continuation pattern (per test-12 lesson: continuation-from-file beats kill-and-respawn). |
| Pure-TS arb-prec might tempt agents to depend on a heavyweight npm package (e.g. `mathjs`, which carries its own special-function library). | The brief explicitly forbids any package whose API is itself a special-function library. Plumbing-only substrate (binary-radix bigfloat) is permitted; the algorithm must be the candidate's. |

## Beads

Each layer + sub-problem is registered as a bead in
`scientist-workbench`. See `bd list -l "ts-bench-meijer-g"` (or `bd
ready` against the `ts-bench-13-*` epic) for the live list. The plan
file is the source of truth for *what* to do; the beads are the
source of truth for *who-is-doing-what-when* and the dependency state.
