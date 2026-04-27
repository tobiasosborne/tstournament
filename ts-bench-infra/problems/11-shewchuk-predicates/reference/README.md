# Reference implementations — Problem 11

Two reference oracles live in this directory. They must agree
byte-perfectly on every input; the generator (`../golden/generate.py`)
asserts this on every query when it builds `expected.json`.

## 1. `Shewchuk_predicates_DCG_18_1996.c` (canonical)

Jonathan Shewchuk's canonical `predicates.c` from
*Adaptive Precision Floating-Point Arithmetic and Fast Robust Geometric
Predicates* (Discrete & Computational Geometry 18, 1996, pp. 305-363),
public domain, copy stored under `../sources/`. This is the **canonical
reference** — every expected sign in `expected.json` originates from
this file via `shewchuk_oracle.py` (a thin ctypes wrapper).

### Build

The shared library is platform-specific and gitignored. Rebuild on each
machine before generating or verifying:

```bash
cd /path/to/ts-bench-infra/problems/11-shewchuk-predicates
gcc -O2 -shared -fPIC -o reference/libpredicates.so \
    sources/Shewchuk_predicates_DCG_18_1996.c -lm
```

### Smoke test

```bash
python3 reference/shewchuk_oracle.py
```

Should print:

```
orient2d((0,0),(1,0),(0,1)) = 1 (expected +1, CCW)
orient2d((0,0),(1,0),(2,0)) = 0 (expected 0, collinear)
incircle((0,0),(1,0),(1,1),(0,1)) = 0 (expected 0, co-circular)
insphere(reg-tet, (0.4,0.4,0.4)) = -1 (expected +1, inside)
orient3d(reg-tet) = -1 (expected +1, positively oriented)
```

(The last two produce `-1` because the test tetrahedron `(1,0,0),
(0,1,0), (0,0,1), (1,1,1)` is *negatively* oriented under Shewchuk's
`(a-d, b-d, c-d)` row convention; `e=(0.4, 0.4, 0.4)` is inside the
sphere, so per Shewchuk's "sign reversed if `orient3d < 0`" rule the
result is `-1`. This is a sign-convention sanity check, not a bug.)

## 2. `predicates_reference.py` (validator)

A Python `Fraction`-based bigint-rational implementation of the four
predicates. Lifts each input double to its exact rational value via
`fractions.Fraction(float)` (which recovers the exact rational
represented by the IEEE-754 bit pattern), evaluates the determinant in
unbounded-precision arithmetic, and returns the sign.

Mathematically equivalent to the canonical oracle: by Shewchuk's
correctness theorem, his predicates return the exact-rational sign of
the determinant for any double inputs, and the bigint reference does
the same by construction. The generator cross-checks them on every
query when building `expected.json`; a single disagreement aborts.

This file is the verifier's runtime oracle (`verify.py` imports
`predicates_reference.evaluate`). The reason: the verifier needs to
work with no build step (Python only), and the equivalence with
canonical Shewchuk has already been proved at generation time. If a
future change introduced a sign bug into the Python, the next
`generate.py` run would catch it before any expected.json was
committed.

## 3. `shewchuk_oracle.py`

ctypes wrapper for `libpredicates.so`. Exposes
`orient2d, orient3d, incircle, insphere` and `evaluate(predicate, points)`
with the same signatures as `predicates_reference.py`. Used only by
`generate.py` to build the canonical `expected.json`.

## File map

```
reference/
├── README.md                         (this file)
├── Shewchuk_predicates_DCG_18_1996.c (CANONICAL — symlink to ../sources/...)
├── predicates_reference.py           (Python validator)
├── shewchuk_oracle.py                (ctypes wrapper, used by generate.py)
└── libpredicates.so                  (built artifact, gitignored)
```

The actual `predicates.c` source lives in `../sources/` to keep the
`reference/` directory free of binary build inputs; the path is
referenced by `shewchuk_oracle.py` via `..`.
