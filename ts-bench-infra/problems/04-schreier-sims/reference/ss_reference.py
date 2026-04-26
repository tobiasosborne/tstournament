"""Reference Schreier-Sims — wraps sympy.combinatorics.PermutationGroup.

Reads one input JSON object on stdin, writes the candidate output JSON
object to stdout. Stripped from ts-bench-test by infra/strip-for-testing.sh.
"""

from __future__ import annotations

import json
import sys

from sympy.combinatorics import Permutation, PermutationGroup


def _to_perm(image: list[int], degree: int) -> Permutation:
    if len(image) != degree:
        raise ValueError(f"permutation image length {len(image)} ≠ degree {degree}")
    return Permutation(image, size=degree)


def ss_reference(payload: dict) -> dict:
    degree = int(payload["degree"])
    gens_imgs = payload["generators"]
    queries_imgs = payload.get("membership_queries", [])

    gens = [_to_perm(img, degree) for img in gens_imgs]
    if not gens:
        gens = [Permutation(list(range(degree)), size=degree)]
    G = PermutationGroup(gens)

    base = list(G.base)  # sympy populates a base from its own Schreier-Sims pass.
    transversal_sizes = [len(G.basic_orbits[i]) for i in range(len(base))]
    strong_gens = [list(g.array_form) for g in G.strong_gens]
    # Pad short array_form to full degree (sympy trims trailing fixed points).
    strong_gens = [_pad(g, degree) for g in strong_gens]

    membership = []
    for img in queries_imgs:
        p = _to_perm(img, degree)
        membership.append(bool(G.contains(p)))

    return {
        "base":               base,
        "strong_generators":  strong_gens,
        "transversal_sizes":  transversal_sizes,
        "order":              str(G.order()),
        "membership_results": membership,
    }


def _pad(image: list[int], degree: int) -> list[int]:
    if len(image) >= degree:
        return image[:degree]
    return image + list(range(len(image), degree))


def main() -> None:
    payload = json.load(sys.stdin)
    out = ss_reference(payload)
    json.dump(out, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
