"""Generate PSLQ golden master."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import mpmath
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "reference"))

from pslq_reference import pslq_reference  # noqa: E402

SEED = 20260426
ENCODING_VERSION = 1


def to_str(x: mpmath.mpf, dps: int) -> str:
    """Stringify with `dps + 20` digits of headroom."""
    return mpmath.nstr(x, dps + 20, strip_zeros=False)


def make_case(case_id: str, vec_mpf: list, dps: int, max_coeff: int):
    xs = [to_str(v, dps) for v in vec_mpf]
    inp = {
        "id": case_id,
        "input": {
            "x":             xs,
            "precision_dps": dps,
            "max_coeff":     max_coeff,
        },
    }
    expected = pslq_reference(inp["input"])
    return inp, {"id": case_id, "expected": expected}


def main() -> None:
    rng = np.random.default_rng(SEED)
    cases: list[tuple[dict, dict]] = []

    DPS = 60

    mpmath.mp.dps = DPS

    one = mpmath.mpf(1)
    pi = mpmath.pi
    e = mpmath.e
    ln2 = mpmath.log(2)
    ln3 = mpmath.log(3)
    ln6 = mpmath.log(6)
    sqrt2 = mpmath.sqrt(2)
    sqrt3 = mpmath.sqrt(3)
    sqrt5 = mpmath.sqrt(5)
    cbrt2 = mpmath.cbrt(2)
    phi = (one + sqrt5) / 2  # golden ratio

    # ── Cases with a known relation ─────────────────────────────────────────
    cases.append(make_case("ln_2_3_6",
                           [one, ln2, ln3, ln6], DPS, 100))
    cases.append(make_case("min_poly_sqrt2",
                           [one, sqrt2, mpmath.mpf(2)], DPS, 100))
    cases.append(make_case("min_poly_sqrt3",
                           [one, sqrt3, mpmath.mpf(3)], DPS, 100))
    cases.append(make_case("min_poly_cbrt2",
                           [one, cbrt2, cbrt2 ** 2, mpmath.mpf(2)], DPS, 100))
    cases.append(make_case("golden_ratio",
                           [one, phi, phi ** 2], DPS, 100))
    cases.append(make_case("machin_pi",
                           [pi, mpmath.atan(mpmath.mpf(1) / 5),
                            mpmath.atan(mpmath.mpf(1) / 239)], DPS, 200))

    # Quartic algebraic: r where r⁴ − r − 1 = 0.
    # Find r via mpmath.findroot.
    quartic_root = mpmath.findroot(lambda r: r**4 - r - 1, mpmath.mpf("1.22"))
    cases.append(make_case(
        "quartic_min_poly",
        [one, quartic_root, quartic_root ** 2,
         quartic_root ** 3, quartic_root ** 4], DPS, 100,
    ))

    # ζ(3) (Apéry's constant) — known to be irrational, but no integer
    # linear relation with {1, ln 2, ln 3} is expected within reasonable
    # bounds.
    z3 = mpmath.zeta(3)
    cases.append(make_case("no_rel_zeta3_ln23", [one, z3, ln2, ln3], DPS, 50))

    # ── Cases with no relation expected ────────────────────────────────────
    cases.append(make_case("no_rel_pi_e",   [one, pi, e],          DPS, 100))
    cases.append(make_case("no_rel_pi_e_lns",
                           [one, pi, e, ln2],                       DPS, 50))
    cases.append(make_case("no_rel_sqrt23", [one, sqrt2, sqrt3],   DPS, 100))

    for i in range(3):
        # Three pseudo-independent reals.
        v = [mpmath.mpf(1)]
        for _ in range(3):
            v.append(mpmath.mpf(str(rng.random())) + pi * mpmath.mpf(str(rng.random())))
        cases.append(make_case(f"no_rel_random_{i}", v, DPS, 50))

    inputs_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "09-pslq",
        "cases": [c[0] for c in cases],
    }
    expected_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "09-pslq",
        "cases": [c[1] for c in cases],
    }

    (HERE / "inputs.json").write_text(json.dumps(inputs_payload, indent=2) + "\n")
    (HERE / "expected.json").write_text(json.dumps(expected_payload, indent=2) + "\n")

    print(f"wrote {len(cases)} cases to inputs.json and expected.json")


if __name__ == "__main__":
    main()
