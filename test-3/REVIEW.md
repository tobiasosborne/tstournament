# test-3 — Formal review

**Trial:** Phase-3, problem 03 (Online Suffix Automaton, Blumer et al. 1985).
**Model:** Claude Opus 4.7 (1M context), inherited via general-purpose subagent.
**Constraint:** pure-TS hard constraint (no `child_process`, no shellouts, no
external CAS, no native binaries, no non-JS WASM).
**Date:** 2026-04-27.
**Solution:** `test-3/03-suffix-automaton/solution.ts` — 244 lines / 9 632 bytes / single file.

---

## 1. Verifier — independently re-run

Command: `verifiers/run_tests.sh 03-suffix-automaton npx --yes tsx 03-suffix-automaton/solution.ts`.

```
shape 43/43 · num_states_bound 43/43 · distinct_substrings 43/43 · lcs_length 43/43
all 43 cases green
```

Every per-case line printed `pass`. Wall-clock 1m11s real / 0m58s user (the
bulk of which is `npx tsx`'s 43× cold-start overhead, not algorithm work).
The agent's self-reported per-check totals match the harness output exactly.

Coverage walk: empty / single-char / two-char base cases (`""`, `"a"`,
`"aa"`, `"ab"`); the canonical pathological-chain inputs (`"aaa"`, all-equal
length-10 and length-50, length-8 palindrome — every shape that exercises
the suffix-link path versus the clone-on-non-solid-edge branch); explicit
LCS edges (`lcs_empty_t`, `lcs_self`, `lcs_disjoint_alpha`); 15 random
small `|s| ≤ 20` cases (which the verifier truth-checks by brute-force
substring enumeration and `O(|s||t|)` DP); 4 random medium cases
`|s| ∈ {50, 100, 150, 200}`; 3 binary-alphabet `|s| = 100` cases
(which maximise clone frequency); the Fibonacci-150 fragment (the
canonical clone-growth adversary); two random large cases at `|s| ∈
{1000, 5000}`; and the two stress cases `|s| = 10000` (one with
`|t| = 5000`, one with `lcs(s, s)`). The harness verifies
`distinct_substrings` and `lcs_length` two different ways depending on
input size — brute force below `|s| = 20`, an inlined reference SAM
above — so passing both regimes is end-to-end correctness, not just
golden-output equality.

## 2. Constraint audit

```
grep -nE 'child_process|spawn|spawnSync|exec\(|execSync|execFile|fork\(|node:child_process|python|sympy|wolfram|maxima|pari|wasm|webassembly' 03-suffix-automaton/solution.ts
```

One hit — line 36, inside the header docblock:

> `* No \`child_process\`, no \`python\`, no native binaries, no WASM, no CAS.`

This is the negation, not a usage. Legitimate.

Imports: a single `require("fs")` (wrapped inside `readAllStdin`) for
`fs.readFileSync(0, "utf8")`. No `package.json`, no `node_modules`, no
transitive deps; the agent leaned entirely on `tsx`'s runtime
(Node 25 + `Int32Array` + `Map`). Hand-rolled `extend`, hand-rolled
clone-on-non-solid-edge, hand-rolled SAM-walk LCS. The `require` form
is a minor style choice (`test-2` used `import * as fs from "node:fs"`);
both are equivalent.

## 3. Scorecard

| Dimension                          | Grade | Evidence |
|---|---|---|
| Correctness (verifier)             | **A+** | 43/43 across all 4 checks, independently re-run; both verification regimes (brute-force `≤ 20` and inlined-reference-SAM `> 20`) pass, including `|s| = 10000` stress and the Fibonacci-150 clone-growth adversary. |
| Constraint compliance              | **A+** | Single grep hit is the self-declarative negation comment. No deps, no shellout, no native code, no WASM. |
| Algorithmic depth                  | **A**  | The full Blumer 1985 construction is implemented from scratch: the `last` pointer; the suffix-link walk in `extend` with the early-exit on the first state that already has a `c`-transition; the `len[p] + 1 === len[q]` solid-edge check; the clone path with a `new Map(trans[q])` transition copy and the redirect loop that re-points every `p → q on c` reachable up the link chain. The reference `Σ (len[v] − len[link[v]])` identity is used for `num_distinct_substrings`. The (state, matched-length) walk for LCS is the textbook recurrence. The one place where ambition does not exceed the bare ask: no `endpos` / `cnt` machinery (occurrence-counting was explicitly out of scope per DESCRIPTION.md, so this is the spec floor, not an omission). |
| Code quality                       | **A**  | Single 244-line file, three clearly delineated sections in source order (header docblock; `class SuffixAutomaton`; JSON I/O glue) — verified by section-marker grep against the architectural self-report. Doc comments at every method name the *invariant* the method maintains (e.g. the comment on `extend` explaining why `this.len` and `this.link` deliberately are not aliased into locals — the typed-array growth in `allocState` would silently invalidate them). Types are tight: `Int32Array` for the hot `len` / `link` columns, `Map<number, number>[]` for transitions, `bigint` only at the substring-sum boundary. No dead code, no commented-out scaffolding, no TODOs. The minor stylistic quibble is the `require("fs")` inside `readAllStdin` (with an `eslint-disable-next-line` line above it); a top-level `import * as fs from "node:fs"` would be slightly cleaner but functionally identical. |
| Numerical / data-structure safety  | **A** | Two safety choices stand out. First, the explicit "do not alias `this.len`/`this.link` into locals" doc comment in `extend` — the typed-array growth pattern in `allocState` is a classic source of dangling-buffer bugs in TypeScript and the agent both anticipates and documents the trap rather than just dodging it by accident. Second, `bigint` for the distinct-substring sum: bench cases stay well inside `2⁵³`, but the I/O contract advertises a decimal-string output precisely because the count grows past `2⁵³` in larger regimes, and using `bigint` from the start removes a silent precision pitfall at low cost. Pre-sizing `cap = 2 * s.length + 2` from the tight `2|s| − 1` bound means the typed arrays never actually grow on the batch path, but the growth path is correctly implemented anyway and so the streaming `extend(c)` API is honest about its complexity. |
| Honesty of self-report             | **A+** | Per-check totals reproduced exactly (`shape 43/43 · num_states_bound 43/43 · distinct_substrings 43/43 · lcs_length 43/43`). Architecture description matches source order 1:1 (3 sections, all in the named line ranges). The "Stated limitations" section names four real weaknesses including the "amortised O(1) but not worst-case" caveat for `extend`, the boxed-bigint accumulation cost at much-larger `|s|`, the lack of a `Uint8Array` 26-slot transition variant (which would be faster on the `a-z` test set but violates the "no fixed-Σ assumption" spec clause), and the surrogate-pair non-handling under `charCodeAt`. The "Alternatives considered and rejected" section names four real alternatives with reasons. No sandbagging, no false modesty, no over-claiming. |
| Engineering judgment               | **A**  | Reading the `Map<number, number>` choice over the 26-slot `Int32Array` against the spec is the right call: DESCRIPTION.md explicitly forbids relying on a fixed alphabet, the test set notwithstanding. The `bigint` choice is similarly governed by the spec rather than the bench (the contract advertises a decimal-string output). Pre-sizing the typed arrays from the `2|s| + 2` upper bound to avoid growth on the batch path is the kind of micro-architectural call you only make if you've internalised the SAM state-count invariant. The clone path uses `new Map(trans[q])` rather than reaching for an opaque copy method — direct, no surprises. The single judgment call that could go either way is keeping `extend` defensively non-aliased everywhere (rather than aliasing `this.trans` into a local, which is safe because `Array.length =` preserves identity); the doc comment notes this and chooses the uniform style on purpose. |

## 4. Comparative table

| Metric                     | This trial (test-3 SAM) | Reference (test-10 pure-TS Risch) |
|---|---|---|
| Verifier                   | 43/43 (4 checks)        | 18/18 (3 checks)                  |
| Wall-clock                 | ~5m / 45 308 tokens     | 24m 59s / ~159 000 tokens         |
| Tool uses                  | 18                      | 79                                |
| Output                     | 244 lines / 9 632 B     | 2 265 lines / 86 178 B            |
| Estimated cost             | ~$0.7                   | ~$3.0                             |

| Metric                     | This trial (test-3 SAM) | Predecessor (test-2 NTT)          |
|---|---|---|
| Verifier                   | 43/43 (4 checks)        | 64/64 (4 checks)                  |
| Wall-clock                 | ~5m                     | ~23m 42s                          |
| Total tokens               | 45 308                  | 112 778                           |
| Tool uses                  | 18                      | 48                                |
| Output                     | 244 lines               | 417 lines                         |

This trial is the cheapest pure-TS Phase-3 run so far, by both
wall-clock and tokens. Single-shot iteration to green: the agent's tool
log shows verifier-then-ship, not verifier-then-debug-then-ship.

## 5. Methodology / benchmark-design observations

**Problem 03 is the closest to the training distribution of any Phase-3
trial so far.** The online suffix automaton with `link` and `len` is the
single most-published competitive-programming algorithm for which the
exposition has converged; the construction in CP-Algorithms-style
references is essentially the same code Opus 4.7 produced, modulo the
`Int32Array` SoA layout and the `bigint` accumulator. The 18 tool uses
and ~5m wall-clock reflect that. The implication for tier discrimination
is sober: `test-3` will likely be passed cleanly by Sonnet 4.6 and
plausibly by Haiku 4.5 too. The trial is load-bearing for the
**coverage** half of the benchmark (the floor — what Opus reliably ships
on a well-known online algorithm) but not for the **discrimination**
half (the ceiling — where models start to diverge).

**The pure-TS constraint does less work here than in `test-2` or
`test-10`.** There is no canonical Python shortcut to forbid: SAMs do
not appear in `numpy.fft` / `sympy.discrete` / `sympy.combinatorics` as
a one-liner the way `risch_integrate` or `sympy.discrete.transforms.ntt`
do. The forbidden-token scrub on staged prose returned nothing
problem-specific. The pure-TS constraint here mostly forecloses
"`child_process` to a Rust crate via JSON" type cheats, which are far
less tempting for SAMs than they are for symbolic integration. As a
result, comparing the test-3 result *across* models will still be
informative, but the constraint is not the experiment in the way it was
for problem 10.

**The verifier's two-regime correctness check is well-shaped for this
problem.** Brute-force substring enumeration below `|s| = 20` and a
reference-SAM walk above means the agent can't pass by reproducing the
reference SAM's bug — the small-input regime cross-checks against a
specification (substrings) rather than another implementation. Combined
with the `num_states_bound` structural check, the verifier triangulates
correctness from three angles (shape, structural invariant,
specification-derived ground truth in two regimes), which is enough to
catch the obvious failure modes — off-by-one in the `len[p] + 1 ===
len[q]` solid-edge check would fail `distinct_substrings`; a forgotten
`Map`-copy in the clone path would fail it on the first cloning input
(`palindrome_8`, `aaaaaaaaaa`, `fibonacci_150`); a swapped `len(v)`
update in the LCS walk would fail `lcs_length` on the small-DP regime.
Both are real failure modes for this algorithm and both are screened.

**Honesty calibration continues.** `test-1` (FFT), `test-2` (NTT),
`test-3` (SAM), and both `test-10` runs have all self-reported
accurately on per-check totals, source structure, and resource use. Four
trials in a row of A+ honesty under Opus 4.7 makes this the established
prior; deviation under cheaper models becomes a data point rather than
noise. The independent re-run protocol stays mandatory regardless.

**Recommendation for next trial.** Two reasonable directions. (a) March
forward to problem 04 (Schreier-Sims, `sympy.combinatorics.PermutationGroup`)
— the next problem in the canonical sweep, and the constraint should
do more work here than it did on SAM. (b) Pivot to a Sonnet 4.6
cross-model probe; `test-2` (NTT) was already the recommended
discrimination point in the previous review, and three completed Opus
4.7 problems (1, 2, 3) plus the test-10 anchor is a usable enough
baseline to start cross-model comparison without losing freshness on
the earlier trials. The user's call.
