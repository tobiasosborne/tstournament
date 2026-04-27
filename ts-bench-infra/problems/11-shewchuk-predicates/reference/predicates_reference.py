#!/usr/bin/env python3
"""
Bigint-rational reference implementation of Shewchuk's four geometric
predicates: orient2d, orient3d, incircle, insphere.

This is a *correctness oracle*, not a performance reference. It computes
the exact sign of each predicate by lifting every input double to its
exact `Fraction` value (Python's `fractions.Fraction(float)` recovers
the exact rational represented by the double's bit pattern) and
evaluating the determinant in unbounded-precision arithmetic.

The exact mathematical specification is:

    orient2d(a, b, c) returns the sign of

        |  bx - ax   by - ay  |
        |  cx - ax   cy - ay  |

    orient3d(a, b, c, d) returns the sign of

        |  bx - ax   by - ay   bz - az  |
        |  cx - ax   cy - ay   cz - az  |
        |  dx - ax   dy - ay   dz - az  |

    incircle(a, b, c, d) returns the sign of

        |  ax - dx   ay - dy   (ax-dx)^2 + (ay-dy)^2  |
        |  bx - dx   by - dy   (bx-dx)^2 + (by-dy)^2  |
        |  cx - dx   cy - dy   (cx-dx)^2 + (cy-dy)^2  |

    (positive ⇒ d is inside the circle through a, b, c (CCW); negative
    ⇒ outside; zero ⇒ co-circular.)

    insphere(a, b, c, d, e) returns the sign of the analogous 4×4
    determinant on the points a-e, b-e, c-e, d-e with squared-norm
    column. Positive ⇒ e is inside the sphere through a, b, c, d
    (positively oriented); negative ⇒ outside; zero ⇒ co-spherical.

Inputs are JSON-encoded doubles read via `float(s)` (which is bit-exact
when `s` was produced by Python's `repr(x)` or JavaScript's
`x.toString()` — both round-trip to the original double). The signs
returned by this reference are the ground truth for the harness.

This file is also used as the verifier's internal oracle: see
`golden/verify.py`.
"""

from fractions import Fraction
from typing import Sequence

# ---------------------------------------------------------------------------
# Lift a double to its exact rational value.
#
# `Fraction(x)` for x: float returns the exact rational whose double is x.
# E.g. `Fraction(0.1) == Fraction(3602879701896397, 36028797018963968)`.
# This is the foundation of every "exact" computation in this file.
# ---------------------------------------------------------------------------


def _lift(p: Sequence[float]) -> tuple:
    return tuple(Fraction(x) for x in p)


def _sign(x: Fraction) -> int:
    if x > 0:
        return 1
    if x < 0:
        return -1
    return 0


# ---------------------------------------------------------------------------
# orient2d
# ---------------------------------------------------------------------------


def orient2d(a, b, c) -> int:
    ax, ay = _lift(a)
    bx, by = _lift(b)
    cx, cy = _lift(c)
    det = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    return _sign(det)


# ---------------------------------------------------------------------------
# orient3d
# ---------------------------------------------------------------------------


def orient3d(a, b, c, d) -> int:
    # Shewchuk's row order: (a-d), (b-d), (c-d). With this convention,
    # orient3d > 0 iff d lies BELOW the plane through a, b, c (the side
    # from which a, b, c appear clockwise). Using (b-a, c-a, d-a) flips
    # the sign relative to Shewchuk's canonical C; this exact form
    # mirrors `orient3dfast` in predicates.c.
    ax, ay, az = _lift(a)
    bx, by, bz = _lift(b)
    cx, cy, cz = _lift(c)
    dx, dy, dz = _lift(d)
    adx, ady, adz = ax - dx, ay - dy, az - dz
    bdx, bdy, bdz = bx - dx, by - dy, bz - dz
    cdx, cdy, cdz = cx - dx, cy - dy, cz - dz
    det = (
        adx * (bdy * cdz - bdz * cdy)
        + bdx * (cdy * adz - cdz * ady)
        + cdx * (ady * bdz - adz * bdy)
    )
    return _sign(det)


# ---------------------------------------------------------------------------
# incircle
#
# Uses the (a-d), (b-d), (c-d) reduction with squared-norm column. This is
# Shewchuk's standard normalisation; computing the 4×4 form
# |x_i  y_i  x_i^2+y_i^2  1| over rows a..d gives the same sign by the
# usual cofactor expansion along the last column.
# ---------------------------------------------------------------------------


def incircle(a, b, c, d) -> int:
    ax, ay = _lift(a)
    bx, by = _lift(b)
    cx, cy = _lift(c)
    dx, dy = _lift(d)
    adx, ady = ax - dx, ay - dy
    bdx, bdy = bx - dx, by - dy
    cdx, cdy = cx - dx, cy - dy
    ad2 = adx * adx + ady * ady
    bd2 = bdx * bdx + bdy * bdy
    cd2 = cdx * cdx + cdy * cdy
    det = (
        adx * (bdy * cd2 - cdy * bd2)
        - ady * (bdx * cd2 - cdx * bd2)
        + ad2 * (bdx * cdy - cdx * bdy)
    )
    return _sign(det)


# ---------------------------------------------------------------------------
# insphere
# ---------------------------------------------------------------------------


def insphere(a, b, c, d, e) -> int:
    ax, ay, az = _lift(a)
    bx, by, bz = _lift(b)
    cx, cy, cz = _lift(c)
    dx, dy, dz = _lift(d)
    ex, ey, ez = _lift(e)

    aex, aey, aez = ax - ex, ay - ey, az - ez
    bex, bey, bez = bx - ex, by - ey, bz - ez
    cex, cey, cez = cx - ex, cy - ey, cz - ez
    dex, dey, dez = dx - ex, dy - ey, dz - ez

    ae2 = aex * aex + aey * aey + aez * aez
    be2 = bex * bex + bey * bey + bez * bez
    ce2 = cex * cex + cey * cey + cez * cez
    de2 = dex * dex + dey * dey + dez * dez

    # Expand 4×4 cofactor along the squared-norm column.
    #
    # | aex  aey  aez  ae2 |
    # | bex  bey  bez  be2 |
    # | cex  cey  cez  ce2 |
    # | dex  dey  dez  de2 |

    def det3(m):
        return (
            m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
        )

    rows_xyz = [
        [aex, aey, aez],
        [bex, bey, bez],
        [cex, cey, cez],
        [dex, dey, dez],
    ]
    norms = [ae2, be2, ce2, de2]

    # Cofactor expansion along the last (squared-norm) column with signs
    # (-1)^{i+3} for row i = 0..3.
    det = Fraction(0)
    sign = 1  # (-1)^{0+3}? we just track parity explicitly
    # Standard Laplace: det = Σ_i (-1)^{i+j} a_{i,j} M_{i,j}, j = 3 (last col)
    for i in range(4):
        minor_rows = [rows_xyz[k] for k in range(4) if k != i]
        minor = det3(minor_rows)
        # sign of (i, j=3) cofactor is (-1)^{i+3}
        s = -1 if (i + 3) % 2 else 1
        det += s * norms[i] * minor

    return _sign(det)


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------


def evaluate(predicate: str, points: Sequence[Sequence[float]]) -> int:
    if predicate == "orient2d":
        a, b, c = points
        return orient2d(a, b, c)
    if predicate == "orient3d":
        a, b, c, d = points
        return orient3d(a, b, c, d)
    if predicate == "incircle":
        a, b, c, d = points
        return incircle(a, b, c, d)
    if predicate == "insphere":
        a, b, c, d, e = points
        return insphere(a, b, c, d, e)
    raise ValueError(f"unknown predicate: {predicate}")


# ---------------------------------------------------------------------------
# CLI: read JSON on stdin, emit JSON on stdout, same shape as the agent.
#
# Input: {"predicate": "...", "queries": [[<pt>, <pt>, ...], ...]}
#        OR {"predicate": "...", "format": "generated", "generator": {...}}
#
# Output: {"signs": [<int>, ...]}
#
# This makes the reference invocable with the same harness as the agent.
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json
    import sys

    payload = json.loads(sys.stdin.read())
    predicate = payload["predicate"]

    if payload.get("format") == "generated":
        # Lazy import so the bigint reference doesn't depend on the
        # generator helpers when used as a pure oracle.
        from generate import expand_generator  # type: ignore

        queries = expand_generator(predicate, payload["generator"])
    else:
        queries = payload["queries"]

    signs = [evaluate(predicate, q) for q in queries]
    json.dump({"signs": signs}, sys.stdout)
    sys.stdout.write("\n")
