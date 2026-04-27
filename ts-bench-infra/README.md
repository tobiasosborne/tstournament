# ts-bench-infra

Infrastructure repo for the TS-Benchmark: eleven algorithm-implementation
problems whose obscurity rises monotonically, used to test how well
Claude implements sophisticated algorithms in TypeScript when no public
TS implementation exists for most of them.

This is the **Phase-1** repository. Phase-2 derives a stripped
distribution (`ts-bench-test/`) from this one via
`infra/strip-for-testing.sh`. Phase-3 hands `ts-bench-test/` to test
agents.

## Layout

```
ts-bench-infra/
├── README.md                       (this file)
├── problems/
│   ├── 01-fft/                     each problem dir contains:
│   │   ├── DESCRIPTION.md            problem statement, signature, invariants
│   │   ├── REFERENCES.md             citations + load-bearing-section sentence
│   │   ├── PROMPT.md                 the exact prompt the test agent receives
│   │   ├── reference/                canonical impl (STRIPPED before ship)
│   │   ├── sources/                  PDFs (STRIPPED before ship)
│   │   └── golden/
│   │       ├── inputs.json           seeded test cases
│   │       ├── expected.json         reference outputs
│   │       ├── verifier_protocol.md  plain-language description of checks
│   │       ├── verify.py             language-neutral JSON-I/O verifier
│   │       └── generate.py           seeded RNG; reproduces inputs/expected
│   ├── 02-ntt/   …
│   ├── 10-risch/
│   └── 11-shewchuk-predicates/   (canonical-oracle ground truth via
│                                  ctypes-wrapped predicates.c)
├── infra/
│   ├── playwright/                 PDF fetcher harness for sources/
│   ├── verifiers/
│   │   ├── encoding.md             unified JSON encoding for every type
│   │   └── run_tests.sh            generic runner (problem-agnostic)
│   └── strip-for-testing.sh        Phase-2 strip script
└── scripts/
    └── run_reference_against_golden.py   sanity-check the reference impls
```

## Problem table

| #  | Problem                                          | Status       |
|----|--------------------------------------------------|--------------|
| 1  | Iterative radix-2 Cooley-Tukey FFT               | green 39/39  |
| 2  | NTT (arbitrary length, Bluestein, Montgomery)    | green 64/64  |
| 3  | Online suffix automaton (Blumer et al. 1985)     | green 43/43  |
| 4  | Schreier-Sims with Sims' filter                  | green 22/22  |
| 5  | LLL lattice reduction (exact rationals, δ=3/4)   | green 22/22  |
| 6  | Stoer-Wagner global minimum cut                  | green 21/21  |
| 7  | Edmonds' blossom (max-weight, general graphs)    | green 23/23  |
| 8  | Buchberger's algorithm (Gröbner bases over ℚ)    | green 18/18  |
| 9  | PSLQ integer relation detection                  | green 14/14  |
| 10 | Risch (transcendental Liouvillian, Bronstein 5–6)| green 18/18  |
| 11 | Shewchuk's adaptive-precision geometric predicates | adversarial 27 cases / ~860k queries; canonical oracle |

Re-run any problem's full pipeline with:

```
infra/verifiers/run_tests.sh problems/NN-name python3 problems/NN-name/reference/<ref>.py
```

## Working philosophy

- **Golden masters are language-agnostic.** Inputs and expected outputs
  are JSON; verifiers consume `{input, candidate}` JSON on stdin and
  emit `{pass, reason, checks}` on stdout. The test agent's TS code only
  ever produces JSON and shells out to `verify.py`.
- **Verifiers test mathematical invariants, not just I/O equality.** For
  every problem, the verifier checks the algorithm's defining properties
  (size-reduction + Lovász for LLL; Parseval + naive DFT match for FFT;
  Buchberger criterion for Gröbner; etc.) so multiple correct
  representations all pass.
- **Solution method is unconstrained.** `PROMPT.md` has no
  "do-not-consult" gate — the test agent is free to use libraries,
  search, or port from another language. The benchmark observes *how*
  Claude solves obscure problems, not whether it implements them from
  scratch. Only the identity of the reference implementation that
  produced the golden master is hidden from the test repo.
- **Reference impls live in `reference/` only.** They are stripped from
  the test repo wholesale. Their function / library identifiers do not
  appear in any prose file shipped to the test agent (`DESCRIPTION.md`,
  `PROMPT.md`, `REFERENCES.md`, `verifier_protocol.md`); the strip
  script's paranoia grep enforces this.
- **Every random RNG seed is pinned in `generate.py`.** Re-running
  `generate.py` produces byte-identical `inputs.json` / `expected.json`.

## Sources (PDFs)

Sources are not auto-included in this repo. Run

```
cd infra/playwright
npm install
npx playwright install chromium
node fetch.mjs            # all problems
```

with the TIB Hannover VPN active to populate `problems/*/sources/`.
The harness needs one manual Cloudflare click per publisher; thereafter
the persistent Chromium profile remembers credentials. See
`infra/playwright/README.md`.

After sources are fetched, the verbatim "string-match block" in each
`PROMPT.md` (currently a clearly-flagged DRAFT placeholder) should be
filled in with one-sentence excerpts from the local PDFs, each followed
by `<file>:p<page>`.

## Producing the test distribution (Phase 2)

```
infra/strip-for-testing.sh . ../ts-bench-test
```

This:
1. Copies the tree, excluding `problems/*/reference/` and `problems/*/sources/`.
2. Scrubs reference-impl function / library names from
   `DESCRIPTION.md`, `PROMPT.md`, `REFERENCES.md`, and
   `golden/verifier_protocol.md`.
3. Greps for forbidden tokens in the result and fails loudly if any
   survive.

Self-test of the strip script:

```
infra/strip-for-testing.sh --self-test
```
