# Problem 10 — Risch Algorithm (transcendental Liouvillian case)

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

Given a univariate integrand `f(x)` built from `ℚ(x)` and the
**transcendental** elementary functions `exp(·)` and `log(·)`, return
either an elementary antiderivative `F(x)` such that `F'(x) = f(x)`, or
`null` to claim that no elementary antiderivative exists.

The supported function class is exactly the one covered by Bronstein,
*Symbolic Integration I*, Ch. 5–6 — transcendental Liouvillian
extensions only. The verifier will not feed trigonometric, algebraic,
or special-function integrands.

## I/O contract (JSON)

### Input (one JSON object on stdin)

```jsonc
{
  "integrand": "<expression string>",
  "variable":  "x"
}
```

`integrand` is a sympy-parseable expression in `x` involving `+`, `-`,
`*`, `/`, `**`, integer / rational constants, and `exp`, `log`.

### Output (one JSON object on stdout)

```jsonc
{ "antiderivative": "<expression string>" }
{ "antiderivative": null }
```

The candidate's antiderivative, if non-null, must be a sympy-parseable
string whose derivative equals the integrand (under `simplify`).

## Suggested TypeScript signature

```ts
interface RischInput  { integrand: string; variable: string; }
interface RischOutput { antiderivative: string | null; }

function risch(input: RischInput): RischOutput;
```

You will need a symbolic algebra layer in TypeScript — either a port of
the Risch algorithm written in TS or a shell-out to a CAS. Both are
fair game. The output goes through `sympy.parsing.sympy_parser` in the
verifier, so your string must be syntactically clean (parseable) Python
arithmetic syntax.

## Verifying your solution

`golden/verify.py` checks three properties: `shape`,
`derivative_matches`, `existence_agrees`. Differentiation is the unique
correctness criterion: any antiderivative whose derivative simplifies
to the integrand passes, regardless of representation. See
`golden/verifier_protocol.md`.

### Files

- `golden/inputs.json` — every test case.
- `golden/expected.json` — reference outputs.
- `golden/verify.py` — verifier.

### Exact shell command

```
infra/verifiers/run_tests.sh problems/10-risch <your-cmd>
```

## Canonical phrasing (informational)

These short excerpts ground the algorithm. They are **informational,
not restrictive**.

> 1. *Definition of "elementary":*
>    "𝓕 (and any f ∈ 𝓕) is said to be elementary over 𝒟 iff
>    𝓕 = 𝒟(θ₁, …, θₙ) where each θᵢ satisfies at least one of the
>    following conditions: (1) θᵢ is algebraic over 𝒟(θ₁, …, θᵢ₋₁),
>    (2) θᵢ'/θᵢ = f' for some f ∈ 𝒟(θ₁, …, θᵢ₋₁) (the exponential
>    case), (3) f'/f = θᵢ' for some f ∈ 𝒟(θ₁, …, θᵢ₋₁) (the
>    logarithmic case)."
>    — `Risch_SolutionFiniteTerms_BullAMS_76_1970.pdf:p1`
> 2. *Liouville's theorem (form of any elementary antiderivative):*
>    "Let 𝓕 be a differential field with an algebraically closed constant
>    field K. Let f ∈ 𝓕 and g be elementary over 𝓕 with g' = f. Then
>    there are v₀, v₁, …, vₖ in 𝓕 and c₁, …, cₖ in K such that
>    f = v₀' + Σ cᵢ vᵢ'/vᵢ."
>    — `Risch_SolutionFiniteTerms_BullAMS_76_1970.pdf:p2`
> 3. *Recursive structure of the algorithm:*
>    "The algorithm proceeds by induction on the number of monomials used
>    in constructing a tower from K(z) to 𝓕."
>    — `Risch_SolutionFiniteTerms_BullAMS_76_1970.pdf:p2`
> 4. *Reduction step at each level:*
>    "Then the problem is reduced to studying an equation
>    f₁ = d₀' + Σ cᵢ dᵢ'/dᵢ where f₁ and the d's are in 𝒟."
>    — `Risch_SolutionFiniteTerms_BullAMS_76_1970.pdf:p2`
> 5. *Normal vs. special parts of the denominator in a monomial extension
>    (Bronstein's split that drives every reduction in §3):*
>    "let t be a monomial over K, we say that p ∈ K[t] is normal (with
>    respect to ') if gcd(p, p') = 1, and that p is special if
>    gcd(p, p') = p, i.e. p | p' in K[t]."
>    — `Bronstein_SymbolicIntegrationTutorial_ISSAC_1998.pdf:p22`
> 6. *Hermite reduction targets only the normal part:*
>    "The Hermite reductions we presented for rational and algebraic
>    functions work in exactly the same way [in] algebraic extensions of
>    monomial extensions of K, as long as we apply them only to the
>    normal part of the denominator of the integrand."
>    — `Bronstein_SymbolicIntegrationTutorial_ISSAC_1998.pdf:p22`
> 7. *Polynomial reduction (degree-of-polynomial-part bound):*
>    "In the transcendental case E = K(t) and when t is a monomial
>    satisfying degₜ(t') ≥ 2, then it is possible to reduce the degree of
>    the polynomial part of the integrand until it is smaller than
>    degₜ(t')."
>    — `Bronstein_SymbolicIntegrationTutorial_ISSAC_1998.pdf:p23`
> 8. *Risch differential equation:*
>    "The above problem is called a Risch differential equation over K.
>    Although solving it seems more complicated than solving g' = f, it
>    is actually simpler than an integration problem because we look for
>    the solutions vᵢ in K only rather than in an extension of K."
>    — `Bronstein_SymbolicIntegrationTutorial_ISSAC_1998.pdf:p28`

## What you must do

1. Conform to the JSON I/O contract above.
2. Run the verifier before declaring done:
   ```
   infra/verifiers/run_tests.sh problems/10-risch <your-cmd>
   ```
3. In your final answer, report the verifier's per-check totals
   (e.g. `derivative_matches 18/18, existence_agrees 18/18, …`).
4. Ship the implementation **you'd put your name on**.
