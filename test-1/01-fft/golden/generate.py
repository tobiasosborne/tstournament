"""Generate FFT golden master.

Produces:
  - inputs.json   : [{"id": ..., "input": {n, direction, x}}, ...]
  - expected.json : [{"id": ..., "expected": [[re, im], ...]}, ...]

Reproducibility: seeded numpy.random.Generator (PCG64, seed pinned below).
Re-running this script with the same seed must produce byte-identical
inputs.json and expected.json.

Run:
  python3 generate.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

SEED = 20260426  # date-based, pinned for reproducibility
HERE = Path(__file__).resolve().parent
ENCODING_VERSION = 1


def to_pair(z: complex) -> list[float]:
    return [float(z.real), float(z.imag)]


def from_array(x: np.ndarray) -> list[list[float]]:
    return [to_pair(complex(z)) for z in x]


def naive_forward(x: np.ndarray) -> np.ndarray:
    n = x.shape[0]
    if n == 0:
        return x.copy()
    j = np.arange(n).reshape(-1, 1)
    k = np.arange(n).reshape(1, -1)
    W = np.exp(-2j * math.pi * j * k / n)
    return W @ x


def naive_inverse(x: np.ndarray) -> np.ndarray:
    n = x.shape[0]
    if n == 0:
        return x.copy()
    j = np.arange(n).reshape(-1, 1)
    k = np.arange(n).reshape(1, -1)
    W = np.exp(+2j * math.pi * j * k / n)
    return (W @ x) / n


def make_case(case_id: str, n: int, direction: str, x: np.ndarray):
    assert x.shape == (n,), (case_id, n, x.shape)
    assert n == 0 or (n & (n - 1)) == 0, (case_id, n)
    expected = np.fft.fft(x) if direction == "forward" else np.fft.ifft(x)
    inp = {
        "id": case_id,
        "input": {
            "n": n,
            "direction": direction,
            "x": from_array(x),
        },
    }
    exp = {"id": case_id, "expected": from_array(expected)}
    return inp, exp


def main() -> None:
    rng = np.random.default_rng(SEED)
    cases: list[tuple[dict, dict]] = []

    # ── Hand-crafted edge cases ──────────────────────────────────────────────
    edges: list[tuple[str, int, str, np.ndarray]] = []

    # n = 1 identities
    edges.append(("edge_n1_forward",  1, "forward", np.array([1 + 0j])))
    edges.append(("edge_n1_inverse",  1, "inverse", np.array([1 + 0j])))
    edges.append(("edge_n1_complex",  1, "forward", np.array([3 - 4j])))

    # n = 2
    edges.append(("edge_n2_dc",       2, "forward", np.array([1 + 0j, 1 + 0j])))
    edges.append(("edge_n2_nyquist",  2, "forward", np.array([1 + 0j, -1 + 0j])))
    edges.append(("edge_n2_impulse",  2, "forward", np.array([1 + 0j, 0 + 0j])))

    # DC and impulse at n = 8
    edges.append(("edge_n8_dc",       8, "forward", np.ones(8, dtype=complex)))
    edges.append(("edge_n8_impulse",  8, "forward",
                  np.array([1] + [0] * 7, dtype=complex)))

    # Single root of unity: x_j = exp(2πi j / n) ⇒ X_k = n δ_{k,1}.
    n_root = 16
    edges.append((
        "edge_n16_root_of_unity",
        n_root,
        "forward",
        np.exp(2j * math.pi * np.arange(n_root) / n_root),
    ))

    # Real-valued input (Hermitian symmetry expected on output).
    edges.append((
        "edge_n8_real_only",
        8,
        "forward",
        np.array([1, 2, 3, 4, 5, 6, 7, 8], dtype=complex),
    ))

    # Pure imaginary input.
    edges.append((
        "edge_n8_pure_imag",
        8,
        "forward",
        1j * np.array([1, 2, 3, 4, 5, 6, 7, 8], dtype=complex),
    ))

    # Inverse-direction edge: round-trip a known forward output.
    fwd_out = np.fft.fft(np.array([1, 2, 3, 4, 5, 6, 7, 8], dtype=complex))
    edges.append(("edge_n8_inverse_of_real_fft", 8, "inverse", fwd_out))

    for case_id, n, direction, x in edges:
        cases.append(make_case(case_id, n, direction, x))

    # ── Seeded random cases ──────────────────────────────────────────────────
    sizes = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024]
    # Two cases per size (one forward, one inverse), 5 extra at mixed sizes
    # → 25 random cases total.
    random_specs: list[tuple[str, int, str]] = []
    for n in sizes:
        random_specs.append((f"rand_n{n}_fwd", n, "forward"))
        random_specs.append((f"rand_n{n}_inv", n, "inverse"))
    for i, n in enumerate([8, 32, 64, 128, 256]):
        random_specs.append((f"rand_extra_{i}_n{n}_fwd", n, "forward"))

    for case_id, n, direction in random_specs:
        re = rng.standard_normal(n)
        im = rng.standard_normal(n)
        x = re + 1j * im
        cases.append(make_case(case_id, n, direction, x))

    # ── Stress cases ─────────────────────────────────────────────────────────
    for n in (16384, 65536):
        re = rng.standard_normal(n)
        im = rng.standard_normal(n)
        x = re + 1j * im
        cases.append(make_case(f"stress_n{n}_fwd", n, "forward", x))

    inputs_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "01-fft",
        "cases": [c[0] for c in cases],
    }
    expected_payload = {
        "encoding_version": ENCODING_VERSION,
        "seed": SEED,
        "problem": "01-fft",
        "cases": [c[1] for c in cases],
    }

    (HERE / "inputs.json").write_text(
        json.dumps(inputs_payload, indent=2) + "\n"
    )
    (HERE / "expected.json").write_text(
        json.dumps(expected_payload, indent=2) + "\n"
    )

    # ── Self-consistency check on the canonical edge cases ──────────────────
    # n=1 identity
    assert from_array(np.fft.fft(np.array([1 + 0j])))[0] == [1.0, 0.0]
    # DC at n=4 ⇒ [4, 0, 0, 0]
    dc4 = np.fft.fft(np.ones(4, dtype=complex))
    assert np.allclose(dc4, [4, 0, 0, 0])
    # Impulse at n=4 ⇒ [1, 1, 1, 1]
    imp4 = np.fft.fft(np.array([1, 0, 0, 0], dtype=complex))
    assert np.allclose(imp4, [1, 1, 1, 1])
    # Naive forward at small n agrees with numpy.fft.
    rng2 = np.random.default_rng(0)
    for n in (1, 2, 4, 8, 16, 32, 64):
        z = rng2.standard_normal(n) + 1j * rng2.standard_normal(n)
        assert np.allclose(naive_forward(z), np.fft.fft(z), atol=1e-10)
        assert np.allclose(naive_inverse(z), np.fft.ifft(z), atol=1e-10)

    print(f"wrote {len(cases)} cases to inputs.json and expected.json")


if __name__ == "__main__":
    main()
