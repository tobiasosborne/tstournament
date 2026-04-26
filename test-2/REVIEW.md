# test-2 — Formal review

**Trial:** Phase-3, problem 02 (Number-Theoretic Transform, arbitrary length).
**Model:** Claude Opus 4.7 (1M context), inherited via general-purpose subagent.
**Constraint:** pure-TS hard constraint (no `child_process`, no shellouts, no
external CAS, no native binaries, no non-JS WASM).
**Date:** 2026-04-26.
**Solution:** `test-2/02-ntt/solution.ts` — 417 lines / 17 491 bytes / single file.

---

## 1. Verifier — independently re-run

Command: `verifiers/run_tests.sh 02-ntt npx --yes tsx 02-ntt/solution.ts`.

```
shape 64/64 · canonical_range 64/64 · modular_equality 64/64 · roundtrip 64/64
all 64 cases green
```

Every per-case line printed `pass`. The agent's self-reported per-check
totals match the harness output exactly.

Coverage walk: identity (`n=1` fwd/inv), small `n=2/4/8` edges (DC, alt,
impulse, inverse-of-fwd), Bluestein-forced primes (`n=7`, `n=17`),
random power-of-two from `n=2` to `n=1024` (fwd & inv), random Bluestein
across the divisors of `p-1` (`n ∈ {7,14,17,28,34,56,68,112,119,136,224,238,476}`,
fwd; selected inverses), convolution-theorem triples at `n ∈ {4,7,8,14,16}`,
and stress at `n=4096` and `n=16384` (fwd). The verifier's `roundtrip` check
independently applies the *opposite-direction* schoolbook reference and
compares to original input — i.e. correctness is checked end-to-end, not
merely against an `expected.json` snapshot.

## 2. Constraint audit

```
grep -nE 'child_process|spawn|spawnSync|exec\(|execSync|execFile|fork\(|node:child_process|python|sympy|wolfram|maxima|pari|wasm|webassembly' 02-ntt/solution.ts
```

One hit — line 31, inside the header docblock:

> `* Pure JS / TS only. No child_process, no shellouts, no native bindings.`

This is the negation, not a usage. Legitimate.

Imports: a single `import * as fs from "node:fs"`. No `package.json`, no
`node_modules`, no transitive deps; the agent leaned entirely on `tsx`'s
runtime (Node 25 + bundled BigInt + `Math.imul`). Hand-rolled Montgomery,
hand-rolled Bluestein, hand-rolled NTT.

## 3. Scorecard

| Dimension                          | Grade | Evidence |
|---|---|---|
| Correctness (verifier)             | **A+** | 64/64 across all 4 checks, independently re-run; includes `n=16384` stress and convolution-theorem triples. |
| Constraint compliance              | **A+** | Single grep hit is the self-declarative comment. No deps, no shellout, no native code, no WASM. |
| Algorithmic depth                  | **A**  | The full canonical stack is implemented from scratch: Montgomery REDC with 16-bit limb splits in pure `Number` arithmetic; iterative Cooley-Tukey on `Uint32Array`; Bluestein chirp-z with `ζ = ω_{2n}` reduction to a power-of-two cyclic convolution; cached forward and inverse plans; `n⁻¹` and `ω⁻¹` via Fermat at setup. The rubric named Bluestein and Montgomery as the canonical-quality choices; both are present, idiomatic, and correctly composed. The one place where ambition does not exceed the bare ask: no Rader for prime-length transforms (the agent argues, correctly, that Bluestein covers `n ∈ {7, 17}` at uniform cost; this is a defensible call rather than an omission). |
| Code quality                       | **A**  | Single 417-line file, eight clearly-delineated sections in strict downward dependency order (matches the self-reported architecture; verified by section-marker grep). Doc comments at every layer name the *invariant* the layer maintains, not just what it does. Types are tight: `Uint32Array` for hot-path storage, `bigint` only for setup. No dead code, no commented-out scaffolding, no TODOs. The single weak spot is one stylistic bigint→Number coercion (`Number(input.x[i])` where parsing the decimal string with `Number()` instead of `BigInt()` works only because residues are < 2³⁰; the bound is explicit but not enforced beyond the runtime `< P` check). |
| Numerical / modular-arithmetic stability | **A** | The Montgomery layer is the most delicate part of the file and the agent navigated it cleanly. The 64-bit product `a·b` (which can reach 2⁶⁰, well past the 2⁵³ safe-integer ceiling) is reconstructed from four 16-bit-limb partial products as a `(hi, lo)` pair; the cross-term carry is propagated explicitly; `Math.imul` is used for the one true 32×32→low-32 step. The doc comment names the bound on every intermediate. The single explicit `Math.floor(mpCross / 0x10000)` is correctly justified (the dividend can exceed 2³¹ so a `>>>` shift would sign-corrupt). The `if (u ≥ p) u -= p` final reduction makes the post-condition `u ∈ [0, p)` total. The one weakness flagged honestly by the agent: untested at `n` near the divisor ceiling `2²³`, where `mmul`'s middle-term `(cross & 0xffff) * 0x10000` adds one bit of headroom but hasn't been measured. |
| Honesty of self-report             | **A+** | Per-check totals reproduced exactly. Architecture description matches source order 1:1 (8 sections, all in the named order). Resource log (~25 min) within 5 % of measured wall-clock (23 min 42 s). The "Alternatives considered and rejected" section names five real alternatives with reasons; the "Stated limitations" section names six honest weaknesses including one debugging cycle. No sandbagging, no false modesty, no over-claiming. |
| Engineering judgment               | **A**  | Choosing Bluestein over Rader for `n ∈ {7, 17}` is correct and well-argued (Bluestein covers uniformly; Rader's win is asymptotic and these sizes don't trigger it). Choosing `Uint32Array` over `BigUint64Array` is correct (residues fit in 30 bits; SMI dispatch matters more than headroom). Folding the `L⁻¹` (and `n⁻¹` for inverse) scale into the per-output chirp post-multiply, saving a full pass, is the kind of micro-architectural call you only make if you've thought about the cost model. Caching twiddles and Bluestein plans is irrelevant in this harness (each test case is a fresh process) and the agent says so explicitly — that self-awareness is the signal. |

## 4. Comparative table

| Metric                     | This trial (test-2 NTT) | Reference (test-10 pure-TS Risch) |
|---|---|---|
| Verifier                   | 64/64 (4 checks)        | 18/18 (3 checks)                  |
| Wall-clock                 | ~23m 42s                | 24m 59s                           |
| Total tokens               | 112 778                 | ~159 000                          |
| Tool uses                  | 48                      | 79                                |
| Output                     | 417 lines / 17 491 B    | 2 265 lines / 86 178 B            |
| Estimated cost             | ~$2.0                   | ~$3.0                             |

The token budget difference (~30 % less) tracks the source-line difference
(~80 % less): NTT under Bluestein has a much smaller surface area than
Risch's nested layered algorithms, so the agent reached "ship" sooner with
fewer iterations.

## 5. Methodology / benchmark-design observations

**The pure-TS constraint continues to do its job.** Without it, problem 02
collapses into one of {`bn.js` modular multiplication wrapping, calling
out to a CAS's NTT, or just doing `bigint % p` and accepting 50× slowdown
on the stress cases}. With it, the model has to make four
non-trivial choices (Montgomery vs Barrett vs lazy reduction; `Number`
vs `BigInt` vs typed array; iterative vs recursive Cooley-Tukey; Bluestein
vs Rader vs prime-factor for non-power-of-two), and each is a place where
the model's algorithmic taste shows. None of these surface in a shellout
trial. As with `test-10`, the constraint is the experiment.

**The verifier is well-shaped for this constraint.** `modular_equality`
forbids the obvious cheat (returning the inverse of your own forward — the
roundtrip would still pass), and the convolution-theorem triples
(`conv*_n*_*`) catch any silent inconsistency in the choice of `ω` or the
inverse normalization across calls. A model that wired up Bluestein
correctly for the forward direction but flipped a sign in the inverse
chirp would fail roundtrip; one that off-by-oned `n⁻¹` would fail
`modular_equality` on small `n`. Both are real failure modes for this
algorithm and both are screened.

**This trial is cheaper-per-grade than `test-10`.** Same model, same
constraint, ~30 % fewer tokens, ~70 % faster. Two readings: (a) NTT is
genuinely simpler than Risch; (b) the agent was running on muscle memory
(Cooley-Tukey is closer to the training distribution than Risch's
Hermite-Rothstein-Trager). Likely both. The implication for cross-model
comparison is that **NTT alone is probably not load-bearing for tier
discrimination** — Sonnet 4.6 and Haiku 4.5 will likely both pass it. The
test-10 Risch trial discriminates harder. A useful next step would be to
run problem 02 on Haiku 4.5 specifically and see whether the Montgomery
implementation degrades to "BigInt mulmod with `% p`", which would
indicate where the ceiling for that tier sits on this kind of algorithmic
work.

**Honesty calibration.** Both `test-1` (FFT) and `test-10` (Risch) Opus
trials self-reported accurately. `test-2` continues the pattern. This is
a useful prior to set: when re-running with Sonnet or Haiku, any
divergence between agent self-report and independent re-run becomes a
data point, not noise. Continue the protocol of independent re-runs for
weaker models — under a strict reading of the WORKLOG it is not optional.

**Recommendation for next trial.** Problem 03 next. Continue the same
pure-TS protocol and the same scorecard. If a model-comparison sweep is
imminent, run `test-2` on Sonnet 4.6 first — it's the cheapest
discrimination data point still missing, and the comparison is
cleanest while the Opus baseline is fresh.
