#!/usr/bin/env python3
"""Reference implementation for problem 12 — shortest-round-trip float ↔ string.

Uses CPython's built-in:

    repr(float)   — provably shortest round-trip since Python 3.1
    float(str)    — provably correctly-rounded round-to-nearest-even

These are the same engines that produce the golden master, so this
script demonstrates that the verifier is internally consistent. It is
also a working reference shape for what a candidate solution must
emit.

I/O: reads one JSON object on stdin, writes one JSON object on stdout.
For the speed-gate tier (`format = "generated"`), expands the LCG
descriptor identically to the verifier (see `verifier_protocol.md`).
"""
import sys
import json
import struct


# --- LCG (must match verify.py and verifier_protocol.md exactly) -------

LCG_A = 6364136223846793005
LCG_C = 1442695040888963407
LCG_M = 1 << 64


def lcg_step(state: int) -> int:
    return (state * LCG_A + LCG_C) % LCG_M


def lcg_random_bits(state: int) -> tuple[int, int]:
    while True:
        state = lcg_step(state)
        bits = state
        if (bits >> 52) & 0x7FF != 0x7FF:
            return state, bits


def expand_generator(generator: dict) -> list[dict]:
    kind = generator["kind"]
    n = int(generator["n"])
    state = int(generator["seed"]) % LCG_M
    out = []
    if kind == "uniform_bits":
        for _ in range(n):
            state, bits = lcg_random_bits(state)
            out.append({"op": "dtoa", "bits": "0x{:016x}".format(bits)})
        return out
    if kind == "uniform_strtod":
        for _ in range(n):
            state, bits = lcg_random_bits(state)
            d = struct.unpack("<d", struct.pack("<Q", bits))[0]
            out.append({"op": "strtod", "s": repr(d)})
        return out
    raise ValueError(f"unknown generator kind: {kind}")


def queries_from_input(inp: dict) -> list[dict]:
    if inp.get("format") == "generated":
        return expand_generator(inp["generator"])
    return inp["queries"]


# --- The two predicates ------------------------------------------------

def double_from_bits(bits_hex: str) -> float:
    bits = int(bits_hex, 16) & ((1 << 64) - 1)
    return struct.unpack("<d", struct.pack("<Q", bits))[0]


def bits_of(d: float) -> int:
    return struct.unpack("<Q", struct.pack("<d", d))[0]


def dtoa(d: float) -> str:
    """CPython repr is provably shortest round-trip since Python 3.1.

    Special cases match the verifier's accepted tokens:
        NaN      -> "NaN"
        +Inf     -> "Infinity"
        -Inf     -> "-Infinity"
    """
    if d != d:
        return "NaN"
    if d == float("inf"):
        return "Infinity"
    if d == -float("inf"):
        return "-Infinity"
    return repr(d)


def strtod(s: str) -> str:
    """Use CPython float() — correctly rounded under round-to-nearest-even.

    Returns the bit pattern of the resulting double as 0x followed by
    16 lowercase hex digits.
    """
    try:
        d = float(s)
    except OverflowError:
        d = float("inf") if not s.lstrip().startswith("-") else float("-inf")
    return "0x{:016x}".format(bits_of(d))


# --- Main --------------------------------------------------------------

def main() -> None:
    inp = json.load(sys.stdin)
    queries = queries_from_input(inp)
    results = []
    for q in queries:
        if q["op"] == "dtoa":
            results.append(dtoa(double_from_bits(q["bits"])))
        elif q["op"] == "strtod":
            results.append(strtod(q["s"]))
        else:
            raise ValueError(f"unknown op: {q.get('op')!r}")
    print(json.dumps({"results": results}))


if __name__ == "__main__":
    main()
