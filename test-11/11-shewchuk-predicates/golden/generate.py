#!/usr/bin/env python3
"""Tier-H expansion helpers for verify.py. Only `expand_generator` is needed."""

LCG_A = 6364136223846793005
LCG_C = 1442695040888963407
LCG_MASK = (1 << 64) - 1


def lcg_next(state: int) -> int:
    return (state * LCG_A + LCG_C) & LCG_MASK


def lcg_doubles(seed: int, n: int, lo: float, hi: float):
    state = seed & LCG_MASK
    span = hi - lo
    out = [0.0] * n
    inv = 1.0 / 9007199254740992.0
    for i in range(n):
        state = lcg_next(state)
        u = (state >> 11) * inv
        out[i] = lo + span * u
    return out


def _query_shape(predicate: str):
    return {
        "orient2d": (3, 2),
        "orient3d": (4, 3),
        "incircle": (4, 2),
        "insphere": (5, 3),
    }[predicate]


def expand_generator(predicate: str, gen: dict):
    if gen["kind"] != "uniform_random":
        raise ValueError(f"unknown generator kind: {gen['kind']}")
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
