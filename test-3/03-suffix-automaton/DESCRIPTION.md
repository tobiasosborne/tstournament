# Problem 3 — Online Suffix Automaton (Blumer et al. 1985)

## What to implement

The **online suffix automaton (SAM)** of a string `s ∈ Σ*` and a small set
of standard query operations on it. Construction must be **online**: a
function `extend(c)` that, given the current SAM of `w`, produces the SAM
of `wc` in amortised constant time.

The full construction algorithm is the one in Blumer et al. 1985 (with
the standard `link` / `len` representation popularised by competitive
programming references): a state's `link` points to the longest proper
suffix in a different equivalence class; when extending by `c`, the
algorithm walks the suffix-link chain and clones states whose `len` would
otherwise be inconsistent.

You implement `extend` (or an equivalent batch builder) plus three
standard queries answered from the finished automaton:

1. **`num_states(s)`** — number of SAM states for `s` (initial state
   counted).
2. **`num_distinct_substrings(s)`** — number of distinct non-empty
   substrings of `s`. Standard SAM identity:
   `Σ_{v ≠ initial} (len(v) − len(link(v)))`.
3. **`lcs(s, t)`** — length of the longest common substring of `s` and
   `t`, computed by walking `t` through the SAM of `s` with the standard
   `current_state, current_length` recurrence (descend the suffix-link
   chain when there is no transition for the next character of `t`,
   otherwise advance the transition).

## Alphabet

ASCII only. `s, t ∈ {a, …, z}*` for the test set; the SAM construction
must not rely on a fixed alphabet size. (The agent is free to use either a
hash map or a 26-slot array, but the verifier will not feed non-`a-z`
characters.)

## I/O contract (JSON)

### Input

```jsonc
{
  "s": "<string>",
  "t": "<string or empty>"     // empty/omitted ⇒ lcs_length must be 0
}
```

### Output

```jsonc
{
  "num_states":              <int>,
  "num_distinct_substrings": "<decimal string>",   // can exceed 2^53
  "lcs_length":              <int>                  // 0 when t is empty
}
```

`num_distinct_substrings` is a **decimal string** because for `|s|` near
`10⁴` the count can exceed `2⁵³`.

## Invariants the verifier checks

1. **Shape.** Output is a JSON object with the three keys above and the
   right types.
2. **State-count bound.** `num_states ≤ 2|s| − 1` for `|s| ≥ 2`,
   `num_states ≤ 2` for `|s| ≤ 1`. (Initial state included; tight bound
   for `|s| ≥ 3`.)
3. **Distinct-substring correctness.** For `|s| ≤ 20`, the count is
   verified by brute-force enumeration of all substrings into a set. For
   larger `|s|`, the count is verified against an independent SAM
   reference inside the verifier.
4. **LCS correctness.** For `|s|, |t| ≤ 20`, the length is verified by
   the literal `O(|s|·|t|)` DP. For larger inputs, against the verifier's
   own reference SAM walk.

## Edge cases the test set covers

- `s = ""` (empty) — `num_states = 1`, `num_distinct_substrings = "0"`.
- `s = "a"`, `s = "aa"`, `s = "ab"`, `s = "aaa"`.
- All-equal `s` (e.g. `"aaaaaaaaaa"`): exercises the suffix-link chain
  collapsing to a path.
- Small alphabet `{a, b}` strings of length 10–30.
- Fibonacci-word fragment of length 100 (exercises the "many cloned
  states" growth pattern).
- Random `a-z` strings at `|s| ∈ {200, 1000, 5000}`.
- LCS pairs at all sizes; `lcs("", anything) = 0`; `lcs(s, s) = |s|`;
  pairs with no common character.
- Stress at `|s| = 10000` with `t` of length 5000.

## What the agent does *not* implement

- No suffix tree, suffix array, or any non-SAM representation. The verifier
  cannot detect this, but it is the spec.
- No batched extensions to multiple strings (no generalised SAM).
- No persistence / serialisation of the automaton.
- No occurrence-counting or position queries (these are standard SAM
  queries, but they are *not* part of this problem).
