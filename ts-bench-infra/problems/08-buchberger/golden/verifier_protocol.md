# Verifier protocol — Problem 8, Buchberger

`verify.py` uses sympy internally for ideal-membership tests and S-pair
reduction; the spec checked is purely the **definition** of a Gröbner
basis, so any candidate that satisfies the four properties below is
accepted regardless of the algorithm that produced it.

## Invocation

```
cat <case>.json | python3 verify.py
```

stdin shape:

```jsonc
{
  "input":     {"vars": [...], "order": "lex|degrevlex",
                "polynomials": [[[expvec, "coeff"], ...], ...]},
  "candidate": {"groebner_basis": [...]},
  "id":        "<case id>"
}
```

stdout:

```jsonc
{
  "pass":   true,
  "reason": "all invariants hold",
  "checks": {
    "shape":                    {"pass": ..., "detail": "..."},
    "input_in_candidate_ideal": {"pass": ..., "detail": "..."},
    "candidate_in_input_ideal": {"pass": ..., "detail": "..."},
    "groebner_basis_property":  {"pass": ..., "detail": "..."}
  }
}
```

## The four checks

### 1. `shape`

Each polynomial is a list of `[expvec, coeff_string]` pairs; every
`expvec` has length `len(vars)` with non-negative-integer entries; every
`coeff_string` parses as a rational. Zero coefficients are silently
dropped.

### 2. `input_in_candidate_ideal`

For every input polynomial `f`, `f ∈ ⟨candidate⟩`. Tested by computing
the reduced Gröbner basis of `candidate` and asking it to test
`contains(f)`.

### 3. `candidate_in_input_ideal`

For every candidate polynomial `g`, `g ∈ ⟨input⟩`. Symmetrically,
tested via the reduced Gröbner basis of `input`.

Together with check 2, `⟨candidate⟩ = ⟨input⟩`.

### 4. `groebner_basis_property`

For every pair `(g_i, g_j)` of distinct candidate polynomials, the
S-polynomial

```
S(g_i, g_j)  =  (LCM(LM(g_i), LM(g_j)) / LT(g_i)) · g_i
              − (LCM(LM(g_i), LM(g_j)) / LT(g_j)) · g_j
```

reduces to `0` modulo the candidate. This is the textbook Buchberger
criterion; if it holds, the candidate is a Gröbner basis of its own
ideal in the requested order.

## What is *not* checked

- The candidate is **not required** to be the reduced Gröbner basis.
  Multiple Gröbner bases of the same ideal in the same order all pass.
- The internal algorithm (Buchberger, F4, F5, …) is invisible to the
  verifier; only the output ideal and Gröbner basis property matter.
- Selection strategy and the two pruning criteria are spec, not check.
