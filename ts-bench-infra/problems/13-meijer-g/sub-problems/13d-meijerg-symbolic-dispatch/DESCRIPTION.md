# 13d — MeijerG symbolic dispatch (Adamchik–Marichev + Roach)

The closed-form-reduction layer. Pattern-matches the input
`(m, n, p, q, an, ap, bm, bq)` against ~1300 known reduction rules
and returns a closed-form expression in the special-function
vocabulary. Reuses `cas-simplify`'s pattern-matching engine. Passes
Tiers A (12 cases) and B (25 cases) of the problem-13 verifier. Not
currently a numerical-precision question — the answer is symbolic.

## Algorithm — Adamchik–Marichev (1990) + Roach (1996/97)

Three-step pipeline, exactly as in the published Adamchik–Marichev
ISSAC paper:

### Step 1 — Pattern recognition

Input: `(m, n, p, q, an, ap, bm, bq, z)`.

Walk a curated decision tree of ~1300 reduction rules organised by
`(m, n, p, q)` first, then by parameter structure (integer
relationships, halves, zero-or-one slots). Each leaf produces a
candidate closed-form expression in the workbench AST.

The decision tree is curated from:

- **Bateman §5.6** pp. 215–222 — elementary, Bessel, Whittaker,
  Legendre. Roughly 50 explicit reductions.
- **Prudnikov–Brychkov–Marichev Vol 3 §8.4** — the canonical
  identity-table compendium. Roughly 600 reductions across the
  function families.
- **Mathai 1993** ch. 3 — modern handbook. Cross-check.
- **DLMF §16.18** "Special cases" — the contemporary index.
- **Wolfram Functions Site** — 1363 formulas across 14 categories at
  `functions.wolfram.com/HypergeometricFunctions/MeijerG/`. Largest
  formula warehouse in existence. Permitted reading: the formulas are
  derivations, not source code.

### Step 2 — Canonicalisation

The candidate closed-form output is run through `cas-simplify` to
canonicalise: collect like terms, normalise the symbol order, reduce
rational-function sub-terms via polynomial GCD per ADR-0013, etc.
This produces a canonical form in workbench's existing convention.

### Step 3 — Equivalence-class check (verifier-side)

Tier A and B verification compares candidate output to a reference
expression by **multi-point sampling** at K = 20 random points in the
expression's natural domain at 200 dps. The candidate is free to emit
any equivalent closed form — `(1−z²)^{−1/2}` and `1/√(1−z²)` and
`(1−z)^{−1/2}·(1+z)^{−1/2}` all pass. See `VERIFIER-PROTOCOL.md`.

## Pattern-matching reuse

`cas-simplify` already implements pattern-matching infrastructure for
its rewrite rules (ADR-0013, polynomial-GCD reductions, foreign-pass-
through invariant). Layer 4 reuses this engine; the ~1300 reduction
rules are *new data*, the engine is existing.

The pattern-matcher's contract:

```
match(pattern: Pattern, expr: Expr) → Bindings | null
applyRule(rule: ReductionRule, expr: MeijerGExpr) → Expr | null
```

A `ReductionRule` has the shape:

```
{
  match: {
    m: 1, n: 0, p: 0, q: 1,
    an: [],
    ap: [],
    bm: [{kind: "free", name: "a"}],   // any value
    bq: []
  },
  rewrite: ({a}, z) =>
    expr("Times",
      expr("Power", z, expr("Times", expr("Constant", "1/2"),
                            sym("a"))),
      expr("Power", sym("E"),
                    expr("Negate", z))),
  source: "Bateman §5.6 (1)"
}
```

The rule database lives in
`scientist-workbench/packages/meijer-core/src/dispatch-rules/`,
organised as one file per source category
(`bateman-5-6.ts`, `pbm-vol3-8-4.ts`, `mathai-3.ts`,
`wolfram-functions.ts`). Each rule cites its source.

## Audit hard line

Every rule must cite a primary-literature source. **Forbidden**:
copying the rule verbatim from any open-source reference
implementation's pattern table (SymPy's `meijerint.py`,
`hyperexpand.py`; FriCAS / Maxima / REDUCE source). The audit grep
checks for short-form variable names and constant-table patterns
identifying the canonical references' source.

## I/O contract — symbolic path

```json
input:  {"an": ["..."], "ap": ["..."], "bm": ["..."], "bq": ["..."],
         "z": {"kind": ...},
         "request_mode": "symbolic-required"}
output: {"kind": "symbolic",
         "expr": <AST>,
         "rule": "bateman-5-6-1",
         "method": "pattern-dispatch"}
      | tagged "meijerg-symbolic/no-known-reduction"
              (parameters do not match any rule in the table; punt to
               the numerical Slater path in the integrated dispatcher)
```

## Acceptance

- Passes Tier 0 (~35 closed-form anchors, all matched to specific
  rule citations).
- Passes Tier A (12 elementary cases) — every case matched to a rule
  in `bateman-5-6.ts`.
- Passes Tier B (25 special-function cases) — every case matched to a
  rule in one of the rule files.
- Multi-point sampling tolerance per `VERIFIER-PROTOCOL.md` (1e-100
  relative).
- Self-test: invariance under permutation within `an`, `ap`, `bm`, `bq`
  individually (the symbolic dispatch must canonicalise parameter
  order).

## Workbench landing

- `packages/meijer-core/src/dispatch-rules/` — the rule files.
- `packages/meijer-core/src/dispatch.ts` — the dispatcher + pattern
  matcher (composes `cas-simplify`'s engine).
- One component of `tools/meijer-g`'s composite algorithm (the full
  tool ships in 13e). Independently exercisable via a thin
  `tools/meijer-g-symbolic-only` for benching the symbolic path alone.

## Reference

- V. Adamchik & O. I. Marichev 1990 ISSAC — algorithm.
- K. Roach 1997 ISSAC — symbolic representation algorithm.
- V. S. Adamchik 1997 "Definite Integration in Mathematica V3.0" —
  exposition.
- Bateman §5.6 / PBM Vol 3 §8.4 / DLMF §16.18 / Mathai 1993 ch. 3
  / Wolfram Functions Site — rule sources.

## Bead

`bd show ts-bench-meijer-g-13d` (or assigned ID).
