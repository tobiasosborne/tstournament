"""FFT verifier — language-neutral.

stdin:
  {"input": {"n", "direction", "x"}, "candidate": [[re, im], ...], "id"?: str}

stdout:
  {"pass": bool, "reason": str, "checks": {...}}

Exit 0 always on a well-formed run; non-zero exit means the verifier itself
crashed (bad JSON, missing dependency).

Invariants checked:
  1. shape       — candidate length equals n
  2. equality    — candidate matches numpy.fft reference componentwise
  3. parseval    — energy identity holds
  4. naive_dft   — for n ≤ 64, candidate matches the literal O(n²) sum
"""

from __future__ import annotations

import json
import math
import sys
import traceback
from typing import Any

import numpy as np

ATOL_EQ = 1e-9
RTOL_EQ = 1e-10
NAIVE_LIMIT = 64
PARSEVAL_RTOL = 1e-9
PARSEVAL_ATOL = 1e-7


def _to_complex_array(pairs: list[list[float]]) -> np.ndarray:
    return np.asarray(
        [complex(re, im) for re, im in pairs],
        dtype=np.complex128,
    )


def _close(a: np.ndarray, b: np.ndarray) -> tuple[bool, float]:
    if a.shape != b.shape:
        return False, float("inf")
    if a.size == 0:
        return True, 0.0
    err = np.abs(a - b)
    tol = ATOL_EQ + RTOL_EQ * np.abs(b)
    return bool(np.all(err <= tol)), float(np.max(err))


def _naive_dft(x: np.ndarray, direction: str) -> np.ndarray:
    n = x.shape[0]
    if n == 0:
        return x.copy()
    j = np.arange(n).reshape(-1, 1)
    k = np.arange(n).reshape(1, -1)
    sign = -1.0 if direction == "forward" else +1.0
    W = np.exp(sign * 2j * math.pi * j * k / n)
    out = W @ x
    if direction == "inverse":
        out = out / n
    return out


def verify(payload: dict[str, Any]) -> dict[str, Any]:
    inp = payload["input"]
    candidate = payload["candidate"]
    n = int(inp["n"])
    direction = inp["direction"]
    if direction not in ("forward", "inverse"):
        return {
            "pass": False,
            "reason": f"unknown direction {direction!r}",
            "checks": {},
        }

    x = _to_complex_array(inp["x"])
    if x.shape[0] != n:
        return {
            "pass": False,
            "reason": f"input length mismatch: declared n={n}, got {x.shape[0]}",
            "checks": {},
        }

    checks: dict[str, dict[str, Any]] = {}

    # ── shape ───────────────────────────────────────────────────────────────
    if not isinstance(candidate, list) or any(
        not isinstance(e, list) or len(e) != 2 for e in candidate
    ):
        return {
            "pass": False,
            "reason": "candidate must be a list of [re, im] pairs",
            "checks": {"shape": {"pass": False, "detail": "malformed"}},
        }
    if len(candidate) != n:
        return {
            "pass": False,
            "reason": f"candidate length {len(candidate)} ≠ n={n}",
            "checks": {"shape": {"pass": False, "detail": "wrong length"}},
        }
    cand = _to_complex_array(candidate)
    checks["shape"] = {"pass": True, "detail": f"length {n}"}

    # ── equality vs numpy ───────────────────────────────────────────────────
    ref = np.fft.fft(x) if direction == "forward" else np.fft.ifft(x)
    eq_pass, eq_err = _close(cand, ref)
    checks["equality"] = {
        "pass": eq_pass,
        "detail": f"max abs err {eq_err:.3e} (atol={ATOL_EQ}, rtol={RTOL_EQ})",
    }

    # ── Parseval ────────────────────────────────────────────────────────────
    norm_x_sq = float(np.sum(np.abs(x) ** 2))
    norm_c_sq = float(np.sum(np.abs(cand) ** 2))
    if direction == "forward":
        # ||x||^2  ≈ (1/n) · ||X||^2
        lhs, rhs = norm_x_sq, norm_c_sq / max(n, 1)
    else:
        # n · ||x_inv||^2 ≈ ||X||^2
        lhs, rhs = n * norm_c_sq, norm_x_sq
    parseval_err = abs(lhs - rhs)
    parseval_tol = PARSEVAL_ATOL + PARSEVAL_RTOL * max(1.0, abs(rhs), abs(lhs))
    checks["parseval"] = {
        "pass": parseval_err <= parseval_tol,
        "detail": (
            f"|lhs − rhs| = {parseval_err:.3e}, tol = {parseval_tol:.3e}, "
            f"lhs={lhs:.6e}, rhs={rhs:.6e}"
        ),
    }

    # ── naive O(n²) DFT match for small n ───────────────────────────────────
    if n <= NAIVE_LIMIT:
        naive = _naive_dft(x, direction)
        naive_pass, naive_err = _close(cand, naive)
        checks["naive_dft"] = {
            "pass": naive_pass,
            "detail": f"max abs err vs naive O(n²) DFT: {naive_err:.3e}",
        }
    else:
        checks["naive_dft"] = {
            "pass": True,
            "detail": f"skipped (n={n} > {NAIVE_LIMIT})",
        }

    overall = all(c["pass"] for c in checks.values())
    if overall:
        reason = "all invariants hold"
    else:
        first_fail = next(k for k, v in checks.items() if not v["pass"])
        reason = f"failed: {first_fail} — {checks[first_fail]['detail']}"

    return {"pass": overall, "reason": reason, "checks": checks}


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        result = verify(payload)
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(traceback.format_exc())
        sys.stderr.write("\n")
        result = {
            "pass": False,
            "reason": f"verifier crashed: {type(e).__name__}: {e}",
            "checks": {},
        }
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
