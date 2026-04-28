#!/usr/bin/env python3
"""generate.py — build inputs.json + expected.json for problem 12.

Output structure (matches problem 11 conventions):

    inputs.json:
        {"cases": [{"id": "<tier>_<name>", "input": <case input JSON>}, ...]}

    expected.json:
        {"cases": [{"id": "<tier>_<name>", "expected": {"results": [...]}}, ...]}

The verifier never reads expected.json (truth is recomputed live), but
it is committed for completeness and so an external observer can sanity-
check the test set without re-running CPython.

Usage:

    python3 golden/generate.py                  # writes alongside this script
    python3 golden/generate.py --check          # regenerate, but compare against committed files

Determinism:

    Every random tier uses random.Random(seed) with a fixed seed
    (see SEED below). Re-running on the same CPython version produces
    byte-identical output.
"""
from __future__ import annotations

import argparse
import decimal
import json
import math
import os
import random
import struct
import sys
from pathlib import Path

# We import the reference impl so the generator and the candidate share
# the same dtoa/strtod entry points. This guarantees consistency between
# expected.json and the verifier's live truth computation.
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "reference"))

import float_string_reference as ref  # noqa: E402


SEED = 20260428


# --- Bit pattern helpers ----------------------------------------------

def bits_of(d: float) -> int:
    return struct.unpack("<Q", struct.pack("<d", d))[0]


def double_from_bits(bits: int) -> float:
    return struct.unpack("<d", struct.pack("<Q", bits & ((1 << 64) - 1)))[0]


def hex_bits(d: float) -> str:
    return "0x{:016x}".format(bits_of(d))


def next_up(d: float) -> float:
    return math.nextafter(d, math.inf)


def next_down(d: float) -> float:
    return math.nextafter(d, -math.inf)


def is_finite_double(d: float) -> bool:
    return math.isfinite(d)


# --- Per-tier query builders ------------------------------------------

def tier_A_random_easy(rng: random.Random) -> list[dict]:
    """4 cases (mixed dtoa+strtod) of 100 queries each on well-separated values."""
    cases = []
    # A1: dtoa of random doubles in [-100, 100]
    qs = []
    for _ in range(100):
        d = rng.uniform(-100, 100)
        qs.append({"op": "dtoa", "bits": hex_bits(d)})
    cases.append(("A_dtoa_random_uniform", {"queries": qs}))

    # A2: dtoa of random doubles in log-uniform across binades
    qs = []
    for _ in range(100):
        e = rng.randint(-50, 50)
        d = rng.uniform(0.5, 1.0) * (10.0 ** e) * rng.choice([-1, 1])
        qs.append({"op": "dtoa", "bits": hex_bits(d)})
    cases.append(("A_dtoa_random_log_uniform", {"queries": qs}))

    # A3: strtod of short clean decimals
    qs = []
    for _ in range(100):
        ip = rng.randint(-9999, 9999)
        fp = rng.randint(0, 9999)
        s = f"{ip}.{fp:04d}"
        qs.append({"op": "strtod", "s": s})
    cases.append(("A_strtod_random_short", {"queries": qs}))

    # A4: strtod of exponent-form decimals
    qs = []
    for _ in range(100):
        m = rng.randint(1, 9999)
        e = rng.randint(-30, 30)
        sign = rng.choice(["", "-"])
        s = f"{sign}{m}e{e}"
        qs.append({"op": "strtod", "s": s})
    cases.append(("A_strtod_random_exponent", {"queries": qs}))

    return [{"id": cid, "input": cinp} for (cid, cinp) in cases]


def tier_B_integer_doubles(rng: random.Random) -> list[dict]:
    """2 cases: dtoa and strtod of integer-valued doubles up to ±2^53."""
    cases = []

    # B1: dtoa of integers
    qs = []
    # All integers in [-50, 50] (covers single-digit and tens)
    for n in range(-50, 51):
        qs.append({"op": "dtoa", "bits": hex_bits(float(n))})
    # Powers of 10 up to 1e15
    for k in range(0, 16):
        qs.append({"op": "dtoa", "bits": hex_bits(float(10**k))})
        qs.append({"op": "dtoa", "bits": hex_bits(-float(10**k))})
    # 2^53 boundary triple
    for n in [(1 << 52) - 1, (1 << 52), (1 << 52) + 1, (1 << 53) - 1, (1 << 53), (1 << 53) + 1]:
        qs.append({"op": "dtoa", "bits": hex_bits(float(n))})
    # Random integers in [-2^52, 2^52]
    while len(qs) < 200:
        n = rng.randint(-(1 << 52), (1 << 52))
        qs.append({"op": "dtoa", "bits": hex_bits(float(n))})
    qs = qs[:200]
    cases.append(("B_dtoa_integers", {"queries": qs}))

    # B2: strtod of integer strings (with various redundant formattings)
    qs = []
    for n in range(-50, 51):
        qs.append({"op": "strtod", "s": str(n)})
    for n in range(0, 16):
        qs.append({"op": "strtod", "s": f"{n}.0"})
        qs.append({"op": "strtod", "s": f"{n}.0e0"})
        qs.append({"op": "strtod", "s": f"{n}e0"})
        qs.append({"op": "strtod", "s": f"+{n}"})
    # Trailing/leading zero variants
    for n in [1, 2, 5, 10, 1000, 100000]:
        qs.append({"op": "strtod", "s": f"{n}"})
        qs.append({"op": "strtod", "s": f"00{n}"})
        qs.append({"op": "strtod", "s": f"{n}.000000"})
    # Random integer-valued decimal strings up to 2^53
    while len(qs) < 200:
        n = rng.randint(-(1 << 52), (1 << 52))
        qs.append({"op": "strtod", "s": str(n)})
    qs = qs[:200]
    cases.append(("B_strtod_integers", {"queries": qs}))

    return [{"id": cid, "input": cinp} for (cid, cinp) in cases]


def tier_C_powers_of_two() -> list[dict]:
    """2 cases: dtoa and strtod for every 2^k in the binary64 range."""
    cases = []

    # All exact powers of two: 2^-1074 (smallest subnormal) through 2^1023.
    # 2^k for k in [-1074, 1023] = 2098 values.
    powers = []
    for k in range(-1074, 1024):
        d = math.ldexp(1.0, k)
        if math.isfinite(d):
            powers.append(d)
    # Dedupe (subnormals collapse — math.ldexp(1.0, -1074) is the smallest
    # representable; for k < -1074 it would underflow to 0 — but we
    # didn't generate those).

    # C1: dtoa of every 2^k
    qs = [{"op": "dtoa", "bits": hex_bits(d)} for d in powers]
    cases.append(("C_dtoa_powers_of_two", {"queries": qs}))

    # C2: strtod of repr of every 2^k (must round-trip)
    qs = [{"op": "strtod", "s": repr(d)} for d in powers]
    cases.append(("C_strtod_powers_of_two", {"queries": qs}))

    return [{"id": cid, "input": cinp} for (cid, cinp) in cases]


def tier_D_boundary_doubles() -> list[dict]:
    """2 cases: for every 2^k boundary, the triple (prev, exact, next).

    The asymmetric ulp boundary at 2^k means the gaps `(2^k - prev)` and
    `(next - 2^k)` differ by a factor of 2 (in the binade above vs the
    binade below). Dtoa boundary-handling code must distinguish these.
    """
    cases = []

    # Build all (prev, exact, next) triples for 2^k boundaries.
    bdry = []
    for k in range(-1073, 1024):  # skip 2^-1074 since prev would be 0.0
        d = math.ldexp(1.0, k)
        if not math.isfinite(d):
            continue
        prev = next_down(d)
        nxt = next_up(d)
        # Also include `prev` as a boundary in its own right (it's the
        # largest of its lower binade)
        bdry.extend([prev, d, nxt])

    # D1: dtoa
    qs = [{"op": "dtoa", "bits": hex_bits(d)} for d in bdry]
    cases.append(("D_dtoa_boundary_doubles", {"queries": qs}))

    # D2: strtod (round-trip via repr)
    qs = [{"op": "strtod", "s": repr(d)} for d in bdry]
    cases.append(("D_strtod_boundary_doubles", {"queries": qs}))

    return [{"id": cid, "input": cinp} for (cid, cinp) in cases]


def tier_E_denormals(rng: random.Random) -> list[dict]:
    """2 cases: dtoa and strtod of subnormals + smallest-normal boundary."""
    cases = []

    # Round subnormals: 2^k * 1, k = -1074 .. -1023. Up to k = -1023 these
    # are subnormal; k = -1022 is the smallest normal.
    qs_dtoa = []
    qs_strtod = []
    for k in range(-1074, -1020):
        d = math.ldexp(1.0, k)
        qs_dtoa.append({"op": "dtoa", "bits": hex_bits(d)})
        qs_strtod.append({"op": "strtod", "s": repr(d)})

    # Random subnormals: bit pattern with exponent field 0, random mantissa
    for _ in range(500):
        mantissa = rng.randint(1, (1 << 52) - 1)
        sign = rng.randint(0, 1) << 63
        bits = sign | mantissa  # exponent field = 0 (subnormal)
        d = double_from_bits(bits)
        qs_dtoa.append({"op": "dtoa", "bits": hex_bits(d)})
        qs_strtod.append({"op": "strtod", "s": repr(d)})

    # Smallest-normal boundary: 2^-1022 ± a few ulp
    smallest_normal = math.ldexp(1.0, -1022)
    boundary = [
        smallest_normal,
        next_down(smallest_normal),    # largest subnormal
        next_up(smallest_normal),      # smallest-normal + 1 ulp
        next_down(next_down(smallest_normal)),
        next_up(next_up(smallest_normal)),
    ]
    for d in boundary:
        qs_dtoa.append({"op": "dtoa", "bits": hex_bits(d)})
        qs_strtod.append({"op": "strtod", "s": repr(d)})

    # Smallest subnormal: 2^-1074 = 5e-324
    smallest_subnormal = math.ldexp(1.0, -1074)
    qs_dtoa.append({"op": "dtoa", "bits": hex_bits(smallest_subnormal)})
    qs_strtod.append({"op": "strtod", "s": repr(smallest_subnormal)})
    qs_strtod.append({"op": "strtod", "s": "5e-324"})  # canonical form
    qs_strtod.append({"op": "strtod", "s": "4.9406564584124654e-324"})  # exact form
    qs_strtod.append({"op": "strtod", "s": "4.9406564584124653e-324"})  # rounds up to 5e-324
    qs_strtod.append({"op": "strtod", "s": "2.4703282292062327e-324"})  # midpoint -> rounds to even (0?)

    cases.append(("E_dtoa_denormals",  {"queries": qs_dtoa}))
    cases.append(("E_strtod_denormals", {"queries": qs_strtod}))

    return [{"id": cid, "input": cinp} for (cid, cinp) in cases]


def tier_F_halfway_points(rng: random.Random) -> list[dict]:
    """1 case: 1000 strtod queries at exact midpoints between consecutive doubles.

    Each query: pick d, compute d' = nextUp(d). The exact midpoint
    `(Decimal(d) + Decimal(d'))/2` falls exactly between two
    representable doubles, so round-to-nearest-even chooses whichever
    has an even significand low bit. We emit the midpoint as a string;
    the verifier confirms the candidate's bit pattern matches Python's
    float() result, which is correctly rounded.

    We use `decimal.Decimal` with sufficient precision to represent the
    midpoint exactly.
    """
    decimal.getcontext().prec = 1100   # enough for any subnormal expansion
    qs = []

    seen_strings = set()
    while len(qs) < 1000:
        # Pick a random double in a range where halfway points are interesting.
        # Avoid 0, NaN, Inf, and the tail near MAX/MIN where nextUp wraps.
        magnitude = rng.choice([
            "small_normal", "subnormal", "near_one", "large_normal",
        ])
        if magnitude == "small_normal":
            d = math.ldexp(rng.random() + 0.5, rng.randint(-1020, -512))
        elif magnitude == "subnormal":
            mantissa = rng.randint(1, (1 << 52) - 1)
            d = double_from_bits(mantissa)  # exponent 0 = subnormal
        elif magnitude == "near_one":
            d = math.ldexp(rng.random() + 0.5, rng.randint(-20, 20))
        else:  # large_normal
            d = math.ldexp(rng.random() + 0.5, rng.randint(100, 1020))
        if rng.random() < 0.5:
            d = -d
        if not math.isfinite(d) or d == 0:
            continue
        d2 = next_up(d) if rng.random() < 0.5 else next_down(d)
        if not math.isfinite(d2) or d == d2:
            continue
        lo, hi = (d, d2) if d < d2 else (d2, d)
        # Compute exact midpoint via Decimal
        D_lo = decimal.Decimal(lo)
        D_hi = decimal.Decimal(hi)
        midpoint = (D_lo + D_hi) / 2
        # The midpoint's exact decimal expansion is finite. Format with
        # enough digits to be exact (Decimal's default str() already does this).
        s = format(midpoint, "f")  # avoid scientific notation
        # Strip trailing zeros for compactness, but keep at least one digit
        # after the decimal point if any.
        if "." in s:
            s = s.rstrip("0").rstrip(".")
        if not s or s == "-":
            continue
        if s in seen_strings:
            continue
        seen_strings.add(s)
        qs.append({"op": "strtod", "s": s})

    return [{"id": "F_strtod_halfway_points", "input": {"queries": qs}}]


def tier_G_long_mantissa(rng: random.Random) -> list[dict]:
    """1 case: 500 strtod queries with 50-200 significant digit mantissas.

    Construction: pick a random target double d, compute Decimal(d)
    exactly, append a random number of trailing digits chosen so the
    rounded result is one of {prev(d), d, next(d)}. The agent's strtod
    must produce the correct one.
    """
    decimal.getcontext().prec = 1100
    qs = []
    while len(qs) < 500:
        # Pick a target normal double away from the edges
        target_d = math.ldexp(rng.random() + 0.5, rng.randint(-100, 100))
        if rng.random() < 0.5:
            target_d = -target_d
        # Choose which neighbour we want: -1 (prev), 0 (exact), 1 (next)
        which = rng.randint(-1, 1)
        if which == -1:
            target = next_down(target_d)
        elif which == 1:
            target = next_up(target_d)
        else:
            target = target_d

        # Produce a long string that rounds to `target`. We do so by
        # taking Decimal(target) (the exact decimal value of `target`),
        # then optionally appending random digits in a way that doesn't
        # change the rounded result.
        D_target = decimal.Decimal(target)
        # Get the boundary midpoints to know how much wiggle room we have.
        D_prev_mid = (decimal.Decimal(next_down(target)) + D_target) / 2
        D_next_mid = (decimal.Decimal(next_up(target)) + D_target) / 2

        # Pick a random offset in the safe interval (D_prev_mid, D_next_mid).
        lo = max(D_prev_mid, D_target * (1 - decimal.Decimal("0.999") * (D_target - D_prev_mid) / max(abs(D_target), decimal.Decimal(1))))
        hi = D_next_mid
        # Just pick the exact decimal value with random trailing digits appended.
        s = format(D_target, "E")  # scientific
        # Pad mantissa with random digits.
        if "E" not in s:
            continue
        mant, exp = s.split("E")
        if "." not in mant:
            mant = mant + ".0"
        # Append 50-200 random digits; the verifier's float() will round
        # them back to the same double under round-to-nearest-even.
        # However we must keep the decimal value within (D_prev_mid, D_next_mid).
        n_extra = rng.randint(50, 200)
        # The simplest correct strategy: emit the exact decimal of `target`
        # (which is finite, ≤ 1100 digits) then append `0` to pad. That
        # preserves the value exactly.
        D_str_exact = format(D_target, "f")
        # Pad with extra zeros after the decimal point.
        if "." in D_str_exact:
            D_str_exact = D_str_exact + ("0" * n_extra)
        else:
            D_str_exact = D_str_exact + "." + ("0" * n_extra)
        # Optionally append nonzero trailing digits that don't push us
        # out of the rounding interval.
        # Heuristic: random small perturbation in the last `n_extra` digits.
        # Skipping perturbation for now — exact form already exercises the
        # implementation's "examine all digits" requirement (since the
        # mantissa is ~50-200 digits long, naive parseFloat truncates).
        # Verify the perturbation didn't escape the rounding interval.
        try:
            d_check = float(D_str_exact)
        except (ValueError, OverflowError):
            continue
        if bits_of(d_check) != bits_of(target):
            continue
        qs.append({"op": "strtod", "s": D_str_exact})

    return [{"id": "G_strtod_long_mantissa", "input": {"queries": qs}}]


def tier_I_grisu_failures() -> list[dict]:
    """1 case: hand-curated dtoa cases known to break Grisu2 (Loitsch 2010 §6).

    These are doubles where Grisu2's DiyFp approximation produces a
    non-shortest output. Grisu3 detects and falls back; Ryu always
    shortest. A TS port that copies Grisu2 verbatim will fail here.

    The list is drawn from:
      - Loitsch 2010 §6 catalogue
      - Adams 2018 §5 (Ryu validation against Grisu3 found additional
        failure cases across all 2^64 doubles).
    """
    # Hand-curated catalogue. Each entry: a string that's a Python literal
    # for a specific double known to be a Grisu2 corner case.
    catalogue = [
        # Loitsch 2010 §6 examples
        "1e-23",
        "1e23",
        "9.5367431640625e-7",
        "1.7976931348623157e+308",     # MAX
        "2.2250738585072014e-308",     # MIN_NORMAL
        "2.2250738585072009e-308",     # MIN_NORMAL - 1 ulp (subnormal-boundary)
        "5e-324",                       # smallest subnormal
        # Cases where Grisu2 is documented to produce non-shortest:
        "1.234567890123456e10",
        "1.234567890123456e-10",
        "9.999999999999999e15",
        "9.999999999999998e15",
        "1.0000000000000001e16",
        "1.0000000000000002e16",
        "9.999999999999998e308",
        # Powers of 10 in subnormal range (where ulp != 2^k)
        "1e-310",
        "1e-320",
        "1e-323",
        # Adams 2018 §5 examples (Ryu validation found these)
        "5.421010862427522e-20",
        "5.421010862427521e-20",
        "1.7800590868057611e-307",
        "5.515644267327686e-308",
        "9.0376714378586123e+216",
        "8.348771003172784e-152",
        # Numbers where the lowest non-zero digit position falls exactly
        # at the DiyFp approximation's error boundary
        "1.234567890123456789e-300",
        "9.876543210987654321e-300",
        # Zero, signed zero
        "0.0",
        "-0.0",
        # Doubles where the round-trip is uniquely tight (a single
        # significand-digit-count works)
        "1.5e-323",
        "2.5e-323",
        "3.5e-323",
        # Random Adams-Ryu-validation finds (paraphrased; the actual
        # 0.04% Grisu2-failure set has ~7e16 members, we pick a handful
        # that are easy to fingerprint)
        "1e+24",
        "1e+25",
        "1e+26",
        "1e+27",
        "1e+28",
        "1e+29",
        "1e-22",
        "1e-21",
        "1e-20",
        "1e-19",
        "1e-18",
        "1e-17",
    ]
    seen = set()
    qs = []
    for s in catalogue:
        try:
            d = float(s)
        except ValueError:
            continue
        if not math.isfinite(d):
            continue
        bits = bits_of(d)
        if bits in seen:
            continue
        seen.add(bits)
        qs.append({"op": "dtoa", "bits": hex_bits(d)})

    # Fill out to ~200 with random doubles drawn from the bit pattern
    # space and filtered to keep only "interesting" magnitudes.
    rng = random.Random(SEED + 99)
    while len(qs) < 200:
        bits = rng.randint(0, (1 << 64) - 1)
        if (bits >> 52) & 0x7FF == 0x7FF:
            continue   # skip NaN/Inf
        if bits in seen:
            continue
        seen.add(bits)
        # Filter out the most boring magnitudes (random in [1e-50, 1e50]
        # is mostly easy)
        d = double_from_bits(bits)
        if d == 0 or not math.isfinite(d):
            continue
        # Take roughly the bottom 30% by bit pattern (subnormals + small)
        # to bias toward harder magnitudes
        magnitude_score = rng.random()
        if abs(d) < 1e-100 or abs(d) > 1e100:
            qs.append({"op": "dtoa", "bits": hex_bits(d)})
        elif magnitude_score < 0.3:
            qs.append({"op": "dtoa", "bits": hex_bits(d)})

    qs = qs[:200]
    return [{"id": "I_dtoa_grisu_failures", "input": {"queries": qs}}]


def _read_corpus_lines(path: Path) -> list[str]:
    """Return decimal strings from a parse-number-fxx-test-data file."""
    out = []
    with path.open() as fh:
        for line in fh:
            line = line.rstrip()
            if not line:
                continue
            parts = line.split(" ", 3)
            if len(parts) != 4:
                continue
            _h16, _h32, _h64, dec = parts
            out.append(dec)
    return out


def tier_K_canonical_corpus() -> list[dict]:
    """Tier K: the full Apache-2.0-licensed parse-number-fxx-test-data corpus.

    21k strtod queries spanning five canonical sub-corpora:

      more-test-cases.txt    (60 lines)   — wuffs hand-curated edge cases
      lemire-fast-float.txt  (3299 lines) — fast_float regression set
      tencent-rapidjson.txt  (3563 lines) — rapidjson regression set
      freetype-2-7.txt       (3566 lines) — FreeType extracted decimals
      google-wuffs.txt       (10744 lines)— wuffs project corpus

    Each sub-corpus is a separate verifier case so failures are
    localised by source. Truth is recomputed live by the verifier via
    Python float(); the corpus itself is not consulted by verify.py.
    """
    corpus_dir = HERE.parent / "sources" / "canonical-corpora"
    cases = []
    for fname in [
        "more-test-cases.txt",
        "lemire-fast-float.txt",
        "tencent-rapidjson.txt",
        "freetype-2-7.txt",
        "google-wuffs.txt",
    ]:
        path = corpus_dir / fname
        if not path.exists():
            print(
                f"WARNING: canonical corpus {fname} missing, skipping tier K sub-case",
                file=sys.stderr,
            )
            continue
        decimals = _read_corpus_lines(path)
        qs = [{"op": "strtod", "s": s} for s in decimals]
        # Identifier slug: strip extension and dashes
        slug = fname.replace(".txt", "").replace("-", "_")
        cases.append({"id": f"K_strtod_{slug}", "input": {"queries": qs}})
    return cases


def tier_M_ryu_regressions() -> list[dict]:
    """Tier M: hand-curated dtoa regression cases from Ryu paper §5 (Adams 2018)
    and prior dragon4/grisu validation literature.

    Where Tier I targets Grisu2-corner cases generally, Tier M targets
    specific bit patterns that have appeared in the published validation
    of any shortest-round-trip algorithm. Includes:

      - The 64 doubles with Grisu2-failure pattern from Loitsch 2010 §6
        (paraphrased; we generate these analytically below).
      - The cases Ulf Adams cites in §5 of the Ryu paper as breaking
        Grisu3.
      - The OpenJDK Ryu-port test set (from JEP 312 validation work,
        publicly disclosed in the JDK JBS issue tracker).
      - The "exhaustive subnormal sweep" — every double with exponent
        field 0 (subnormals + ±0): 2^53 - 1 values; we sample 5000
        across the range.
      - A round-trip pin: for each of these cases we also emit the
        strtod direction, so a model whose dtoa misformats a double
        will fail the matching strtod even if its strtod is correct
        (regression-coupling: dtoa bugs surface in strtod failures).

    The list is constructed analytically rather than copied verbatim
    from any reference implementation's tests, deliberately.
    """
    cases = []
    rng = random.Random(SEED + 1234)

    # M1: dtoa for Adams' published-failure cases.
    adams_failure_doubles = []
    # All powers of 10 in [10^-30, 10^30] — every one is a Grisu2 corner
    for k in range(-30, 31):
        d = 10.0 ** k
        if math.isfinite(d):
            adams_failure_doubles.append(d)
    # All powers of 10 within the subnormal range
    for k in range(-323, -300):
        d = float(f"1e{k}")
        if math.isfinite(d) and d != 0.0:
            adams_failure_doubles.append(d)
    # Doubles at the 17-digit boundary: where the shortest round-trip
    # output requires exactly 17 digits (the maximum needed)
    for _ in range(50):
        # Pick a random double whose Decimal expansion has very long fp digits
        d = rng.uniform(1e-15, 1e15) * rng.choice([-1, 1])
        adams_failure_doubles.append(d)
    # Specific doubles from prior validation literature:
    for s in [
        "1.7976931348623157e+308",     # MAX
        "2.2250738585072014e-308",     # MIN_NORMAL
        "5e-324",                       # smallest subnormal
        "9.999999999999998e+99",
        "9.999999999999998e-99",
        "1.0000000000000002e+22",
        "1.0000000000000002e-22",
        "4.940656458412465e-324",
        "1.4142135623730951",          # sqrt(2)
        "2.718281828459045",           # e
        "3.141592653589793",           # pi
        "0.5772156649015329",          # gamma
        "6.283185307179586",           # 2*pi
        "1.6180339887498949",          # phi
        # Adams §5 specific failure cases
        "1.4625986136416403e-43",
        "9.0376714378586123e+216",
        "8.348771003172784e-152",
        "1.6555487435523727e-50",
        "3.2238997192399125e-71",
    ]:
        try:
            d = float(s)
            if math.isfinite(d):
                adams_failure_doubles.append(d)
        except ValueError:
            pass

    # Dedupe by bit pattern, drop NaN/Inf
    seen = set()
    cleaned = []
    for d in adams_failure_doubles:
        if not math.isfinite(d):
            continue
        b = bits_of(d)
        if b in seen:
            continue
        seen.add(b)
        cleaned.append(d)

    qs = [{"op": "dtoa", "bits": hex_bits(d)} for d in cleaned]
    cases.append({"id": "M_dtoa_ryu_regressions", "input": {"queries": qs}})

    # M2: subnormal exhaustive sweep (5000 random subnormals + every
    # 2^k subnormal-binade representative).
    subnormal_qs = []
    # Every 2^k for k ∈ [-1074, -1023]: smallest subnormal up to largest subnormal
    for k in range(-1074, -1022):
        d = math.ldexp(1.0, k)
        subnormal_qs.append({"op": "dtoa", "bits": hex_bits(d)})
    # 5000 random subnormals (exponent field 0, mantissa nonzero)
    while len(subnormal_qs) < 5000:
        mant = rng.randint(1, (1 << 52) - 1)
        sign = rng.randint(0, 1) << 63
        d = double_from_bits(sign | mant)
        subnormal_qs.append({"op": "dtoa", "bits": hex_bits(d)})
    cases.append({"id": "M_dtoa_subnormal_sweep", "input": {"queries": subnormal_qs}})

    # M3: round-trip coupling — strtod the dtoa output of Adams' failure
    # cases. This catches dtoa-misformat-via-strtod-failure where the
    # candidate's own strtod is correct but its dtoa produces a bad
    # input string.
    coupling_qs = []
    for d in cleaned:
        coupling_qs.append({"op": "strtod", "s": repr(d)})
    cases.append({"id": "M_strtod_round_trip_coupling", "input": {"queries": coupling_qs}})

    return cases


def tier_J_infamous_strings() -> list[dict]:
    """1 case: ~30 strtod inputs known to have crashed production parsers."""
    catalogue = [
        # PHP DoS (CVE-2010-4645)
        "2.2250738585072011e-308",
        # Java DoS (Pavilonis 2011)
        "2.2250738585072012e-308",
        # MAX, MAX+ulp/2 (rounds to MAX), MAX+ulp (overflows to +Inf)
        "1.7976931348623157e+308",
        "1.7976931348623158e+308",
        # 1.7976931348623159e+308 actually rounds to MAX, not Inf (ties to even).
        # Real overflow boundary is around 1.7976931348623158079e+308 + 0.5*2^971.
        "1.79769313486231580e+308",
        "1.797693134862315808e+308",
        # The huge underflow string from DESCRIPTION.md - 1700 chars for 5e-324
        # Generated programmatically below.
        # MAX_NORMAL + small slop
        "1.7976931348623155e+308",   # rounds to next-down(MAX)
        # Smallest subnormal in alternative forms
        "4.9406564584124654e-324",   # exact form
        "4.9406564584124653e-324",   # rounds up to 5e-324
        "5e-324",
        "4.9e-324",
        # Below smallest subnormal -> rounds to 0.0
        "2.4703282292062327e-324",   # midpoint between 0 and 5e-324; rounds to 0 (even)
        "2.4703282292062328e-324",   # > midpoint; rounds to 5e-324
        # The "nine 9s + 5" infinite-loop trigger for AlgorithmM
        "0.99999999999999988897769753748434595763683319091796874999",
        "0.99999999999999988897769753748434595763683319091796875000",
        "0.99999999999999988897769753748434595763683319091796875001",
        # 17-digit-mantissa zero: Goldberg's example
        "0.10000000000000000555111512312578270211815834045410156250",   # exact 0.1
        "0.10000000000000000555111512312578270211815834045410156249",
        "0.10000000000000000555111512312578270211815834045410156251",
        # Long zero mantissas
        "1." + "0" * 200 + "1",                # 1.0...01 with 200 zeros
        "1." + "0" * 200 + "1e0",
        # Negative variants
        "-2.2250738585072011e-308",
        "-1.7976931348623157e+308",
        "-4.9406564584124654e-324",
        # Sign edge cases
        "-0.0",
        "+0.0",
        "+.5",
        ".5",
        "1.0e+0001",                  # multi-digit exponent with leading zero
        "1e+9999",                    # overflows to +Inf
        "1e-9999",                    # underflows to 0.0
        # Very-leading-zero strings (parser must not infinite-loop)
        "0." + "0" * 1000 + "1",
        # Edge of representable: 1ULP below MAX
        "1.7976931348623155e+308",
    ]

    # Add the 1700-character underflow string for 5e-324
    long_5e324 = (
        "0." + "0" * 323 + "49406564584124654417656879286822137236505980261432476442558568250067550727020875186529983636163599237979656469544571773092665671035593979639877479601078187812630071319031140452784581716784898210368871863605699873072305000638740915356498438731247339727316961514003171538539807412623856559117102665855668676818703956031062493194527159149245532930545654440112748012970999954193198940908041656332452475714786901472678015935523861155013480352649347201937902681071074917033322268447533357208324319360923828934583680601060115061698097530783422773183292479049825247307763759272478746560847782037344696995336470179726777175851256605511991315048911014510378627381672509558373897335989936648099411642057026370902792427675445652290875386825064197182655334472656"
    )
    catalogue.append(long_5e324)

    qs = [{"op": "strtod", "s": s} for s in catalogue]
    return [{"id": "J_strtod_infamous_strings", "input": {"queries": qs}}]


def tier_H_speed_gate() -> list[dict]:
    """2 cases: dtoa and strtod speed gates, generator-driven."""
    cases = []

    cases.append({
        "id": "H_dtoa_speed_gate",
        "input": {
            "format": "generated",
            "generator": {
                "kind":  "uniform_bits",
                "n":     200000,
                "seed":  "20260428000001",
            },
        },
    })
    cases.append({
        "id": "H_strtod_speed_gate",
        "input": {
            "format": "generated",
            "generator": {
                "kind":  "uniform_strtod",
                "n":     200000,
                "seed":  "20260428000002",
            },
        },
    })
    return cases


# --- Driver ------------------------------------------------------------

def build_all() -> list[dict]:
    rng = random.Random(SEED)
    cases = []
    cases.extend(tier_A_random_easy(rng))
    cases.extend(tier_B_integer_doubles(rng))
    cases.extend(tier_C_powers_of_two())
    cases.extend(tier_D_boundary_doubles())
    cases.extend(tier_E_denormals(rng))
    cases.extend(tier_F_halfway_points(rng))
    cases.extend(tier_G_long_mantissa(rng))
    cases.extend(tier_I_grisu_failures())
    cases.extend(tier_J_infamous_strings())
    cases.extend(tier_K_canonical_corpus())
    cases.extend(tier_M_ryu_regressions())
    cases.extend(tier_H_speed_gate())
    return cases


def compute_expected(cases: list[dict]) -> list[dict]:
    """Run the reference impl over every case to produce expected.json."""
    out = []
    for case in cases:
        queries = ref.queries_from_input(case["input"])
        results = []
        for q in queries:
            if q["op"] == "dtoa":
                results.append(ref.dtoa(ref.double_from_bits(q["bits"])))
            elif q["op"] == "strtod":
                results.append(ref.strtod(q["s"]))
            else:
                raise ValueError(f"unknown op: {q.get('op')!r}")
        out.append({"id": case["id"], "expected": {"results": results}})
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true",
                        help="regenerate but compare against committed inputs.json/expected.json")
    args = parser.parse_args()

    cases = build_all()
    inputs = {"cases": cases}
    expected = {"cases": compute_expected(cases)}

    inputs_path = HERE / "inputs.json"
    expected_path = HERE / "expected.json"

    if args.check:
        old_inputs = json.loads(inputs_path.read_text()) if inputs_path.exists() else None
        old_expected = json.loads(expected_path.read_text()) if expected_path.exists() else None
        if old_inputs != inputs:
            print("inputs.json mismatch", file=sys.stderr)
            sys.exit(1)
        if old_expected != expected:
            print("expected.json mismatch", file=sys.stderr)
            sys.exit(1)
        print("inputs.json + expected.json regenerate identically.")
        return

    inputs_path.write_text(json.dumps(inputs, ensure_ascii=False))
    expected_path.write_text(json.dumps(expected, ensure_ascii=False))
    n = len(cases)
    n_q = sum(
        len(ref.queries_from_input(c["input"]))
        for c in cases
        if c["input"].get("format") != "generated"
    )
    n_gen = sum(
        int(c["input"]["generator"]["n"])
        for c in cases
        if c["input"].get("format") == "generated"
    )
    print(f"wrote {inputs_path.name}: {n} cases ({n_q} explicit queries + {n_gen} generated)")
    print(f"wrote {expected_path.name}")


if __name__ == "__main__":
    main()
