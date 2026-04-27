# Unified JSON Encoding for Golden Masters

Every `golden/inputs.json`, `golden/expected.json`, and the stdin/stdout of every
`verify.py` uses the encoding rules below. They are language-agnostic by design:
TS, Julia, Python, C, and Lean targets all consume the same files and produce
output in the same encoding. The verifier never inspects target-language
floating-point representations directly.

## Design rules

1. **Strings for everything that can lose precision in IEEE-754.** Big integers,
   rationals, exact-real components of complex numbers, polynomial coefficients,
   and exact graph weights are JSON strings, never JSON numbers.
2. **JSON numbers are reserved for native machine-precision floats** (FFT
   inputs/outputs, statistics, indices, dimensions). When in doubt, prefer
   strings.
3. **Indices are 0-based everywhere.** Permutations, vertices, polynomial
   variables, suffix-automaton states.
4. **Arrays for ordered things, objects for tagged things.** No mixed-type
   tuples.
5. **No NaN, no Infinity in inputs.** Verifiers may emit them as strings
   (`"NaN"`, `"Infinity"`) in `checks` payloads only.
6. **Per-problem schemas live in `golden/verifier_protocol.md`** and are pinned
   by example. Schema drift across problems is forbidden — if a new type is
   needed, add it here first.

## Type encodings

| Type            | Encoding                                                 | Example                                                 |
|-----------------|----------------------------------------------------------|---------------------------------------------------------|
| Machine float   | JSON number                                              | `3.141592653589793`                                     |
| Big integer     | JSON string, signed decimal                              | `"-12345678901234567890"`                               |
| Rational        | object `{"num": "...", "den": "..."}`, `den > 0`, gcd=1  | `{"num": "-3", "den": "4"}`                             |
| Complex (float) | array `[re, im]` of JSON numbers                         | `[1.0, -2.5]`                                           |
| Complex (exact) | array `[re, im]` of strings (rational decimals)          | `["1", "-5/2"]`                                         |
| Modular int     | JSON string (canonical residue in `[0, p)`)              | `"998244352"` with separate field `"modulus": "..."`    |
| Polynomial      | sparse list `[[exp_vec, coeff_string], …]`               | `[[[2,0], "3"], [[0,1], "-1/2"]]` for `3x² − ½y`        |
| Polynomial ring | object `{"vars": ["x","y"], "order": "lex"}`             | `{"vars":["x₁","x₂","x₃"],"order":"degrevlex"}`         |
| Permutation     | 0-indexed image array, length `n`                        | `[2,0,1]` (sends 0→2, 1→0, 2→1)                         |
| Permutation grp | `{"degree": n, "generators": [perm, perm, …]}`           | `{"degree":4,"generators":[[1,0,2,3],[0,2,3,1]]}`       |
| Graph           | `{"n": n, "edges": [[u,v,w], …], "weighted": bool}`      | `{"n":3,"edges":[[0,1,"5"],[1,2,"-2"]],"weighted":true}`|
| String (text)   | JSON string, UTF-8                                       | `"abracadabra"`                                         |
| Lattice basis   | matrix as `[[row], [row], …]` of strings (exact)         | `[["1","0","2"],["3","-1","0"]]`                        |
| Vector (exact)  | array of strings                                         | `["1","-3","7"]`                                        |
| Symbolic expr   | object `{"sympy": "<srepr-string>"}` (Risch only)        | `{"sympy":"Mul(Symbol('x'),exp(Symbol('x')))"}`         |
| Sentinel        | `{"sentinel": "no_elementary_antiderivative"}` etc.      | —                                                       |

## Polynomial conventions

- Exponent vector length equals the ring's variable count, in declared variable
  order. A constant term has exponent vector `[0,0,…,0]`.
- Coefficients are rational strings (`"a"` or `"a/b"`); integer coefficients
  drop the denominator.
- Zero polynomial encodes as `[]`, never `[[exp, "0"]]`.
- Sparse listing is canonical: at most one entry per exponent vector, ordered
  by the ring's monomial order (lex / degrevlex / grlex). The verifier
  re-canonicalises before comparison so candidate output need not be sorted.

## Graph conventions

- `edges` are undirected unless the schema says otherwise. `[u,v,w]` and
  `[v,u,w]` denote the same edge; the verifier deduplicates.
- Self-loops and parallel edges are rejected by default; per-problem schemas
  explicitly opt in if needed (Stoer-Wagner allows parallel edges with
  positive weights).
- Weights: float → JSON number, exact → string. Schema declares which.

## File layout

```
golden/
  inputs.json        # array of test cases, each {"id": "...", "input": <type>}
  expected.json      # array of {"id": "...", "expected": <type>}, optional
  verifier_protocol.md
  verify.py          # stdin: {"input": ..., "candidate": ...}
                     # stdout: {"pass": bool, "reason": str, "checks": {...}}
  generate.py        # seeded RNG; reproduces inputs.json + expected.json
```

`inputs.json` is a JSON array; element order is the canonical test order.
Each `id` is unique within the problem and stable across regenerations
(seeded RNG → identical IDs).

## Verifier I/O contract

```jsonc
// stdin
{
  "input":     <encoded per type>,
  "candidate": <encoded per type>,
  "id":        "<test id>"           // optional, for logging
}

// stdout
{
  "pass":   true,
  "reason": "all invariants hold",
  "checks": {
    "<invariant_name>": { "pass": true, "detail": "..." },
    ...
  }
}
```

- `pass` is the conjunction of every entry in `checks`.
- `reason` is human-readable; on failure, name the first failing check.
- `checks` is open-ended per problem; the protocol pins which keys must
  appear (e.g., FFT must include `parseval`, `roundtrip`, `naive_dft_match`).
- Verifier exits 0 on a well-formed run regardless of `pass`. Non-zero exit
  means the verifier itself crashed (bad JSON, missing dependency).

## Versioning

This document is `v1`. Any change requires bumping the version and writing a
migration note. `inputs.json` carries `"encoding_version": 1` at the top level
(wrap the test array in an object if needed, decided per-problem).
