#!/usr/bin/env bash
# reference-candidate.sh — invoke the in-tree scientist-workbench
# `tools/meijer-g` as the candidate solution for problem 13.
#
# This is a *reference* candidate: it is the canonical implementation
# the trial agents are competing against, NOT a model trial submission.
# A model trial submission lives at, e.g.,
# `tstournament/test-13-pure-ts/solution.ts` and re-implements the
# Meijer G-function from papers per the no-direct-porting clause in
# `PROMPT.md`.
#
# This shell wrapper exists so:
#   1. The verifier's wiring can be self-tested end-to-end against a
#      known-correct candidate.  Expected outcome: ~all 91 cases green
#      with the per-tier counts documented in `WORKLOG-13.md`
#      (hv0.11 reported them; this verifier reproduces them).
#   2. Trial agents can read this file to understand the candidate
#      stdin/stdout contract concretely.
#
# Invocation (from the tstournament repo root):
#   bash ts-bench-infra/infra/verifiers/run_tests.sh \
#       ts-bench-infra/problems/13-meijer-g \
#       bash ts-bench-infra/problems/13-meijer-g/golden/reference-candidate.sh
#
# Reads one JSON object on stdin (the input field of one case from
# `golden/inputs.json`); writes one JSON object on stdout (matching
# the candidate output shape documented in `golden/PROMPT-CANDIDATE.md`).
#
# Uses the workbench's `bench/meijer-g/run-candidate.ts` adapter
# directly: same wire format, same in-process invocation via
# `executeToolDef`.  Requires `bun` on $PATH (the workbench's standard
# runtime).

set -euo pipefail

WORKBENCH_ROOT="${SCIWB_ROOT:-/home/tobias/Projects/scientist-workbench}"
CANDIDATE_TS="${WORKBENCH_ROOT}/bench/meijer-g/run-candidate.ts"

if [[ ! -f "$CANDIDATE_TS" ]]; then
  echo "reference-candidate.sh: cannot find scientist-workbench at" >&2
  echo "  ${CANDIDATE_TS}" >&2
  echo "Set \$SCIWB_ROOT to the scientist-workbench checkout." >&2
  exit 2
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "reference-candidate.sh: 'bun' not on \$PATH." >&2
  echo "Install bun (https://bun.sh) or extend PATH (e.g. PATH=\$HOME/.amp/bin:\$PATH)." >&2
  exit 2
fi

exec bun "$CANDIDATE_TS"
