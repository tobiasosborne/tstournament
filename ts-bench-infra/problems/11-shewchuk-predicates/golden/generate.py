#!/usr/bin/env python3
"""
Adversarial golden-master generator for problem 11 — Shewchuk's
adaptive-precision geometric predicates.

The test set is structured in eight tiers, each designed to discriminate
a specific kind of failure mode. The cardinal design principle:

    A naive `Math.sign(det)` evaluator should fail tiers C–F catastrophically.
    A bigint-rational evaluator should pass tiers A–G but TIME OUT on H.
    Only an IEEE-754 adaptive-precision implementation (Shewchuk port)
    passes all eight tiers within the 1.5s per-case budget.

Tier descriptions:

    A. random_easy           well-separated random points; sanity floor.
    B. integer_exact_zero    integer coords on exact lines / planes /
                             circles / spheres; double computation is
                             bit-exact, sign is exactly 0. Naive passes.
    C. snap_to_grid          exactly-degenerate config built in
                             rationals, each coordinate rounded to its
                             nearest double. The rounded triplet's
                             exact-rational sign is generally nonzero.
                             Naive returns roundoff garbage.
    D. ulp_perturbation      double-exact degenerate configs perturbed
                             by k ULPs along one coordinate, k ∈
                             {-3, -1, 0, +1, +3}. Sign must transition
                             through zero. Naive fails any sign-flip
                             obscured by cancellation.
    E. catastrophic_cancel   coords clustered near (C, C) for large C
                             (2^50 to 1e15), with small offsets. Naive
                             determinant subtracts ~2C² near-equal
                             quantities; all bits below ulp(2C²) are
                             lost.
    F. planted_on_manifold   exactly co-circular / co-spherical /
                             coplanar k-tuples (rational
                             parameterisation), snapped to grid.
                             Headline incircle / insphere / orient3d
                             killer.
    G. (skipped — redundant with B–F)
    H. speed_gate            uniform-random non-degenerate queries via a
                             documented LCG, expanded by both the agent
                             and the verifier from a {kind, n, seed}
                             descriptor (avoids 100MB+ JSON). Tests
                             throughput. Bigint-rational TS dies here on
                             the 1.5s budget.

Determinism: all randomness is seeded by the constants below. Re-running
this script produces byte-identical inputs.json + expected.json.
"""

from __future__ import annotations

import json
import math
import os
import random
import sys
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "reference"))
import predicates_reference as py_ref  # noqa: E402

# Canonical reference: Shewchuk's predicates.c via ctypes. Required —
# the golden master must be generated from the canonical implementation
# (Shewchuk 1996), with the Python `predicates_reference.py` serving as
# a cross-validator. If shewchuk_oracle fails to load, this script
# refuses to produce expected.json: an unverified ground truth would
# defeat the point of the test set.
try:
    import shewchuk_oracle as oracle  # noqa: E402
except FileNotFoundError as e:
    print(
        f"FATAL: cannot load Shewchuk's canonical predicates.c oracle: {e}",
        file=sys.stderr,
    )
    print(
        "Build it first via:\n"
        "  gcc -O2 -shared -fPIC -o reference/libpredicates.so "
        "sources/Shewchuk_predicates_DCG_18_1996.c -lm",
        file=sys.stderr,
    )
    sys.exit(2)


SEED = 20260427  # stable seed = today's date

# ---------------------------------------------------------------------------
# Shared LCG (Tier H expansion). See verifier_protocol.md §"Tier H expansion"
# for the reference TypeScript implementation; this Python and that TS must
# produce byte-identical double streams from the same seed.
# ---------------------------------------------------------------------------

LCG_A = 6364136223846793005
LCG_C = 1442695040888963407
LCG_MASK = (1 << 64) - 1


def lcg_next(state: int) -> int:
    return (state * LCG_A + LCG_C) & LCG_MASK


def lcg_double_unit(state: int) -> float:
    # Top 53 bits of state, mapped to a double in [0, 1).
    return (state >> 11) / 9007199254740992.0  # 2^53


def lcg_doubles(seed: int, n: int, lo: float, hi: float) -> list[float]:
    state = seed & LCG_MASK
    span = hi - lo
    out = [0.0] * n
    for i in range(n):
        state = lcg_next(state)
        out[i] = lo + span * lcg_double_unit(state)
    return out


def expand_generator(predicate: str, gen: dict) -> list:
    """Expand a Tier H descriptor into the same query list both the
    agent and the verifier should see."""
    kind = gen["kind"]
    if kind != "uniform_random":
        raise ValueError(f"unknown generator kind: {kind}")
    n = gen["n"]
    seed = int(gen["seed"])
    lo = float(gen["lo"])
    hi = float(gen["hi"])
    pts_per_query, dim = _query_shape(predicate)
    total = n * pts_per_query * dim
    flat = lcg_doubles(seed, total, lo, hi)
    queries = []
    idx = 0
    for _ in range(n):
        q = []
        for _p in range(pts_per_query):
            pt = flat[idx : idx + dim]
            idx += dim
            q.append(pt)
        queries.append(q)
    return queries


def _query_shape(predicate: str) -> tuple[int, int]:
    return {
        "orient2d": (3, 2),
        "orient3d": (4, 3),
        "incircle": (4, 2),
        "insphere": (5, 3),
    }[predicate]


# ---------------------------------------------------------------------------
# IEEE-754 ULP helpers
# ---------------------------------------------------------------------------


def ulp_step(x: float, k: int) -> float:
    if k == 0:
        return x
    direction = math.inf if k > 0 else -math.inf
    for _ in range(abs(k)):
        x = math.nextafter(x, direction)
    return x


# ---------------------------------------------------------------------------
# Common helpers: rational rounding to doubles
# ---------------------------------------------------------------------------


def f(q) -> float:
    """Round a Fraction (or int) to the nearest IEEE-754 double."""
    return float(q)


def pt_d(coords) -> list[float]:
    return [f(c) for c in coords]


# ---------------------------------------------------------------------------
# Tier A — random_easy
# ---------------------------------------------------------------------------


def tier_A(predicate: str, rng: random.Random, n: int = 100) -> list:
    pts_per_query, dim = _query_shape(predicate)
    out = []
    for _ in range(n):
        q = []
        for _p in range(pts_per_query):
            q.append([rng.uniform(-100.0, 100.0) for _ in range(dim)])
        out.append(q)
    return out


# ---------------------------------------------------------------------------
# Tier B — integer_exact_zero
#
# Construct configurations where every coordinate is a small integer
# (so all double arithmetic is bit-exact up to 2^53) AND the
# mathematical determinant is exactly zero. Naive evaluators return
# zero on these by virtue of integer arithmetic being exact, so this
# tier is purely a sanity check that the agent's predicate doesn't
# spuriously return a fixed sign or perturb the input.
# ---------------------------------------------------------------------------


def tier_B_orient2d(rng: random.Random, n: int = 200) -> list:
    out = []
    for _ in range(n):
        ax = rng.randint(-50, 50)
        ay = rng.randint(-50, 50)
        dx = rng.randint(-20, 20)
        dy = rng.randint(-20, 20)
        if dx == 0 and dy == 0:
            dx = 1
        bx, by = ax + dx, ay + dy
        # Place c on the line a-b at integer parameter 2..5.
        t = rng.randint(2, 5)
        cx, cy = ax + t * dx, ay + t * dy
        out.append([[float(ax), float(ay)], [float(bx), float(by)], [float(cx), float(cy)]])
    return out


def tier_B_orient3d(rng: random.Random, n: int = 200) -> list:
    out = []
    for _ in range(n):
        a = [rng.randint(-30, 30) for _ in range(3)]
        u = [rng.randint(-15, 15) for _ in range(3)]
        v = [rng.randint(-15, 15) for _ in range(3)]
        # Make sure u, v are linearly independent in expectation.
        b = [a[i] + u[i] for i in range(3)]
        c = [a[i] + v[i] for i in range(3)]
        # d is integer linear combination of u and v.
        s = rng.randint(-3, 3) or 1
        t = rng.randint(-3, 3) or 1
        d = [a[i] + s * u[i] + t * v[i] for i in range(3)]
        out.append([
            [float(x) for x in a],
            [float(x) for x in b],
            [float(x) for x in c],
            [float(x) for x in d],
        ])
    return out


def tier_B_incircle(rng: random.Random, n: int = 200) -> list:
    """Co-circular integer points via Pythagorean triples on small circles."""
    out = []
    triples = [
        (3, 4, 5), (5, 12, 13), (8, 15, 17), (7, 24, 25), (9, 40, 41),
        (20, 21, 29), (28, 45, 53),
    ]
    for _ in range(n):
        a_int, b_int, _r = rng.choice(triples)
        # 4 points on circle radius r, all integer: (±a, ±b), (±b, ±a).
        candidates = [
            (a_int, b_int), (-a_int, b_int), (a_int, -b_int), (-a_int, -b_int),
            (b_int, a_int), (-b_int, a_int), (b_int, -a_int), (-b_int, -a_int),
        ]
        # Center can be any integer; circle becomes (x-cx)² + (y-cy)² = r².
        cx = rng.randint(-30, 30)
        cy = rng.randint(-30, 30)
        # Pick 4 distinct candidates.
        picks = rng.sample(candidates, 4)
        pts = [[float(p[0] + cx), float(p[1] + cy)] for p in picks]
        out.append(pts)
    return out


def tier_B_insphere(rng: random.Random, n: int = 200) -> list:
    """Co-spherical integer points: pick centers and use ±a,±b,±c permutations
    on small Euler 4-tuples a²+b²+c²=N."""
    out = []
    quads = [
        (1, 2, 2, 9), (2, 3, 6, 49), (1, 4, 8, 81), (3, 4, 12, 169),
        (2, 6, 9, 121), (1, 2, 10, 105),  # last one: 1+4+100=105
    ]
    for _ in range(n):
        a_int, b_int, c_int, _N = rng.choice(quads)
        # 5 distinct points by sign and axis permutation.
        all_signs = [(s1, s2, s3) for s1 in (1, -1) for s2 in (1, -1) for s3 in (1, -1)]
        # Permute the absolute values with signs to get many surface points.
        candidates = []
        for sgn in all_signs:
            for perm in [(0, 1, 2), (1, 0, 2), (2, 0, 1)]:
                vals = (a_int, b_int, c_int)
                p = (sgn[0] * vals[perm[0]], sgn[1] * vals[perm[1]], sgn[2] * vals[perm[2]])
                candidates.append(p)
        # Dedup
        candidates = list(set(candidates))
        if len(candidates) < 5:
            continue
        cx = rng.randint(-20, 20)
        cy = rng.randint(-20, 20)
        cz = rng.randint(-20, 20)
        picks = rng.sample(candidates, 5)
        pts = [[float(p[0] + cx), float(p[1] + cy), float(p[2] + cz)] for p in picks]
        out.append(pts)
    # Pad if truncation lost some.
    while len(out) < n:
        out.append(out[len(out) % max(1, len(out))])
    return out[:n]


# ---------------------------------------------------------------------------
# Tier C — snap_to_grid
#
# Build exactly-degenerate configuration in rationals, then round each
# coordinate to its nearest IEEE-754 double. The rounded coordinates
# are *not* exactly degenerate — their exact-rational interpretation
# yields a small but nonzero determinant whose sign is determined by
# the rounding direction of each coord. Naive `Math.sign(det)` returns
# whatever roundoff produces, which is sign-uncorrelated with the
# truth.
# ---------------------------------------------------------------------------


def tier_C_orient2d(rng: random.Random, n: int = 1000) -> list:
    out = []
    for _ in range(n):
        # Random tilted rational line y = (p/q) x + (r/s).
        p = rng.randint(-100, 100) or 1
        q = rng.randint(1, 100)
        r = rng.randint(-100, 100)
        s = rng.randint(1, 100)
        slope = Fraction(p, q)
        intercept = Fraction(r, s)
        # Three distinct rational x's in a tight band so the line
        # passes through a region where double rounding is non-trivial.
        xs_seen = set()
        xs = []
        while len(xs) < 3:
            x = Fraction(rng.randint(-200, 200), rng.randint(1, 50))
            if x not in xs_seen:
                xs_seen.add(x)
                xs.append(x)
        ys = [slope * x + intercept for x in xs]
        out.append([
            [f(xs[0]), f(ys[0])],
            [f(xs[1]), f(ys[1])],
            [f(xs[2]), f(ys[2])],
        ])
    return out


def tier_C_orient3d(rng: random.Random, n: int = 1000) -> list:
    out = []
    for _ in range(n):
        # Plane through origin: ax + by + cz = 0 with rational normal.
        nx = Fraction(rng.randint(-50, 50) or 1, rng.randint(1, 30))
        ny = Fraction(rng.randint(-50, 50) or 1, rng.randint(1, 30))
        nz = Fraction(rng.randint(-50, 50) or 1, rng.randint(1, 30))
        d = Fraction(rng.randint(-50, 50), rng.randint(1, 30))
        # Plane: nx*x + ny*y + nz*z = d.
        # Pick 4 points: pick (x, y) rationally, solve for z.
        pts = []
        seen = set()
        while len(pts) < 4:
            x = Fraction(rng.randint(-50, 50), rng.randint(1, 30))
            y = Fraction(rng.randint(-50, 50), rng.randint(1, 30))
            z = (d - nx * x - ny * y) / nz
            if (x, y) in seen:
                continue
            seen.add((x, y))
            pts.append((x, y, z))
        out.append([[f(c) for c in p] for p in pts])
    return out


def tier_C_incircle(rng: random.Random, n: int = 1000) -> list:
    """4 co-circular rational points (Pythagorean parameterisation), snapped."""
    out = []
    for _ in range(n):
        cx = Fraction(rng.randint(-50, 50), rng.randint(1, 30))
        cy = Fraction(rng.randint(-50, 50), rng.randint(1, 30))
        # Radius² is implicit; we use the rational parameterisation
        # (R*(1-t²)/(1+t²), R*2t/(1+t²)) for circle of radius R.
        R = Fraction(rng.randint(1, 30), rng.randint(1, 5))
        ts = []
        seen = set()
        while len(ts) < 4:
            t = Fraction(rng.randint(-30, 30), rng.randint(1, 30))
            if t in seen:
                continue
            seen.add(t)
            ts.append(t)
        pts_rat = []
        for t in ts:
            denom = 1 + t * t
            x = cx + R * (1 - t * t) / denom
            y = cy + R * (2 * t) / denom
            pts_rat.append((x, y))
        out.append([[f(c) for c in p] for p in pts_rat])
    return out


def tier_C_insphere(rng: random.Random, n: int = 1000) -> list:
    """5 co-spherical rational points via stereographic projection."""
    out = []
    for _ in range(n):
        cx = Fraction(rng.randint(-30, 30), rng.randint(1, 20))
        cy = Fraction(rng.randint(-30, 30), rng.randint(1, 20))
        cz = Fraction(rng.randint(-30, 30), rng.randint(1, 20))
        R = Fraction(rng.randint(1, 20), rng.randint(1, 5))
        # Parameterisation: (u, v) ↦ (2u, 2v, -1 + u² + v²) / (1 + u² + v²)
        # is on unit sphere; scale by R for radius R sphere.
        params = []
        seen = set()
        while len(params) < 5:
            u = Fraction(rng.randint(-20, 20), rng.randint(1, 15))
            v = Fraction(rng.randint(-20, 20), rng.randint(1, 15))
            if (u, v) in seen:
                continue
            seen.add((u, v))
            params.append((u, v))
        pts_rat = []
        for u, v in params:
            denom = 1 + u * u + v * v
            x = cx + R * (2 * u) / denom
            y = cy + R * (2 * v) / denom
            z = cz + R * (-1 + u * u + v * v) / denom
            pts_rat.append((x, y, z))
        out.append([[f(c) for c in p] for p in pts_rat])
    return out


# ---------------------------------------------------------------------------
# Tier D — ulp_perturbation
#
# Take a double-exact degenerate configuration (Tier B style) and
# perturb one coordinate by k ULPs for k ∈ {-3, -1, 0, +1, +3}. Each
# perturbed config yields a definite exact-rational sign; the sweep
# verifies the predicate's monotonicity through zero.
# ---------------------------------------------------------------------------


PERTURB_STEPS = [-3, -1, 0, 1, 3]


def _ulp_sweep(base_pts: list[list[float]], target_pt_idx: int, target_coord: int) -> list[list[list[float]]]:
    sweeps = []
    for k in PERTURB_STEPS:
        config = [list(pt) for pt in base_pts]
        config[target_pt_idx][target_coord] = ulp_step(
            base_pts[target_pt_idx][target_coord], k
        )
        sweeps.append(config)
    return sweeps


def tier_D_orient2d(rng: random.Random, n_base: int = 200) -> list:
    out = []
    for _ in range(n_base):
        ax = rng.randint(-50, 50)
        ay = rng.randint(-50, 50)
        dx = rng.randint(-20, 20)
        dy = rng.randint(-20, 20)
        if dx == 0 and dy == 0:
            dx = 1
        bx, by = ax + dx, ay + dy
        cx, cy = ax + 2 * dx, ay + 2 * dy
        base = [[float(ax), float(ay)], [float(bx), float(by)], [float(cx), float(cy)]]
        # Perturb c.x AND c.y (two sweeps per base config — ensures we
        # exercise both coords).
        out.extend(_ulp_sweep(base, 2, 0))
        out.extend(_ulp_sweep(base, 2, 1))
    return out


def tier_D_orient3d(rng: random.Random, n_base: int = 100) -> list:
    out = []
    for _ in range(n_base):
        a = [rng.randint(-30, 30) for _ in range(3)]
        u = [rng.randint(-15, 15) for _ in range(3)]
        v = [rng.randint(-15, 15) for _ in range(3)]
        b = [a[i] + u[i] for i in range(3)]
        c = [a[i] + v[i] for i in range(3)]
        s = rng.randint(-3, 3) or 1
        t = rng.randint(-3, 3) or 1
        d = [a[i] + s * u[i] + t * v[i] for i in range(3)]
        base = [[float(x) for x in p] for p in (a, b, c, d)]
        # Sweep d's x, y, z.
        for coord in range(3):
            out.extend(_ulp_sweep(base, 3, coord))
    return out


def tier_D_incircle(rng: random.Random, n_base: int = 100) -> list:
    """Use Tier B integer co-circular configs and ULP-perturb the 4th point."""
    out = []
    base_set = tier_B_incircle(rng, n_base)
    for base in base_set:
        for coord in range(2):
            out.extend(_ulp_sweep(base, 3, coord))
    return out


def tier_D_insphere(rng: random.Random, n_base: int = 80) -> list:
    out = []
    base_set = tier_B_insphere(rng, n_base)
    for base in base_set:
        for coord in range(3):
            out.extend(_ulp_sweep(base, 4, coord))
    return out


# ---------------------------------------------------------------------------
# Tier E — catastrophic_cancellation
#
# Coordinates clustered near (C, C) for large C. Naive evaluators
# accumulate intermediate products of magnitude ~C² and subtract to
# recover the desired value at magnitude ~1; all bits below
# `ulp(C²)` are lost.
# ---------------------------------------------------------------------------


def tier_E_orient2d(rng: random.Random, n: int = 500) -> list:
    out = []
    Cs = [2.0**40, 2.0**45, 2.0**50, 2.0**52, 1e10, 1e12, 1e15]
    for _ in range(n):
        C = rng.choice(Cs)
        # Direction vector with small integer components.
        dx = rng.randint(1, 50)
        dy = rng.choice([-1, 1]) * rng.randint(1, 50)
        # a, b on a near-line; c is approximately on the line, ULP-perturbed.
        a = [C, C]
        b = [C + float(dx), C + float(dy)]
        cx_target = C + 2.0 * float(dx)
        cy_target = C + 2.0 * float(dy)
        cx = ulp_step(cx_target, rng.choice([-1, 0, 1, 2]))
        cy = ulp_step(cy_target, rng.choice([-1, 0, 1, 2]))
        out.append([list(a), list(b), [cx, cy]])
    return out


def tier_E_orient3d(rng: random.Random, n: int = 500) -> list:
    out = []
    Cs = [2.0**40, 2.0**45, 2.0**50, 1e10, 1e12]
    for _ in range(n):
        C = rng.choice(Cs)
        # Three direction vectors u, v, and a fourth point d ~ near plane.
        u = [float(rng.randint(1, 30)), float(rng.randint(1, 30)), float(rng.randint(1, 30))]
        v = [float(rng.randint(-30, 30) or 1), float(rng.randint(-30, 30) or 1), float(rng.randint(-30, 30) or 1)]
        a = [C, C, C]
        b = [C + u[i] for i in range(3)]
        c = [C + v[i] for i in range(3)]
        s = rng.choice([1, 2, -1])
        t = rng.choice([1, 2, -1])
        d_target = [C + s * u[i] + t * v[i] for i in range(3)]
        d = [ulp_step(d_target[i], rng.choice([-1, 0, 1])) for i in range(3)]
        out.append([a, b, c, d])
    return out


def tier_E_incircle(rng: random.Random, n: int = 500) -> list:
    out = []
    Cs = [2.0**30, 2.0**35, 1e8, 1e10]
    for _ in range(n):
        C = rng.choice(Cs)
        # 4 points clustered near (C, C).
        offsets = [(rng.randint(-20, 20), rng.randint(-20, 20)) for _ in range(4)]
        # Ensure distinct.
        while len(set(offsets)) < 4:
            offsets = [(rng.randint(-20, 20), rng.randint(-20, 20)) for _ in range(4)]
        pts = [[C + float(ox), C + float(oy)] for ox, oy in offsets]
        out.append(pts)
    return out


def tier_E_insphere(rng: random.Random, n: int = 500) -> list:
    out = []
    Cs = [2.0**25, 2.0**30, 1e7, 1e9]
    for _ in range(n):
        C = rng.choice(Cs)
        offsets = [(rng.randint(-15, 15), rng.randint(-15, 15), rng.randint(-15, 15)) for _ in range(5)]
        while len({tuple(o) for o in offsets}) < 5:
            offsets = [(rng.randint(-15, 15), rng.randint(-15, 15), rng.randint(-15, 15)) for _ in range(5)]
        pts = [[C + float(o[0]), C + float(o[1]), C + float(o[2])] for o in offsets]
        out.append(pts)
    return out


# ---------------------------------------------------------------------------
# Tier F — planted_on_manifold
#
# Same construction as Tier C, but with parameters chosen so the
# rational manifold is harder for naive cancellation: large rational
# centers, mid-sized coordinate magnitudes, and many cases where the
# rounded points sit very close to the manifold (forcing the evaluator
# into deep adaptive expansion).
# ---------------------------------------------------------------------------


def tier_F_incircle(rng: random.Random, n: int = 1000) -> list:
    out = []
    for _ in range(n):
        cx = Fraction(rng.randint(-1000, 1000), rng.randint(1, 7))
        cy = Fraction(rng.randint(-1000, 1000), rng.randint(1, 7))
        R = Fraction(rng.randint(50, 500), rng.randint(1, 7))
        ts = []
        seen = set()
        while len(ts) < 4:
            t = Fraction(rng.randint(-100, 100), rng.randint(1, 100))
            if t in seen:
                continue
            seen.add(t)
            ts.append(t)
        pts_rat = []
        for t in ts:
            denom = 1 + t * t
            x = cx + R * (1 - t * t) / denom
            y = cy + R * (2 * t) / denom
            pts_rat.append((x, y))
        out.append([[f(c) for c in p] for p in pts_rat])
    return out


def tier_F_insphere(rng: random.Random, n: int = 1000) -> list:
    out = []
    for _ in range(n):
        cx = Fraction(rng.randint(-500, 500), rng.randint(1, 7))
        cy = Fraction(rng.randint(-500, 500), rng.randint(1, 7))
        cz = Fraction(rng.randint(-500, 500), rng.randint(1, 7))
        R = Fraction(rng.randint(30, 300), rng.randint(1, 7))
        params = []
        seen = set()
        while len(params) < 5:
            u = Fraction(rng.randint(-50, 50), rng.randint(1, 30))
            v = Fraction(rng.randint(-50, 50), rng.randint(1, 30))
            if (u, v) in seen:
                continue
            seen.add((u, v))
            params.append((u, v))
        pts_rat = []
        for u, v in params:
            denom = 1 + u * u + v * v
            x = cx + R * (2 * u) / denom
            y = cy + R * (2 * v) / denom
            z = cz + R * (-1 + u * u + v * v) / denom
            pts_rat.append((x, y, z))
        out.append([[f(c) for c in p] for p in pts_rat])
    return out


def tier_F_orient3d(rng: random.Random, n: int = 1000) -> list:
    """Coplanar quadruples on rational planes with large center-of-mass."""
    out = []
    for _ in range(n):
        nx = Fraction(rng.randint(-300, 300) or 1, rng.randint(1, 7))
        ny = Fraction(rng.randint(-300, 300) or 1, rng.randint(1, 7))
        nz = Fraction(rng.randint(-300, 300) or 1, rng.randint(1, 7))
        d = Fraction(rng.randint(-1000, 1000), rng.randint(1, 7))
        pts = []
        seen = set()
        while len(pts) < 4:
            x = Fraction(rng.randint(-500, 500), rng.randint(1, 7))
            y = Fraction(rng.randint(-500, 500), rng.randint(1, 7))
            z = (d - nx * x - ny * y) / nz
            if (x, y) in seen:
                continue
            seen.add((x, y))
            pts.append((x, y, z))
        out.append([[f(c) for c in p] for p in pts])
    return out


# ---------------------------------------------------------------------------
# Tier H — speed_gate (descriptor only)
# ---------------------------------------------------------------------------


def tier_H_descriptor(predicate: str, rng: random.Random) -> dict:
    n = {
        "orient2d": 500_000,
        "orient3d": 200_000,
        "incircle": 100_000,
        "insphere": 50_000,
    }[predicate]
    seed = rng.randint(1, (1 << 63) - 1)
    return {
        "kind": "uniform_random",
        "n": n,
        "seed": str(seed),
        "lo": -100.0,
        "hi": 100.0,
    }


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def case(case_id: str, predicate: str, queries=None, generator=None) -> dict:
    inp = {"predicate": predicate}
    if generator is not None:
        inp["format"] = "generated"
        inp["generator"] = generator
    else:
        inp["queries"] = queries
    return {"id": case_id, "input": inp}


def compute_expected(case_obj: dict) -> dict:
    """Compute expected signs from Shewchuk's canonical C oracle, with
    the Python bigint reference as a cross-check. Aborts loudly on any
    disagreement between the two."""
    inp = case_obj["input"]
    predicate = inp["predicate"]
    if inp.get("format") == "generated":
        queries = expand_generator(predicate, inp["generator"])
    else:
        queries = inp["queries"]
    signs = []
    for i, q in enumerate(queries):
        s_oracle = oracle.evaluate(predicate, q)
        s_python = py_ref.evaluate(predicate, q)
        if s_oracle != s_python:
            raise AssertionError(
                f"canonical/Python disagreement in {case_obj['id']} q[{i}]: "
                f"shewchuk={s_oracle} python={s_python} q={q}"
            )
        signs.append(s_oracle)
    return {"id": case_obj["id"], "expected": {"signs": signs}}


def build_all() -> tuple[list, list]:
    cases = []
    rng = random.Random(SEED)

    # orient2d: A B C D E (no F separate; E covers cluster) H
    cases.append(case("orient2d_A_random_easy", "orient2d", queries=tier_A("orient2d", rng, 100)))
    cases.append(case("orient2d_B_integer_exact_zero", "orient2d", queries=tier_B_orient2d(rng, 200)))
    cases.append(case("orient2d_C_snap_to_grid", "orient2d", queries=tier_C_orient2d(rng, 1000)))
    cases.append(case("orient2d_D_ulp_perturbation", "orient2d", queries=tier_D_orient2d(rng, 200)))
    cases.append(case("orient2d_E_catastrophic_cancellation", "orient2d", queries=tier_E_orient2d(rng, 500)))
    cases.append(case("orient2d_H_speed_gate", "orient2d", generator=tier_H_descriptor("orient2d", rng)))

    # orient3d: A B C D E F H
    cases.append(case("orient3d_A_random_easy", "orient3d", queries=tier_A("orient3d", rng, 100)))
    cases.append(case("orient3d_B_integer_exact_zero", "orient3d", queries=tier_B_orient3d(rng, 200)))
    cases.append(case("orient3d_C_snap_to_grid", "orient3d", queries=tier_C_orient3d(rng, 1000)))
    cases.append(case("orient3d_D_ulp_perturbation", "orient3d", queries=tier_D_orient3d(rng, 100)))
    cases.append(case("orient3d_E_catastrophic_cancellation", "orient3d", queries=tier_E_orient3d(rng, 500)))
    cases.append(case("orient3d_F_planted_coplanar", "orient3d", queries=tier_F_orient3d(rng, 1000)))
    cases.append(case("orient3d_H_speed_gate", "orient3d", generator=tier_H_descriptor("orient3d", rng)))

    # incircle: A B C D E F H
    cases.append(case("incircle_A_random_easy", "incircle", queries=tier_A("incircle", rng, 100)))
    cases.append(case("incircle_B_integer_co_circular", "incircle", queries=tier_B_incircle(rng, 200)))
    cases.append(case("incircle_C_snap_to_grid", "incircle", queries=tier_C_incircle(rng, 1000)))
    cases.append(case("incircle_D_ulp_perturbation", "incircle", queries=tier_D_incircle(rng, 100)))
    cases.append(case("incircle_E_catastrophic_cancellation", "incircle", queries=tier_E_incircle(rng, 500)))
    cases.append(case("incircle_F_planted_co_circular", "incircle", queries=tier_F_incircle(rng, 1000)))
    cases.append(case("incircle_H_speed_gate", "incircle", generator=tier_H_descriptor("incircle", rng)))

    # insphere: A B C D E F H
    cases.append(case("insphere_A_random_easy", "insphere", queries=tier_A("insphere", rng, 100)))
    cases.append(case("insphere_B_integer_co_spherical", "insphere", queries=tier_B_insphere(rng, 200)))
    cases.append(case("insphere_C_snap_to_grid", "insphere", queries=tier_C_insphere(rng, 1000)))
    cases.append(case("insphere_D_ulp_perturbation", "insphere", queries=tier_D_insphere(rng, 80)))
    cases.append(case("insphere_E_catastrophic_cancellation", "insphere", queries=tier_E_insphere(rng, 500)))
    cases.append(case("insphere_F_planted_co_spherical", "insphere", queries=tier_F_insphere(rng, 1000)))
    cases.append(case("insphere_H_speed_gate", "insphere", generator=tier_H_descriptor("insphere", rng)))

    print(f"computing expected outputs for {len(cases)} cases ...", file=sys.stderr)
    expected = []
    for i, c in enumerate(cases, 1):
        e = compute_expected(c)
        expected.append(e)
        if i % 1 == 0:
            n_q = len(c["input"].get("queries", [])) or c["input"].get("generator", {}).get("n", 0)
            print(
                f"  [{i:2}/{len(cases)}] {c['id']:<48} {n_q:>7} queries",
                file=sys.stderr,
            )

    return cases, expected


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def main():
    cases, expected = build_all()

    inputs_path = os.path.join(HERE, "inputs.json")
    expected_path = os.path.join(HERE, "expected.json")

    with open(inputs_path, "w") as fp:
        json.dump({"cases": cases}, fp)
        fp.write("\n")
    with open(expected_path, "w") as fp:
        json.dump({"cases": expected}, fp)
        fp.write("\n")

    in_size = os.path.getsize(inputs_path)
    out_size = os.path.getsize(expected_path)
    print(
        f"wrote inputs.json ({in_size:,} bytes) and expected.json ({out_size:,} bytes)",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
