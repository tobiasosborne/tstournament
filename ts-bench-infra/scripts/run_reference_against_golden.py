"""Drive a problem's reference implementation through its own golden master,
case by case, and report whether every verifier check is green.

Usage:
  python3 scripts/run_reference_against_golden.py problems/01-fft

The script:
  1. Reads <problem>/golden/inputs.json.
  2. For every case, runs <problem>/reference/<*.py> on the input via
     subprocess (stdin → stdout JSON).
  3. Pipes (input, candidate) into <problem>/golden/verify.py.
  4. Asserts every case is `pass: true`. Prints a per-check summary.

Exits non-zero on the first failing case (with full payload printed).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path


def find_reference(problem_dir: Path) -> Path:
    refs = sorted((problem_dir / "reference").glob("*.py"))
    if not refs:
        raise SystemExit(f"no reference/*.py found in {problem_dir}")
    if len(refs) > 1:
        # Allow a `_main.py` convention if multiple files exist.
        main = problem_dir / "reference" / "_main.py"
        if main.exists():
            return main
        raise SystemExit(
            f"multiple reference scripts in {problem_dir / 'reference'}: "
            f"{[r.name for r in refs]}; designate one as _main.py"
        )
    return refs[0]


def run_json(cmd: list[str], stdin_obj) -> dict | list:
    proc = subprocess.run(
        cmd,
        input=json.dumps(stdin_obj),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise SystemExit(
            f"command {cmd!r} exited {proc.returncode}\n"
            f"stderr:\n{proc.stderr}"
        )
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        raise SystemExit(
            f"command {cmd!r} did not emit JSON: {e}\n"
            f"stdout:\n{proc.stdout}"
        ) from e


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("problem", type=Path, help="path like problems/01-fft")
    ap.add_argument(
        "--limit", type=int, default=None,
        help="only run the first N cases (for fast smoke-testing)",
    )
    args = ap.parse_args()

    problem_dir: Path = args.problem.resolve()
    inputs_path = problem_dir / "golden" / "inputs.json"
    verify_path = problem_dir / "golden" / "verify.py"
    ref_path = find_reference(problem_dir)

    inputs_payload = json.loads(inputs_path.read_text())
    cases = inputs_payload["cases"]
    if args.limit is not None:
        cases = cases[: args.limit]

    print(
        f"running {len(cases)} cases from {inputs_path.relative_to(problem_dir.parent)}"
        f" through {ref_path.relative_to(problem_dir.parent)}"
        f" via {verify_path.relative_to(problem_dir.parent)}"
    )

    check_counts: Counter[str] = Counter()
    check_pass:   Counter[str] = Counter()
    failures: list[dict] = []

    for case in cases:
        case_id = case["id"]
        candidate = run_json(["python3", str(ref_path)], case["input"])
        result = run_json(
            ["python3", str(verify_path)],
            {"input": case["input"], "candidate": candidate, "id": case_id},
        )

        for name, c in result.get("checks", {}).items():
            check_counts[name] += 1
            if c.get("pass"):
                check_pass[name] += 1

        if not result.get("pass"):
            failures.append({"id": case_id, "result": result})
            print(f"  FAIL  {case_id}: {result.get('reason')}")
            for cname, cres in result.get("checks", {}).items():
                mark = "✓" if cres.get("pass") else "✗"
                print(f"        {mark} {cname}: {cres.get('detail')}")
        else:
            print(f"  pass  {case_id}")

    print()
    print("Per-check summary:")
    for name in sorted(check_counts):
        print(f"  {name:>12}  {check_pass[name]:>4}/{check_counts[name]:<4}")
    print()
    if failures:
        print(f"{len(failures)} / {len(cases)} cases FAILED")
        sys.exit(1)
    print(f"all {len(cases)} cases green")


if __name__ == "__main__":
    main()
