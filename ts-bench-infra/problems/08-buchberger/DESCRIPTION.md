# Problem 8 — Buchberger's Algorithm (Gröbner bases over ℚ[x₁,…,xₙ])

## What to implement

Given a finite set of polynomials `F = {f_1, …, f_m} ⊂ ℚ[x_1, …, x_n]` and
a monomial order, compute a **Gröbner basis** of the ideal `⟨F⟩` with
respect to that order. The construction algorithm is **Buchberger's
algorithm** with:

- **Normal selection strategy** — at each iteration, pick the pair
  `(f_i, f_j)` whose S-polynomial has the smallest leading monomial.
- **Buchberger's two criteria** for pruning:
  - *Criterion 1 (coprime LMs):* skip the pair if `gcd(LM(f_i), LM(f_j)) = 1`.
  - *Criterion 2 (chain criterion):* skip the pair `(f_i, f_j)` if there
    is a `k` with `LM(f_k) | lcm(LM(f_i), LM(f_j))` and the pairs
    `(f_i, f_k)`, `(f_k, f_j)` have already been processed.

The returned basis must be a Gröbner basis of `⟨F⟩` for the requested
order. Reduced form is **not** required (the verifier accepts any
Gröbner basis of the right ideal); however, an idiomatic, polished
implementation will return the unique reduced Gröbner basis.

## Supported monomial orders

- `"lex"` — pure lexicographic, with `x_1 > x_2 > … > x_n`.
- `"degrevlex"` — degree-reverse-lexicographic, the standard default for
  fast computation, with `x_1 > x_2 > … > x_n` for tie-breaking.

## Field of coefficients

All coefficients live in `ℚ`. They are exchanged as decimal-string
rationals using the `"num/den"` shorthand (e.g. `"3/4"`, `"-7"`).

## I/O contract (JSON)

### Input

```jsonc
{
  "vars":         ["x", "y", "z"],
  "order":        "lex" | "degrevlex",
  "polynomials": [
    [[<exponent vector>, "<rational>"], …],   // sparse representation
    …
  ]
}
```

A polynomial is `[[expvec, coeff], …]` where `expvec` is a list of
non-negative integer exponents whose length equals `len(vars)`, in the
declared variable order. The coefficient is a decimal rational string in
canonical form (no leading `+`, no whitespace, denominator stripped if
`±1`). The zero polynomial encodes as `[]`.

### Output

```jsonc
{
  "groebner_basis": [
    [[<exponent vector>, "<rational>"], …],
    …
  ]
}
```

Same encoding. Order of polynomials in the output list is unconstrained;
the verifier sorts as needed.

## Invariants the verifier checks

1. **Shape.** All exponent vectors length-`n`, non-negative integers.
   All coefficients parseable as `ℚ`. No empty zero-coefficient entries.
2. **Ideal containment (input → candidate).** Every input polynomial
   lies in `⟨candidate⟩`.
3. **Ideal containment (candidate → input).** Every candidate polynomial
   lies in `⟨input⟩`. Together with check 2, `⟨candidate⟩ = ⟨input⟩`.
4. **Gröbner basis property.** Every S-polynomial `S(g_i, g_j)` for
   `g_i, g_j` in `candidate` reduces to `0` modulo `candidate`.

If all four hold, `candidate` is a Gröbner basis of `⟨input⟩` for the
requested order.

## Edge cases the test set covers

- Single non-zero generator (already a Gröbner basis).
- Already-reduced bases (idempotent).
- The classical `(x² + y, xy + 1)` example (lex order).
- 3-variable systems including the cyclic-3 system.
- Monomial ideals (LM-only).
- A system whose Gröbner basis has size strictly larger than the input
  (cloning required).
- Both `lex` and `degrevlex` exercised.
- Random low-degree systems at `(n_vars, m_polys) ∈ {(2, 3), (3, 3),
  (3, 4)}` with degrees ≤ 3 and small rational coefficients.

## What the agent does *not* implement

- No F4 or F5 algorithm (linear-algebra-based GB; out of scope).
- No graded reverse lex with shifted weights, no general weight orders.
- No coefficient fields beyond `ℚ` (no `𝔽_p`, no algebraic extensions).
- No syzygy module computation.
- No ideal-theoretic operations beyond a basis of the input ideal
  (no intersection, quotient, saturation, elimination beyond what `lex`
  naturally gives).
