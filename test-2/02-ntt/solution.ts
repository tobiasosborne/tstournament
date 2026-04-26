/**
 * Number-Theoretic Transform over F_p with p = 998244353, arbitrary length n.
 *
 *   Forward:  X_k = Σ_j x_j · ω_n^{jk}             (mod p)
 *   Inverse:  x_j = n⁻¹ · Σ_k X_k · ω_n^{-jk}      (mod p)
 *   ω_n = g^((p-1)/n) mod p,  g = 3,  n | p-1 = 2²³ · 7 · 17.
 *
 * Architecture (layered, top → bottom):
 *
 *   1. Field constants    — p = 998244353, Montgomery R = 2³², the constants
 *                            R mod p, R² mod p, and p_inv = -p⁻¹ mod 2³².
 *   2. BigInt setup       — modular inverse / power, used only at plan-build
 *                            time. Never enters the inner butterfly loop.
 *   3. Montgomery REDC    — mmul(a,b) = a·b·R⁻¹ mod p, in pure Number
 *                            arithmetic via 16-bit limb splits and Math.imul.
 *                            No BigInt, no '%p', no division on the hot path.
 *   4. Power-of-two NTT   — iterative Cooley-Tukey on Uint32Array, in-place
 *                            with a single bit-reversal up front. Twiddle
 *                            table is precomputed in Montgomery form and
 *                            cached per (size, direction).
 *   5. Bluestein chirp-z  — for non-power-of-two n | (p-1), reduce to a
 *                            length-L (≥ 2n-1, power of two) cyclic
 *                            convolution using a 2n-th root of unity
 *                            ζ = g^((p-1)/(2n)). Plans are cached.
 *   6. Top-level dispatch — `ntt({n, direction, x})` selects the fast path
 *                            for power-of-two n and Bluestein otherwise,
 *                            handling the inverse 1/n scale uniformly.
 *   7. JSON I/O driver    — read one input object on stdin, write one
 *                            decimal-string array on stdout.
 *
 * Pure JS / TS only. No child_process, no shellouts, no native bindings.
 */

import * as fs from "node:fs";

// ────────────────────────────── Field constants ──────────────────────────────

const P = 998244353;          // prime; p < 2³⁰, so p² < 2⁶⁰
const P_BIG = 998244353n;
const G_BIG = 3n;             // primitive root of (Z/p)*

// Montgomery domain with R = 2³².
//   p_inv satisfies   p · p_inv ≡ -1   (mod 2³²)         [used inside REDC]
//   R    mod p                                             [= 1 in Montgomery]
//   R²   mod p                                             [maps n → n·R via mmul(n,R²)]
//
// (Numerically: P_INV = 998244351 = p - 2 — a coincidence of this particular
// prime; computed once via Newton iteration and frozen here.)
const P_INV = 998244351 | 0;
const R_MOD_P = 301989884;
const R2_MOD_P = 932051910;

// ─────────────────────────────── BigInt helpers ──────────────────────────────
// Used only for setup (root building, n⁻¹ for the inverse scale). Never the
// inner loop; the hot path is entirely Number-based.

function modpowBig(base: bigint, exp: bigint, mod: bigint): bigint {
  let r = 1n;
  let b = base % mod;
  if (b < 0n) b += mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return r;
}

function modinv(a: bigint): bigint {
  // Fermat: a⁻¹ ≡ a^{p-2} (mod p). p is prime; cheaper than EEA in BigInt.
  return modpowBig(a, P_BIG - 2n, P_BIG);
}

// ────────────────────────── Montgomery multiplication ───────────────────────
//
// REDC(t) returns t · R⁻¹ mod p for 0 ≤ t < p · R.
//   m = (t mod R) · p_inv mod R
//   u = (t + m·p) / R                       ← the low R bits cancel: m chosen
//   if u ≥ p: u -= p                          so that t + m·p ≡ 0 (mod R).
//
// Inputs a, b < p < 2³⁰ in Montgomery form. Their product can reach 2⁶⁰,
// past the 2⁵³ safe-integer window, so we never form it as a single Number.
// Instead we keep the 64-bit value as two 32-bit halves and reconstruct via
// 16-bit limb partial products. Each partial product is < 2³², well inside
// the safe-integer range. The final reduction reads only the high half plus
// a one-bit carry — the low halves cancel by construction.

/** a * b in Montgomery form. a, b ∈ [0, p), result ∈ [0, p). */
function mmul(a: number, b: number): number {
  // 16-bit limbs of the inputs.
  const aLo = a & 0xffff, aHi = a >>> 16;
  const bLo = b & 0xffff, bHi = b >>> 16;

  // 64-bit product t = a·b, assembled from four 32-bit partial products:
  //   t = ll + (lh + hl)·2¹⁶ + hh·2³².
  // Decompose into (tHi, tLo) with tLo the low 32 bits.
  const ll = aLo * bLo;            // < 2³²
  const lh = aLo * bHi;            // < 2³⁰
  const hl = aHi * bLo;            // < 2³⁰
  const hh = aHi * bHi;            // < 2²⁸

  const cross = lh + hl;                          // < 2³¹
  const lowSum = ll + (cross & 0xffff) * 0x10000; // < 2³³
  const tLo = lowSum >>> 0;                       // mod 2³²
  const tHi = hh + (cross >>> 16) + (lowSum >= 0x100000000 ? 1 : 0);

  // m = (tLo · P_INV) mod 2³². Math.imul gives signed 32-bit; the bit
  // pattern is the same as the unsigned product mod 2³².
  const m = Math.imul(tLo | 0, P_INV) >>> 0;

  // m·p as a 64-bit pair (mpHi, mpLo). m < 2³², p < 2³⁰, so m·p < 2⁶².
  const mLo = m & 0xffff, mHi = m >>> 16;
  const pLo = P & 0xffff, pHi = P >>> 16;          // pHi < 2¹⁴
  const mpll = mLo * pLo;                          // < 2³²
  const mplh = mLo * pHi;                          // < 2³⁰
  const mphl = mHi * pLo;                          // < 2³²
  const mphh = mHi * pHi;                          // < 2³⁰

  const mpCross = mplh + mphl;                     // < 2³³
  // Low 16 bits: '&' coerces to int32, but the low-16 lane is unaffected
  // by sign-extension; it agrees with the unsigned low-16 of mpCross.
  const mpCrossLo = mpCross & 0xffff;
  const mpCrossHi = Math.floor(mpCross / 0x10000); // ≤ 2¹⁷
  const mpLowSum = mpll + mpCrossLo * 0x10000;     // < 2³³
  const mpLo = mpLowSum >>> 0;
  const mpHi = mphh + mpCrossHi + (mpLowSum >= 0x100000000 ? 1 : 0);

  // u = (t + m·p) / R. The low halves cancel by Montgomery's construction;
  // we only need to add the high halves and the carry from the low add.
  const lowAdd = tLo + mpLo;
  const u = tHi + mpHi + (lowAdd >= 0x100000000 ? 1 : 0);
  return u >= P ? u - P : u;
}

/** to-Montgomery: x → x·R mod p, via mmul(x, R² mod p). */
function toMont(x: number): number { return mmul(x, R2_MOD_P); }

/** from-Montgomery: x → x·R⁻¹ mod p, via mmul(x, 1). */
function fromMont(x: number): number { return mmul(x, 1); }

/** Modular addition / subtraction. Single conditional, branchless-friendly. */
function addmod(a: number, b: number): number { const s = a + b; return s >= P ? s - P : s; }
function submod(a: number, b: number): number { const s = a - b; return s < 0  ? s + P : s; }

// ──────────────────────────── Power-of-two NTT ───────────────────────────────
//
// Iterative Cooley-Tukey, in-place, decimation-in-time. Bit-reversal up
// front; then for each stage L = 2, 4, …, n we apply length-L butterflies
// across the array, indexing into a flat twiddle table that holds all
// stages back-to-back.

const POW2_TWIDDLE_CACHE: Map<number, Uint32Array> = new Map();

/**
 * Precompute (and cache) ω_L^k in Montgomery form for every stage L ∈
 * {2, 4, …, n} and every k ∈ [0, L/2). Layout: stage L (with H = L/2)
 * occupies the H slots [H-1, H-1+H). The total length is 1 + 2 + 4 + … +
 * n/2 = n - 1.
 *
 * For the inverse direction the twiddle is ω_L⁻¹ instead of ω_L, so the
 * same butterfly code path computes the (un-scaled) inverse NTT.
 */
function powerOfTwoTwiddles(n: number, invert: boolean): Uint32Array {
  const key = invert ? -n : n;
  const cached = POW2_TWIDDLE_CACHE.get(key);
  if (cached) return cached;

  const table = new Uint32Array(Math.max(1, n - 1));
  for (let L = 2; L <= n; L <<= 1) {
    const H = L >>> 1;
    const wReg = modpowBig(G_BIG, (P_BIG - 1n) / BigInt(L), P_BIG);
    const wUsed = invert ? modinv(wReg) : wReg;
    const wMont = toMont(Number(wUsed));
    let cur = R_MOD_P; // 1 in Montgomery form
    for (let k = 0; k < H; k++) {
      table[H - 1 + k] = cur;
      cur = mmul(cur, wMont);
    }
  }
  POW2_TWIDDLE_CACHE.set(key, table);
  return table;
}

/** In-place bit-reversal permutation for power-of-two-length arrays. */
function bitReverse(a: Uint32Array): void {
  const n = a.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >>> 1;
    for (; j & bit; bit >>>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const t = a[i]; a[i] = a[j]; a[j] = t; }
  }
}

/**
 * In-place NTT of `a` (length = power of two, values in Montgomery form).
 * `invert = true` runs the inverse butterflies but does NOT apply the 1/n
 * scaling — the caller does that, because the Bluestein path wants both
 * an inverse NTT and a separate L⁻¹ scale anyway.
 */
function nttPow2(a: Uint32Array, invert: boolean): void {
  const n = a.length;
  if (n <= 1) return;
  bitReverse(a);
  const tw = powerOfTwoTwiddles(n, invert);

  for (let L = 2; L <= n; L <<= 1) {
    const H = L >>> 1;
    const base = H - 1;
    for (let i = 0; i < n; i += L) {
      for (let k = 0; k < H; k++) {
        const u = a[i + k];
        const v = mmul(a[i + k + H], tw[base + k]);
        a[i + k]     = addmod(u, v);
        a[i + k + H] = submod(u, v);
      }
    }
  }
}

// ──────────────────────────── Bluestein chirp-z ──────────────────────────────
//
// For arbitrary n | (p-1), express the DFT as a circular convolution.
// The identity 2jk = j² + k² - (k-j)² turns
//
//   X_k = Σ_j x_j · ω_n^{jk}       (with ω_n = ζ², ζ = ω_{2n})
//       = ζ^{k²} · Σ_j (x_j · ζ^{j²}) · ζ^{-(k-j)²}
//       = ζ^{k²} · (a ★ b)_k
//
// where a_j = x_j · ζ^{j²}, b_m = ζ^{-m²}, and ★ is circular convolution
// of period L for any L ≥ 2n - 1. We pick L the next power of two, encode
// b cyclically (b_{L-m} = b_m by evenness in the index), and compute the
// convolution by length-L NTT.
//
// The inverse direction reuses the same machinery with ζ replaced by ζ⁻¹
// and a final scale by n⁻¹. Both forward and inverse plans are cached.

interface BluesteinPlan {
  n: number;
  L: number;                  // power-of-two convolution length
  chirp: Uint32Array;         // ζ^{j²} (Montgomery), length n   — used pre and post
  bHat: Uint32Array;          // forward NTT of cyclic-embedded ζ^{-m²}, length L
  invScaleMont: number;       // (n·L)⁻¹ for inverse, L⁻¹ for forward (Montgomery)
}

/** Smallest power of two ≥ x. (x ≥ 1.) */
function nextPow2(x: number): number {
  let p = 1;
  while (p < x) p <<= 1;
  return p;
}

const BLUESTEIN_CACHE: Map<number, BluesteinPlan> = new Map();

/** Two cache slots per n: forward and inverse. Encoded by sign of the key. */
function bluesteinPlan(n: number, invert: boolean): BluesteinPlan {
  const key = invert ? -n : n;
  const cached = BLUESTEIN_CACHE.get(key);
  if (cached) return cached;

  if ((P_BIG - 1n) % (2n * BigInt(n)) !== 0n) {
    // The verifier promises n | p-1, so 2n | p-1 as well (since p-1 has 2²³).
    // This guard exists only to give a clear error if that promise is broken.
    throw new Error(`2n=${2 * n} does not divide p-1; cannot form ζ_{2n}`);
  }

  // ζ = ω_{2n} for forward, ζ⁻¹ for inverse.
  const zetaBase = modpowBig(G_BIG, (P_BIG - 1n) / (2n * BigInt(n)), P_BIG);
  const zeta = invert ? modinv(zetaBase) : zetaBase;
  const zetaMont = toMont(Number(zeta));
  const zetaInvMont = toMont(Number(modinv(zeta)));
  const zetaSqMont = mmul(zetaMont, zetaMont);
  const zetaSqInvMont = mmul(zetaInvMont, zetaInvMont);

  // Build chirp[j] = ζ^{j²} and chirpInv[j] = ζ^{-j²} iteratively, using
  // ζ^{(j+1)²} = ζ^{j²} · ζ^{2j+1}.  step holds ζ^{2j+1}; advance by ζ².
  const chirp = new Uint32Array(n);
  const chirpInv = new Uint32Array(n);
  chirp[0]    = R_MOD_P;       // ζ⁰ = 1
  chirpInv[0] = R_MOD_P;
  let cur = R_MOD_P, curInv = R_MOD_P;
  let step = zetaMont, stepInv = zetaInvMont;     // ζ¹, ζ⁻¹
  for (let j = 1; j < n; j++) {
    cur    = mmul(cur, step);          // ζ^{j²}
    curInv = mmul(curInv, stepInv);    // ζ^{-j²}
    chirp[j]    = cur;
    chirpInv[j] = curInv;
    step    = mmul(step, zetaSqMont);    // → ζ^{2(j+1)+1 - 2} = ζ^{2j+3}
    stepInv = mmul(stepInv, zetaSqInvMont);
  }

  // L = next power of two ≥ 2n - 1. The cyclic embedding of b_m = ζ^{-m²}
  // is even in the index: b at L-m equals b at m, with zeros in between.
  const L = nextPow2(2 * n - 1);
  const bHat = new Uint32Array(L);
  bHat[0] = chirpInv[0];
  for (let m = 1; m < n; m++) {
    bHat[m]     = chirpInv[m];
    bHat[L - m] = chirpInv[m];
  }
  nttPow2(bHat, false);

  // For forward: post-scale by L⁻¹ after the inverse NTT inside the conv.
  // For inverse: also fold in n⁻¹, so a single multiply suffices.
  const invScaleBig = invert
    ? modinv(BigInt(L) * BigInt(n))
    : modinv(BigInt(L));
  const invScaleMont = toMont(Number(invScaleBig));

  const plan: BluesteinPlan = { n, L, chirp, bHat, invScaleMont };
  BLUESTEIN_CACHE.set(key, plan);
  return plan;
}

// ────────────────────────────── Top-level NTT ────────────────────────────────

const POW2_INV_N_MONT_CACHE: Map<number, number> = new Map();

function pow2InvNMont(n: number): number {
  const cached = POW2_INV_N_MONT_CACHE.get(n);
  if (cached !== undefined) return cached;
  const v = toMont(Number(modinv(BigInt(n))));
  POW2_INV_N_MONT_CACHE.set(n, v);
  return v;
}

/**
 * Length-n NTT of `xReg` (regular, non-Montgomery residues), forward or
 * inverse. Returns regular residues. n must divide p-1.
 */
function nttArbitrary(xReg: number[], invert: boolean): number[] {
  const n = xReg.length;
  if (n === 0) return [];
  if (n === 1) return [xReg[0] % P];

  // Power-of-two fast path: avoids the chirp machinery entirely.
  if ((n & (n - 1)) === 0) {
    const a = new Uint32Array(n);
    for (let i = 0; i < n; i++) a[i] = toMont(xReg[i]);
    nttPow2(a, invert);
    if (invert) {
      const nInvMont = pow2InvNMont(n);
      for (let i = 0; i < n; i++) a[i] = mmul(a[i], nInvMont);
    }
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) out[i] = fromMont(a[i]);
    return out;
  }

  // Bluestein path.
  const { L, chirp, bHat, invScaleMont } = bluesteinPlan(n, invert);

  // a_j = x_j · ζ^{j²} in Montgomery form, padded to length L with zeros.
  const A = new Uint32Array(L);
  for (let j = 0; j < n; j++) A[j] = mmul(toMont(xReg[j]), chirp[j]);

  // Convolve A with b: forward NTT, pointwise, inverse NTT, scale.
  nttPow2(A, false);
  for (let i = 0; i < L; i++) A[i] = mmul(A[i], bHat[i]);
  nttPow2(A, true);
  // Fold L⁻¹ (and n⁻¹ on inverse) into a single per-output multiply by
  // combining with the chirp post-multiplier below.

  const out = new Array<number>(n);
  for (let k = 0; k < n; k++) {
    // X_k = chirp[k] · A_k · invScale.   chirp encodes ζ_used^{k²}; for
    // the inverse plan ζ_used = ω_{2n}⁻¹ so this is already ζ⁻^{k²}.
    out[k] = fromMont(mmul(mmul(A[k], chirp[k]), invScaleMont));
  }
  return out;
}

// ──────────────────────────────── JSON driver ───────────────────────────────

interface NTTInput {
  n: number;
  modulus: string;
  primitive_root: string;
  direction: "forward" | "inverse";
  x: string[];
}

function ntt(input: NTTInput): string[] {
  const n = input.n | 0;
  if (n !== input.x.length) throw new Error(`n=${n} disagrees with |x|=${input.x.length}`);
  if (input.modulus !== "998244353") throw new Error(`unexpected modulus: ${input.modulus}`);
  if (input.primitive_root !== "3") throw new Error(`unexpected primitive_root: ${input.primitive_root}`);
  if (input.direction !== "forward" && input.direction !== "inverse") {
    throw new Error(`unknown direction: ${input.direction}`);
  }
  if (n < 0) throw new Error(`n must be ≥ 0`);

  const xReg = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    // Residues are 30-bit, safely representable in Number.
    const v = Number(input.x[i]);
    if (!Number.isInteger(v) || v < 0 || v >= P) {
      throw new Error(`x[${i}] = ${input.x[i]} is not a canonical residue in [0, p)`);
    }
    xReg[i] = v;
  }

  const yReg = nttArbitrary(xReg, input.direction === "inverse");
  const out = new Array<string>(n);
  for (let i = 0; i < n; i++) out[i] = yReg[i].toString(10);
  return out;
}

function main(): void {
  const raw = fs.readFileSync(0, "utf8");
  const input = JSON.parse(raw) as NTTInput;
  process.stdout.write(JSON.stringify(ntt(input)));
}

main();
