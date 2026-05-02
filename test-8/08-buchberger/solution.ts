/**
 * Problem 8 — Buchberger's Algorithm over ℚ[x_1,…,x_n]
 *
 * A pure-TypeScript implementation of Buchberger's algorithm computing
 * Gröbner bases of polynomial ideals over the rationals, with:
 *
 *   - Both lex and degrevlex monomial orders (x_1 > x_2 > … > x_n).
 *   - Exact rational coefficients (BigInt num/den).
 *   - Buchberger's classical pair-handling refinements:
 *       Criterion 1 — coprime leading monomials.
 *       Criterion 2 — chain (LCM-divisibility) criterion.
 *   - Normal selection strategy: at every iteration the unprocessed pair
 *     whose S-polynomial leading-monomial proxy (the lcm of LMs) is
 *     smallest under the requested order is selected next. The lcm is the
 *     classical "sugar-free" proxy for the S-poly leading monomial; under
 *     the normal strategy we pick the pair with smallest such proxy.
 *   - Final inter-reduction so the output is the unique reduced Gröbner
 *     basis (monic, no term divisible by another generator's LM).
 *
 * I/O contract: read one JSON object on stdin, write one JSON object on
 * stdout. See PROMPT.md for the schema.
 */

import { readFileSync } from "node:fs";

// ────────────────────────────────────────────────────────────────────────────
// 1. Exact rational arithmetic (BigInt num/den, normalised, den > 0).
// ────────────────────────────────────────────────────────────────────────────

const B0 = 0n;
const B1 = 1n;

function bgcd(a: bigint, b: bigint): bigint {
  if (a < B0) a = -a;
  if (b < B0) b = -b;
  while (b !== B0) {
    const r = a % b;
    a = b;
    b = r;
  }
  return a;
}

/** Immutable rational. Always normalised: den > 0 and gcd(num, den) = 1. */
class Q {
  static readonly ZERO = new Q(B0, B1);
  static readonly ONE = new Q(B1, B1);

  readonly num: bigint;
  readonly den: bigint;

  private constructor(num: bigint, den: bigint) {
    this.num = num;
    this.den = den;
  }

  static of(num: bigint, den: bigint = B1): Q {
    if (den === B0) throw new Error("rational: zero denominator");
    if (num === B0) return Q.ZERO;
    if (den < B0) {
      num = -num;
      den = -den;
    }
    const g = bgcd(num, den);
    if (g !== B1) {
      num /= g;
      den /= g;
    }
    return new Q(num, den);
  }

  /** Parse "a", "a/b", or "-a/b" (also tolerates leading +). */
  static parse(s: string): Q {
    const t = s.trim();
    if (t === "0") return Q.ZERO;
    const slash = t.indexOf("/");
    if (slash < 0) return Q.of(BigInt(t));
    return Q.of(BigInt(t.slice(0, slash)), BigInt(t.slice(slash + 1)));
  }

  isZero(): boolean { return this.num === B0; }
  isOne():  boolean { return this.num === B1 && this.den === B1; }
  sign():   number  { return this.num < B0 ? -1 : this.num > B0 ? 1 : 0; }

  neg(): Q { return this.isZero() ? this : new Q(-this.num, this.den); }

  add(o: Q): Q {
    if (this.isZero()) return o;
    if (o.isZero()) return this;
    return Q.of(this.num * o.den + o.num * this.den, this.den * o.den);
  }
  sub(o: Q): Q {
    if (o.isZero()) return this;
    if (this.isZero()) return o.neg();
    return Q.of(this.num * o.den - o.num * this.den, this.den * o.den);
  }
  mul(o: Q): Q {
    if (this.isZero() || o.isZero()) return Q.ZERO;
    return Q.of(this.num * o.num, this.den * o.den);
  }
  div(o: Q): Q {
    if (o.isZero()) throw new Error("rational: division by zero");
    if (this.isZero()) return Q.ZERO;
    return Q.of(this.num * o.den, this.den * o.num);
  }

  inv(): Q {
    if (this.isZero()) throw new Error("rational: inverse of zero");
    return Q.of(this.den, this.num);
  }

  toString(): string {
    return this.den === B1 ? this.num.toString() : `${this.num}/${this.den}`;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Monomials and monomial orders.
//
//    A monomial is a length-n array of non-negative integers. We use
//    plain `number[]` (exponents in tests are tiny).  Each polynomial
//    keeps an immutable invariant: the term list is sorted strictly
//    descending under the active monomial order, with no zero terms.
// ────────────────────────────────────────────────────────────────────────────

type Exp = number[];

function expEqual(a: Exp, b: Exp): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function expAdd(a: Exp, b: Exp): Exp {
  const n = a.length;
  const r = new Array<number>(n);
  for (let i = 0; i < n; i++) r[i] = a[i] + b[i];
  return r;
}

function expSub(a: Exp, b: Exp): Exp {
  const n = a.length;
  const r = new Array<number>(n);
  for (let i = 0; i < n; i++) r[i] = a[i] - b[i];
  return r;
}

function expMax(a: Exp, b: Exp): Exp {
  const n = a.length;
  const r = new Array<number>(n);
  for (let i = 0; i < n; i++) r[i] = a[i] > b[i] ? a[i] : b[i];
  return r;
}

function expDivides(a: Exp, b: Exp): boolean {
  // does a | b ?
  for (let i = 0; i < a.length; i++) if (a[i] > b[i]) return false;
  return true;
}

function expCoprime(a: Exp, b: Exp): boolean {
  // gcd(a, b) = 1, i.e. no shared variable
  for (let i = 0; i < a.length; i++) if (a[i] > 0 && b[i] > 0) return false;
  return true;
}

function expIsOne(a: Exp): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== 0) return false;
  return true;
}

/**
 * Compare two exponent vectors `a`, `b` under the requested order.
 * Returns +1 if a > b, -1 if a < b, 0 if equal. Both orders use the
 * convention x_1 > x_2 > … > x_n, i.e. variable index 0 is "highest".
 *
 *  - lex:        first non-zero (a_i − b_i), scanning i = 0..n-1.
 *  - degrevlex:  compare total degree first; on tie, compare via the
 *                last differing coordinate scanning from the right
 *                (i = n-1..0): the monomial with the SMALLER exponent
 *                at the last differing index wins.  This is grevlex.
 */
type Order = "lex" | "degrevlex";

function compareExp(order: Order, a: Exp, b: Exp): number {
  const n = a.length;
  if (order === "lex") {
    for (let i = 0; i < n; i++) {
      if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
    }
    return 0;
  }
  // degrevlex
  let da = 0, db = 0;
  for (let i = 0; i < n; i++) { da += a[i]; db += b[i]; }
  if (da !== db) return da > db ? 1 : -1;
  for (let i = n - 1; i >= 0; i--) {
    if (a[i] !== b[i]) return a[i] < b[i] ? 1 : -1;
  }
  return 0;
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Polynomial representation: descending-sorted, non-zero terms.
//
//    A `Poly` is a list of {exp, coef} ordered strictly descending under
//    the ambient monomial order. Mutating operations always preserve this
//    invariant.  LM(f)/LC(f)/LT(f) are simply terms[0].
// ────────────────────────────────────────────────────────────────────────────

interface Term { exp: Exp; coef: Q; }
type Poly = Term[];

/** Build a Poly from a sparse [[expvec, "coeff"], …] list, dropping zeros
 *  and merging duplicates, then sorting descending. */
function polyFromSparse(entries: ReadonlyArray<[Exp, string]>, order: Order): Poly {
  const merge = new Map<string, { exp: Exp; coef: Q }>();
  for (const [expIn, coefStr] of entries) {
    const c = Q.parse(coefStr);
    if (c.isZero()) continue;
    // canonical key for the exponent vector
    const k = expIn.join(",");
    const existing = merge.get(k);
    if (existing) {
      const sum = existing.coef.add(c);
      if (sum.isZero()) merge.delete(k);
      else existing.coef = sum;
    } else {
      merge.set(k, { exp: expIn.slice(), coef: c });
    }
  }
  const arr: Poly = Array.from(merge.values());
  arr.sort((u, v) => compareExp(order, v.exp, u.exp)); // descending
  return arr;
}

function polyToSparse(p: Poly): Array<[Exp, string]> {
  return p.map(t => [t.exp.slice(), t.coef.toString()] as [Exp, string]);
}

/** Multiply each coefficient by `c`. c must be non-zero. Returns a new
 *  Poly; the input is not mutated. */
function polyScale(p: Poly, c: Q): Poly {
  if (c.isZero()) return [];
  if (c.isOne()) return p;
  const out: Poly = new Array(p.length);
  for (let i = 0; i < p.length; i++) {
    out[i] = { exp: p[i].exp, coef: p[i].coef.mul(c) };
  }
  return out;
}

/** Multiply by a single term  m·c, preserving descending order
 *  (multiplying every exponent vector by the same monomial preserves the
 *  ordering of the original list, since both lex and degrevlex are
 *  monomial orders). */
function polyMulTerm(p: Poly, m: Exp, c: Q): Poly {
  if (c.isZero() || p.length === 0) return [];
  const out: Poly = new Array(p.length);
  for (let i = 0; i < p.length; i++) {
    out[i] = { exp: expAdd(p[i].exp, m), coef: p[i].coef.mul(c) };
  }
  return out;
}

/** Compute  α·f + β·g  with given order.  Linear merge, since both inputs
 *  are descending-sorted under `order`. */
function polyAxBy(order: Order, alpha: Q, f: Poly, beta: Q, g: Poly): Poly {
  if (alpha.isZero()) return polyScale(g, beta);
  if (beta.isZero()) return polyScale(f, alpha);
  const out: Poly = [];
  let i = 0, j = 0;
  while (i < f.length && j < g.length) {
    const cmp = compareExp(order, f[i].exp, g[j].exp);
    if (cmp > 0) {
      const c = f[i].coef.mul(alpha);
      if (!c.isZero()) out.push({ exp: f[i].exp, coef: c });
      i++;
    } else if (cmp < 0) {
      const c = g[j].coef.mul(beta);
      if (!c.isZero()) out.push({ exp: g[j].exp, coef: c });
      j++;
    } else {
      const c = f[i].coef.mul(alpha).add(g[j].coef.mul(beta));
      if (!c.isZero()) out.push({ exp: f[i].exp, coef: c });
      i++; j++;
    }
  }
  while (i < f.length) {
    const c = f[i].coef.mul(alpha);
    if (!c.isZero()) out.push({ exp: f[i].exp, coef: c });
    i++;
  }
  while (j < g.length) {
    const c = g[j].coef.mul(beta);
    if (!c.isZero()) out.push({ exp: g[j].exp, coef: c });
    j++;
  }
  return out;
}

/** Make `p` monic (leading coefficient = 1). Returns input unchanged if
 *  already monic or zero. */
function polyMakeMonic(p: Poly): Poly {
  if (p.length === 0) return p;
  const lc = p[0].coef;
  if (lc.isOne()) return p;
  const inv = lc.inv();
  return polyScale(p, inv);
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Multivariate division (a.k.a. normal form / reduction).
//
//    Given `f` and a list G = [g_1, …, g_t], produce the remainder r of
//    dividing f by G under the active order: a polynomial whose every
//    term is divisible by no LM(g_k). The quotient is discarded; we only
//    need the remainder for Buchberger.
//
//    Strategy: at each step look at the leading term of the running
//    polynomial p; if some g_k has LM(g_k) | LM(p), subtract
//      (lc(p) / lc(g_k)) · (LM(p) / LM(g_k)) · g_k
//    from p. Otherwise peel the leading term into the remainder and
//    continue.
//
//    The running polynomial p is held as a Map<expKey, {exp, coef}> so
//    subtracting  c · x^m · g  is O(|g|) regardless of |p|.  This avoids
//    the O(|p|) array-rebuild that the naive "merge two sorted lists"
//    approach would do per cancellation step — important when |G| ≫ 1
//    and reduction takes hundreds of steps with growing rational
//    coefficients (lex case rand_3_lex_n3_m4 in the test set).
// ────────────────────────────────────────────────────────────────────────────

/**
 * Normal-form (multivariate division) of `f` modulo `G` under `order`.
 * Returns the descending-sorted remainder polynomial; the quotient is
 * discarded.  Every term of the remainder is irreducible mod G.
 */
function normalForm(order: Order, f: Poly, G: ReadonlyArray<Poly>): Poly {
  if (f.length === 0) return [];

  // p : Map<exp-string, {exp, coef}>.  All entries have non-zero coef.
  const p = new Map<string, { exp: Exp; coef: Q }>();
  for (const t of f) p.set(t.exp.join(","), { exp: t.exp, coef: t.coef });

  // Remainder accumulated in strict descending order (since we always
  // append the current leading term and the new leading term is strictly
  // smaller).
  const remainder: Poly = [];

  while (p.size > 0) {
    // Find current leading entry (max under `order`).  O(|p|) scan; if
    // this proved a hot spot we'd switch to a heap/skiplist, but in
    // practice |p| ≤ a few hundred even on hard cases.
    let leadKey: string | null = null;
    let leadExp: Exp | null = null;
    let leadCoef: Q | null = null;
    for (const [k, v] of p) {
      if (leadExp === null || compareExp(order, v.exp, leadExp) > 0) {
        leadKey = k;
        leadExp = v.exp;
        leadCoef = v.coef;
      }
    }
    // Find a reducer.
    let reducer: Poly | null = null;
    for (let k = 0; k < G.length; k++) {
      const g = G[k];
      if (g.length === 0) continue;
      if (expDivides(g[0].exp, leadExp!)) { reducer = g; break; }
    }
    if (reducer === null) {
      // Peel into remainder.
      remainder.push({ exp: leadExp!, coef: leadCoef! });
      p.delete(leadKey!);
      continue;
    }
    // p := p − (lc(p)/lc(g)) · x^m · g, where m = lt.exp − LM(g).
    const m = expSub(leadExp!, reducer[0].exp);
    const cNeg = leadCoef!.div(reducer[0].coef).neg();
    for (let k = 0; k < reducer.length; k++) {
      const term = reducer[k];
      const newExp = expAdd(term.exp, m);
      const newKey = newExp.join(",");
      const delta = term.coef.mul(cNeg);
      const existing = p.get(newKey);
      if (existing === undefined) {
        p.set(newKey, { exp: newExp, coef: delta });
      } else {
        const sum = existing.coef.add(delta);
        if (sum.isZero()) p.delete(newKey);
        else existing.coef = sum;
      }
    }
  }
  return remainder;
}

/** S-polynomial of two non-zero polys f, g:
 *    S(f,g) = (lcm/LT(f))·f − (lcm/LT(g))·g
 *  where lcm = lcm(LM(f), LM(g)).  Returns the result under `order`. */
function sPolynomial(order: Order, f: Poly, g: Poly): Poly {
  const lf = f[0], lg = g[0];
  const lcm = expMax(lf.exp, lg.exp);
  const af = expSub(lcm, lf.exp);
  const ag = expSub(lcm, lg.exp);
  const cf = Q.ONE.div(lf.coef);
  const cg = Q.ONE.div(lg.coef).neg();
  // S = cf · x^af · f  +  cg · x^ag · g
  const left  = polyMulTerm(f, af, cf);
  const right = polyMulTerm(g, ag, cg);
  return polyAxBy(order, Q.ONE, left, Q.ONE, right);
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Buchberger's algorithm with the normal selection strategy and
//    Buchberger's two pair-handling criteria — applied at *insertion
//    time* via the Gebauer–Möller UPDATE procedure (Becker & Weispfenning
//    Algorithm 5.66; Gebauer & Möller, JSC 1988).  Pruning the pair set
//    at insertion is logically equivalent to applying Criterion 1
//    (coprime LMs) and Criterion 2 (chain criterion) at pop time, but it
//    keeps the queue small enough that draining it stays cheap.  Without
//    this, the harder lex case rand_3_lex_n3_m4 generates thousands of
//    pending pairs before the chain criterion can kick them out.
//
//    UPDATE(G, P, h) — adding new generator h = G[t] to basis G with old
//    pair set P:
//
//       C := { (i, t) : 0 ≤ i < t }                        // tentative
//       (M) drop (i,t) ∈ C if some (j,t) ∈ C with j ≠ i has
//                 lcm(LM(g_j), LM(h))  |  lcm(LM(g_i), LM(h))
//                 strictly (or, on equality, j < i).
//       (F) drop (i,t) ∈ C surviving (M) if LM(g_i) ⊥ LM(h) (coprime).
//       (B) drop (i,j) ∈ P, i,j < t, if  LM(h) | lcm(LM(g_i), LM(g_j))
//                 AND  lcm(g_i, g_j) ≠ lcm(g_i, h)
//                 AND  lcm(g_i, g_j) ≠ lcm(g_j, h).
//
//    At pop time we still apply Criterion 1 once as a final defence (it
//    almost never fires on pairs surviving (F), but the spec calls for
//    it explicitly).  The chain criterion has already been applied via
//    (B) and (M) — there is no separate pop-time chain check.
//
//    The pair queue is a plain array; we linear-scan for the smallest
//    LCM each pop (normal selection strategy). Switching to a heap is
//    pure constant-factor; |pairs| stays under a few dozen on the test
//    set after Gebauer–Möller.
// ────────────────────────────────────────────────────────────────────────────

interface Pair {
  i: number;        // basis index of first element
  j: number;        // basis index of second element  (i < j)
  lcm: Exp;         // lcm(LM(G[i]), LM(G[j]))  — selection key
  coprime: boolean; // cached:  LM(G[i]) and LM(G[j]) coprime
}

function makePair(G: ReadonlyArray<Poly>, i: number, j: number): Pair {
  const a = G[i][0].exp, b = G[j][0].exp;
  return { i, j, lcm: expMax(a, b), coprime: expCoprime(a, b) };
}

/**
 * Gebauer–Möller pair-update for adding generator G[newIdx] to G.
 *
 * Mutates `pairs` in place: prune existing pairs by (B), then append
 * the new pairs (i, newIdx) that survive (M) ∧ ¬(F).  `pairs` is the
 * accumulated pair queue across earlier UPDATE calls.
 */
function gmUpdate(G: ReadonlyArray<Poly>, pairs: Pair[], newIdx: number): void {
  const lmH = G[newIdx][0].exp;

  // Tentative new pairs C = { (i, newIdx) : i < newIdx }.
  const C: Pair[] = new Array(newIdx);
  for (let i = 0; i < newIdx; i++) C[i] = makePair(G, i, newIdx);

  // (M) Drop (i,t) ∈ C if some (j,t) ∈ C, j ≠ i, has its lcm dividing
  //     (i,t)'s lcm strictly — or, on equality, with smaller index.
  //     This selects a canonical representative per equivalence class
  //     of pairs sharing the same LCM.
  const keepC: boolean[] = new Array(C.length).fill(true);
  for (let i = 0; i < C.length; i++) {
    if (!keepC[i]) continue;
    for (let j = 0; j < C.length; j++) {
      if (i === j || !keepC[j]) continue;
      if (expDivides(C[j].lcm, C[i].lcm)) {
        if (expEqual(C[j].lcm, C[i].lcm)) {
          if (j < i) { keepC[i] = false; break; }
        } else {
          keepC[i] = false;
          break;
        }
      }
    }
  }

  // (F) Drop (i,t) surviving (M) if LM(g_i) and LM(h) are coprime.
  //     This is Buchberger's Criterion 1 applied at insertion time;
  //     soundness follows because (M) ensures any dropped pair is
  //     covered by a representative pair that is NOT coprime.
  for (let i = 0; i < C.length; i++) {
    if (keepC[i] && C[i].coprime) keepC[i] = false;
  }

  // (B) Prune existing pair (i,j) ∈ pairs (with i < j < newIdx) if
  //     LM(h) | lcm(g_i, g_j)  AND  lcm(g_i, g_j) is *strictly* coarser
  //     than both lcm(g_i, h) and lcm(g_j, h).  The intuition: if h's
  //     leading monomial properly subsumes the LCM of the old pair,
  //     and neither shortcut chain (i, t) nor (j, t) is "as tight" as
  //     the old pair, then (i, j) is dominated.
  //
  //     We index C by i for O(1) lookup of lcm(i, t).
  const cLcmByI: Exp[] = new Array(newIdx);
  for (let i = 0; i < C.length; i++) cLcmByI[C[i].i] = C[i].lcm;

  let w = 0;
  for (let r = 0; r < pairs.length; r++) {
    const p = pairs[r];
    if (expDivides(lmH, p.lcm)
        && !expEqual(p.lcm, cLcmByI[p.i])
        && !expEqual(p.lcm, cLcmByI[p.j])) {
      continue;       // pruned by (B)
    }
    pairs[w++] = p;
  }
  pairs.length = w;

  // Append the surviving new pairs.
  for (let i = 0; i < C.length; i++) if (keepC[i]) pairs.push(C[i]);
}

function buchberger(
  order: Order,
  generators: ReadonlyArray<Poly>,
): Poly[] {
  // Build G one generator at a time, applying Gebauer–Möller UPDATE on
  // each addition so the initial pair pruning is applied uniformly.
  // Exact-duplicate generators are filtered (cheap fingerprint).
  const G: Poly[] = [];
  const pairs: Pair[] = [];
  const seenFingerprint = new Set<string>();
  for (const g0 of generators) {
    if (g0.length === 0) continue;
    const g = polyMakeMonic(g0);
    const key = g.map(t => t.exp.join(",") + "@" + t.coef.toString()).join(";");
    if (seenFingerprint.has(key)) continue;
    seenFingerprint.add(key);
    // Short-circuit: a non-zero constant generator means the ideal is
    // already the whole ring.  Return {1} directly.
    if (g.length === 1 && expIsOne(g[0].exp)) {
      return [[{ exp: g[0].exp.slice(), coef: Q.ONE }]];
    }
    G.push(g);
    if (G.length > 1) gmUpdate(G, pairs, G.length - 1);
  }
  if (G.length === 0) return [];

  while (pairs.length > 0) {
    // Normal selection strategy: pop the pair whose LCM is smallest
    // under the active order.
    let bestIdx = 0;
    for (let p = 1; p < pairs.length; p++) {
      if (compareExp(order, pairs[p].lcm, pairs[bestIdx].lcm) < 0) bestIdx = p;
    }
    const pair = pairs[bestIdx];
    pairs.splice(bestIdx, 1);

    // Criterion 1 (coprime LMs) — second-line defence; almost never
    // fires after Gebauer–Möller (F), but the spec asks for it
    // literally and applying it twice is free.
    if (pair.coprime) continue;

    const s = sPolynomial(order, G[pair.i], G[pair.j]);
    const r = normalForm(order, s, G);
    if (r.length === 0) continue;

    const nf = polyMakeMonic(r);

    // Short-circuit: a non-zero constant residue means the ideal is the
    // whole ring; the reduced GB is just {1}.
    if (nf.length === 1 && expIsOne(nf[0].exp)) {
      return [[{ exp: nf[0].exp.slice(), coef: Q.ONE }]];
    }

    G.push(nf);
    gmUpdate(G, pairs, G.length - 1);
  }

  return G;
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Final inter-reduction → unique reduced Gröbner basis.
//
//    Make every g ∈ G monic. Then drop g whose LM is divisible by some
//    other LM in G. Finally, fully reduce each remaining g by all the
//    OTHER generators (auto-reduction). The result is the reduced
//    Gröbner basis (canonical up to ordering).
// ────────────────────────────────────────────────────────────────────────────

function reduceBasis(order: Order, G: Poly[]): Poly[] {
  // 1. monic
  let H = G.map(polyMakeMonic).filter(g => g.length > 0);

  // 2. drop generators whose LM is divisible by some OTHER generator's LM
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < H.length; i++) {
      const lmI = H[i][0].exp;
      let dominated = false;
      for (let j = 0; j < H.length; j++) {
        if (i === j) continue;
        if (expDivides(H[j][0].exp, lmI)) { dominated = true; break; }
      }
      if (dominated) {
        H.splice(i, 1);
        changed = true;
        break;
      }
    }
  }

  // 3. inter-reduce: replace each g_i by NF(g_i, H \ {g_i}) until stable
  //    (one pass over the basis is sufficient because LMs are now
  //    minimal and reduction never grows them, but we loop to be safe).
  let stable = false;
  while (!stable) {
    stable = true;
    for (let i = 0; i < H.length; i++) {
      const others = H.slice(0, i).concat(H.slice(i + 1));
      const reduced = polyMakeMonic(normalForm(order, H[i], others));
      if (reduced.length === 0) {
        H.splice(i, 1);
        stable = false;
        break;
      }
      // structural check: did we change?
      if (!polyEquals(reduced, H[i])) {
        H[i] = reduced;
        stable = false;
      }
    }
  }

  // canonical ordering: descending by LM
  H.sort((u, v) => compareExp(order, v[0].exp, u[0].exp));
  return H;
}

/** Clear denominators: multiply each polynomial by the LCM of its
 *  coefficient denominators so all coefficients become integers, then
 *  divide out any common GCD of the resulting numerators. The result is
 *  a non-zero scalar multiple of the input — same generator of the same
 *  ideal, same leading monomial — so the Gröbner-basis property and
 *  ideal containment are preserved.
 *
 *  Why this exists at all: it keeps coefficient shape identical to the
 *  reference outputs, *and* avoids tickling sympy.polys.polytools'
 *  `groebner.contains(...)` codepath that miscoerces between ZZ and QQ
 *  when one side has integer coefficients and the other side carries a
 *  rational. (Hit at sympy 1.14, raises CoercionFailed.)
 *
 *  Sign convention: leave the leading coefficient with whatever sign it
 *  had on input.  Our pipeline always makes polynomials monic before
 *  calling this, so the leading coefficient is +1 going in and stays
 *  positive going out. */
function polyClearDenoms(p: Poly): Poly {
  if (p.length === 0) return p;
  // lcm of denominators
  let lcm = B1;
  for (const t of p) {
    const d = t.coef.den;
    lcm = (lcm / bgcd(lcm, d)) * d;
  }
  // scaled integer numerators
  const nums: bigint[] = new Array(p.length);
  for (let i = 0; i < p.length; i++) {
    nums[i] = (p[i].coef.num * lcm) / p[i].coef.den;
  }
  // gcd of |nums|
  let gcdN = B0;
  for (const v of nums) {
    const a = v < B0 ? -v : v;
    gcdN = gcdN === B0 ? a : bgcd(gcdN, a);
  }
  if (gcdN === B0) gcdN = B1;

  const out: Poly = new Array(p.length);
  for (let i = 0; i < p.length; i++) {
    out[i] = { exp: p[i].exp, coef: Q.of(nums[i] / gcdN, B1) };
  }
  return out;
}

function polyEquals(a: Poly, b: Poly): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!expEqual(a[i].exp, b[i].exp)) return false;
    if (a[i].coef.num !== b[i].coef.num) return false;
    if (a[i].coef.den !== b[i].coef.den) return false;
  }
  return true;
}

// ────────────────────────────────────────────────────────────────────────────
// 7. JSON I/O glue.
// ────────────────────────────────────────────────────────────────────────────

interface Input {
  vars: string[];
  order: Order;
  polynomials: Array<Array<[Exp, string]>>;
}

interface Output {
  groebner_basis: Array<Array<[Exp, string]>>;
}

function solve(input: Input): Output {
  const { order, polynomials } = input;
  if (order !== "lex" && order !== "degrevlex") {
    throw new Error(`unsupported monomial order: ${order}`);
  }
  const F: Poly[] = polynomials.map(p => polyFromSparse(p, order));
  const G = buchberger(order, F);
  const reduced = reduceBasis(order, G);
  // Cosmetic / interop step — see polyClearDenoms.
  const clean = reduced.map(polyClearDenoms);
  return { groebner_basis: clean.map(polyToSparse) };
}

function main(): void {
  const raw = readFileSync(0, "utf8");
  const input = JSON.parse(raw) as Input;
  const out = solve(input);
  process.stdout.write(JSON.stringify(out));
}

main();
