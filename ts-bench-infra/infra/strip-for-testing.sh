#!/usr/bin/env bash
# Phase-2 strip script: derive ts-bench-test/ from ts-bench-infra/ for
# distribution to Phase-3 test agents.
#
# Behaviour:
#   1. Copy the source tree to the destination, EXCLUDING
#      `problems/*/reference/` and `problems/*/sources/`.
#   2. Remove configurable forbidden tokens from prose files
#      (DESCRIPTION.md, PROMPT.md, verifier_protocol.md, REFERENCES.md)
#      by regex substitution. Tokens are reference-implementation
#      function / library names that would steer the agent toward the
#      reference impl that produced the golden master.
#   3. After the substitution, grep -rE for the forbidden tokens across
#      the prose files. If any survive, fail loudly with non-zero exit.
#
# Usage:
#   infra/strip-for-testing.sh <src-dir> <dest-dir> [--keep-existing]
#   infra/strip-for-testing.sh --self-test
#
# Examples:
#   infra/strip-for-testing.sh . ../ts-bench-test
#   infra/strip-for-testing.sh ./ts-bench-infra ./ts-bench-test
#
# Notes:
# - The script does NOT scrub source code (verify.py, generate.py). The
#   verifier is allowed to mention numpy/sympy/mpmath internally because
#   the user has explicitly said so: those are the verifier's compute
#   substrate, not steering hints in prose.
# - The forbidden-token list is below; edit `FORBIDDEN_TOKENS` to add or
#   remove patterns.

set -euo pipefail

# ── Forbidden tokens ─────────────────────────────────────────────────────────
# Each line is an extended-regex pattern that must NOT survive in any of:
#   problems/*/{DESCRIPTION,PROMPT,REFERENCES}.md
#   problems/*/golden/verifier_protocol.md
#
# Patterns are case-sensitive. Whitespace at the start of a line is
# significant only inside the patterns themselves.
FORBIDDEN_TOKENS=(
  # Reference function names from the original spec.
  'risch_integrate'
  'stoer_wagner'
  'max_weight_matching'
  'mpmath\.pslq'
  'numpy\.fft\.fft'
  'numpy\.fft\.ifft'
  'np\.fft'
  'pocketfft'
  'Matrix\.LLL'
  '\.lll\('
  'fpylll'
  'sympy\.discrete\.transforms\.ntt'
  'sympy_ntt'
  'sympy\.combinatorics\.PermutationGroup'
  'sympy\.integrals\.risch'
  'risch_integrate'
  '\.groebner\('
  'wolframscript'

  # Implementation-source pointers for the SAM problem.
  'KACTL'
  'jiangly'
  'CP-Algorithms'
)

# Files in scope for the scrub + grep:
PROSE_GLOBS=(
  'problems/*/DESCRIPTION.md'
  'problems/*/PROMPT.md'
  'problems/*/REFERENCES.md'
  'problems/*/golden/verifier_protocol.md'
)

# Dirs removed wholesale from the destination.
STRIP_DIRS=(
  'reference'
  'sources'
)


usage() {
  cat <<EOF >&2
usage: $0 <src-dir> <dest-dir> [--keep-existing]
       $0 --self-test
EOF
  exit 2
}


# ── Strip implementation ────────────────────────────────────────────────────

do_strip() {
  local src="$1"
  local dest="$2"
  local keep_existing="${3:-false}"

  if [[ ! -d "$src" ]]; then
    echo "error: source directory not found: $src" >&2
    exit 1
  fi
  if [[ -e "$dest" && "$keep_existing" != "true" ]]; then
    echo "error: destination already exists: $dest" >&2
    echo "  pass --keep-existing to overwrite into it" >&2
    exit 1
  fi

  mkdir -p "$dest"

  echo "[1/4] copying tree (excluding reference/ and sources/)"
  # rsync would be cleaner, but we want zero external deps.
  # Build exclude args for find.
  (cd "$src" && find . -type d \( -name reference -o -name sources \) -prune -o -type f -print) \
    | while read -r f; do
        # Drop leading "./"
        rel="${f#./}"
        # Skip the script itself if running from infra/.
        if [[ "$rel" == "infra/strip-for-testing.sh" ]]; then
          continue
        fi
        mkdir -p "$dest/$(dirname "$rel")"
        cp "$src/$rel" "$dest/$rel"
      done

  # Sanity: confirm reference/ and sources/ are absent.
  if find "$dest" -type d \( -name reference -o -name sources \) | grep -q .; then
    echo "error: stripped directories still present in destination" >&2
    find "$dest" -type d \( -name reference -o -name sources \)
    exit 1
  fi

  echo "[2/4] scrubbing forbidden tokens from prose"
  local glob f token n_before n_after
  for glob in "${PROSE_GLOBS[@]}"; do
    # shellcheck disable=SC2086
    for f in $(cd "$dest" && ls $glob 2>/dev/null || true); do
      f="$dest/$f"
      for token in "${FORBIDDEN_TOKENS[@]}"; do
        # Replace each match with [REDACTED].
        if grep -qE "$token" "$f" 2>/dev/null; then
          sed -E -i "s,$token,[REDACTED],g" "$f"
        fi
      done
    done
  done

  echo "[3/4] paranoia grep — failing if any forbidden token survives"
  local any_failure=0
  for token in "${FORBIDDEN_TOKENS[@]}"; do
    for glob in "${PROSE_GLOBS[@]}"; do
      # shellcheck disable=SC2086
      for f in $(cd "$dest" && ls $glob 2>/dev/null || true); do
        f="$dest/$f"
        if grep -nE "$token" "$f" 2>/dev/null; then
          echo "LEAK: $f contains forbidden token /$token/" >&2
          any_failure=1
        fi
      done
    done
  done

  if [[ $any_failure -ne 0 ]]; then
    echo "strip FAILED — forbidden tokens remain after scrub" >&2
    exit 1
  fi

  echo "[4/4] done — $dest is ready for distribution"
}


# ── Self-test ───────────────────────────────────────────────────────────────

do_self_test() {
  echo "self-test: building a dummy ts-bench-infra and running strip on it"

  local tmp
  tmp=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf \"$tmp\"" EXIT

  local src="$tmp/src"
  local dest="$tmp/dest"
  mkdir -p "$src/problems/99-dummy/reference"
  mkdir -p "$src/problems/99-dummy/sources"
  mkdir -p "$src/problems/99-dummy/golden"
  mkdir -p "$src/infra/verifiers"

  cat >"$src/problems/99-dummy/DESCRIPTION.md" <<'EOF'
# dummy problem
This file mentions risch_integrate and numpy.fft.fft to test scrubbing.
EOF
  cat >"$src/problems/99-dummy/PROMPT.md" <<'EOF'
# dummy prompt
Implement something. The reference uses stoer_wagner. KACTL is cited here too.
EOF
  cat >"$src/problems/99-dummy/REFERENCES.md" <<'EOF'
References. Internally we use mpmath.pslq and Matrix.LLL.
EOF
  cat >"$src/problems/99-dummy/golden/verifier_protocol.md" <<'EOF'
The verifier compares against max_weight_matching internally.
EOF
  cat >"$src/problems/99-dummy/reference/secret.py" <<'EOF'
# This whole file should disappear from the dest.
print("the reference uses jiangly's port")
EOF
  cat >"$src/problems/99-dummy/sources/paper.pdf" <<'EOF'
fake pdf
EOF
  cat >"$src/problems/99-dummy/golden/inputs.json" <<'EOF'
{"cases": []}
EOF
  cat >"$src/problems/99-dummy/golden/verify.py" <<'EOF'
# verify.py is shipped; allowed to mention numpy.fft internally.
import numpy as np
EOF
  cat >"$src/infra/verifiers/encoding.md" <<'EOF'
encoding doc
EOF

  # Run the strip.
  do_strip "$src" "$dest" "false"

  # Assertions.
  local ok=0
  echo "self-test: checking destination layout"
  [[ ! -d "$dest/problems/99-dummy/reference" ]] || { echo "FAIL: reference still present"; ok=1; }
  [[ ! -d "$dest/problems/99-dummy/sources"   ]] || { echo "FAIL: sources still present";   ok=1; }
  [[ -f "$dest/problems/99-dummy/DESCRIPTION.md" ]] || { echo "FAIL: DESCRIPTION missing"; ok=1; }
  [[ -f "$dest/problems/99-dummy/golden/inputs.json" ]] || { echo "FAIL: inputs.json missing"; ok=1; }
  [[ -f "$dest/problems/99-dummy/golden/verify.py" ]] || { echo "FAIL: verify.py missing"; ok=1; }
  [[ -f "$dest/infra/verifiers/encoding.md" ]] || { echo "FAIL: encoding.md missing"; ok=1; }

  echo "self-test: confirming forbidden tokens were scrubbed from prose"
  if grep -E 'risch_integrate|numpy\.fft\.fft|stoer_wagner|KACTL|mpmath\.pslq|Matrix\.LLL|max_weight_matching' \
        "$dest/problems/99-dummy/DESCRIPTION.md" \
        "$dest/problems/99-dummy/PROMPT.md" \
        "$dest/problems/99-dummy/REFERENCES.md" \
        "$dest/problems/99-dummy/golden/verifier_protocol.md" 2>/dev/null; then
    echo "FAIL: forbidden tokens leaked into prose"
    ok=1
  fi

  echo "self-test: confirming verify.py source code was NOT scrubbed"
  if ! grep -q 'numpy' "$dest/problems/99-dummy/golden/verify.py"; then
    echo "FAIL: verify.py was incorrectly scrubbed"
    ok=1
  fi

  if [[ $ok -eq 0 ]]; then
    echo "self-test: ALL CHECKS PASSED"
  else
    echo "self-test: FAILURES DETECTED"
    exit 1
  fi
}


# ── Main ────────────────────────────────────────────────────────────────────

if [[ $# -eq 0 ]]; then
  usage
fi

case "$1" in
  --self-test)
    do_self_test
    ;;
  -h|--help)
    usage
    ;;
  *)
    if [[ $# -lt 2 ]]; then usage; fi
    SRC="$1"; DEST="$2"; KEEP="false"
    if [[ "${3:-}" == "--keep-existing" ]]; then KEEP="true"; fi
    do_strip "$SRC" "$DEST" "$KEEP"
    ;;
esac
