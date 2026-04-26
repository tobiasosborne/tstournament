"""Generate Buchberger golden master."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "reference"))

from buchberger_reference import buchberger_reference  # noqa: E402

SEED = 20260426
ENCODING_VERSION = 1


def make_case(case_id: str, vars_: list[str], order: str,
              polys: list[list[list]]):
    inp = {
        "id": case_id,
        "input": {
            "vars": vars_,
            "order": order,
            "polynomials": polys,
        },
    }
    expected = buchberger_reference(inp["input"])
    return inp, {"id": case_id, "expected": expected}


def random_poly(rng: np.random.Generator, n_vars: int, max_deg: int,
                num_terms: int, coeff_range: int = 5) -> list[list]:
    out: list[list] = []
    used: set[tuple[int, ...]] = set()
    attempts = 0
    while len(out) < num_terms and attempts < 50:
        attempts += 1
        expvec = tuple(int(rng.integers(0, max_deg + 1)) for _ in range(n_vars))
        if expvec in used:
            continue
        used.add(expvec)
        c = int(rng.integers(-coeff_range, coeff_range + 1))
        if c == 0:
            continue
        out.append([list(expvec), str(c)])
    return out


def main() -> None:
    rng = np.random.default_rng(SEED)
    cases: list[tuple[dict, dict]] = []

    # ── Hand-crafted ────────────────────────────────────────────────────────
    # Single non-zero poly.
    cases.append(make_case(
        "single_x2_plus_y", ["x", "y"], "lex",
        [[[[2, 0], "1"], [[0, 1], "1"]]],
    ))
    # Two-poly classic example (x²+y, xy+1).
    cases.append(make_case(
        "classic_x2y_xy1_lex", ["x", "y"], "lex",
        [
            [[[2, 0], "1"], [[0, 1], "1"]],          # x² + y
            [[[1, 1], "1"], [[0, 0], "1"]],          # xy + 1
        ],
    ))
    cases.append(make_case(
        "classic_x2y_xy1_degrevlex", ["x", "y"], "degrevlex",
        [
            [[[2, 0], "1"], [[0, 1], "1"]],
            [[[1, 1], "1"], [[0, 0], "1"]],
        ],
    ))

    # Cyclic-3 system (lex): x + y + z, xy + yz + zx, xyz − 1.
    cyclic3 = [
        [[[1, 0, 0], "1"], [[0, 1, 0], "1"], [[0, 0, 1], "1"]],
        [[[1, 1, 0], "1"], [[0, 1, 1], "1"], [[1, 0, 1], "1"]],
        [[[1, 1, 1], "1"], [[0, 0, 0], "-1"]],
    ]
    cases.append(make_case("cyclic3_lex", ["x", "y", "z"], "lex", cyclic3))
    cases.append(make_case("cyclic3_degrevlex",
                           ["x", "y", "z"], "degrevlex", cyclic3))

    # Already-reduced 1-var basis.
    cases.append(make_case(
        "univariate_already_reduced", ["x"], "lex",
        [[[[3], "1"], [[1], "1"]]],   # x³ + x
    ))

    # Monomial ideal in 2 vars: (x², xy, y²) — already a GB.
    cases.append(make_case(
        "monomial_ideal_2vars", ["x", "y"], "degrevlex",
        [
            [[[2, 0], "1"]],
            [[[1, 1], "1"]],
            [[[0, 2], "1"]],
        ],
    ))

    # System whose GB has more elements than the input.
    # F = (xy − 1, y² + x);  GB(lex) involves a degree-3 polynomial in y.
    cases.append(make_case(
        "expanding_2vars", ["x", "y"], "lex",
        [
            [[[1, 1], "1"], [[0, 0], "-1"]],         # xy − 1
            [[[0, 2], "1"], [[1, 0], "1"]],          # y² + x
        ],
    ))

    # ── Random small systems ───────────────────────────────────────────────
    for i, (n_vars, m_polys, max_deg) in enumerate([
        (2, 3, 2), (2, 3, 3), (3, 3, 2),
        (3, 4, 2), (2, 4, 3),
    ]):
        var_names = ["x", "y", "z"][:n_vars]
        polys = []
        for _ in range(m_polys):
            polys.append(random_poly(rng, n_vars, max_deg,
                                     num_terms=3 + int(rng.integers(0, 3))))
        for ord_ in ("lex", "degrevlex"):
            cases.append(make_case(f"rand_{i}_{ord_}_n{n_vars}_m{m_polys}",
                                   var_names, ord_, polys))

    inputs_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "08-buchberger",
        "cases": [c[0] for c in cases],
    }
    expected_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "08-buchberger",
        "cases": [c[1] for c in cases],
    }

    (HERE / "inputs.json").write_text(json.dumps(inputs_payload, indent=2) + "\n")
    (HERE / "expected.json").write_text(json.dumps(expected_payload, indent=2) + "\n")

    print(f"wrote {len(cases)} cases to inputs.json and expected.json")


if __name__ == "__main__":
    main()
