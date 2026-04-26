"""Reference FFT — wraps numpy.fft.fft / numpy.fft.ifft behind the
language-neutral JSON I/O contract defined in DESCRIPTION.md.

Reads one input JSON object on stdin, writes the candidate output JSON array
to stdout. Stripped from ts-bench-test by infra/strip-for-testing.sh.
"""

from __future__ import annotations

import json
import sys

import numpy as np


def fft_reference(payload: dict) -> list[list[float]]:
    n = int(payload["n"])
    direction = payload["direction"]
    x = np.asarray(
        [complex(re, im) for re, im in payload["x"]],
        dtype=np.complex128,
    )
    if x.shape[0] != n:
        raise ValueError(f"length mismatch: declared n={n}, got {x.shape[0]}")
    if n & (n - 1) != 0:
        raise ValueError(f"n must be a power of two, got n={n}")

    if direction == "forward":
        y = np.fft.fft(x)
    elif direction == "inverse":
        y = np.fft.ifft(x)
    else:
        raise ValueError(f"unknown direction: {direction!r}")

    return [[float(z.real), float(z.imag)] for z in y]


def main() -> None:
    payload = json.load(sys.stdin)
    out = fft_reference(payload)
    json.dump(out, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
