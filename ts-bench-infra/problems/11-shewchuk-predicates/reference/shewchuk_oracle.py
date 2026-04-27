#!/usr/bin/env python3
"""
ctypes wrapper for Shewchuk's canonical `predicates.c` (1996, public domain).

Build the shared library once via:

    gcc -O2 -shared -fPIC -o libpredicates.so \\
        ../sources/Shewchuk_predicates_DCG_18_1996.c -lm

Then import this module and call `oracle_evaluate(predicate, points)` to
get the canonical sign for any predicate-and-points pair. The library
must be rebuilt on each platform (the .so is gitignored).

This is the **canonical reference**. Every expected sign in the
golden master originates here. The Python `predicates_reference.py`
in this same directory is a *validator* whose job is to confirm
agreement with this oracle on the full test set.

Sign conventions (from Shewchuk 1996 §"Definitions"):

    orient2d(a, b, c)    : > 0 iff a, b, c counter-clockwise
                           < 0 iff clockwise
                           = 0 iff collinear

    orient3d(a, b, c, d) : > 0 iff d below plane(a, b, c)
                           < 0 iff above
                           = 0 iff coplanar
                           ("below" = the side from which a, b, c
                           appear in clockwise order)

    incircle(a, b, c, d) : > 0 iff d inside circle through a, b, c
                              (provided a, b, c CCW; sign reversed if
                              CW)
                           < 0 iff outside
                           = 0 iff co-circular

    insphere(a, b, c, d, e):
                           > 0 iff e inside sphere through a, b, c, d
                              (provided orient3d(a, b, c, d) > 0;
                              sign reversed otherwise)
                           < 0 iff outside
                           = 0 iff co-spherical
"""

from __future__ import annotations

import ctypes
import os
from typing import Sequence

# ---------------------------------------------------------------------------
# Library load + function-pointer setup
# ---------------------------------------------------------------------------

_HERE = os.path.dirname(os.path.abspath(__file__))
_LIB_PATH = os.path.join(_HERE, "libpredicates.so")

if not os.path.exists(_LIB_PATH):
    raise FileNotFoundError(
        f"libpredicates.so not found at {_LIB_PATH}. Build it first via:\n"
        f"  gcc -O2 -shared -fPIC -o {_LIB_PATH} "
        f"{os.path.join(_HERE, '..', 'sources', 'Shewchuk_predicates_DCG_18_1996.c')} -lm"
    )

_lib = ctypes.CDLL(_LIB_PATH)

# void exactinit(void)
_lib.exactinit.argtypes = []
_lib.exactinit.restype = None

_DPTR = ctypes.POINTER(ctypes.c_double)

_lib.orient2d.argtypes = [_DPTR, _DPTR, _DPTR]
_lib.orient2d.restype = ctypes.c_double

_lib.orient3d.argtypes = [_DPTR, _DPTR, _DPTR, _DPTR]
_lib.orient3d.restype = ctypes.c_double

_lib.incircle.argtypes = [_DPTR, _DPTR, _DPTR, _DPTR]
_lib.incircle.restype = ctypes.c_double

_lib.insphere.argtypes = [_DPTR, _DPTR, _DPTR, _DPTR, _DPTR]
_lib.insphere.restype = ctypes.c_double

# Init constants used by the adaptive paths. Idempotent; calling twice is harmless.
_lib.exactinit()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _arr(coords: Sequence[float]) -> ctypes.Array:
    return (ctypes.c_double * len(coords))(*coords)


def _sign(x: float) -> int:
    if x > 0.0:
        return 1
    if x < 0.0:
        return -1
    return 0


# ---------------------------------------------------------------------------
# Public predicate wrappers
# ---------------------------------------------------------------------------


def orient2d(a, b, c) -> int:
    return _sign(_lib.orient2d(_arr(a), _arr(b), _arr(c)))


def orient3d(a, b, c, d) -> int:
    return _sign(_lib.orient3d(_arr(a), _arr(b), _arr(c), _arr(d)))


def incircle(a, b, c, d) -> int:
    return _sign(_lib.incircle(_arr(a), _arr(b), _arr(c), _arr(d)))


def insphere(a, b, c, d, e) -> int:
    return _sign(_lib.insphere(_arr(a), _arr(b), _arr(c), _arr(d), _arr(e)))


def evaluate(predicate: str, points) -> int:
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
# Smoke test (run when invoked directly)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Three classical sanity cases from Shewchuk 1996.
    print("orient2d((0,0),(1,0),(0,1)) =", orient2d((0, 0), (1, 0), (0, 1)),
          "(expected +1, CCW)")
    print("orient2d((0,0),(1,0),(2,0)) =", orient2d((0, 0), (1, 0), (2, 0)),
          "(expected 0, collinear)")
    # incircle: the four corners of the unit square are co-circular.
    print(
        "incircle((0,0),(1,0),(1,1),(0,1)) =",
        incircle((0, 0), (1, 0), (1, 1), (0, 1)),
        "(expected 0, co-circular)",
    )
    # The user's worked test case: e=(0.4,0.4,0.4) inside circumsphere of
    # the regular-tetrahedron-ish set {(1,0,0),(0,1,0),(0,0,1),(1,1,1)}.
    print(
        "insphere(reg-tet, (0.4,0.4,0.4)) =",
        insphere((1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 1, 1), (0.4, 0.4, 0.4)),
        "(expected +1, inside)",
    )
    print(
        "orient3d(reg-tet) =",
        orient3d((1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 1, 1)),
        "(expected +1, positively oriented)",
    )
