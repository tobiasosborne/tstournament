# Problem 8 — Buchberger's Algorithm (Gröbner bases over ℚ[x₁,…,xₙ])

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

Given a finite set of polynomials `F = {f_1, …, f_m} ⊂ ℚ[x_1, …, x_n]`
and a monomial order, compute a **Gröbner basis** of `⟨F⟩` for that
order, using **Buchberger's algorithm** with:

- **Normal selection strategy** — at each step, pick the pair whose
  S-polynomial has the smallest leading monomial.
- **Buchberger's two criteria**:
  - *Criterion 1 (coprime LMs)* — skip if `gcd(LM(f_i), LM(f_j)) = 1`.
  - *Criterion 2 (chain criterion)* — skip `(f_i, f_j)` if some `f_k`
    has `LM(f_k) | lcm(LM(f_i), LM(f_j))` and `(f_i, f_k)`,
    `(f_k, f_j)` are already done.

Supported orders: `"lex"` and `"degrevlex"` (graded reverse lex). Both
order `x_1 > x_2 > … > x_n`.

## I/O contract (JSON)

### Input (one JSON object on stdin)

```jsonc
{
  "vars":         ["x", "y", "z"],
  "order":        "lex" | "degrevlex",
  "polynomials": [
    [[<exponent vector>, "<rational>"], ...],
    ...
  ]
}
```

A polynomial is a list of `[expvec, coeff]` pairs. `expvec` is a length-
`n` list of non-negative integers. `coeff` is a decimal-string rational
(`"3/4"`, `"-7"`, `"0"`). The zero polynomial is `[]`.

### Output (one JSON object on stdout)

```jsonc
{
  "groebner_basis": [
    [[<exponent vector>, "<rational>"], ...],
    ...
  ]
}
```

The basis ordering and individual-polynomial term ordering are both
unconstrained — the verifier rebuilds and compares ideals, not strings.

## Suggested TypeScript signature

```ts
type Coeff = string;          // decimal-string rational
type Term  = [number[], Coeff];   // [expvec, coeff]
type Poly  = Term[];

interface BuchbergerInput {
  vars:        string[];
  order:       "lex" | "degrevlex";
  polynomials: Poly[];
}

interface BuchbergerOutput { groebner_basis: Poly[]; }

function buchberger(input: BuchbergerInput): BuchbergerOutput;
```

You will need exact rational arithmetic over `ℚ`; `bigint` numerator /
denominator pairs are the natural representation, but anything that
preserves exactness will pass.

## Verifying your solution

`golden/verify.py` checks four properties: `shape`,
`input_in_candidate_ideal`, `candidate_in_input_ideal`, and
`groebner_basis_property`. The reduced Gröbner basis is **not required**
— any Gröbner basis of the same ideal in the same order is accepted.
See `golden/verifier_protocol.md`.

### Files

- `golden/inputs.json` — every test case.
- `golden/expected.json` — reference outputs (sympy's reduced GB,
  provided as one valid answer; not the only one).
- `golden/verify.py` — verifier.

### Exact shell command

```
infra/verifiers/run_tests.sh problems/08-buchberger <your-cmd>
```

## Canonical phrasing (informational)

These short excerpts ground definitions and conventions. They are
**informational, not restrictive**.

> 1. *Historical attribution (the thesis introduced the algorithm):*
>    "This is the English translation (by Michael P. Abramson) of the PhD
>    thesis of Bruno Buchberger, in which he introduced the algorithmic
>    theory of Gröbner bases."
>    — `Buchberger_Thesis_1965_English_JSC_2006.pdf:p1`
> 2. *Buchberger's Criterion (the canonical statement, from CLO Ch.2 §6
>    Theorem 6):*
>    "Theorem 6 (Buchberger's Criterion). Let I be a polynomial ideal.
>    Then a basis G = {g₁, …, gₜ} of I is a Gröbner basis of I if and
>    only if for all pairs i ≠ j, the remainder on division of S(gᵢ, gⱼ)
>    by G (listed in some order) is zero."
>    — `Cox_Little_OShea_IdealsVarietiesAlgorithms_4ed_Springer_2015.pdf:p85`
> 3. *Criterion 1 — coprime leading monomials (CLO Ch.2 §10 Proposition 1
>    = the first refinement of Buchberger's algorithm):*
>    "Proposition 1. Given a finite set G ⊆ k[x₁, …, xₙ], suppose that we
>    have f, g ∈ G such that lcm(LM(f), LM(g)) = LM(f) · LM(g). This
>    means that the leading monomials of f and g are relatively prime.
>    Then S(f, g) →_G 0."
>    — `Cox_Little_OShea_IdealsVarietiesAlgorithms_4ed_Springer_2015.pdf:p109`
> 4. *Why Criterion 1 lets the algorithm skip pairs:*
>    "Proposition 1 gives a more efficient version of Theorem 3 of §9: to
>    test for a Gröbner basis, we need only have S(gᵢ, gⱼ) →_G 0 for
>    those i < j where LM(gᵢ) and LM(gⱼ) are not relatively prime."
>    — `Cox_Little_OShea_IdealsVarietiesAlgorithms_4ed_Springer_2015.pdf:p109`
> 5. *Refined / syzygy-based criterion (CLO Ch.2 §10 Theorem 6 — the
>    basis for the chain / LCM-elimination criterion):*
>    "Theorem 6. A basis G = (g₁, …, gₜ) for an ideal I is a Gröbner
>    basis if and only if for every element S = (H₁, …, Hₜ) in a
>    homogeneous basis for the syzygies S(G), S · G = Σᵢ Hᵢgᵢ can be
>    written S · G = Σᵢ Aᵢgᵢ, where the multidegree α of S satisfies
>    α > multideg(Aᵢgᵢ) whenever Aᵢgᵢ ≠ 0."
>    — `Cox_Little_OShea_IdealsVarietiesAlgorithms_4ed_Springer_2015.pdf:p111`

## What you must do

1. Conform to the JSON I/O contract above.
2. Run the verifier before declaring done:
   ```
   infra/verifiers/run_tests.sh problems/08-buchberger <your-cmd>
   ```
3. In your final answer, report the verifier's per-check totals
   (e.g. `groebner_basis_property 18/18, …`).
4. Ship the implementation **you'd put your name on**.
