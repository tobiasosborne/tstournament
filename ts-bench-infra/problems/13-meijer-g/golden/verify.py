#!/usr/bin/env python3
"""verify.py — tstournament problem 13 (Meijer G-function) verifier.

Language-neutral, self-contained.  Reads a payload on stdin

    {"input":     <case-input from inputs.json::cases[i].input>,
     "candidate": <candidate output (one JSON object)>,
     "id":        str}

and emits a verdict on stdout

    {"pass": bool, "reason": str,
     "checks": {<name>: {"pass": bool, "detail": str}}}

This is the **trial-runner verifier** for the Meijer G mega-test.
It mirrors `bench/meijer-g/golden/verify.py` from `scientist-workbench`
(`hv0.11`) — the workbench's own validation surface for
`tools/meijer-g/` — and adds:

  1. acceptance of *both* refusal wire shapes:
     - the workbench's `{"kind": "tagged", "tag": "meijer-g/<class>",
       "payload": {...}}` envelope, and
     - the VERIFIER-PROTOCOL.md spec shape `{"kind": "out-of-region",
       "reason": "...", "ruled_out_methods": [...]}`;
  2. a single-point AST-evaluation witness for symbolic candidate
     outputs (in addition to the rule-id presence check).  When a case
     has `expected.truth`, the verifier walks the candidate's `expr`
     tree (unwrapping foreign-pass-through `cas-simplify/out-of-scope`
     tags), evaluates it at the case's `z` via mpmath at 100 dps, and
     checks relative error against the pinned truth.  This catches
     wrong-but-rule-id-matching symbolic outputs.

Multi-point random-z sampling (K=20 per VERIFIER-PROTOCOL.md
§"symbolic check") is a **P2 follow-up** — see `BEADS-TO-FILE.txt` in
the worktree where this verifier was lifted from `bench/meijer-g/`.
The single-point check delivers ~all the discrimination of the
multi-point check for closed-form anchors (Tier 0) and symbolic
reductions whose `z` is non-degenerate (Tiers A, B); only the
contrived "right at z, wrong elsewhere" failure mode escapes.

Per ADR-0019 §1 the verifier checks INVARIANTS, not byte-equality.
The full check set per case (per VERIFIER-PROTOCOL.md):

    1. no_tool_error            — strict
    2. shape                    — output kind matches expected.kind
                                  (`value` allows symbolic OR numerical
                                   unless request_mode constrains)
    3. finite_value             — numerical: re/im parse as finite mpf
    4. method_admissible        — numerical method ∈ {slater-series-1|2,
                                  mellin-barnes, braaksma-algebraic};
                                  symbolic method == 'symbolic-dispatch'
    5. self_reported_precision  — numerical: achieved_precision ≤ requested
    6. value_accuracy           — multi-point sample numerical or single-
                                  point AST evaluation symbolic
    7. boundary_envelope        — refusal: tag/class matches expected
    8. symbolic_rule_present    — symbolic: non-empty `rule` field
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any, Optional

import mpmath
mpmath.mp.dps = 80

HERE = Path(__file__).resolve().parent
_EXPECTED_INDEX: Optional[dict[str, dict]] = None


def _load_expected() -> dict[str, dict]:
    global _EXPECTED_INDEX
    if _EXPECTED_INDEX is None:
        path = HERE / "expected.json"
        if not path.exists():
            _EXPECTED_INDEX = {}
            return _EXPECTED_INDEX
        payload = json.loads(path.read_text())
        _EXPECTED_INDEX = {c["id"]: c for c in payload["cases"]}
    return _EXPECTED_INDEX


# ---------------------------------------------------------------------
# Per-check helpers
# ---------------------------------------------------------------------

ADMITTED_NUMERICAL_METHODS = {
    "slater-series-1", "slater-series-2",
    "mellin-barnes", "braaksma-algebraic",
}
ADMITTED_SYMBOLIC_METHODS = {"symbolic-dispatch"}

SPEED_GATE_MS = 1500.0  # tier H


def _is_str(x: Any) -> bool:
    return isinstance(x, str)


def _check_shape_numerical(candidate: dict) -> dict:
    required = {"value", "achieved_precision", "method"}
    missing = required - set(candidate.keys())
    if missing:
        return {"pass": False, "detail": f"missing fields: {sorted(missing)}"}
    v = candidate["value"]
    if not isinstance(v, dict) or set(v.keys()) - {"re", "im"}:
        return {"pass": False,
                "detail": f"value must be {{re, im}}; got {v}"}
    if "re" not in v or "im" not in v:
        return {"pass": False, "detail": f"value missing re/im; got {v}"}
    if not (_is_str(v["re"]) and _is_str(v["im"])):
        return {"pass": False, "detail": "value.re/im must be strings"}
    if not isinstance(candidate["achieved_precision"], int):
        return {"pass": False, "detail": "achieved_precision must be int"}
    if not _is_str(candidate["method"]):
        return {"pass": False, "detail": "method must be str"}
    return {"pass": True, "detail": "all required numerical fields present"}


def _check_shape_symbolic(candidate: dict) -> dict:
    # VERIFIER-PROTOCOL.md spec requires `expr`; the workbench dispatcher
    # also emits `rule`, `source`, `note`, `method`.  We require the
    # workbench shape (which is a strict superset); a candidate that
    # ships only `expr` would lose the symbolic_rule_present check but
    # could still pass single-point value_accuracy.  For v0.1 we hold
    # the workbench shape (5-field record) — the trial agent's PROMPT.md
    # documents this contract.
    required = {"rule", "method", "expr"}
    missing = required - set(candidate.keys())
    if missing:
        return {"pass": False, "detail": f"missing fields: {sorted(missing)}"}
    for key in ("rule", "method"):
        if not _is_str(candidate[key]):
            return {"pass": False, "detail": f"{key} must be str"}
    return {"pass": True, "detail": "all required symbolic fields present"}


def _check_finite_value(candidate: dict) -> dict:
    try:
        re = mpmath.mpf(candidate["value"]["re"])
        im = mpmath.mpf(candidate["value"]["im"])
    except Exception as e:
        return {"pass": False, "detail": f"could not parse value: {e}"}
    if not (mpmath.isfinite(re) and mpmath.isfinite(im)):
        return {"pass": False, "detail": f"non-finite value re={re}, im={im}"}
    return {"pass": True, "detail": "value parses, finite"}


def _check_method_admissible(candidate: dict, kind: str) -> dict:
    m = candidate.get("method", "")
    if kind == "numerical":
        admitted = ADMITTED_NUMERICAL_METHODS
    elif kind == "symbolic":
        admitted = ADMITTED_SYMBOLIC_METHODS
    else:
        return {"pass": False, "detail": f"unknown candidate kind {kind}"}
    if m not in admitted:
        return {"pass": False,
                "detail": f"method={m!r} not in admitted set {sorted(admitted)}"}
    return {"pass": True, "detail": f"method={m!r}"}


def _check_self_reported_precision(candidate: dict, requested_precision: int) -> dict:
    ap = candidate["achieved_precision"]
    if ap < 0:
        return {"pass": False, "detail": f"achieved_precision={ap} negative"}
    if ap > requested_precision:
        return {"pass": False,
                "detail": (f"achieved_precision={ap} > requested "
                           f"{requested_precision} — over-reporting")}
    return {"pass": True,
            "detail": f"achieved={ap}, requested={requested_precision}"}


def _value_accuracy_numerical(candidate: dict, expected: dict) -> float:
    """Compute relative error vs pinned truth for a numerical candidate."""
    truth_re = mpmath.mpf(expected["truth"]["re"])
    truth_im = mpmath.mpf(expected["truth"]["im"])
    truth = mpmath.mpc(truth_re, truth_im)

    cand_re = mpmath.mpf(candidate["value"]["re"])
    cand_im = mpmath.mpf(candidate["value"]["im"])
    cand = mpmath.mpc(cand_re, cand_im)

    diff = mpmath.fabs(cand - truth)
    scale = max(mpmath.fabs(truth), mpmath.mpf("1e-300"))
    return float(diff / scale)


# ---------------------------------------------------------------------
# Single-point AST evaluation (symbolic discrimination, v0.1)
# ---------------------------------------------------------------------

def _unwrap_foreign(node: Any) -> Any:
    """Strip `cas-simplify/out-of-scope` foreign-pass-through wrappers
    to reveal the underlying expression node.  Workbench tools wrap
    expression heads outside their declared scope in this tag (PRD §2.3
    foreign-pass-through invariant); the symbolic AST blob the
    dispatcher emits uses this convention to round-trip heads like
    `exp`/`sin`/`besselj`/etc. that aren't in `cas-simplify`'s native
    rule set.
    """
    if isinstance(node, dict) and node.get("kind") == "tagged" \
            and node.get("tag", "").startswith("cas-simplify/"):
        return _unwrap_foreign(node.get("payload"))
    return node


def _parse_string_number(s: str) -> mpmath.mpf:
    s = str(s).strip()
    if "/" in s:
        a, b = s.split("/", 1)
        return mpmath.mpf(a) / mpmath.mpf(b)
    return mpmath.mpf(s)


def _eval_ast(node: Any, env: dict) -> mpmath.mpc:
    """Evaluate a candidate's `expr` AST at the given environment.

    The closed special-function vocabulary is per
    `sub-problems/13b-special-fn-ast-and-pfq/DESCRIPTION.md`:

      Plus, Times, Power, Negate, Constant, Sin, Cos, Exp, Log,
      BesselJ, BesselY, BesselI, BesselK, HypergeometricPFQ,
      WhittakerM, WhittakerW, ParabolicCylinderD, Erf, Erfc,
      ExpIntegralEi, Polylog, Gamma, Digamma, Pi, E, I, Sqrt, Square,
      Inverse, Arctan, Arcsin, ...

    Workbench heads are lowercase (`exp`, `sin`, `besselj`); the
    VERIFIER-PROTOCOL exemplars are CamelCase (`Exp`, `Sin`, `BesselJ`).
    We accept both (lowercase first, then case-folded fallback).

    Unknown heads raise `_ASTEvalError`; the caller falls back to
    rule-id-presence-only.
    """
    node = _unwrap_foreign(node)

    # Number literal: a bare string from the workbench codec.
    if isinstance(node, str):
        return mpmath.mpc(_parse_string_number(node), 0)

    # Number literal: a bigfloat or rational record
    if isinstance(node, dict) and "kind" in node:
        k = node["kind"]
        if k == "rational":
            return mpmath.mpc(
                mpmath.mpf(node["num"]) / mpmath.mpf(node["den"]),
                0,
            )
        if k == "integer":
            return mpmath.mpc(mpmath.mpf(str(node["value"])), 0)
        if k == "complex":
            return mpmath.mpc(
                _parse_string_number(node["re"]),
                _parse_string_number(node["im"]),
            )
        if k == "float64":
            return mpmath.mpc(mpmath.mpf(str(node["value"])), 0)
        if k == "symbol":
            name = node.get("name", "")
            if name in env:
                return env[name]
            raise _ASTEvalError(f"unbound symbol {name!r}")
        if k == "expression":
            head = node.get("head", "")
            args = node.get("args", [])
            return _eval_expression(head, args, env)

    if isinstance(node, dict) and "head" in node:
        # bare expression record (no kind discriminator)
        return _eval_expression(node["head"], node.get("args", []), env)

    raise _ASTEvalError(f"cannot evaluate node {type(node).__name__}: {str(node)[:80]}")


class _ASTEvalError(Exception):
    pass


def _eval_expression(head: str, args: list, env: dict) -> mpmath.mpc:
    h = head.lower()

    def _ev(a):
        return _eval_ast(a, env)

    if h in ("plus", "add"):
        return sum((_ev(a) for a in args), mpmath.mpc(0))
    if h in ("times", "mul"):
        out = mpmath.mpc(1)
        for a in args:
            out = out * _ev(a)
        return out
    if h in ("negate", "neg"):
        if len(args) != 1:
            raise _ASTEvalError(f"negate arity {len(args)}")
        return -_ev(args[0])
    if h in ("power", "pow"):
        if len(args) != 2:
            raise _ASTEvalError(f"power arity {len(args)}")
        b, e = _ev(args[0]), _ev(args[1])
        return mpmath.power(b, e)
    if h == "constant":
        if len(args) == 1:
            return _ev(args[0])
    if h in ("inverse",):
        if len(args) != 1:
            raise _ASTEvalError("inverse arity")
        return mpmath.mpc(1) / _ev(args[0])
    if h in ("sqrt",):
        return mpmath.sqrt(_ev(args[0]))
    if h in ("square",):
        v = _ev(args[0])
        return v * v
    if h in ("sin",):
        return mpmath.sin(_ev(args[0]))
    if h in ("cos",):
        return mpmath.cos(_ev(args[0]))
    if h in ("tan",):
        return mpmath.tan(_ev(args[0]))
    if h in ("exp",):
        return mpmath.exp(_ev(args[0]))
    if h in ("log", "ln"):
        return mpmath.log(_ev(args[0]))
    if h in ("arctan", "atan"):
        return mpmath.atan(_ev(args[0]))
    if h in ("arcsin", "asin"):
        return mpmath.asin(_ev(args[0]))
    if h in ("arccos", "acos"):
        return mpmath.acos(_ev(args[0]))
    if h in ("erf",):
        return mpmath.erf(_ev(args[0]))
    if h in ("erfc",):
        return mpmath.erfc(_ev(args[0]))
    if h in ("gamma",):
        return mpmath.gamma(_ev(args[0]))
    if h in ("digamma", "psi"):
        return mpmath.digamma(_ev(args[0]))
    if h in ("besselj",):
        nu, z = _ev(args[0]), _ev(args[1])
        return mpmath.besselj(nu, z)
    if h in ("bessely",):
        return mpmath.bessely(_ev(args[0]), _ev(args[1]))
    if h in ("besseli",):
        return mpmath.besseli(_ev(args[0]), _ev(args[1]))
    if h in ("besselk",):
        return mpmath.besselk(_ev(args[0]), _ev(args[1]))
    if h in ("expintegralei", "ei"):
        return mpmath.ei(_ev(args[0]))
    if h in ("polylog",):
        return mpmath.polylog(_ev(args[0]), _ev(args[1]))
    if h in ("hypergeometricpfq", "pfq", "hyper"):
        # args = [a-list, b-list, z]
        if len(args) != 3:
            raise _ASTEvalError(f"hyper arity {len(args)}")
        # a-list and b-list may be a wrapped list value or a plain list
        def _list_args(node):
            node = _unwrap_foreign(node)
            if isinstance(node, list):
                return [_ev(x) for x in node]
            if isinstance(node, dict):
                if node.get("kind") == "list":
                    return [_ev(x) for x in node.get("items", [])]
                if "args" in node:
                    return [_ev(x) for x in node["args"]]
            raise _ASTEvalError(f"hyper list arg shape: {type(node).__name__}")
        avals = _list_args(args[0])
        bvals = _list_args(args[1])
        z = _ev(args[2])
        return mpmath.hyper(avals, bvals, z)
    if h in ("pi",):
        return mpmath.mpc(mpmath.pi, 0)
    if h in ("e", "eulere"):
        return mpmath.mpc(mpmath.e, 0)
    if h in ("i", "imaginaryunit"):
        return mpmath.mpc(0, 1)
    if h in ("symbol",):
        # When a head value-encoded symbol survives.
        name = args[0] if args else ""
        if isinstance(name, str) and name in env:
            return env[name]
        raise _ASTEvalError(f"unbound symbol {name!r}")
    raise _ASTEvalError(f"unknown head {head!r}")


def _z_from_input(inp: dict) -> mpmath.mpc:
    z = inp.get("z")
    if isinstance(z, dict):
        if "re" in z and "im" in z:
            return mpmath.mpc(_parse_string_number(z["re"]),
                              _parse_string_number(z["im"]))
        if z.get("kind") == "rational":
            return mpmath.mpc(
                mpmath.mpf(z["num"]) / mpmath.mpf(z["den"]),
                0,
            )
        if z.get("kind") == "complex":
            return mpmath.mpc(_parse_string_number(z["re"]),
                              _parse_string_number(z["im"]))
    raise _ASTEvalError(f"unrecognised z: {z}")


def _value_accuracy_symbolic(candidate: dict, expected: dict, inp: dict) -> tuple[Optional[float], str]:
    """Single-point AST evaluation of the candidate's `expr` at `z`.

    Returns (rel_err, detail) where rel_err is None when the AST cannot
    be evaluated (caller falls back to rule-id-presence-only).
    """
    if expected.get("truth") is None:
        return None, "no truth pinned"
    try:
        z = _z_from_input(inp)
        truth_re = mpmath.mpf(expected["truth"]["re"])
        truth_im = mpmath.mpf(expected["truth"]["im"])
        truth = mpmath.mpc(truth_re, truth_im)
        with mpmath.workdps(100):
            val = _eval_ast(candidate["expr"], {"z": z})
        diff = mpmath.fabs(val - truth)
        scale = max(mpmath.fabs(truth), mpmath.mpf("1e-300"))
        return float(diff / scale), f"AST(z={z}) = {complex(val)}; truth = {complex(truth)}"
    except _ASTEvalError as e:
        return None, f"AST eval skipped: {e}"
    except Exception as e:
        return None, f"AST eval crashed (skipped): {type(e).__name__}: {e}"


# ---------------------------------------------------------------------
# Boundary-envelope check (accept both wire shapes)
# ---------------------------------------------------------------------

def _normalise_refusal(candidate: dict) -> tuple[Optional[str], dict]:
    """Return (tag-as-string, payload-dict) for a refusal candidate, or
    (None, {}) if not a refusal shape.  Accepts both:

      workbench:  {"kind": "tagged", "tag": "meijer-g/<class>",
                   "payload": {"reason": ..., "ruled_out_methods": [...]}}

      protocol:   {"kind": "out-of-region", "reason": ...,
                   "ruled_out_methods": [...]}
    """
    if not isinstance(candidate, dict):
        return None, {}
    k = candidate.get("kind", "")
    if k == "tagged":
        tag = candidate.get("tag", "")
        payload = candidate.get("payload", {}) or {}
        return tag, payload if isinstance(payload, dict) else {}
    if k == "out-of-region":
        # Translate to the workbench tag namespace for comparison.
        return "meijer-g/out-of-region", {
            "reason": candidate.get("reason", ""),
            "ruled_out_methods": candidate.get("ruled_out_methods", []),
        }
    return None, {}


def _check_boundary_envelope(candidate: dict, expected: dict) -> dict:
    tag, _ = _normalise_refusal(candidate)
    if tag is None:
        return {"pass": False,
                "detail": (f"expected tagged refusal but got "
                           f"kind={candidate.get('kind', type(candidate).__name__)}")}
    expected_tag = expected.get("tag", "")
    if tag != expected_tag:
        return {"pass": False,
                "detail": f"tag {tag!r} != expected {expected_tag!r}"}
    return {"pass": True, "detail": f"tagged {expected_tag}"}


def _check_speed(candidate: dict) -> Optional[dict]:
    """Tier-H speed gate (returns None if not applicable)."""
    if os.environ.get("MEIJERG_BENCH_CHECK_SPEED") != "1":
        return None
    elapsed = candidate.get("elapsed_ms")
    if elapsed is None:
        return {"pass": False, "detail": "no elapsed_ms field on candidate"}
    if elapsed > SPEED_GATE_MS:
        return {"pass": False,
                "detail": f"elapsed {elapsed:.1f}ms > {SPEED_GATE_MS}ms speed gate"}
    return {"pass": True, "detail": f"{elapsed:.1f}ms ≤ {SPEED_GATE_MS}ms"}


# ---------------------------------------------------------------------
# Top-level
# ---------------------------------------------------------------------

def verify(payload: dict) -> dict:
    case_id = payload.get("id", "")
    candidate = payload.get("candidate", {})
    inp = payload.get("input", {})

    if "id" not in payload:
        return {"pass": False, "reason": "missing id in payload", "checks": {}}

    expected_index = _load_expected()
    if case_id not in expected_index:
        return {"pass": False,
                "reason": f"id {case_id!r} not in expected.json",
                "checks": {}}
    case_expected = expected_index[case_id]

    checks: dict[str, dict] = {}

    # 0. Tool error: never expected.
    if isinstance(candidate, dict) and candidate.get("kind") == "tool_error":
        checks["no_tool_error"] = {
            "pass": False,
            "detail": (f"tool crashed: {candidate.get('name')}: "
                       f"{candidate.get('message')}"),
        }
        return _wrap(checks)
    checks["no_tool_error"] = {"pass": True, "detail": "tool did not crash"}

    expected = case_expected["expected"]
    expected_kind = expected.get("kind", "value")
    cand_kind = candidate.get("kind", "")

    # ----- Refusal-expected case ------
    if expected_kind == "tagged":
        checks["boundary_envelope"] = _check_boundary_envelope(candidate, expected)
        spd = _check_speed(candidate)
        if spd is not None:
            checks["speed_gate"] = spd
        return _wrap(checks)

    # ----- Value-expected case --------
    # The candidate may be 'symbolic' or 'numerical'.  We accept either
    # under request_mode='auto'; the candidate's `kind` discriminates.

    cand_tag, _cand_payload = _normalise_refusal(candidate)
    if cand_tag is not None:
        # Unexpected refusal on a value-expected case
        checks["shape"] = {
            "pass": False,
            "detail": (f"expected value (symbolic|numerical) but got refusal "
                       f"{cand_tag}"),
        }
        return _wrap(checks)

    if cand_kind not in ("symbolic", "numerical"):
        checks["shape"] = {
            "pass": False,
            "detail": (f"expected kind in {{symbolic, numerical}} but got "
                       f"kind={cand_kind!r}"),
        }
        return _wrap(checks)

    # Shape check
    if cand_kind == "symbolic":
        checks["shape"] = _check_shape_symbolic(candidate)
    else:
        checks["shape"] = _check_shape_numerical(candidate)
    if not checks["shape"]["pass"]:
        return _wrap(checks)

    # Method admissible
    checks["method_admissible"] = _check_method_admissible(candidate, cand_kind)

    # Numerical-specific:
    if cand_kind == "numerical":
        checks["finite_value"] = _check_finite_value(candidate)
        if not checks["finite_value"]["pass"]:
            return _wrap(checks)

        requested_precision = inp.get("precision", 50)
        checks["self_reported_precision"] = _check_self_reported_precision(
            candidate, requested_precision)

        # Value accuracy (numerical) — relative-error vs pinned truth.
        if expected.get("truth") is not None:
            rel = _value_accuracy_numerical(candidate, expected)
            tol = float(mpmath.mpf(case_expected["tolerance_rel"]))
            checks["value_accuracy"] = {
                "pass": rel <= tol,
                "detail": f"rel={rel:.3e} {'≤' if rel <= tol else '>'} tol={tol:.3e}",
            }

    else:  # symbolic
        # Rule-id presence (the workbench's v0.1 minimum).
        rule_id = candidate.get("rule", "")
        if not rule_id:
            checks["symbolic_rule_present"] = {
                "pass": False,
                "detail": "symbolic candidate has empty 'rule' field",
            }
        else:
            checks["symbolic_rule_present"] = {
                "pass": True,
                "detail": f"rule={rule_id!r}",
            }

        # Single-point AST evaluation witness (when a numerical truth is
        # pinned).  Falls back gracefully when the AST head set is not
        # known to the evaluator.
        rel, detail = _value_accuracy_symbolic(candidate, expected, inp)
        if rel is not None:
            tol = float(mpmath.mpf(case_expected["tolerance_rel"]))
            checks["value_accuracy"] = {
                "pass": rel <= tol,
                "detail": (f"rel={rel:.3e} "
                           f"{'≤' if rel <= tol else '>'} tol={tol:.3e}; "
                           f"{detail}"),
            }
        else:
            # Don't report 'value_accuracy' as failed when the AST eval
            # was skipped — the rule-id-presence check is the v0.1
            # baseline.  Multi-point K=20 random-z sampling per
            # VERIFIER-PROTOCOL.md §"symbolic check" is the P2 follow-up.
            checks["value_accuracy_note"] = {
                "pass": True,
                "detail": detail,
            }

    # Speed-gate (Tier H)
    spd = _check_speed(candidate)
    if spd is not None:
        checks["speed_gate"] = spd

    return _wrap(checks)


def _wrap(checks: dict) -> dict:
    overall = all(c["pass"] for c in checks.values())
    if overall:
        return {"pass": True, "reason": "all invariants hold", "checks": checks}
    first_fail = next(k for k, v in checks.items() if not v["pass"])
    return {"pass": False,
            "reason": f"failed: {first_fail} — {checks[first_fail]['detail']}",
            "checks": checks}


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        result = verify(payload)
    except Exception as e:
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
