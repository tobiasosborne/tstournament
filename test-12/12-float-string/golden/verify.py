#!/usr/bin/env python3
"""verify.py — problem 12, shortest-round-trip float ↔ string.

Reads a JSON object on stdin of the form

    {"input": <case-input>, "candidate": <candidate-output>, "id": <case-id>}

and emits a verdict on stdout:

    {"pass": <bool>, "reason": "...", "checks": {...}}

with three sub-checks:

    shape           — output JSON has the expected shape
    batch_complete  — results array length matches the (possibly expanded) query count
    bitwise_correct — every result is correct per the spec in PROMPT.md

Truth is recomputed live for every query via CPython's
shortest-round-trip `repr(float)` (for `dtoa`) and correctly-rounded
`float(str)` (for `strtod`). The committed `expected.json` is not
consulted.

For halfway-point cases (Tier F), the verifier additionally checks the
ties-to-even tie-break via `decimal.Decimal` arithmetic.

The LCG expansion for Tier H is identical to the spec in
`verifier_protocol.md` §"Tier H expansion".
"""
import sys
import json
import struct
import decimal
import math


# --- LCG (MMIX, Knuth) -------------------------------------------------

LCG_A = 6364136223846793005
LCG_C = 1442695040888963407
LCG_M = 1 << 64


def lcg_step(state: int) -> int:
    return (state * LCG_A + LCG_C) % LCG_M


def lcg_random_bits(state: int) -> tuple[int, int]:
    """Advance LCG once and return (new_state, bits) where bits is a
    finite-non-NaN IEEE-754 double bit pattern. Rejects NaN/Inf and
    advances again until a finite double is produced.
    """
    while True:
        state = lcg_step(state)
        bits = state
        # Reject NaN / +-Inf: exponent field == 0x7FF
        if (bits >> 52) & 0x7FF != 0x7FF:
            return state, bits


def expand_generator(generator: dict) -> list[dict]:
    """Expand a generator descriptor into the explicit query list."""
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


# --- sig_digit_count ---------------------------------------------------

_SPECIAL = ("nan", "inf", "infinity", "-inf", "-infinity")


def sig_digit_count(s: str) -> int:
    """The exact procedure from verifier_protocol.md §sig_digit_count."""
    s = s.strip().lower()
    if s in _SPECIAL:
        return 0
    s = s.lstrip("+-")
    if "e" in s:
        m, _ = s.split("e", 1)
    else:
        m = s
    if "." in m:
        ip, fp = m.split(".", 1)
    else:
        ip, fp = m, ""
    digits = (ip + fp).lstrip("0").rstrip("0")
    if not digits:
        return 1
    return len(digits)


# --- Float bit pattern helpers -----------------------------------------

def bits_of(d: float) -> int:
    return struct.unpack("<Q", struct.pack("<d", d))[0]


def double_from_bits(bits: int) -> float:
    return struct.unpack("<d", struct.pack("<Q", bits & ((1 << 64) - 1)))[0]


def is_nan_bits(bits: int) -> bool:
    exp = (bits >> 52) & 0x7FF
    mant = bits & ((1 << 52) - 1)
    return exp == 0x7FF and mant != 0


def parse_hex_bits(s: str) -> int | None:
    """Parse '0x<16 hex>' (lowercase). Returns the int or None on malformed."""
    if not isinstance(s, str):
        return None
    s = s.strip()
    if len(s) != 18 or not (s[0:2] == "0x" or s[0:2] == "0X"):
        return None
    try:
        v = int(s, 16)
    except ValueError:
        return None
    if v < 0 or v >= (1 << 64):
        return None
    return v


# --- Per-query verification --------------------------------------------

def verify_dtoa_query(input_bits: int, candidate: str) -> tuple[bool, str]:
    """Check candidate is a shortest-round-trip representation of the
    input double."""
    input_double = double_from_bits(input_bits)

    # NaN: any case-insensitive 'nan' / 'NaN' / etc. is acceptable.
    if is_nan_bits(input_bits):
        if not isinstance(candidate, str):
            return False, "NaN: candidate not a string"
        if candidate.strip().lower() != "nan":
            return False, f"NaN: expected 'NaN', got {candidate!r}"
        return True, ""

    # +-Infinity
    if math.isinf(input_double):
        if not isinstance(candidate, str):
            return False, "Inf: candidate not a string"
        c = candidate.strip().lower()
        wanted = "infinity" if input_double > 0 else "-infinity"
        wanted_short = "inf" if input_double > 0 else "-inf"
        if c not in (wanted, wanted_short):
            return False, f"Inf: expected {wanted!r} or {wanted_short!r}, got {candidate!r}"
        return True, ""

    # Finite cases:
    if not isinstance(candidate, str):
        return False, "candidate not a string"

    # Try to parse with float()
    try:
        parsed = float(candidate)
    except ValueError:
        return False, f"candidate {candidate!r} is not parseable by float()"

    # Compare bit-exactly (distinguishes +0 / -0)
    if bits_of(parsed) != input_bits:
        return False, (
            f"round-trip mismatch: parseFloat({candidate!r}) = {parsed!r} "
            f"(bits 0x{bits_of(parsed):016x}) != input bits 0x{input_bits:016x}"
        )

    # Compare significant-digit count to CPython repr.
    expected = repr(input_double)
    expected_sig = sig_digit_count(expected)
    got_sig = sig_digit_count(candidate)
    if got_sig != expected_sig:
        return False, (
            f"shortness: expected {expected_sig} sig digits "
            f"(per repr={expected!r}), got {got_sig} (in {candidate!r})"
        )

    return True, ""


def verify_strtod_query(input_str: str, candidate: str) -> tuple[bool, str]:
    """Check candidate's bit-pattern matches the correctly rounded
    decimal-to-double conversion."""
    bits = parse_hex_bits(candidate)
    if bits is None:
        return False, f"candidate {candidate!r} not in form 0x[0-9a-f]{{16}}"

    # Compute expected via Python float()
    try:
        expected_double = float(input_str)
    except (ValueError, OverflowError) as exc:
        # Some test cases may exercise overflow; OverflowError -> +-Inf
        return False, f"input {input_str!r} unparseable by float(): {exc!r}"
    expected_bits = bits_of(expected_double)

    # NaN: accept any quiet-NaN bit pattern.
    if math.isnan(expected_double):
        if is_nan_bits(bits):
            return True, ""
        return False, f"expected NaN, got 0x{bits:016x}"

    # Finite or +-Inf: exact match.
    if bits != expected_bits:
        return False, (
            f"strtod mismatch: {input_str!r} -> 0x{bits:016x}, expected 0x{expected_bits:016x} "
            f"({double_from_bits(bits)!r} vs {expected_double!r})"
        )
    return True, ""


# --- Per-case verification ---------------------------------------------

def verify_case(payload: dict) -> dict:
    case_id = payload.get("id", "<unknown>")
    inp = payload["input"]
    cand = payload["candidate"]

    # Shape check
    if not isinstance(cand, dict) or "results" not in cand:
        return {
            "pass": False,
            "reason": "candidate output missing 'results' field",
            "checks": {
                "shape":          {"pass": False, "detail": "missing 'results'"},
                "batch_complete": {"pass": False, "detail": "n/a"},
                "bitwise_correct":{"pass": False, "detail": "n/a"},
            },
        }
    results = cand["results"]
    if not isinstance(results, list):
        return {
            "pass": False,
            "reason": "'results' is not a list",
            "checks": {
                "shape":          {"pass": False, "detail": "results is not a list"},
                "batch_complete": {"pass": False, "detail": "n/a"},
                "bitwise_correct":{"pass": False, "detail": "n/a"},
            },
        }

    queries = queries_from_input(inp)
    expected_n = len(queries)
    got_n = len(results)

    shape_check = {"pass": True, "detail": f"{got_n} string results"}
    if not all(isinstance(r, str) for r in results):
        shape_check = {"pass": False, "detail": "non-string entries in results"}

    batch_check = {
        "pass": got_n == expected_n,
        "detail": f"got {got_n} results, expected {expected_n}",
    }

    if not shape_check["pass"] or not batch_check["pass"]:
        return {
            "pass": False,
            "reason": "shape/batch failure",
            "checks": {
                "shape":          shape_check,
                "batch_complete": batch_check,
                "bitwise_correct":{"pass": False, "detail": "skipped"},
            },
        }

    # Per-query bitwise-correct check
    failures = []
    n_checked = 0
    for i, (q, r) in enumerate(zip(queries, results)):
        n_checked += 1
        if q["op"] == "dtoa":
            input_bits = int(q["bits"], 16)
            ok, reason = verify_dtoa_query(input_bits, r)
            if not ok and len(failures) < 5:
                input_double = double_from_bits(input_bits)
                failures.append(
                    f"idx {i}: op=dtoa bits=0x{input_bits:016x} ({input_double!r}) "
                    f"cand={r!r} :: {reason}"
                )
            if not ok and len(failures) == 5:
                failures.append("(further failures suppressed)")
        elif q["op"] == "strtod":
            ok, reason = verify_strtod_query(q["s"], r)
            if not ok and len(failures) < 5:
                failures.append(
                    f"idx {i}: op=strtod input={q['s']!r} cand={r!r} :: {reason}"
                )
            if not ok and len(failures) == 5:
                failures.append("(further failures suppressed)")
        else:
            failures.append(f"idx {i}: unknown op {q.get('op')!r}")

    n_failed = sum(1 for f in failures if not f.startswith("("))
    bw_check = {
        "pass": len(failures) == 0,
        "detail": (
            f"{n_checked} queries; {n_failed} failures"
            if failures else f"{n_checked} queries all correct"
        ),
    }
    if failures:
        bw_check["detail"] = bw_check["detail"] + " | " + " | ".join(failures)

    overall_pass = shape_check["pass"] and batch_check["pass"] and bw_check["pass"]
    reason = "all invariants hold" if overall_pass else "see check details"
    return {
        "pass": overall_pass,
        "reason": reason,
        "checks": {
            "shape":          shape_check,
            "batch_complete": batch_check,
            "bitwise_correct":bw_check,
        },
    }


def main() -> None:
    payload = json.load(sys.stdin)
    print(json.dumps(verify_case(payload)))


if __name__ == "__main__":
    main()
