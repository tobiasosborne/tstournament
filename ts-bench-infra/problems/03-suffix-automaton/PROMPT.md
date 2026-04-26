# Problem 3 — Online Suffix Automaton (Blumer et al. 1985)

## ⚠ How you will be graded

You will be graded on **QUALITY** and **CORRECTNESS**.

Produce the **most elegant, most efficient, most perfect, most impressive**
TypeScript implementation you can. This is a portfolio piece. The verifier
is a *floor*, not a ceiling — passing it is necessary but not sufficient.

**Dev time is infinite.** Take as long as you need. Use multiple sessions
if that helps. Refactor. Re-architect. Profile. Polish. **Prefer
multi-session quality over quick-fix janky band-aid shortcuts.** Do not
ship the first thing that passes the verifier — ship the version you'd put
your name on.

**How** you solve it is up to you: search the web, use libraries, port
from another language, copy patterns from prior art — whatever you'd do
normally. The JSON I/O contract is the only hard interface constraint.

## Problem statement

Implement the **online suffix automaton (SAM)** of a string `s ∈ Σ*` and a
small set of standard queries on it. Construction must be **online**: a
function `extend(c)` that, given the current SAM of `w`, produces the SAM
of `wc` in amortised constant time. (A batch builder that internally calls
`extend` per character is fine; what matters is that the per-step
operation is the canonical `link, len` extension, not a re-build.)

Three queries must be answered from the finished automaton:

1. **`num_states(s)`** — number of SAM states (initial state counted).
2. **`num_distinct_substrings(s)`** — number of distinct non-empty
   substrings of `s`. Standard SAM identity:
   `Σ_{v ≠ initial} (len(v) − len(link(v)))`.
3. **`lcs(s, t)`** — length of the longest common substring of `s` and
   `t`, computed by walking `t` through the SAM of `s` with the standard
   `(state, length)` recurrence: descend the suffix-link chain when there
   is no transition for the current character; otherwise follow the
   transition.

## Alphabet

ASCII; the test set uses only `a-z`. The SAM construction must not rely on
a fixed alphabet size — use a hash map (or equivalent) for transitions.

## I/O contract (JSON)

### Input (one JSON object on stdin)

```jsonc
{
  "s": "<string>",
  "t": "<string or empty>"     // empty/omitted ⇒ lcs_length must be 0
}
```

### Output (one JSON object on stdout)

```jsonc
{
  "num_states":              <int>,
  "num_distinct_substrings": "<decimal string>",
  "lcs_length":              <int>
}
```

`num_distinct_substrings` is a **decimal string** — for the stress sizes
the count is comfortably inside `2⁵³`, but the encoding stays uniform with
the rest of the bench.

## Suggested TypeScript signature

```ts
interface SAMInput  { s: string; t: string; }
interface SAMOutput {
  num_states:              number;
  num_distinct_substrings: string;
  lcs_length:              number;
}

function suffixAutomaton(input: SAMInput): SAMOutput;
```

The shape of your internal API is up to you. If you want to expose a
streaming `extend(c)` plus terminal queries, do that internally and only
expose the JSON shape above as the program boundary.

## Verifying your solution

`golden/verify.py` reads `{"input": ..., "candidate": ..., "id": ...}` on
stdin and emits four checks:

```jsonc
{
  "pass":   true,
  "reason": "all invariants hold",
  "checks": {
    "shape":               {"pass": true, "detail": "..."},
    "num_states_bound":    {"pass": true, "detail": "..."},
    "distinct_substrings": {"pass": true, "detail": "..."},
    "lcs_length":          {"pass": true, "detail": "..."}
  }
}
```

The first two are structural; the second two are computed two different
ways depending on input size (brute force for `|s| ≤ 20`, reference SAM
otherwise). See `golden/verifier_protocol.md`.

### Files

- `golden/inputs.json` — every test case.
- `golden/expected.json` — reference outputs (provided; not required by
  the verifier).
- `golden/verify.py` — verifier.

### Exact shell command

```
infra/verifiers/run_tests.sh problems/03-suffix-automaton <your-cmd>
```

For example:

```
infra/verifiers/run_tests.sh problems/03-suffix-automaton npx tsx solution.ts
```

The harness pipes each case through your program and through the verifier,
and prints a per-check summary. It exits 0 only if every case is
`"pass": true`.

## Canonical phrasing (informational)

These short excerpts ground definitions and conventions. They are
**informational, not restrictive** — you don't have to derive your
solution from them.

> 1. *State / edge bound:*
>    "the smallest partial DFA for the set of all subwords of a given word
>    w, |w| ≥ 2, has at most 2|w|−2 states and 3|w|−4 transition edges,
>    independently of the alphabet size."
>    — `Blumer_etal_SmallestAutomaton_TCS_40_1985.pdf:p1`
> 2. *End-set / end-equivalence (the basis of the suffix-link field):*
>    "For any nonempty y in Σ*, the end-set of y in w is given by
>    end-setw(y) = {i : y = aᵢ₋|y|+1 … aᵢ}. … We say that x and y in
>    Σ* are end-equivalent (on w) if end-setw(x) = end-setw(y), and we
>    denote this by x ≡w y."
>    — `Blumer_etal_SmallestAutomaton_TCS_40_1985.pdf:p3`
> 3. *Clone / split on a non-solid matching edge:*
>    "as in the DAWG construction, if a non-solid edge is encountered
>    during SlowFind, its target state has to be duplicated in a clone
>    and the non-solid edge is redirected to this clone."
>    — `Crochemore_Verin_CDAWG_LNCS_1261_1997.pdf:p9`

## What you must do

1. Conform to the JSON I/O contract above. Read from stdin, write to
   stdout.
2. Run the verifier before declaring done:
   ```
   infra/verifiers/run_tests.sh problems/03-suffix-automaton <your-cmd>
   ```
3. In your final answer, report the verifier's per-check totals
   (e.g. `distinct_substrings 43/43, lcs_length 43/43, …`).
4. Ship the implementation **you'd put your name on**, not the first thing
   that passes. Quality and correctness are the grade. Multi-session
   refinement is welcome; janky shortcuts are not.
