/**
 * Deterministic Schreier-Sims with Sims' filter.
 *
 * Constructs a base + strong generating set (BSGS) for a permutation group
 * G ≤ Sym(n) presented by generators on {0, 1, ..., n-1}, then reports the
 * order |G| as a decimal string, the basic transversal sizes |U_i|, the
 * strong generators (image-array form), and a membership decision for
 * each query permutation via the standard sift / strip.
 *
 * --- Conventions ----------------------------------------------------------
 *
 * Permutations are encoded as image arrays: p[i] is the image of i.
 * Composition is left-to-right: (p · q)[i] = q[p[i]] — i.e. apply p, then
 * apply q to the result. This matches SymPy's array-form Permutation
 * multiplication (the verifier's reference) and is the convention used by
 * most modern computational group theory codebases (GAP, Holt-Eick-O'Brien
 * Ch. 4). With this convention u(b) = p means u[b] = p, and stripping a
 * permutation h that sends b → p back to a stabiliser element of b is
 * h · u^{-1}, since (h · u^{-1})[b] = u^{-1}[h[b]] = u^{-1}[p] = b.
 *
 * Indexing throughout the code is 0-based. We write the stabiliser chain
 *
 *     G = G^(0) ≥ G^(1) ≥ ... ≥ G^(k) = {e}
 *
 * with G^(i) the pointwise stabiliser of base[0..i-1] (so G^(0) = G).
 * For each level i ∈ {0, ..., k-1} the BSGS keeps:
 *   - the base point b_i = base[i];
 *   - generators of G^(i) (which include those that lie in deeper
 *     stabilisers, so the deeper a level is the smaller its gen list);
 *   - the orbit Δ_i = b_i^{G^(i)};
 *   - explicit coset representatives u_p with u_p(b_i) = p, plus their
 *     precomputed inverses, for every p ∈ Δ_i.
 *
 * Explicit coset reps (rather than a Schreier-vector encoding) cost
 * O(k · n^2) integers — a few hundred bytes for the largest case in this
 * test set (M_12, n = 12, k = 5) — and make every sift step a flat O(n)
 * array lookup with no Schreier-tree traversal.
 *
 * --- Algorithm ------------------------------------------------------------
 *
 * Deterministic Schreier-Sims with Sims' filter, as in Sims (1970) and
 * Holt-Eick-O'Brien §4.4.
 *
 *   Phase 1 — install the input generators directly into the chain. For
 *            each non-identity input generator g, find the shallowest
 *            level whose base point g moves and append g to that level's
 *            generator list (and to every shallower level's, since g ∈
 *            G^(0), ..., G^(level)). If g fixes every existing base
 *            point, extend the base by some point g moves and install
 *            g at the new level.
 *
 *   Phase 2 — for each level i from the deepest up, enumerate every
 *            Schreier generator
 *                  s_{p,x} = u_p · x · u_{x[p]}^{-1}
 *            for p ∈ Δ_i and x ∈ generators(G^(i)), sift each through
 *            the current chain, and on the first non-trivial residue
 *            install it via Phase 1's installation rule (potentially
 *            extending the base) and restart the scan from the deepest
 *            level. When a full bottom-up pass produces no non-trivial
 *            residue, the BSGS is correct.
 *
 * Sims' filter is precisely the "sift-each-Schreier-generator and only
 * keep the residue if non-trivial" idea quoted in PROMPT.md from
 * Sims_PermutationGroups_1970.pdf:p9. Each insertion strictly increases
 * the orbit-stabiliser product ∏|U_i|, which is bounded above by n!, so
 * the loop terminates.
 *
 * Base extension policy: when a generator (input or sifted residue)
 * fixes the entire current base yet is not the identity, we append the
 * smallest moved point as a new base point — the conventional
 * deterministic choice (Holt-Eick-O'Brien Algorithm 4.43).
 *
 * Group-order arithmetic uses native BigInt. For the test set this is
 * never required (the largest order is 95040 < 2^53), but the protocol
 * demands a decimal string and BigInt is the obvious zero-cost way to
 * stay correct for sporadic groups beyond 2^53 (e.g. M_24).
 *
 * --- HARD CONSTRAINT compliance ------------------------------------------
 *
 * 100% TypeScript, stdlib only. No child_process, no spawn, no exec, no
 * shelling out, no Python / SymPy / Mathematica / GAP / Magma / Pari, no
 * native binaries, no WASM. Reads stdin, writes stdout. In principle
 * runs unchanged in a browser worker.
 */

import { readFileSync } from "node:fs";

// -------------------------------------------------------------------------
// Types & I/O
// -------------------------------------------------------------------------

type Perm = number[];

interface SSInput {
  degree: number;
  generators: Perm[];
  membership_queries: Perm[];
}

interface SSOutput {
  base: number[];
  strong_generators: Perm[];
  transversal_sizes: number[];
  order: string;
  membership_results: boolean[];
}

// -------------------------------------------------------------------------
// Permutation primitives
// -------------------------------------------------------------------------
//
// A permutation is a plain number[] of length n with p[i] = image of i.
// All composition is left-to-right: (p · q)[i] = q[p[i]] — i.e. apply p
// then q. The identity is [0, 1, ..., n-1].

function identityPerm(n: number): Perm {
  const e = new Array<number>(n);
  for (let i = 0; i < n; i++) e[i] = i;
  return e;
}

function isIdentity(p: Perm): boolean {
  for (let i = 0; i < p.length; i++) if (p[i] !== i) return false;
  return true;
}

function permEqual(a: Perm, b: Perm): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Compose: returns p · q with (p · q)[i] = q[p[i]] (apply p then q). */
function compose(p: Perm, q: Perm): Perm {
  const n = p.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = q[p[i]];
  return out;
}

/** Inverse permutation: out[p[i]] = i. */
function invert(p: Perm): Perm {
  const n = p.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[p[i]] = i;
  return out;
}

/** Find some point moved by p, or -1 if p is the identity. */
function firstMovedPoint(p: Perm): number {
  for (let i = 0; i < p.length; i++) if (p[i] !== i) return i;
  return -1;
}

// -------------------------------------------------------------------------
// Stabiliser chain
// -------------------------------------------------------------------------
//
// `levels[i]` carries the data attached to base point b_i:
//
//   level.basePoint      : b_i
//   level.generators     : generators of G^(i) — the pointwise stabiliser
//                          of base[0..i-1]. Note: deeper levels have
//                          smaller (subset) generator lists, since deeper
//                          stabilisers are smaller groups.
//   level.orbit          : Δ_i = b_i^{G^(i)}, in BFS order from b_i
//   level.transversal[p] : a perm u with u(b_i) = p, for p ∈ Δ_i
//                          (undefined for p outside the orbit)
//   level.transversalInv : the inverse of each transversal entry, cached
//                          to avoid recomputing during sift
//
// `strongAll` is a flat, deduplicated list of every strong generator
// across every level — what we ultimately emit.

interface Level {
  basePoint: number;
  generators: Perm[];                   // generators of G^(i)
  orbit: number[];                      // BFS order from base point
  transversal: (Perm | undefined)[];    // length n; transversal[p] sends b_i → p
  transversalInv: (Perm | undefined)[]; // length n; cached inverse
}

class BSGS {
  readonly degree: number;
  base: number[] = [];
  levels: Level[] = [];
  /**
   * Flat list of every distinct (by image array) strong generator across
   * all levels — what we ultimately emit. Maintained as a Set keyed by a
   * string form to keep insertions cheap and dedup'd.
   */
  private readonly strongSeen: Set<string> = new Set();
  strongAll: Perm[] = [];

  constructor(degree: number) {
    this.degree = degree;
  }

  /** Add a strong generator at level `levelIdx`. Pre-condition: g fixes
   *  base[0..levelIdx-1] pointwise but moves base[levelIdx]. (The caller
   *  — installGenerator — has just established this.) Then g lies in the
   *  stabilisers G^(0), G^(1), ..., G^(levelIdx), so it must be appended
   *  to the generator lists of those levels (and *not* deeper ones,
   *  which would falsely claim g stabilises further base points). */
  addStrongGenerator(g: Perm, levelIdx: number): void {
    // Track in the flat list (deduped by image-array string form).
    const key = g.join(",");
    if (!this.strongSeen.has(key)) {
      this.strongSeen.add(key);
      this.strongAll.push(g.slice());
    }
    for (let i = 0; i <= levelIdx; i++) {
      let dup = false;
      for (const h of this.levels[i].generators) {
        if (permEqual(h, g)) { dup = true; break; }
      }
      if (!dup) this.levels[i].generators.push(g);
    }
  }

  /** Append a new base point, creating an empty Level for it. The caller
   *  is responsible for populating generators and recomputing the orbit. */
  appendBasePoint(b: number): number {
    this.base.push(b);
    this.levels.push({
      basePoint: b,
      generators: [],
      orbit: [],
      transversal: new Array(this.degree),
      transversalInv: new Array(this.degree),
    });
    return this.levels.length - 1;
  }

  /** (Re)compute the orbit of base[i] under levels[i].generators, plus
   *  explicit coset representatives. Standard BFS using the stored gens.
   *  For each j we maintain transversal[j] sending b_i to j. */
  recomputeOrbit(i: number): void {
    const lvl = this.levels[i];
    const n = this.degree;
    lvl.orbit = [lvl.basePoint];
    lvl.transversal = new Array(n);
    lvl.transversalInv = new Array(n);
    const id = identityPerm(n);
    lvl.transversal[lvl.basePoint] = id;
    lvl.transversalInv[lvl.basePoint] = id;

    // BFS
    let head = 0;
    while (head < lvl.orbit.length) {
      const p = lvl.orbit[head++];
      const uP = lvl.transversal[p]!;
      for (const g of lvl.generators) {
        const q = g[p];
        if (lvl.transversal[q] === undefined) {
          // u_q = u_p · g  (u_p sends b → p, then g sends p → q)
          const uQ = compose(uP, g);
          lvl.transversal[q] = uQ;
          lvl.transversalInv[q] = invert(uQ);
          lvl.orbit.push(q);
        }
      }
    }
  }
}

// -------------------------------------------------------------------------
// Sift / strip
// -------------------------------------------------------------------------
//
// Walk down the chain; at each level i, replace the current candidate h
// with h · u^{-1} where u is the canonical transversal element sending
// b_i to h(b_i). After this, h fixes b_i and lies in G^(i+1), so we can
// recurse. The loop ends when either h leaves the i-th orbit (drop-off:
// h ∉ G^(i+1)) or every level has been stripped.
//
// Returns { residue, dropOff }:
//   - dropOff = base.length, residue = identity        ⇒  g ∈ G;
//   - 0 ≤ dropOff < base.length, residue moves base[dropOff] off Δ_dropOff
//                                                       ⇒  g ∈ G^(dropOff)
//                                                          but g ∉ G^(dropOff+1);
//   - dropOff = base.length, residue non-trivial       ⇒  residue fixes
//                                                          every base point
//                                                          yet is not e —
//                                                          the chain is
//                                                          incomplete and
//                                                          must be extended.

function sift(bsgs: BSGS, g: Perm): { residue: Perm; dropOff: number } {
  let h = g.slice();
  for (let i = 0; i < bsgs.levels.length; i++) {
    const lvl = bsgs.levels[i];
    const img = h[lvl.basePoint];
    const u = lvl.transversal[img];
    if (u === undefined) {
      // h(b_i) ∉ Δ_i ⇒ h ∉ G^(i+1) and we cannot strip further.
      return { residue: h, dropOff: i };
    }
    // h · u^{-1} fixes b_i (and equals h restricted to G^(i+1)).
    h = compose(h, lvl.transversalInv[img]!);
  }
  return { residue: h, dropOff: bsgs.levels.length };
}

// -------------------------------------------------------------------------
// Schreier-Sims construction (deterministic, with Sims' filter)
// -------------------------------------------------------------------------

function schreierSimsConstruct(degree: number, gensIn: Perm[]): BSGS {
  const bsgs = new BSGS(degree);

  // Phase 1 — install input generators directly into the chain. We keep
  // them as-is rather than sifting first, because the input generators
  // are needed verbatim to generate G itself at level 0; only the
  // *Schreier* generators are subjected to Sims' filter (Phase 2).
  for (const g of gensIn) {
    if (isIdentity(g)) continue;
    installGenerator(bsgs, g);
  }

  // Phase 2 — bottom-up Schreier-generator sweep. Whenever any level
  // emits a non-trivial residue we install it (which may mutate every
  // shallower level's gen list and orbit) and restart the scan at the
  // deepest level. A full bottom-up pass with no insertion proves the
  // BSGS is closed. Termination: each insertion strictly increases
  // ∏|U_i| (an integer bounded by n!), so the loop must halt.
  for (let i = bsgs.levels.length - 1; i >= 0; ) {
    if (closeLevelUnderSchreier(bsgs, i)) {
      i = bsgs.levels.length - 1;     // some insertion happened — restart
    } else {
      i--;                             // level i is closed; move up
    }
  }

  return bsgs;
}

/** Install `g` (assumed non-identity) as a strong generator at the
 *  shallowest level it doesn't fix, extending the base if g fixes every
 *  existing base point. Recomputes orbits at every affected level. */
function installGenerator(bsgs: BSGS, g: Perm): void {
  let level = -1;
  for (let i = 0; i < bsgs.base.length; i++) {
    if (g[bsgs.base[i]] !== bsgs.base[i]) { level = i; break; }
  }
  if (level === -1) {
    // g fixes every existing base point. Append a new base point — by
    // convention the smallest moved point, mirroring HEO Algorithm 4.43.
    level = bsgs.appendBasePoint(firstMovedPoint(g));
  }
  bsgs.addStrongGenerator(g, level);
  // g enters the gen lists of levels [0..level] (see addStrongGenerator),
  // so their orbits may grow. Deeper levels are unaffected.
  for (let i = 0; i <= level; i++) bsgs.recomputeOrbit(i);
}

/** Try to close level `levelIdx` under the Sims filter: enumerate every
 *  Schreier generator s_{p,x} = u_p · x · u_{x[p]}^{-1}, sift each, and
 *  on the first non-trivial residue install it and return `true`. If
 *  every Schreier generator sifts to identity, return `false`. */
function closeLevelUnderSchreier(bsgs: BSGS, levelIdx: number): boolean {
  const lvl = bsgs.levels[levelIdx];
  // Snapshot — installation may mutate these mid-iteration, but we only
  // need to find one offending Schreier generator before we restart, so
  // a snapshot is both safer and adequate.
  const orbit = lvl.orbit.slice();
  const gens = lvl.generators.slice();

  for (const p of orbit) {
    const uP = lvl.transversal[p]!;
    for (const x of gens) {
      // s sends b_i ↦ b_i (u_p sends b_i → p, x sends p → x[p], and
      // u_{x[p]}^{-1} sends x[p] → b_i), so s ∈ G^(levelIdx + 1). The
      // Schreier-generator theorem (Sims 1970) says these s span
      // G^(levelIdx + 1) as levelIdx, p, x range over their domains.
      const xP = x[p];
      const s = compose(compose(uP, x), lvl.transversalInv[xP]!);
      if (isIdentity(s)) continue;

      const { residue } = sift(bsgs, s);
      if (isIdentity(residue)) continue;

      installGenerator(bsgs, residue);
      return true;
    }
  }
  return false;
}

// -------------------------------------------------------------------------
// Membership
// -------------------------------------------------------------------------

function contains(bsgs: BSGS, g: Perm): boolean {
  const { residue, dropOff } = sift(bsgs, g);
  return dropOff === bsgs.levels.length && isIdentity(residue);
}

// -------------------------------------------------------------------------
// Top-level driver
// -------------------------------------------------------------------------

function schreierSims(input: SSInput): SSOutput {
  const { degree, generators, membership_queries } = input;

  for (const g of generators) {
    if (!Array.isArray(g) || g.length !== degree) {
      throw new Error(`generator length mismatch: expected ${degree}, got ${g?.length}`);
    }
  }
  for (const q of membership_queries) {
    if (!Array.isArray(q) || q.length !== degree) {
      throw new Error(`query length mismatch: expected ${degree}, got ${q?.length}`);
    }
  }

  const bsgs = schreierSimsConstruct(degree, generators);

  // |G| = ∏ |U_i|. BigInt costs nothing at these sizes and keeps the
  // decimal-string output correct for sporadic groups beyond 2^53.
  let order = 1n;
  const transversalSizes: number[] = [];
  for (const lvl of bsgs.levels) {
    transversalSizes.push(lvl.orbit.length);
    order *= BigInt(lvl.orbit.length);
  }

  return {
    base:                bsgs.base.slice(),
    strong_generators:   bsgs.strongAll.map(p => p.slice()),
    transversal_sizes:   transversalSizes,
    order:               order.toString(),
    // Trivial group: bsgs.levels is empty ⇒ contains(bsgs, q) is true iff
    // q is the identity, which is exactly what we want for {e}.
    membership_results:  membership_queries.map(q => contains(bsgs, q)),
  };
}

// -------------------------------------------------------------------------
// CLI glue: stdin → stdout
// -------------------------------------------------------------------------

function main(): void {
  const raw = readFileSync(0, "utf8");
  const input = JSON.parse(raw) as SSInput;
  const output = schreierSims(input);
  process.stdout.write(JSON.stringify(output) + "\n");
}

main();
