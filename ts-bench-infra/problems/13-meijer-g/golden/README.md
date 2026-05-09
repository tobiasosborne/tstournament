# `golden/` — problem 13 trial-runner artefacts

This directory is the **trial-runner-side validation surface** for
problem 13 (Meijer G-function). It is the staging that lets the
`infra/verifiers/run_tests.sh` runner grade a candidate solution
against pinned truth values.

## Layout

| File | Purpose |
|---|---|
| `inputs.json` | 91 test cases × 9 tiers (0/A/B/C/D/E/F/G; H is a cross-cutting subset). Lifted from `scientist-workbench` `bench/meijer-g/golden/inputs.json` (`hv0.11`). |
| `expected.json` | Pinned truth values + per-case `tolerance_rel`. Tier 0 anchors evaluated at 200 dps from the elementary RHS (oracle-bug-immune); Tiers A–F at 110 dps from Wolfram + mpmath consensus; Tier G refusal envelopes. |
| `tier-h.json` | The cross-cutting Tier-H speed-gate manifest — 35 case ids that re-run with `MEIJERG_BENCH_CHECK_SPEED=1` to assert ≤ 1500 ms/case. |
| `verify.py` | Three-output-category invariant verifier. Per-case ≥ 4 invariant checks; multi-shape (symbolic / numerical / refusal); accepts both wire shapes for refusal (`{kind: "tagged", tag: "meijer-g/<class>"}` and `{kind: "out-of-region", reason, ruled_out_methods}`). |
| `generate.py` | Lifted Wolfram + mpmath consensus driver. Re-running this script with the same `mpmath` and `wolframscript` versions reproduces a byte-identical `expected.json`. |
| `test_mutations.py` | Five mutation-prove tests for the verifier itself: each perturbation flips a different invariant; every one is expected RED. Run on demand; not in CI. |
| `reference-candidate.sh` | Shell wrapper that invokes the in-tree `scientist-workbench` `tools/meijer-g/` as the candidate. Used to self-test the verifier wiring; trial agents replace this with their own `solution.ts`. |

## Running the trial-runner

From the `tstournament` repo root:

```sh
PATH=/path/to/bun/bin:$PATH \
  bash ts-bench-infra/infra/verifiers/run_tests.sh \
       ts-bench-infra/problems/13-meijer-g \
       <candidate-cmd...>
```

For the in-tree reference candidate (sanity-test the verifier):

```sh
PATH=/home/tobias/.amp/bin:$PATH \
  bash ts-bench-infra/infra/verifiers/run_tests.sh \
       ts-bench-infra/problems/13-meijer-g \
       bash ts-bench-infra/problems/13-meijer-g/golden/reference-candidate.sh
```

For a candidate solution `solution.ts` that follows the wire format
documented in `../VERIFIER-PROTOCOL.md`:

```sh
bash ts-bench-infra/infra/verifiers/run_tests.sh \
     ts-bench-infra/problems/13-meijer-g \
     bun /path/to/solution.ts
```

## Three output categories

Per `../VERIFIER-PROTOCOL.md` the candidate's `solution.ts` reads one
JSON object on stdin and writes one JSON object on stdout. The output
must be one of three shapes:

### Symbolic match

```jsonc
{
  "kind": "symbolic",
  "rule": "<stable rule id>",          // required, non-empty
  "source": "<human-readable citation>",
  "note": "<RHS in conventional notation>",
  "method": "symbolic-dispatch",
  "expr": <AST in the closed special-function vocabulary>
}
```

The `expr` is an AST in the heads documented in
`sub-problems/13b-special-fn-ast-and-pfq/DESCRIPTION.md`
(`Plus / Times / Power / Negate / Constant / Sin / Cos / Exp / Log /
BesselJ / BesselY / BesselI / BesselK / HypergeometricPFQ / WhittakerM /
WhittakerW / ParabolicCylinderD / Erf / Erfc / ExpIntegralEi / Polylog
/ Gamma / Digamma / Pi / E / I / Sqrt / Square / Inverse / Arctan / …`).
Heads are case-insensitive; the verifier accepts both `Exp` and `exp`.
A `Symbol` head with name `"z"` references the case's `z` argument.

The verifier evaluates `expr` at the case's `z` and checks relative
error ≤ `tolerance_rel` against the pinned truth, in addition to
checking the `rule` field is non-empty.

### Numerical success

```jsonc
{
  "kind": "numerical",
  "value": {"re": "<dec>", "im": "<dec>"},
  "achieved_precision": <int>,       // ≤ requested precision
  "method": "slater-series-1" | "slater-series-2"
          | "mellin-barnes" | "braaksma-algebraic",
  "working_precision": <int>,        // optional but recommended
  "warnings": [<string>, ...],       // optional
  "diagnostics": <record>            // optional
}
```

### Out-of-region refusal

Either of:

```jsonc
{
  "kind": "out-of-region",
  "reason": "<human-readable diagnosis>",
  "ruled_out_methods": ["slater-series-1", "slater-series-2",
                        "mellin-barnes", "braaksma-algebraic"]
}
```

or the workbench equivalent:

```jsonc
{
  "kind": "tagged",
  "tag": "meijer-g/<class>",
  "payload": {"reason": "<string>",
              "ruled_out_methods": [<string>, ...]}
}
```

Refusal classes (the `<class>` portion):

* `out-of-region` — every applicable layer refused.
* `non-finite-input` — z or a parameter contains NaN/Inf.
* `degenerate-shape` — m + n = 0.
* `symbolic-required-no-match` — `request_mode = symbolic-required`
  and no rule matched.
* `forced-method-refused` — `--force-method=<lane>` and that lane
  refused.

## Per-check summary the verifier reports

| Check | Path | Tolerance |
|---|---|---|
| `no_tool_error` | both | strict |
| `shape` | success | strict (`kind ∈ {symbolic, numerical}`) |
| `finite_value` | numerical | re/im parse as finite mpf |
| `method_admissible` | both | numerical: `slater-{1,2}` / `mellin-barnes` / `braaksma-algebraic`; symbolic: `symbolic-dispatch` |
| `self_reported_precision` | numerical | `0 ≤ achieved_precision ≤ requested` |
| `value_accuracy` | numerical, *and* symbolic when `expected.truth` is pinned | per-case `tolerance_rel` |
| `symbolic_rule_present` | symbolic | non-empty `rule` field |
| `boundary_envelope` | refusal | tag-strict (workbench tag namespace) |
| `value_accuracy_note` | symbolic when AST eval is skipped | informational |

## What v0.1 ships vs. what is deferred

**Ships:**
- All 9 tiers green against the in-tree reference candidate (91/91).
- AST-evaluation single-point witness for symbolic outputs with a
  pinned truth (catches wrong-but-rule-id-matching symbolic answers).
- Five mutation-prove tests for the verifier; all RED on perturbation.

**Deferred (P2 follow-ups in `BEADS-TO-FILE.txt`):**
- Multi-point K=20 random-z sampling for symbolic outputs per
  `../VERIFIER-PROTOCOL.md` §"symbolic check". v0.1 ships single-point
  evaluation, which catches the common failure modes; the contrived
  "right at z, wrong elsewhere" case escapes.
- Tier-H 200-LCG-case sweep at fixed seed. v0.1 ships a 35-case
  cross-cutting subset (re-uses C/D/E/F ids); the 200-case generator
  is a follow-up.
- Test-13a..e/ trial sandboxes (separate work).
