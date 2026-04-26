# Problem 5 — LLL lattice reduction (exact rationals, δ = 3/4)

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

Given a basis `B = (b_1, …, b_n)` of a `ℤ`-lattice in `ℤ^d`, return an
**LLL-reduced basis** `B′` of the same lattice with parameter `δ = 3/4`.
Arithmetic must be **exact rational / integer** — no floating point in
the inner loop.

A basis with Gram-Schmidt vectors `(b*_1, …, b*_n)` and coefficients

```
μ_{i,j}  =  ⟨b_i, b*_j⟩ / ⟨b*_j, b*_j⟩
```

is **LLL-reduced** for `δ` iff:

- **Size-reduction:**     `|μ_{i,j}| ≤ ½` for all `j < i`.
- **Lovász condition:**   `‖b*_i‖² ≥ (δ − μ_{i,i−1}²) · ‖b*_{i−1}‖²`
  for all `i ≥ 2`.

Both must hold **exactly** in `ℚ`.

## I/O contract (JSON)

### Input (one JSON object on stdin)

```jsonc
{
  "n":     <int, ≥ 1>,
  "d":     <int, ≥ n>,
  "basis": [["<int>", "<int>", …], …],   // n rows, d columns, decimal-string ints
  "delta": {"num": "3", "den": "4"}      // pinned; expect 3/4 in every test
}
```

Basis vectors are **rows**; entries are signed decimal-string integers.

### Output (one JSON object on stdout)

```jsonc
{
  "reduced_basis": [["<int>", "<int>", …], …]   // n rows, d columns, decimal-string ints
}
```

The reduced basis is integer-valued (LLL on an integer basis stays
integer).

## Suggested TypeScript signature

```ts
interface LLLInput {
  n:     number;
  d:     number;
  basis: string[][];
  delta: { num: string; den: string };
}

interface LLLOutput { reduced_basis: string[][]; }

function lll(input: LLLInput): LLLOutput;
```

`bigint` is the natural fit for entries; rationals for the Gram-Schmidt
coefficients. The shape of your internal API is up to you.

## Verifying your solution

`golden/verify.py` reads `{"input": ..., "candidate": ..., "id": ...}` on
stdin and emits five checks:

```jsonc
{
  "pass":   true,
  "reason": "all invariants hold",
  "checks": {
    "shape":          {"pass": true, "detail": "..."},
    "same_lattice":   {"pass": true, "detail": "..."},
    "size_reduction": {"pass": true, "detail": "..."},
    "lovasz":         {"pass": true, "detail": "..."},
    "det_preserved":  {"pass": true, "detail": "..."}
  }
}
```

The verifier works directly from the LLL definition with exact rational
arithmetic; any basis satisfying the four mathematical conditions over
the same lattice is accepted. Multiple LLL-reduced bases exist for a
given lattice — you do not need to match the reference's exact output.
See `golden/verifier_protocol.md`.

### Files

- `golden/inputs.json` — every test case.
- `golden/expected.json` — reference outputs (provided; not required).
- `golden/verify.py` — verifier.

### Exact shell command

```
infra/verifiers/run_tests.sh problems/05-lll <your-cmd>
```

## Canonical phrasing (informational)

These short excerpts ground definitions and conventions. They are
**informational, not restrictive**.

> 1. *Definition of "reduced basis" — size-reduction (1.4) and Lovász
>    condition (1.5):*
>    "we call a basis b₁, b₂, …, bₙ for a lattice L reduced if
>    (1.4) |μᵢⱼ| ≤ ½  for  1 ≤ j < i ≤ n
>    and
>    (1.5) |b*ᵢ + μᵢ,ᵢ₋₁ b*ᵢ₋₁|² ≥ ¾ |b*ᵢ₋₁|²  for  1 < i ≤ n,"
>    — `Lenstra_Lenstra_Lovasz_FactoringPolys_MathAnn_261_1982.pdf:p2`
> 2. *The δ parameter is configurable on (¼, 1):*
>    "The constant ¾ in (1.5) is arbitrarily chosen, and may be replaced
>    by any fixed real number y with ¼ < y < 1."
>    — `Lenstra_Lenstra_Lovasz_FactoringPolys_MathAnn_261_1982.pdf:p3`
> 3. *Polynomial run-time bound:*
>    "Let L ⊂ ℤⁿ be a lattice with basis b₁, b₂, …, bₙ, and let B ∈ ℝ,
>    B > 2, be such that |bᵢ|² ≤ B for 1 ≤ i ≤ n. Then the number of
>    arithmetic operations needed by the basis reduction algorithm …
>    is O(n⁴ log B), and the integers on which these operations are
>    performed each have binary length O(n log B)."
>    — `Lenstra_Lenstra_Lovasz_FactoringPolys_MathAnn_261_1982.pdf:p7`

## What you must do

1. Conform to the JSON I/O contract above. Read from stdin, write to
   stdout.
2. Run the verifier before declaring done:
   ```
   infra/verifiers/run_tests.sh problems/05-lll <your-cmd>
   ```
3. In your final answer, report the verifier's per-check totals
   (e.g. `same_lattice 22/22, size_reduction 22/22, lovasz 22/22, …`).
4. Ship the implementation **you'd put your name on**, not the first
   thing that passes.
