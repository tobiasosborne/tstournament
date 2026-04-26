"""Generate Risch golden master."""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "reference"))

from risch_reference import risch_reference  # noqa: E402

SEED = 20260426
ENCODING_VERSION = 1


def make_case(case_id: str, integrand: str, variable: str = "x"):
    inp = {
        "id": case_id,
        "input": {"integrand": integrand, "variable": variable},
    }
    expected = risch_reference(inp["input"])
    return inp, {"id": case_id, "expected": expected}


def main() -> None:
    cases: list[tuple[dict, dict]] = []

    # ── Polynomials ─────────────────────────────────────────────────────────
    cases.append(make_case("poly_zero",        "0"))
    cases.append(make_case("poly_const",       "5"))
    cases.append(make_case("poly_x",           "x"))
    cases.append(make_case("poly_x2_plus_1",   "x**2 + 1"))
    cases.append(make_case("poly_cubic",       "x**3 - 2*x + 7"))

    # ── Rational ────────────────────────────────────────────────────────────
    cases.append(make_case("rat_one_over_x",   "1/x"))
    cases.append(make_case("rat_log_arg",      "(2*x + 1)/(x**2 + x + 1)"))
    cases.append(make_case("rat_partial_frac", "1/(x*(x + 1))"))
    cases.append(make_case("rat_x_over_1px2",  "x/(1 + x**2)"))

    # ── Exp/log mixed ──────────────────────────────────────────────────────
    cases.append(make_case("exp_x",            "exp(x)"))
    cases.append(make_case("x_exp_x",          "x*exp(x)"))
    cases.append(make_case("log_x",            "log(x)"))
    cases.append(make_case("log_over_x",       "log(x)/x"))
    cases.append(make_case("x_exp_x2",         "x*exp(x**2)"))
    cases.append(make_case("recip_x_log_x",    "1/(x*log(x))"))

    # ── Non-elementary diagnostics ──────────────────────────────────────────
    cases.append(make_case("nonelem_exp_x2",   "exp(x**2)"))
    cases.append(make_case("nonelem_exp_over_x", "exp(x)/x"))
    cases.append(make_case("nonelem_recip_log",  "1/log(x)"))

    inputs_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "10-risch",
        "cases": [c[0] for c in cases],
    }
    expected_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "10-risch",
        "cases": [c[1] for c in cases],
    }

    (HERE / "inputs.json").write_text(json.dumps(inputs_payload, indent=2) + "\n")
    (HERE / "expected.json").write_text(json.dumps(expected_payload, indent=2) + "\n")

    print(f"wrote {len(cases)} cases to inputs.json and expected.json")


if __name__ == "__main__":
    main()
