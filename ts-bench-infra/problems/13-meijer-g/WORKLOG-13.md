# WORKLOG-13.md — Meijer G mega-test campaign

Living document. Updated by the orchestrator at the end of each session.
Future-you (or the next agent) reads this *first* on session start.

---

## ► WHERE WE ARE (last updated 2026-05-08)

**Phase:** substrate complete; first numerical surface tool shipping.
**Bead state:** 2 of 12 children closed (`hv0.1`, `hv0.3`).
**Next pickup:** `hv0.5` — `packages/meijer-core` Slater residue evaluator.
**Commits since campaign start:** 9 in scientist-workbench, 1 in
tstournament (the campaign-plan files).

The campaign is structured as a 5-stage sub-problem campaign (13a..13e)
and is currently at the end of stage 13b. The bigfloat substrate
(arbitrary-precision real + complex with full transcendental and
special-function vocabulary) is shipped; the first arbprec-tier tool
(`tools/hypergeometric-pfq`) ships and works. Both have been
cross-validated against Wolfram byte-for-byte at 50 decimal digits.

**The substrate is the long-pole; it's done. From here the work is
algorithmic composition.**

---

## ► YOUR NEXT TASK

Pick up **`hv0.5` — MeijerG Slater residue-summation evaluator** in
`scientist-workbench`. Spec at
[`sub-problems/13c-meijerg-numerical-slater/DESCRIPTION.md`](sub-problems/13c-meijerg-numerical-slater/DESCRIPTION.md).

This is the piece that takes the substrate from `hv0.1` + the pFq
evaluator from `hv0.3` and assembles them into a numerical MeijerG.
After it lands, you can compute Meijer G numerically across the bulk
of the parameter space (`p ≤ q + 1` with `|z|` away from the unit
circle) — Tier C of the verifier comes within reach.

Algorithm to implement (Slater 1966 ch. 5 + Johansson 2009 mpmath blog):

1. Decide Series 1 vs Series 2 by `(p, q, m, n, |z|)`:
   - p < q              ⟹ Series 1 (residues at `Γ(b_j − s)` poles).
   - p > q              ⟹ Series 2 (residues at `Γ(1 − a_j + s)` poles).
   - p == q == m + n    ⟹ Series 2 if |z| > 1, else Series 1.
   - else               ⟹ Series 1, with caveats (refusal at boundary).
2. Build the term list. Each term is
   `Γ-product · z^{b_k} · pFq(...)`, parameters reorganised per Slater.
3. Cancellation handling: if any pair of relevant `b_j` (or `a_j`)
   parameters differs by an integer, simple-pole formula fails. Two
   correct paths: (i) closed-form higher-order residues with `digamma` /
   `polygamma` (textbook); (ii) **Johansson `hmag` perturbation** —
   perturb every parameter by an independent `2^-hmag` and retry. Path
   (ii) is recommended for robustness; mpmath uses it.
4. Cancellation detection: track `|sum| / max_k |term_k|`. If it falls
   below `2^-target_precision`, the sum has lost too many digits;
   re-run at `working_precision = 2·target + spare`.
5. Quarantine: `|z|=1 ∧ p=q ∧ m+n=p` — neither series converges; emit
   `tagged "meijerg-slater/quarantine-band"`.

Lands as a new package `@workbench/meijer-core` with the Slater layer
exposed both as a library function and (via a thin wire-wrapper) as
`tools/meijer-g-slater-only` for benching the Slater path
independently.

---

## ► PROJECT STATE (substrate snapshot)

### Closed beads

**`hv0.1` — `packages/bigfloat`** (closed 2026-05-07)
- 229 unit tests, all green; ~5400 LOC across 9 source files.
- Public surface (everything in ADR-0020's spec):
  - Types: `BigFloat` = `(BigInt mantissa, i32 exp, i32 prec)`;
    `BigComplex` = `{ re, im }`; round-half-to-even normalisation.
  - Arithmetic: `add / sub / mul / div / sqrt / powInt`; comparisons;
    `abs / neg / sgn`.
  - Conversion: `fromInt / fromFloat64 / fromString / toFloat64 /
    toString`.
  - Constants: `ln2 / pi / e` (cached per-precision).
  - Transcendentals: `exp / log / expm1 / log1p`; full trig
    (`sin / cos / tan / asin / acos / atan / atan2`); hyperbolics;
    general `pow`.
  - Special: `bernoulliRational` (exact, cached); `gamma / lgamma /
    digamma / trigamma / polygamma` dispatcher.
  - Complex versions: `cadd / csub / cmul / cdiv / cabs / carg /
    csqrt / cexp / clog / cpow / cgamma / clgamma / cdigamma`.
  - Protocol encoding: `bigfloatToValue / valueToBigFloat` (and
    bigcomplex variants) plus `bigfloatSchema / bigcomplexSchema`.
- Cross-validated against Wolfram (`wolframscript -code 'N[..., 50]'`)
  byte-for-byte on Γ(5.5), Γ(100), lgamma(100), ψ(10), ψ'(2), Γ(1+i),
  Γ(1/2+i/2), exp(1+i), and many more.

**`hv0.3` — `tools/hypergeometric-pfq`** (closed 2026-05-07)
- 15 unit tests, all green.
- First arbprec-tier tool in the workbench. Surface:
  - Input `record { a: list<bigcomplex>, b: list<bigcomplex>,
    z: bigcomplex }`.
  - Output `record { value, achieved_precision, method, n_terms,
    working_precision, warnings }` or `tagged "hypergeometric-pfq/
    {non-convergent,parameter-pole}"`.
  - `--precision=<int>` standard flag inherited via the runner's
    arbprec-aware `mergedFlags` helper.
- Algorithm v0.1: direct power series with cancellation detection +
  bumped-precision retry; closed-form 0F0 (= exp) and 1F0 (= binomial);
  honest refusal for `p > q+1` and for `|z| ≥ 0.95` with `p == q+1`.
- Cross-validated identities at 50 dps:
  - 0F0(;;1) = e
  - 1F1(1;1;2) = e²
  - 2F1(1,1;2;1/2) = 2 log(2)
  - 1F0(2;;1/2) = 4
  - pFq(a;b;0) = 1 (general invariant)

**ADR-0020 + lockstep docs** (committed 2026-05-07)
- New tier flag `arbprec?: boolean` on `ToolDefinition`, parallel to
  `nondeterministic?` and `numerical?`. Mutually exclusive with both.
- `--precision=<int>` (decimal digits, default 50) standard flag
  inherited by `arbprec: true` tools.
- Determinism contract: bit-identical *cross-platform forever* given
  the precision flag — `BigInt` arithmetic is bit-identical across
  every JS runtime by language spec.
- Encoding: `tagged "bigfloat" payload: record { mantissa, exponent,
  precision }` and `tagged "bigcomplex" payload: record { re, im }`.
  No new primitive added to the value protocol.
- PRD §6.1, README "Hard requirements", CLAUDE.md hallucination-risk
  callout all reference it. Worklog shard 068 in scientist-workbench.

### Open beads (in dependency order)

| Bead | Title | Depends on |
|------|-------|------------|
| **hv0.5** | `packages/meijer-core`: Slater residue evaluator | hv0.1 ✓, hv0.3 ✓ |
| hv0.2 | cas-core: special-function AST vocabulary extension | hv0.1 ✓ |
| hv0.6 | `packages/meijer-core`: Adamchik-Marichev + Roach symbolic dispatch | hv0.2 |
| hv0.4 | `bench/hypergeometric-pfq`: tier-graded test battery | hv0.3 ✓ |
| hv0.7 | `packages/quadrature` arb-prec generalisation of integrate-1d | hv0.1 ✓ |
| hv0.8 | `packages/meijer-core`: Mellin-Barnes contour quadrature | hv0.7, hv0.2 |
| hv0.9 | `packages/meijer-core`: Braaksma asymptotic + hyperasymptotic | hv0.1 ✓, hv0.2 |
| hv0.10 | `tools/meijer-g`: top-level dispatcher | 5, 6, 8, 9 |
| hv0.11 | `bench/meijer-g`: full golden master battery | hv0.10 |
| hv0.12 | tstournament problem-13 staging | hv0.11 |

**Unblocked next** (no open dependencies): hv0.5, hv0.2, hv0.4, hv0.7.

---

## ► HARD-WON LESSONS (read before writing code)

### 1. mpmath's `print(x)` at `mp.dps=N` truncates, doesn't round

When recording cross-check expected values from mpmath, `mp.dps=50;
print(e)` shows `2.7182818284590452353602874713526624977572470936999`
— this is mpmath rounding the binary representation *down* to 50
decimal digits. **The correctly-rounded value at 50 dps is
`...0937000`** (round-half-to-even on digit 51 = 9 with non-zero trail).

The bigfloat substrate's `toString(...)` does correct round-half-to-
even. If your test expected value comes from mpmath's `print(...)`
output, **regenerate it** by computing at higher precision and
rounding manually, or by using Wolfram (`wolframscript -code 'N[..., 50]'`)
which rounds correctly.

This bit me three times in `transcendental.test.ts` and twice in
`special.test.ts` and once in `complex.test.ts`. Always cross-check
against Wolfram, not mpmath display.

### 2. Stirling's series at large z needs a working-precision bump

For Γ / lgamma / digamma at `Re z > prec/4` or so, the recurrence
path subtracts `Σ log(z+k)` from `lgamma(z+N)`, and these two values
are of comparable magnitude — catastrophic cancellation in the result.

Inside `lgamma`, `digamma`, `trigamma`: `work = prec + 96` (not the
usual `prec + 32`). The 96-bit margin absorbs the cancellation.
`shiftThreshold = ceil(work/8)` (≈ `prec/7`) is small enough that the
recurrence's term count is bounded; `k_max ≈ π · shiftThreshold ≈ 25`
in practice.

### 3. `arbprec: true` flag inheritance is in the runner's `mergedFlags`

Adding `arbprec: true` to a tool's definition automatically inherits
`--precision=<int>` (default 50) via `packages/contract/src/runner.ts`
`mergedFlags`. The tool's `fn` receives `flags.precision` as a
`bigint`. Tools may *override* the flag's bounds (e.g. tighten the
cap) but cannot rename or retype it.

### 4. `BigInt` is bit-deterministic across runtimes — by spec

ECMAScript guarantees `BigInt` arithmetic is bit-identical regardless
of host (Bun, Node, V8, JSC). This is the load-bearing fact for the
`arbprec: true` determinism contract. Internally bigfloat ops do
`absMan << BigInt(shift)` and `q = num / den` and the result is
identical on any platform. Don't introduce float64 anywhere in the
canonical computation path or you break this guarantee silently.

### 5. The half-bit / sticky-bit pattern in `div` and `sqrt`

For correct round-half-to-even on lossy operations, set a sticky bit:

```ts
const q = num / den;
const r = num - q * den;
const qWithSticky = r === 0n ? q : q | 1n;
return normalise(qWithSticky, ...);
```

The sticky bit ensures `normalise` rounds in the direction the *true*
discarded part dictates, not just the visible discarded bits. Used in
`div`, `sqrt`, `bernoulli` rational-to-float conversion, and the
decimal `fromString`. Don't skip it.

### 6. CSV: where Wolfram and mpmath disagree on MeijerG

Per the research probe (commit `bbbfb46`'s `ORACLE-STRATEGY.md`):
**`|z|=1 ∧ p=q ∧ m+n=p`** — Slater's two natural series both diverge
term-wise at the boundary; mpmath emits `NoConvergence`, Wolfram
emits `MeijerG::hdiv` and analytically continues. Quarantine these
test cases from the golden master; supply hand-derived third witness
where unavoidable.

---

## ► COMMANDS (cheatsheet)

```sh
# At session start (in scientist-workbench):
cd /home/tobias/Projects/scientist-workbench
bd ready                     # show unblocked work; pick the top one
bd show scientist-workbench-hv0.5  # read the spec body

# Inner loop:
bun run check:quick          # ~25s; 4 phases (codegen, types, bun test, conventions)
bun test packages/<name>/    # focused

# Cross-check against Wolfram for any value:
wolframscript -code 'N[<expression>, 50]'

# Cross-check against mpmath (at 60+ dps to dodge the truncation gotcha):
python3 -c "from mpmath import mp, <fn>; mp.dps=60; print(<fn>(...))"

# At session end:
bd close scientist-workbench-<id>   # close completed beads
bd export -o .beads/issues.jsonl    # sync the JSONL (pre-commit hook
                                    # also runs this automatically)
git add ... && git commit ... && git push origin main
```

---

## ► FILE LAYOUT (where things live)

```
tstournament/
├── ts-bench-infra/problems/13-meijer-g/
│   ├── DESCRIPTION.md                    problem statement
│   ├── PROMPT.md                         campaign-level brief
│   ├── PLAN.md                           seven-layer architecture
│   ├── REFERENCES.md                     load-bearing bibliography
│   ├── ORACLE-STRATEGY.md                Wolfram + mpmath consensus
│   ├── VERIFIER-PROTOCOL.md              three-output-category contract
│   ├── WORKLOG-13.md                     ← this file
│   └── sub-problems/
│       ├── 13a-bigfloat/                 ✓ (closed via hv0.1)
│       ├── 13b-special-fn-ast-and-pfq/   ✓ (closed via hv0.3)
│       ├── 13c-meijerg-numerical-slater/ ← NEXT (hv0.5)
│       ├── 13d-meijerg-symbolic-dispatch/
│       └── 13e-meijerg-integrated/
└── WORKLOG.md                            top-level (12 problems incl. this)

scientist-workbench/
├── docs/adr/0020-arbitrary-precision-tier.md
├── docs/worklog/068-arbitrary-precision-tier.md
├── docs/worklog/069-bigfloat-and-pfq-shipped.md ← session handoff
├── packages/bigfloat/                    ✓ shipped (hv0.1)
│   └── src/{types, arithmetic, comparison, conversion,
│           transcendental, bernoulli, special, complex,
│           encoding, index}.ts
└── tools/hypergeometric-pfq/             ✓ shipped (hv0.3)
    └── tool.{ts, test.ts}, package.json, goldens/
```

---

## ► RECENT COMMITS (campaign timeline)

scientist-workbench (chronological since campaign start):
- `6ef18f2` beads: register problem 13 epic + 12 children
- `95267eb` ADR-0020: arbitrary-precision tier
- `1f32a5e` packages/bigfloat substrate v0.1 (arithmetic + types + comparison + conversion)
- `e1539f2` packages/bigfloat: transcendentals (exp, log, ln2, pi, e, atan)
- `391a53d` packages/bigfloat: full trig + hyperbolics + general pow
- `c321b5e` packages/bigfloat: Bernoulli + Γ + lgamma + ψ + ψ'
- `a721cc0` packages/bigfloat: BigComplex API
- `5e5f366` packages/bigfloat: protocol encoding + close hv0.1
- `2eb15b1` contract: arbprec tier wiring + tools/hypergeometric-pfq v0.1
- `7509a4e` beads: close hv0.3

tstournament:
- `bbbfb46` problem 13 (Meijer G mega-test): scope + plan + sub-problem briefs

---

## ► DON'TS (operational hard line)

- **Do not consult mpmath's `meijerg.py` source.** The brief explicitly
  forbids it (problem 13 PROMPT.md no-direct-porting clause). The audit
  grep at trial close looks for `hypercomb`, `hyper`, `_hyp_borel`,
  `nint_distance`, `hmag`, `eliminate` — and the comment-by-comment
  axis. Permitted: the Johansson 2009 blog post (algorithm-level
  description, not source).
- **Do not unify the tier flags (`nondeterministic`, `numerical`,
  `arbprec`) into a discriminated enum** without a separate breaking
  ADR. The parallel-flag pattern is load-bearing for byte-identical
  provenance compatibility.
- **Do not let any code path in an `arbprec: true` tool touch float64
  for canonical-output computation.** Auxiliary float64 for heuristics
  (e.g. `toFloat64(z).value` in `kEstimate` of `exp`) is fine *iff*
  it does not affect output bytes.
- **Do not skip the working-precision bump** in Stirling-based gamma /
  digamma / trigamma. The 96-bit margin is empirically required.
- **Do not run `bd init` or `bd init --force`.** Use `bd bootstrap
  --yes` for setup. `bd init` rebuilds the DB and discards issues.
