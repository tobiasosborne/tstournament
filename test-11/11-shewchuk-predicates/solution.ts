/*
 * solution.ts -- Adaptive-precision Shewchuk geometric predicates in TypeScript.
 *
 * A faithful port of Shewchuk's public-domain `predicates.c` (CMU 1996).
 * All four predicates -- orient2d, orient3d, incircle, insphere -- are
 * implemented as IEEE-754 staged adaptive computations:
 *
 *   Stage 1 (fast filter):   compute the determinant in plain doubles, bound
 *                            the worst-case roundoff via Shewchuk's
 *                            `errboundA * permanent`, and return immediately
 *                            if `|det|` exceeds it.
 *   Stage 2 (adapt B):       recompute the determinant exactly via expansion
 *                            arithmetic on the leading 1-component differences,
 *                            tighter `errboundB`.
 *   Stage 3 (adapt C):       add a second-order correction using the
 *                            roundoff `tail` terms of the (a-x) differences,
 *                            even tighter `errboundC + resulterrbound*|det|`.
 *   Stage 4 (full exact):    pile all higher-order tail*tail products into
 *                            the running expansion. For orient2d/3d/incircle
 *                            this is a single growing fin; for insphere we
 *                            fall through to a complete `insphereExact`,
 *                            mirroring `predicates.c`.
 *
 * The arithmetic core uses Knuth's two-sum, Dekker's split, and
 * Veltkamp/Dekker two-product, each emitted inline (no function call) for
 * the V8 JIT to register-allocate cleanly. Working buffers are pre-allocated
 * Float64Arrays held in module scope so the hot path allocates nothing.
 *
 * I/O: a JSON object on stdin describing one batch (explicit list or
 * Tier-H LCG descriptor); a `{"signs": [...]}` JSON object on stdout.
 */

// -----------------------------------------------------------------------
// Floating-point error-bound constants (Shewchuk's exactinit() output for
// IEEE-754 double).
// -----------------------------------------------------------------------

const EPS = 1.1102230246251565e-16; // 2^-53
const SPLITTER = 134217729.0; // 2^27 + 1
const RESULTERRBOUND = (3.0 + 8.0 * EPS) * EPS;
const CCWERRBOUND_A = (3.0 + 16.0 * EPS) * EPS;
const CCWERRBOUND_B = (2.0 + 12.0 * EPS) * EPS;
const CCWERRBOUND_C = (9.0 + 64.0 * EPS) * EPS * EPS;
const O3DERRBOUND_A = (7.0 + 56.0 * EPS) * EPS;
const O3DERRBOUND_B = (3.0 + 28.0 * EPS) * EPS;
const O3DERRBOUND_C = (26.0 + 288.0 * EPS) * EPS * EPS;
const ICCERRBOUND_A = (10.0 + 96.0 * EPS) * EPS;
const ICCERRBOUND_B = (4.0 + 48.0 * EPS) * EPS;
const ICCERRBOUND_C = (44.0 + 576.0 * EPS) * EPS * EPS;
const ISPERRBOUND_A = (16.0 + 224.0 * EPS) * EPS;
const ISPERRBOUND_B = (5.0 + 72.0 * EPS) * EPS;
const ISPERRBOUND_C = (71.0 + 1408.0 * EPS) * EPS * EPS;

// -----------------------------------------------------------------------
// Expansion arithmetic.
//
// An "expansion" is a sorted (smallest-magnitude-first) sequence of
// non-overlapping doubles whose sum is the exact value being represented.
// All routines below return the length of the output expansion `h`.
//
// Output buffers `h` must be distinct from input expansion arrays.
// -----------------------------------------------------------------------

// fast_expansion_sum_zeroelim: h := e + f, with zero elimination.
// Mirrors predicates.c lines ~1020-1092.
function fastExpansionSumZeroelim(
  elen: number,
  e: Float64Array,
  flen: number,
  f: Float64Array,
  h: Float64Array,
): number {
  let Q: number;
  let Qnew: number;
  let hh: number;
  let bvirt: number;
  let avirt: number, bround: number, around: number;
  let eindex = 0;
  let findex = 0;
  let hindex = 0;
  let enow = e[0];
  let fnow = f[0];

  if ((fnow > enow) === (fnow > -enow)) {
    Q = enow;
    eindex = 1;
    enow = e[1];
  } else {
    Q = fnow;
    findex = 1;
    fnow = f[1];
  }

  if (eindex < elen && findex < flen) {
    if ((fnow > enow) === (fnow > -enow)) {
      // Fast_Two_Sum(enow, Q)
      Qnew = enow + Q;
      hh = Q - (Qnew - enow);
      eindex++;
      enow = e[eindex];
    } else {
      Qnew = fnow + Q;
      hh = Q - (Qnew - fnow);
      findex++;
      fnow = f[findex];
    }
    Q = Qnew;
    if (hh !== 0) h[hindex++] = hh;

    while (eindex < elen && findex < flen) {
      if ((fnow > enow) === (fnow > -enow)) {
        // Two_Sum(Q, enow)
        Qnew = Q + enow;
        bvirt = Qnew - Q;
        avirt = Qnew - bvirt;
        bround = enow - bvirt;
        around = Q - avirt;
        hh = around + bround;
        eindex++;
        enow = e[eindex];
      } else {
        Qnew = Q + fnow;
        bvirt = Qnew - Q;
        avirt = Qnew - bvirt;
        bround = fnow - bvirt;
        around = Q - avirt;
        hh = around + bround;
        findex++;
        fnow = f[findex];
      }
      Q = Qnew;
      if (hh !== 0) h[hindex++] = hh;
    }
  }
  while (eindex < elen) {
    Qnew = Q + enow;
    bvirt = Qnew - Q;
    avirt = Qnew - bvirt;
    bround = enow - bvirt;
    around = Q - avirt;
    hh = around + bround;
    eindex++;
    enow = e[eindex];
    Q = Qnew;
    if (hh !== 0) h[hindex++] = hh;
  }
  while (findex < flen) {
    Qnew = Q + fnow;
    bvirt = Qnew - Q;
    avirt = Qnew - bvirt;
    bround = fnow - bvirt;
    around = Q - avirt;
    hh = around + bround;
    findex++;
    fnow = f[findex];
    Q = Qnew;
    if (hh !== 0) h[hindex++] = hh;
  }
  if (Q !== 0 || hindex === 0) h[hindex++] = Q;
  return hindex;
}

// scale_expansion_zeroelim: h := b * e, with zero elimination.
// Mirrors predicates.c lines ~1292-1333.
function scaleExpansionZeroelim(
  elen: number,
  e: Float64Array,
  b: number,
  h: Float64Array,
): number {
  // Split(b, bhi, blo)
  const c0 = SPLITTER * b;
  const abig0 = c0 - b;
  const bhi = c0 - abig0;
  const blo = b - bhi;

  let enow = e[0];
  // Two_Product_Presplit(enow, b, bhi, blo, Q, hh)
  let Q = enow * b;
  let c = SPLITTER * enow;
  let abig = c - enow;
  let ahi = c - abig;
  let alo = enow - ahi;
  let err1 = Q - ahi * bhi;
  let err2 = err1 - alo * bhi;
  let err3 = err2 - ahi * blo;
  let hh = alo * blo - err3;

  let hindex = 0;
  if (hh !== 0) h[hindex++] = hh;

  let product1: number, product0: number;
  let sum: number;
  let bvirt: number, avirt: number, bround: number, around: number;
  let Qnew: number;

  for (let eindex = 1; eindex < elen; eindex++) {
    enow = e[eindex];
    // Two_Product_Presplit
    product1 = enow * b;
    c = SPLITTER * enow;
    abig = c - enow;
    ahi = c - abig;
    alo = enow - ahi;
    err1 = product1 - ahi * bhi;
    err2 = err1 - alo * bhi;
    err3 = err2 - ahi * blo;
    product0 = alo * blo - err3;

    // Two_Sum(Q, product0, sum, hh)
    sum = Q + product0;
    bvirt = sum - Q;
    avirt = sum - bvirt;
    bround = product0 - bvirt;
    around = Q - avirt;
    hh = around + bround;
    if (hh !== 0) h[hindex++] = hh;

    // Fast_Two_Sum(product1, sum, Q, hh)
    Qnew = product1 + sum;
    hh = sum - (Qnew - product1);
    Q = Qnew;
    if (hh !== 0) h[hindex++] = hh;
  }
  if (Q !== 0 || hindex === 0) h[hindex++] = Q;
  return hindex;
}

// estimate(): one-double approximation of the value of an expansion.
function estimate(elen: number, e: Float64Array): number {
  let Q = e[0];
  for (let i = 1; i < elen; i++) Q += e[i];
  return Q;
}

// -----------------------------------------------------------------------
// Pre-allocated working buffers. All sized to predicates.c's static
// arrays. We keep separate fin1/fin2 ping-pong buffers per predicate
// because they all run in the same module instance.
// -----------------------------------------------------------------------

// orient2d
const o2_B = new Float64Array(4);
const o2_C1 = new Float64Array(8);
const o2_C2 = new Float64Array(12);
const o2_D = new Float64Array(16);
const o2_u = new Float64Array(4);

// orient3d
const o3_bc = new Float64Array(4);
const o3_ca = new Float64Array(4);
const o3_ab = new Float64Array(4);
const o3_adet = new Float64Array(8);
const o3_bdet = new Float64Array(8);
const o3_cdet = new Float64Array(8);
const o3_abdet = new Float64Array(16);
const o3_fin1 = new Float64Array(192);
const o3_fin2 = new Float64Array(192);
const o3_at_b = new Float64Array(4);
const o3_at_c = new Float64Array(4);
const o3_bt_c = new Float64Array(4);
const o3_bt_a = new Float64Array(4);
const o3_ct_a = new Float64Array(4);
const o3_ct_b = new Float64Array(4);
const o3_bct = new Float64Array(8);
const o3_cat = new Float64Array(8);
const o3_abt = new Float64Array(8);
const o3_u = new Float64Array(4);
const o3_v = new Float64Array(12);
const o3_w = new Float64Array(16);

// incircle
const ic_bc = new Float64Array(4);
const ic_ca = new Float64Array(4);
const ic_ab = new Float64Array(4);
const ic_axbc = new Float64Array(8);
const ic_axxbc = new Float64Array(16);
const ic_aybc = new Float64Array(8);
const ic_ayybc = new Float64Array(16);
const ic_adet = new Float64Array(32);
const ic_bxca = new Float64Array(8);
const ic_bxxca = new Float64Array(16);
const ic_byca = new Float64Array(8);
const ic_byyca = new Float64Array(16);
const ic_bdet = new Float64Array(32);
const ic_cxab = new Float64Array(8);
const ic_cxxab = new Float64Array(16);
const ic_cyab = new Float64Array(8);
const ic_cyyab = new Float64Array(16);
const ic_cdet = new Float64Array(32);
const ic_abdet = new Float64Array(64);
const ic_fin1 = new Float64Array(1152);
const ic_fin2 = new Float64Array(1152);
const ic_aa = new Float64Array(4);
const ic_bb = new Float64Array(4);
const ic_cc = new Float64Array(4);
const ic_u = new Float64Array(4);
const ic_v = new Float64Array(4);
const ic_temp8 = new Float64Array(8);
const ic_temp16a = new Float64Array(16);
const ic_temp16b = new Float64Array(16);
const ic_temp16c = new Float64Array(16);
const ic_temp32a = new Float64Array(32);
const ic_temp32b = new Float64Array(32);
const ic_temp48 = new Float64Array(48);
const ic_temp64 = new Float64Array(64);
const ic_axtbb = new Float64Array(8);
const ic_axtcc = new Float64Array(8);
const ic_aytbb = new Float64Array(8);
const ic_aytcc = new Float64Array(8);
const ic_bxtaa = new Float64Array(8);
const ic_bxtcc = new Float64Array(8);
const ic_bytaa = new Float64Array(8);
const ic_bytcc = new Float64Array(8);
const ic_cxtaa = new Float64Array(8);
const ic_cxtbb = new Float64Array(8);
const ic_cytaa = new Float64Array(8);
const ic_cytbb = new Float64Array(8);
const ic_axtbc = new Float64Array(8);
const ic_aytbc = new Float64Array(8);
const ic_bxtca = new Float64Array(8);
const ic_bytca = new Float64Array(8);
const ic_cxtab = new Float64Array(8);
const ic_cytab = new Float64Array(8);
const ic_axtbct = new Float64Array(16);
const ic_aytbct = new Float64Array(16);
const ic_bxtcat = new Float64Array(16);
const ic_bytcat = new Float64Array(16);
const ic_cxtabt = new Float64Array(16);
const ic_cytabt = new Float64Array(16);
const ic_axtbctt = new Float64Array(8);
const ic_aytbctt = new Float64Array(8);
const ic_bxtcatt = new Float64Array(8);
const ic_bytcatt = new Float64Array(8);
const ic_cxtabtt = new Float64Array(8);
const ic_cytabtt = new Float64Array(8);
const ic_abt = new Float64Array(8);
const ic_bct = new Float64Array(8);
const ic_cat = new Float64Array(8);
const ic_abtt = new Float64Array(4);
const ic_bctt = new Float64Array(4);
const ic_catt = new Float64Array(4);

// insphere -- adapt buffers (small) plus fallback exact buffers.
const is_ab = new Float64Array(4);
const is_bc = new Float64Array(4);
const is_cd = new Float64Array(4);
const is_da = new Float64Array(4);
const is_ac = new Float64Array(4);
const is_bd = new Float64Array(4);
const is_temp8a = new Float64Array(8);
const is_temp8b = new Float64Array(8);
const is_temp8c = new Float64Array(8);
const is_temp16 = new Float64Array(16);
const is_temp24 = new Float64Array(24);
const is_temp48 = new Float64Array(48);
const is_xdet = new Float64Array(96);
const is_ydet = new Float64Array(96);
const is_zdet = new Float64Array(96);
const is_xydet = new Float64Array(192);
const is_adet = new Float64Array(288);
const is_bdet = new Float64Array(288);
const is_cdet = new Float64Array(288);
const is_ddet = new Float64Array(288);
const is_abdet = new Float64Array(576);
const is_cddet = new Float64Array(576);
const is_fin1 = new Float64Array(1152);

// insphereExact buffers (the canonical reference's monolithic exact path).
const ise_ab = new Float64Array(4);
const ise_bc = new Float64Array(4);
const ise_cd = new Float64Array(4);
const ise_de = new Float64Array(4);
const ise_ea = new Float64Array(4);
const ise_ac = new Float64Array(4);
const ise_bd = new Float64Array(4);
const ise_ce = new Float64Array(4);
const ise_da = new Float64Array(4);
const ise_eb = new Float64Array(4);
const ise_temp8a = new Float64Array(8);
const ise_temp8b = new Float64Array(8);
const ise_temp16 = new Float64Array(16);
const ise_abc = new Float64Array(24);
const ise_bcd = new Float64Array(24);
const ise_cde = new Float64Array(24);
const ise_dea = new Float64Array(24);
const ise_eab = new Float64Array(24);
const ise_abd = new Float64Array(24);
const ise_bce = new Float64Array(24);
const ise_cda = new Float64Array(24);
const ise_deb = new Float64Array(24);
const ise_eac = new Float64Array(24);
const ise_temp48a = new Float64Array(48);
const ise_temp48b = new Float64Array(48);
const ise_abcd = new Float64Array(96);
const ise_bcde = new Float64Array(96);
const ise_cdea = new Float64Array(96);
const ise_deab = new Float64Array(96);
const ise_eabc = new Float64Array(96);
const ise_temp192 = new Float64Array(192);
const ise_det384x = new Float64Array(384);
const ise_det384y = new Float64Array(384);
const ise_det384z = new Float64Array(384);
const ise_detxy = new Float64Array(768);
const ise_adet = new Float64Array(1152);
const ise_bdet = new Float64Array(1152);
const ise_cdet = new Float64Array(1152);
const ise_ddet = new Float64Array(1152);
const ise_edet = new Float64Array(1152);
const ise_abdet = new Float64Array(2304);
const ise_cddet = new Float64Array(2304);
const ise_cdedet = new Float64Array(3456);
const ise_deter = new Float64Array(5760);

// -----------------------------------------------------------------------
// orient2d
// -----------------------------------------------------------------------

function orient2dAdapt(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  detsum: number,
): number {
  let acx = ax - cx;
  let bcx = bx - cx;
  let acy = ay - cy;
  let bcy = by - cy;

  // Two_Product(acx, bcy, detleft1, detleft0)
  let detleft = acx * bcy;
  let c = SPLITTER * acx;
  let abig = c - acx;
  let ahi = c - abig;
  let alo = acx - ahi;
  c = SPLITTER * bcy;
  abig = c - bcy;
  let bhi = c - abig;
  let blo = bcy - bhi;
  let err1 = detleft - ahi * bhi;
  let err2 = err1 - alo * bhi;
  let err3 = err2 - ahi * blo;
  let detlefttail = alo * blo - err3;

  // Two_Product(acy, bcx, detright1, detright0)
  let detright = acy * bcx;
  c = SPLITTER * acy;
  abig = c - acy;
  ahi = c - abig;
  alo = acy - ahi;
  c = SPLITTER * bcx;
  abig = c - bcx;
  bhi = c - abig;
  blo = bcx - bhi;
  err1 = detright - ahi * bhi;
  err2 = err1 - alo * bhi;
  err3 = err2 - ahi * blo;
  let detrighttail = alo * blo - err3;

  // Two_Two_Diff(detleft, detlefttail, detright, detrighttail) → B[0..3]
  // Two_One_Diff(detleft, detlefttail, detright)
  let _i: number, _j: number, _0: number;
  let bvirt: number, avirt: number, bround: number, around: number;
  // Two_Diff(detlefttail, detright, _i, B[0])
  let x = detlefttail - detright;
  bvirt = detlefttail - x;
  avirt = x + bvirt;
  bround = bvirt - detright;
  around = detlefttail - avirt;
  o2_B[0] = around + bround;
  _i = x;
  // Two_Sum(detleft, _i, _j, B[1])
  x = detleft + _i;
  bvirt = x - detleft;
  avirt = x - bvirt;
  bround = _i - bvirt;
  around = detleft - avirt;
  o2_B[1] = around + bround;
  _j = x;
  // Two_One_Diff(_j, B[1], detrighttail) -- but we want Two_Two_Diff layout.
  // Actually Two_Two_Diff(a1, a0, b1, b0, x3, x2, x1, x0):
  //   Two_One_Diff(a1, a0, b0, _j, _0, x0)  -- already done? No, we did Two_One_Diff(detleft, detlefttail, detright), result _j, B[1], B[0].
  //   Two_One_Diff(_j, _0=B[1], b1=detrighttail, x3, x2, x1)
  // So here _j is the high, _0 = B[1].
  // Two_Diff(_0, b1, _i, x1)
  x = o2_B[1] - detrighttail;
  bvirt = o2_B[1] - x;
  avirt = x + bvirt;
  bround = bvirt - detrighttail;
  around = o2_B[1] - avirt;
  o2_B[1] = around + bround;
  _i = x;
  // Two_Sum(_j, _i, x3, x2)
  x = _j + _i;
  bvirt = x - _j;
  avirt = x - bvirt;
  bround = _i - bvirt;
  around = _j - avirt;
  o2_B[2] = around + bround;
  o2_B[3] = x;

  let det = o2_B[0] + o2_B[1] + o2_B[2] + o2_B[3];
  let errbound = CCWERRBOUND_B * detsum;
  if (det >= errbound || -det >= errbound) return det;

  // Two_Diff_Tail
  let acxtail: number;
  x = ax - cx;
  bvirt = ax - x;
  avirt = x + bvirt;
  bround = bvirt - cx;
  around = ax - avirt;
  acxtail = around + bround;

  let bcxtail: number;
  x = bx - cx;
  bvirt = bx - x;
  avirt = x + bvirt;
  bround = bvirt - cx;
  around = bx - avirt;
  bcxtail = around + bround;

  let acytail: number;
  x = ay - cy;
  bvirt = ay - x;
  avirt = x + bvirt;
  bround = bvirt - cy;
  around = ay - avirt;
  acytail = around + bround;

  let bcytail: number;
  x = by - cy;
  bvirt = by - x;
  avirt = x + bvirt;
  bround = bvirt - cy;
  around = by - avirt;
  bcytail = around + bround;

  if (
    acxtail === 0 &&
    acytail === 0 &&
    bcxtail === 0 &&
    bcytail === 0
  ) {
    return det;
  }

  errbound = CCWERRBOUND_C * detsum + RESULTERRBOUND * Math.abs(det);
  det += acx * bcytail + bcy * acxtail - (acy * bcxtail + bcx * acytail);
  if (det >= errbound || -det >= errbound) return det;

  // Stage 4 -- exact via expansions.
  // Two_Product(acxtail, bcy)
  let s1 = acxtail * bcy;
  c = SPLITTER * acxtail;
  abig = c - acxtail;
  ahi = c - abig;
  alo = acxtail - ahi;
  c = SPLITTER * bcy;
  abig = c - bcy;
  bhi = c - abig;
  blo = bcy - bhi;
  err1 = s1 - ahi * bhi;
  err2 = err1 - alo * bhi;
  err3 = err2 - ahi * blo;
  let s0 = alo * blo - err3;

  // Two_Product(acytail, bcx)
  let t1 = acytail * bcx;
  c = SPLITTER * acytail;
  abig = c - acytail;
  ahi = c - abig;
  alo = acytail - ahi;
  c = SPLITTER * bcx;
  abig = c - bcx;
  bhi = c - abig;
  blo = bcx - bhi;
  err1 = t1 - ahi * bhi;
  err2 = err1 - alo * bhi;
  err3 = err2 - ahi * blo;
  let t0 = alo * blo - err3;

  // Two_Two_Diff(s1, s0, t1, t0) → o2_u[0..3]
  x = s0 - t0;
  bvirt = s0 - x;
  avirt = x + bvirt;
  bround = bvirt - t0;
  around = s0 - avirt;
  o2_u[0] = around + bround;
  _i = x;
  x = s1 + _i;
  bvirt = x - s1;
  avirt = x - bvirt;
  bround = _i - bvirt;
  around = s1 - avirt;
  o2_u[1] = around + bround;
  _j = x;
  x = o2_u[1] - t1;
  bvirt = o2_u[1] - x;
  avirt = x + bvirt;
  bround = bvirt - t1;
  around = o2_u[1] - avirt;
  o2_u[1] = around + bround;
  _i = x;
  x = _j + _i;
  bvirt = x - _j;
  avirt = x - bvirt;
  bround = _i - bvirt;
  around = _j - avirt;
  o2_u[2] = around + bround;
  o2_u[3] = x;

  const C1len = fastExpansionSumZeroelim(4, o2_B, 4, o2_u, o2_C1);

  // Two_Product(acx, bcytail)
  s1 = acx * bcytail;
  c = SPLITTER * acx;
  abig = c - acx;
  ahi = c - abig;
  alo = acx - ahi;
  c = SPLITTER * bcytail;
  abig = c - bcytail;
  bhi = c - abig;
  blo = bcytail - bhi;
  err1 = s1 - ahi * bhi;
  err2 = err1 - alo * bhi;
  err3 = err2 - ahi * blo;
  s0 = alo * blo - err3;

  // Two_Product(acy, bcxtail)
  t1 = acy * bcxtail;
  c = SPLITTER * acy;
  abig = c - acy;
  ahi = c - abig;
  alo = acy - ahi;
  c = SPLITTER * bcxtail;
  abig = c - bcxtail;
  bhi = c - abig;
  blo = bcxtail - bhi;
  err1 = t1 - ahi * bhi;
  err2 = err1 - alo * bhi;
  err3 = err2 - ahi * blo;
  t0 = alo * blo - err3;

  x = s0 - t0;
  bvirt = s0 - x;
  avirt = x + bvirt;
  bround = bvirt - t0;
  around = s0 - avirt;
  o2_u[0] = around + bround;
  _i = x;
  x = s1 + _i;
  bvirt = x - s1;
  avirt = x - bvirt;
  bround = _i - bvirt;
  around = s1 - avirt;
  o2_u[1] = around + bround;
  _j = x;
  x = o2_u[1] - t1;
  bvirt = o2_u[1] - x;
  avirt = x + bvirt;
  bround = bvirt - t1;
  around = o2_u[1] - avirt;
  o2_u[1] = around + bround;
  _i = x;
  x = _j + _i;
  bvirt = x - _j;
  avirt = x - bvirt;
  bround = _i - bvirt;
  around = _j - avirt;
  o2_u[2] = around + bround;
  o2_u[3] = x;

  const C2len = fastExpansionSumZeroelim(C1len, o2_C1, 4, o2_u, o2_C2);

  // Two_Product(acxtail, bcytail)
  s1 = acxtail * bcytail;
  c = SPLITTER * acxtail;
  abig = c - acxtail;
  ahi = c - abig;
  alo = acxtail - ahi;
  c = SPLITTER * bcytail;
  abig = c - bcytail;
  bhi = c - abig;
  blo = bcytail - bhi;
  err1 = s1 - ahi * bhi;
  err2 = err1 - alo * bhi;
  err3 = err2 - ahi * blo;
  s0 = alo * blo - err3;

  // Two_Product(acytail, bcxtail)
  t1 = acytail * bcxtail;
  c = SPLITTER * acytail;
  abig = c - acytail;
  ahi = c - abig;
  alo = acytail - ahi;
  c = SPLITTER * bcxtail;
  abig = c - bcxtail;
  bhi = c - abig;
  blo = bcxtail - bhi;
  err1 = t1 - ahi * bhi;
  err2 = err1 - alo * bhi;
  err3 = err2 - ahi * blo;
  t0 = alo * blo - err3;

  x = s0 - t0;
  bvirt = s0 - x;
  avirt = x + bvirt;
  bround = bvirt - t0;
  around = s0 - avirt;
  o2_u[0] = around + bround;
  _i = x;
  x = s1 + _i;
  bvirt = x - s1;
  avirt = x - bvirt;
  bround = _i - bvirt;
  around = s1 - avirt;
  o2_u[1] = around + bround;
  _j = x;
  x = o2_u[1] - t1;
  bvirt = o2_u[1] - x;
  avirt = x + bvirt;
  bround = bvirt - t1;
  around = o2_u[1] - avirt;
  o2_u[1] = around + bround;
  _i = x;
  x = _j + _i;
  bvirt = x - _j;
  avirt = x - bvirt;
  bround = _i - bvirt;
  around = _j - avirt;
  o2_u[2] = around + bround;
  o2_u[3] = x;

  const Dlen = fastExpansionSumZeroelim(C2len, o2_C2, 4, o2_u, o2_D);

  return o2_D[Dlen - 1];
}

function orient2d(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  const detleft = (ax - cx) * (by - cy);
  const detright = (ay - cy) * (bx - cx);
  const det = detleft - detright;

  let detsum: number;
  if (detleft > 0) {
    if (detright <= 0) return det > 0 ? 1 : det < 0 ? -1 : 0;
    detsum = detleft + detright;
  } else if (detleft < 0) {
    if (detright >= 0) return det > 0 ? 1 : det < 0 ? -1 : 0;
    detsum = -detleft - detright;
  } else {
    return det > 0 ? 1 : det < 0 ? -1 : 0;
  }

  const errbound = CCWERRBOUND_A * detsum;
  if (det >= errbound || -det >= errbound) return det > 0 ? 1 : det < 0 ? -1 : 0;

  const r = orient2dAdapt(ax, ay, bx, by, cx, cy, detsum);
  return r > 0 ? 1 : r < 0 ? -1 : 0;
}

// -----------------------------------------------------------------------
// orient3d
// -----------------------------------------------------------------------

// Build a 4-component "two-two-diff" expansion (a1*b1 - a2*b2 form):
//   Two_Product(p, q) → (s1, s0)
//   Two_Product(r, t) → (u1, u0)
//   Two_Two_Diff(s1, s0, u1, u0) → out[0..3]
// Inlined where used because the four terms appear constantly.

function orient3dAdapt(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  dx: number,
  dy: number,
  dz: number,
  permanent: number,
): number {
  let adx = ax - dx;
  let bdx = bx - dx;
  let cdx = cx - dx;
  let ady = ay - dy;
  let bdy = by - dy;
  let cdy = cy - dy;
  let adz = az - dz;
  let bdz = bz - dz;
  let cdz = cz - dz;

  let c: number, abig: number, ahi: number, alo: number, bhi: number, blo: number;
  let err1: number, err2: number, err3: number;
  let bvirt: number, avirt: number, bround: number, around: number;
  let _i: number, _j: number, _0: number;
  let x: number;

  // bc = bdx*cdy - cdx*bdy expansion of length 4
  let s1 = bdx * cdy;
  c = SPLITTER * bdx;
  abig = c - bdx;
  ahi = c - abig;
  alo = bdx - ahi;
  c = SPLITTER * cdy;
  abig = c - cdy;
  bhi = c - abig;
  blo = cdy - bhi;
  err1 = s1 - ahi * bhi;
  err2 = err1 - alo * bhi;
  err3 = err2 - ahi * blo;
  let s0 = alo * blo - err3;

  let t1 = cdx * bdy;
  c = SPLITTER * cdx;
  abig = c - cdx;
  ahi = c - abig;
  alo = cdx - ahi;
  c = SPLITTER * bdy;
  abig = c - bdy;
  bhi = c - abig;
  blo = bdy - bhi;
  err1 = t1 - ahi * bhi;
  err2 = err1 - alo * bhi;
  err3 = err2 - ahi * blo;
  let t0 = alo * blo - err3;

  // Two_Two_Diff(s1, s0, t1, t0) → o3_bc[0..3]
  x = s0 - t0;
  bvirt = s0 - x;
  avirt = x + bvirt;
  bround = bvirt - t0;
  around = s0 - avirt;
  o3_bc[0] = around + bround;
  _i = x;
  x = s1 + _i;
  bvirt = x - s1;
  avirt = x - bvirt;
  bround = _i - bvirt;
  around = s1 - avirt;
  o3_bc[1] = around + bround;
  _j = x;
  x = o3_bc[1] - t1;
  bvirt = o3_bc[1] - x;
  avirt = x + bvirt;
  bround = bvirt - t1;
  around = o3_bc[1] - avirt;
  o3_bc[1] = around + bround;
  _i = x;
  x = _j + _i;
  bvirt = x - _j;
  avirt = x - bvirt;
  bround = _i - bvirt;
  around = _j - avirt;
  o3_bc[2] = around + bround;
  o3_bc[3] = x;

  const alen = scaleExpansionZeroelim(4, o3_bc, adz, o3_adet);

  // ca = cdx*ady - adx*cdy
  s1 = cdx * ady;
  c = SPLITTER * cdx;
  abig = c - cdx;
  ahi = c - abig;
  alo = cdx - ahi;
  c = SPLITTER * ady;
  abig = c - ady;
  bhi = c - abig;
  blo = ady - bhi;
  err1 = s1 - ahi * bhi;
  err2 = err1 - alo * bhi;
  err3 = err2 - ahi * blo;
  s0 = alo * blo - err3;

  t1 = adx * cdy;
  c = SPLITTER * adx;
  abig = c - adx;
  ahi = c - abig;
  alo = adx - ahi;
  c = SPLITTER * cdy;
  abig = c - cdy;
  bhi = c - abig;
  blo = cdy - bhi;
  err1 = t1 - ahi * bhi;
  err2 = err1 - alo * bhi;
  err3 = err2 - ahi * blo;
  t0 = alo * blo - err3;

  x = s0 - t0;
  bvirt = s0 - x;
  avirt = x + bvirt;
  bround = bvirt - t0;
  around = s0 - avirt;
  o3_ca[0] = around + bround;
  _i = x;
  x = s1 + _i;
  bvirt = x - s1;
  avirt = x - bvirt;
  bround = _i - bvirt;
  around = s1 - avirt;
  o3_ca[1] = around + bround;
  _j = x;
  x = o3_ca[1] - t1;
  bvirt = o3_ca[1] - x;
  avirt = x + bvirt;
  bround = bvirt - t1;
  around = o3_ca[1] - avirt;
  o3_ca[1] = around + bround;
  _i = x;
  x = _j + _i;
  bvirt = x - _j;
  avirt = x - bvirt;
  bround = _i - bvirt;
  around = _j - avirt;
  o3_ca[2] = around + bround;
  o3_ca[3] = x;

  const blen = scaleExpansionZeroelim(4, o3_ca, bdz, o3_bdet);

  // ab = adx*bdy - bdx*ady
  s1 = adx * bdy;
  c = SPLITTER * adx;
  abig = c - adx;
  ahi = c - abig;
  alo = adx - ahi;
  c = SPLITTER * bdy;
  abig = c - bdy;
  bhi = c - abig;
  blo = bdy - bhi;
  err1 = s1 - ahi * bhi;
  err2 = err1 - alo * bhi;
  err3 = err2 - ahi * blo;
  s0 = alo * blo - err3;

  t1 = bdx * ady;
  c = SPLITTER * bdx;
  abig = c - bdx;
  ahi = c - abig;
  alo = bdx - ahi;
  c = SPLITTER * ady;
  abig = c - ady;
  bhi = c - abig;
  blo = ady - bhi;
  err1 = t1 - ahi * bhi;
  err2 = err1 - alo * bhi;
  err3 = err2 - ahi * blo;
  t0 = alo * blo - err3;

  x = s0 - t0;
  bvirt = s0 - x;
  avirt = x + bvirt;
  bround = bvirt - t0;
  around = s0 - avirt;
  o3_ab[0] = around + bround;
  _i = x;
  x = s1 + _i;
  bvirt = x - s1;
  avirt = x - bvirt;
  bround = _i - bvirt;
  around = s1 - avirt;
  o3_ab[1] = around + bround;
  _j = x;
  x = o3_ab[1] - t1;
  bvirt = o3_ab[1] - x;
  avirt = x + bvirt;
  bround = bvirt - t1;
  around = o3_ab[1] - avirt;
  o3_ab[1] = around + bround;
  _i = x;
  x = _j + _i;
  bvirt = x - _j;
  avirt = x - bvirt;
  bround = _i - bvirt;
  around = _j - avirt;
  o3_ab[2] = around + bround;
  o3_ab[3] = x;

  const clen = scaleExpansionZeroelim(4, o3_ab, cdz, o3_cdet);

  const ablen = fastExpansionSumZeroelim(alen, o3_adet, blen, o3_bdet, o3_abdet);
  let finlength = fastExpansionSumZeroelim(ablen, o3_abdet, clen, o3_cdet, o3_fin1);

  let det = estimate(finlength, o3_fin1);
  let errbound = O3DERRBOUND_B * permanent;
  if (det >= errbound || -det >= errbound) return det;

  // tail terms
  let adxtail: number;
  x = ax - dx;
  bvirt = ax - x;
  avirt = x + bvirt;
  bround = bvirt - dx;
  around = ax - avirt;
  adxtail = around + bround;

  let bdxtail: number;
  x = bx - dx;
  bvirt = bx - x;
  avirt = x + bvirt;
  bround = bvirt - dx;
  around = bx - avirt;
  bdxtail = around + bround;

  let cdxtail: number;
  x = cx - dx;
  bvirt = cx - x;
  avirt = x + bvirt;
  bround = bvirt - dx;
  around = cx - avirt;
  cdxtail = around + bround;

  let adytail: number;
  x = ay - dy;
  bvirt = ay - x;
  avirt = x + bvirt;
  bround = bvirt - dy;
  around = ay - avirt;
  adytail = around + bround;

  let bdytail: number;
  x = by - dy;
  bvirt = by - x;
  avirt = x + bvirt;
  bround = bvirt - dy;
  around = by - avirt;
  bdytail = around + bround;

  let cdytail: number;
  x = cy - dy;
  bvirt = cy - x;
  avirt = x + bvirt;
  bround = bvirt - dy;
  around = cy - avirt;
  cdytail = around + bround;

  let adztail: number;
  x = az - dz;
  bvirt = az - x;
  avirt = x + bvirt;
  bround = bvirt - dz;
  around = az - avirt;
  adztail = around + bround;

  let bdztail: number;
  x = bz - dz;
  bvirt = bz - x;
  avirt = x + bvirt;
  bround = bvirt - dz;
  around = bz - avirt;
  bdztail = around + bround;

  let cdztail: number;
  x = cz - dz;
  bvirt = cz - x;
  avirt = x + bvirt;
  bround = bvirt - dz;
  around = cz - avirt;
  cdztail = around + bround;

  if (
    adxtail === 0 &&
    bdxtail === 0 &&
    cdxtail === 0 &&
    adytail === 0 &&
    bdytail === 0 &&
    cdytail === 0 &&
    adztail === 0 &&
    bdztail === 0 &&
    cdztail === 0
  ) {
    return det;
  }

  errbound = O3DERRBOUND_C * permanent + RESULTERRBOUND * Math.abs(det);
  det +=
    adz * (bdx * cdytail + cdy * bdxtail - (bdy * cdxtail + cdx * bdytail)) +
    adztail * (bdx * cdy - bdy * cdx) +
    (bdz * (cdx * adytail + ady * cdxtail - (cdy * adxtail + adx * cdytail)) +
      bdztail * (cdx * ady - cdy * adx)) +
    (cdz * (adx * bdytail + bdy * adxtail - (ady * bdxtail + bdx * adytail)) +
      cdztail * (adx * bdy - ady * bdx));
  if (det >= errbound || -det >= errbound) return det;

  // Stage 4: build the full expansion. Direct port of orient3dadapt.
  let finnow = o3_fin1;
  let finother = o3_fin2;

  // at_b, at_c
  let at_blen: number, at_clen: number;
  let negate: number;
  if (adxtail === 0) {
    if (adytail === 0) {
      o3_at_b[0] = 0;
      at_blen = 1;
      o3_at_c[0] = 0;
      at_clen = 1;
    } else {
      negate = -adytail;
      // Two_Product(negate, bdx)
      let p = negate * bdx;
      c = SPLITTER * negate;
      abig = c - negate;
      ahi = c - abig;
      alo = negate - ahi;
      c = SPLITTER * bdx;
      abig = c - bdx;
      bhi = c - abig;
      blo = bdx - bhi;
      err1 = p - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      o3_at_b[0] = alo * blo - err3;
      o3_at_b[1] = p;
      at_blen = 2;
      // Two_Product(adytail, cdx)
      p = adytail * cdx;
      c = SPLITTER * adytail;
      abig = c - adytail;
      ahi = c - abig;
      alo = adytail - ahi;
      c = SPLITTER * cdx;
      abig = c - cdx;
      bhi = c - abig;
      blo = cdx - bhi;
      err1 = p - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      o3_at_c[0] = alo * blo - err3;
      o3_at_c[1] = p;
      at_clen = 2;
    }
  } else {
    if (adytail === 0) {
      let p = adxtail * bdy;
      c = SPLITTER * adxtail;
      abig = c - adxtail;
      ahi = c - abig;
      alo = adxtail - ahi;
      c = SPLITTER * bdy;
      abig = c - bdy;
      bhi = c - abig;
      blo = bdy - bhi;
      err1 = p - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      o3_at_b[0] = alo * blo - err3;
      o3_at_b[1] = p;
      at_blen = 2;
      negate = -adxtail;
      p = negate * cdy;
      c = SPLITTER * negate;
      abig = c - negate;
      ahi = c - abig;
      alo = negate - ahi;
      c = SPLITTER * cdy;
      abig = c - cdy;
      bhi = c - abig;
      blo = cdy - bhi;
      err1 = p - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      o3_at_c[0] = alo * blo - err3;
      o3_at_c[1] = p;
      at_clen = 2;
    } else {
      // Full Two_Two_Diff blocks for at_b and at_c.
      // adxt_bdy = adxtail*bdy ; adyt_bdx = adytail*bdx
      let p1 = adxtail * bdy;
      c = SPLITTER * adxtail;
      abig = c - adxtail;
      ahi = c - abig;
      alo = adxtail - ahi;
      c = SPLITTER * bdy;
      abig = c - bdy;
      bhi = c - abig;
      blo = bdy - bhi;
      err1 = p1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      let p0 = alo * blo - err3;

      let q1 = adytail * bdx;
      c = SPLITTER * adytail;
      abig = c - adytail;
      ahi = c - abig;
      alo = adytail - ahi;
      c = SPLITTER * bdx;
      abig = c - bdx;
      bhi = c - abig;
      blo = bdx - bhi;
      err1 = q1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      let q0 = alo * blo - err3;

      x = p0 - q0;
      bvirt = p0 - x;
      avirt = x + bvirt;
      bround = bvirt - q0;
      around = p0 - avirt;
      o3_at_b[0] = around + bround;
      _i = x;
      x = p1 + _i;
      bvirt = x - p1;
      avirt = x - bvirt;
      bround = _i - bvirt;
      around = p1 - avirt;
      o3_at_b[1] = around + bround;
      _j = x;
      x = o3_at_b[1] - q1;
      bvirt = o3_at_b[1] - x;
      avirt = x + bvirt;
      bround = bvirt - q1;
      around = o3_at_b[1] - avirt;
      o3_at_b[1] = around + bround;
      _i = x;
      x = _j + _i;
      bvirt = x - _j;
      avirt = x - bvirt;
      bround = _i - bvirt;
      around = _j - avirt;
      o3_at_b[2] = around + bround;
      o3_at_b[3] = x;
      at_blen = 4;

      // at_c: adyt_cdx - adxt_cdy
      p1 = adytail * cdx;
      c = SPLITTER * adytail;
      abig = c - adytail;
      ahi = c - abig;
      alo = adytail - ahi;
      c = SPLITTER * cdx;
      abig = c - cdx;
      bhi = c - abig;
      blo = cdx - bhi;
      err1 = p1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      p0 = alo * blo - err3;

      q1 = adxtail * cdy;
      c = SPLITTER * adxtail;
      abig = c - adxtail;
      ahi = c - abig;
      alo = adxtail - ahi;
      c = SPLITTER * cdy;
      abig = c - cdy;
      bhi = c - abig;
      blo = cdy - bhi;
      err1 = q1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      q0 = alo * blo - err3;

      x = p0 - q0;
      bvirt = p0 - x;
      avirt = x + bvirt;
      bround = bvirt - q0;
      around = p0 - avirt;
      o3_at_c[0] = around + bround;
      _i = x;
      x = p1 + _i;
      bvirt = x - p1;
      avirt = x - bvirt;
      bround = _i - bvirt;
      around = p1 - avirt;
      o3_at_c[1] = around + bround;
      _j = x;
      x = o3_at_c[1] - q1;
      bvirt = o3_at_c[1] - x;
      avirt = x + bvirt;
      bround = bvirt - q1;
      around = o3_at_c[1] - avirt;
      o3_at_c[1] = around + bround;
      _i = x;
      x = _j + _i;
      bvirt = x - _j;
      avirt = x - bvirt;
      bround = _i - bvirt;
      around = _j - avirt;
      o3_at_c[2] = around + bround;
      o3_at_c[3] = x;
      at_clen = 4;
    }
  }

  // bt_c, bt_a
  let bt_clen: number, bt_alen: number;
  if (bdxtail === 0) {
    if (bdytail === 0) {
      o3_bt_c[0] = 0;
      bt_clen = 1;
      o3_bt_a[0] = 0;
      bt_alen = 1;
    } else {
      negate = -bdytail;
      let p = negate * cdx;
      c = SPLITTER * negate;
      abig = c - negate;
      ahi = c - abig;
      alo = negate - ahi;
      c = SPLITTER * cdx;
      abig = c - cdx;
      bhi = c - abig;
      blo = cdx - bhi;
      err1 = p - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      o3_bt_c[0] = alo * blo - err3;
      o3_bt_c[1] = p;
      bt_clen = 2;
      p = bdytail * adx;
      c = SPLITTER * bdytail;
      abig = c - bdytail;
      ahi = c - abig;
      alo = bdytail - ahi;
      c = SPLITTER * adx;
      abig = c - adx;
      bhi = c - abig;
      blo = adx - bhi;
      err1 = p - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      o3_bt_a[0] = alo * blo - err3;
      o3_bt_a[1] = p;
      bt_alen = 2;
    }
  } else {
    if (bdytail === 0) {
      let p = bdxtail * cdy;
      c = SPLITTER * bdxtail;
      abig = c - bdxtail;
      ahi = c - abig;
      alo = bdxtail - ahi;
      c = SPLITTER * cdy;
      abig = c - cdy;
      bhi = c - abig;
      blo = cdy - bhi;
      err1 = p - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      o3_bt_c[0] = alo * blo - err3;
      o3_bt_c[1] = p;
      bt_clen = 2;
      negate = -bdxtail;
      p = negate * ady;
      c = SPLITTER * negate;
      abig = c - negate;
      ahi = c - abig;
      alo = negate - ahi;
      c = SPLITTER * ady;
      abig = c - ady;
      bhi = c - abig;
      blo = ady - bhi;
      err1 = p - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      o3_bt_a[0] = alo * blo - err3;
      o3_bt_a[1] = p;
      bt_alen = 2;
    } else {
      let p1 = bdxtail * cdy;
      c = SPLITTER * bdxtail;
      abig = c - bdxtail;
      ahi = c - abig;
      alo = bdxtail - ahi;
      c = SPLITTER * cdy;
      abig = c - cdy;
      bhi = c - abig;
      blo = cdy - bhi;
      err1 = p1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      let p0 = alo * blo - err3;

      let q1 = bdytail * cdx;
      c = SPLITTER * bdytail;
      abig = c - bdytail;
      ahi = c - abig;
      alo = bdytail - ahi;
      c = SPLITTER * cdx;
      abig = c - cdx;
      bhi = c - abig;
      blo = cdx - bhi;
      err1 = q1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      let q0 = alo * blo - err3;

      x = p0 - q0;
      bvirt = p0 - x;
      avirt = x + bvirt;
      bround = bvirt - q0;
      around = p0 - avirt;
      o3_bt_c[0] = around + bround;
      _i = x;
      x = p1 + _i;
      bvirt = x - p1;
      avirt = x - bvirt;
      bround = _i - bvirt;
      around = p1 - avirt;
      o3_bt_c[1] = around + bround;
      _j = x;
      x = o3_bt_c[1] - q1;
      bvirt = o3_bt_c[1] - x;
      avirt = x + bvirt;
      bround = bvirt - q1;
      around = o3_bt_c[1] - avirt;
      o3_bt_c[1] = around + bround;
      _i = x;
      x = _j + _i;
      bvirt = x - _j;
      avirt = x - bvirt;
      bround = _i - bvirt;
      around = _j - avirt;
      o3_bt_c[2] = around + bround;
      o3_bt_c[3] = x;
      bt_clen = 4;

      // bt_a: bdyt_adx - bdxt_ady
      p1 = bdytail * adx;
      c = SPLITTER * bdytail;
      abig = c - bdytail;
      ahi = c - abig;
      alo = bdytail - ahi;
      c = SPLITTER * adx;
      abig = c - adx;
      bhi = c - abig;
      blo = adx - bhi;
      err1 = p1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      p0 = alo * blo - err3;

      q1 = bdxtail * ady;
      c = SPLITTER * bdxtail;
      abig = c - bdxtail;
      ahi = c - abig;
      alo = bdxtail - ahi;
      c = SPLITTER * ady;
      abig = c - ady;
      bhi = c - abig;
      blo = ady - bhi;
      err1 = q1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      q0 = alo * blo - err3;

      x = p0 - q0;
      bvirt = p0 - x;
      avirt = x + bvirt;
      bround = bvirt - q0;
      around = p0 - avirt;
      o3_bt_a[0] = around + bround;
      _i = x;
      x = p1 + _i;
      bvirt = x - p1;
      avirt = x - bvirt;
      bround = _i - bvirt;
      around = p1 - avirt;
      o3_bt_a[1] = around + bround;
      _j = x;
      x = o3_bt_a[1] - q1;
      bvirt = o3_bt_a[1] - x;
      avirt = x + bvirt;
      bround = bvirt - q1;
      around = o3_bt_a[1] - avirt;
      o3_bt_a[1] = around + bround;
      _i = x;
      x = _j + _i;
      bvirt = x - _j;
      avirt = x - bvirt;
      bround = _i - bvirt;
      around = _j - avirt;
      o3_bt_a[2] = around + bround;
      o3_bt_a[3] = x;
      bt_alen = 4;
    }
  }

  // ct_a, ct_b
  let ct_alen: number, ct_blen: number;
  if (cdxtail === 0) {
    if (cdytail === 0) {
      o3_ct_a[0] = 0;
      ct_alen = 1;
      o3_ct_b[0] = 0;
      ct_blen = 1;
    } else {
      negate = -cdytail;
      let p = negate * adx;
      c = SPLITTER * negate;
      abig = c - negate;
      ahi = c - abig;
      alo = negate - ahi;
      c = SPLITTER * adx;
      abig = c - adx;
      bhi = c - abig;
      blo = adx - bhi;
      err1 = p - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      o3_ct_a[0] = alo * blo - err3;
      o3_ct_a[1] = p;
      ct_alen = 2;
      p = cdytail * bdx;
      c = SPLITTER * cdytail;
      abig = c - cdytail;
      ahi = c - abig;
      alo = cdytail - ahi;
      c = SPLITTER * bdx;
      abig = c - bdx;
      bhi = c - abig;
      blo = bdx - bhi;
      err1 = p - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      o3_ct_b[0] = alo * blo - err3;
      o3_ct_b[1] = p;
      ct_blen = 2;
    }
  } else {
    if (cdytail === 0) {
      let p = cdxtail * ady;
      c = SPLITTER * cdxtail;
      abig = c - cdxtail;
      ahi = c - abig;
      alo = cdxtail - ahi;
      c = SPLITTER * ady;
      abig = c - ady;
      bhi = c - abig;
      blo = ady - bhi;
      err1 = p - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      o3_ct_a[0] = alo * blo - err3;
      o3_ct_a[1] = p;
      ct_alen = 2;
      negate = -cdxtail;
      p = negate * bdy;
      c = SPLITTER * negate;
      abig = c - negate;
      ahi = c - abig;
      alo = negate - ahi;
      c = SPLITTER * bdy;
      abig = c - bdy;
      bhi = c - abig;
      blo = bdy - bhi;
      err1 = p - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      o3_ct_b[0] = alo * blo - err3;
      o3_ct_b[1] = p;
      ct_blen = 2;
    } else {
      let p1 = cdxtail * ady;
      c = SPLITTER * cdxtail;
      abig = c - cdxtail;
      ahi = c - abig;
      alo = cdxtail - ahi;
      c = SPLITTER * ady;
      abig = c - ady;
      bhi = c - abig;
      blo = ady - bhi;
      err1 = p1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      let p0 = alo * blo - err3;

      let q1 = cdytail * adx;
      c = SPLITTER * cdytail;
      abig = c - cdytail;
      ahi = c - abig;
      alo = cdytail - ahi;
      c = SPLITTER * adx;
      abig = c - adx;
      bhi = c - abig;
      blo = adx - bhi;
      err1 = q1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      let q0 = alo * blo - err3;

      x = p0 - q0;
      bvirt = p0 - x;
      avirt = x + bvirt;
      bround = bvirt - q0;
      around = p0 - avirt;
      o3_ct_a[0] = around + bround;
      _i = x;
      x = p1 + _i;
      bvirt = x - p1;
      avirt = x - bvirt;
      bround = _i - bvirt;
      around = p1 - avirt;
      o3_ct_a[1] = around + bround;
      _j = x;
      x = o3_ct_a[1] - q1;
      bvirt = o3_ct_a[1] - x;
      avirt = x + bvirt;
      bround = bvirt - q1;
      around = o3_ct_a[1] - avirt;
      o3_ct_a[1] = around + bround;
      _i = x;
      x = _j + _i;
      bvirt = x - _j;
      avirt = x - bvirt;
      bround = _i - bvirt;
      around = _j - avirt;
      o3_ct_a[2] = around + bround;
      o3_ct_a[3] = x;
      ct_alen = 4;

      // ct_b: cdyt_bdx - cdxt_bdy
      p1 = cdytail * bdx;
      c = SPLITTER * cdytail;
      abig = c - cdytail;
      ahi = c - abig;
      alo = cdytail - ahi;
      c = SPLITTER * bdx;
      abig = c - bdx;
      bhi = c - abig;
      blo = bdx - bhi;
      err1 = p1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      p0 = alo * blo - err3;

      q1 = cdxtail * bdy;
      c = SPLITTER * cdxtail;
      abig = c - cdxtail;
      ahi = c - abig;
      alo = cdxtail - ahi;
      c = SPLITTER * bdy;
      abig = c - bdy;
      bhi = c - abig;
      blo = bdy - bhi;
      err1 = q1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      q0 = alo * blo - err3;

      x = p0 - q0;
      bvirt = p0 - x;
      avirt = x + bvirt;
      bround = bvirt - q0;
      around = p0 - avirt;
      o3_ct_b[0] = around + bround;
      _i = x;
      x = p1 + _i;
      bvirt = x - p1;
      avirt = x - bvirt;
      bround = _i - bvirt;
      around = p1 - avirt;
      o3_ct_b[1] = around + bround;
      _j = x;
      x = o3_ct_b[1] - q1;
      bvirt = o3_ct_b[1] - x;
      avirt = x + bvirt;
      bround = bvirt - q1;
      around = o3_ct_b[1] - avirt;
      o3_ct_b[1] = around + bround;
      _i = x;
      x = _j + _i;
      bvirt = x - _j;
      avirt = x - bvirt;
      bround = _i - bvirt;
      around = _j - avirt;
      o3_ct_b[2] = around + bround;
      o3_ct_b[3] = x;
      ct_blen = 4;
    }
  }

  const bctlen = fastExpansionSumZeroelim(bt_clen, o3_bt_c, ct_blen, o3_ct_b, o3_bct);
  let wlen = scaleExpansionZeroelim(bctlen, o3_bct, adz, o3_w);
  finlength = fastExpansionSumZeroelim(finlength, finnow, wlen, o3_w, finother);
  let tmp = finnow; finnow = finother; finother = tmp;

  const catlen = fastExpansionSumZeroelim(ct_alen, o3_ct_a, at_clen, o3_at_c, o3_cat);
  wlen = scaleExpansionZeroelim(catlen, o3_cat, bdz, o3_w);
  finlength = fastExpansionSumZeroelim(finlength, finnow, wlen, o3_w, finother);
  tmp = finnow; finnow = finother; finother = tmp;

  const abtlen = fastExpansionSumZeroelim(at_blen, o3_at_b, bt_alen, o3_bt_a, o3_abt);
  wlen = scaleExpansionZeroelim(abtlen, o3_abt, cdz, o3_w);
  finlength = fastExpansionSumZeroelim(finlength, finnow, wlen, o3_w, finother);
  tmp = finnow; finnow = finother; finother = tmp;

  if (adztail !== 0) {
    const vlen = scaleExpansionZeroelim(4, o3_bc, adztail, o3_v);
    finlength = fastExpansionSumZeroelim(finlength, finnow, vlen, o3_v, finother);
    tmp = finnow; finnow = finother; finother = tmp;
  }
  if (bdztail !== 0) {
    const vlen = scaleExpansionZeroelim(4, o3_ca, bdztail, o3_v);
    finlength = fastExpansionSumZeroelim(finlength, finnow, vlen, o3_v, finother);
    tmp = finnow; finnow = finother; finother = tmp;
  }
  if (cdztail !== 0) {
    const vlen = scaleExpansionZeroelim(4, o3_ab, cdztail, o3_v);
    finlength = fastExpansionSumZeroelim(finlength, finnow, vlen, o3_v, finother);
    tmp = finnow; finnow = finother; finother = tmp;
  }

  // Two_One_Product helper -> writes 4 components into o3_u.
  // (a1*B + a0*B + b * remainder)... see predicates.c Two_One_Product macro.
  const twoOneProduct = (a1: number, a0: number, b: number) => {
    let bsplit_c = SPLITTER * b;
    let bsplit_abig = bsplit_c - b;
    let bhi2 = bsplit_c - bsplit_abig;
    let blo2 = b - bhi2;

    // Two_Product_Presplit(a0, b)
    let p = a0 * b;
    let cc = SPLITTER * a0;
    let aabig = cc - a0;
    let aahi = cc - aabig;
    let aalo = a0 - aahi;
    let e1 = p - aahi * bhi2;
    let e2 = e1 - aalo * bhi2;
    let e3 = e2 - aahi * blo2;
    let p0 = aalo * blo2 - e3;
    o3_u[0] = p0;
    let _i_local = p;

    // Two_Product_Presplit(a1, b)
    let p2 = a1 * b;
    cc = SPLITTER * a1;
    aabig = cc - a1;
    aahi = cc - aabig;
    aalo = a1 - aahi;
    e1 = p2 - aahi * bhi2;
    e2 = e1 - aalo * bhi2;
    e3 = e2 - aahi * blo2;
    let p20 = aalo * blo2 - e3;
    let _j_local = p2;
    let _0_local = p20;

    // Two_Sum(_i, _0, _k, x1)
    let xk = _i_local + _0_local;
    let bv = xk - _i_local;
    let av = xk - bv;
    let br = _0_local - bv;
    let ar = _i_local - av;
    o3_u[1] = ar + br;
    let _k_local = xk;

    // Fast_Two_Sum(_j, _k, x3, x2)
    let xx = _j_local + _k_local;
    o3_u[2] = _k_local - (xx - _j_local);
    o3_u[3] = xx;
  };

  // High-order tail*tail products.
  if (adxtail !== 0) {
    if (bdytail !== 0) {
      // adxt_bdyt = adxtail*bdytail (Two_Product)
      let p1 = adxtail * bdytail;
      c = SPLITTER * adxtail;
      abig = c - adxtail;
      ahi = c - abig;
      alo = adxtail - ahi;
      c = SPLITTER * bdytail;
      abig = c - bdytail;
      bhi = c - abig;
      blo = bdytail - bhi;
      err1 = p1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      let p0 = alo * blo - err3;

      twoOneProduct(p1, p0, cdz);
      finlength = fastExpansionSumZeroelim(finlength, finnow, 4, o3_u, finother);
      tmp = finnow; finnow = finother; finother = tmp;

      if (cdztail !== 0) {
        twoOneProduct(p1, p0, cdztail);
        finlength = fastExpansionSumZeroelim(finlength, finnow, 4, o3_u, finother);
        tmp = finnow; finnow = finother; finother = tmp;
      }
    }
    if (cdytail !== 0) {
      negate = -adxtail;
      let p1 = negate * cdytail;
      c = SPLITTER * negate;
      abig = c - negate;
      ahi = c - abig;
      alo = negate - ahi;
      c = SPLITTER * cdytail;
      abig = c - cdytail;
      bhi = c - abig;
      blo = cdytail - bhi;
      err1 = p1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      let p0 = alo * blo - err3;

      twoOneProduct(p1, p0, bdz);
      finlength = fastExpansionSumZeroelim(finlength, finnow, 4, o3_u, finother);
      tmp = finnow; finnow = finother; finother = tmp;
      if (bdztail !== 0) {
        twoOneProduct(p1, p0, bdztail);
        finlength = fastExpansionSumZeroelim(finlength, finnow, 4, o3_u, finother);
        tmp = finnow; finnow = finother; finother = tmp;
      }
    }
  }
  if (bdxtail !== 0) {
    if (cdytail !== 0) {
      let p1 = bdxtail * cdytail;
      c = SPLITTER * bdxtail;
      abig = c - bdxtail;
      ahi = c - abig;
      alo = bdxtail - ahi;
      c = SPLITTER * cdytail;
      abig = c - cdytail;
      bhi = c - abig;
      blo = cdytail - bhi;
      err1 = p1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      let p0 = alo * blo - err3;

      twoOneProduct(p1, p0, adz);
      finlength = fastExpansionSumZeroelim(finlength, finnow, 4, o3_u, finother);
      tmp = finnow; finnow = finother; finother = tmp;
      if (adztail !== 0) {
        twoOneProduct(p1, p0, adztail);
        finlength = fastExpansionSumZeroelim(finlength, finnow, 4, o3_u, finother);
        tmp = finnow; finnow = finother; finother = tmp;
      }
    }
    if (adytail !== 0) {
      negate = -bdxtail;
      let p1 = negate * adytail;
      c = SPLITTER * negate;
      abig = c - negate;
      ahi = c - abig;
      alo = negate - ahi;
      c = SPLITTER * adytail;
      abig = c - adytail;
      bhi = c - abig;
      blo = adytail - bhi;
      err1 = p1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      let p0 = alo * blo - err3;

      twoOneProduct(p1, p0, cdz);
      finlength = fastExpansionSumZeroelim(finlength, finnow, 4, o3_u, finother);
      tmp = finnow; finnow = finother; finother = tmp;
      if (cdztail !== 0) {
        twoOneProduct(p1, p0, cdztail);
        finlength = fastExpansionSumZeroelim(finlength, finnow, 4, o3_u, finother);
        tmp = finnow; finnow = finother; finother = tmp;
      }
    }
  }
  if (cdxtail !== 0) {
    if (adytail !== 0) {
      let p1 = cdxtail * adytail;
      c = SPLITTER * cdxtail;
      abig = c - cdxtail;
      ahi = c - abig;
      alo = cdxtail - ahi;
      c = SPLITTER * adytail;
      abig = c - adytail;
      bhi = c - abig;
      blo = adytail - bhi;
      err1 = p1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      let p0 = alo * blo - err3;

      twoOneProduct(p1, p0, bdz);
      finlength = fastExpansionSumZeroelim(finlength, finnow, 4, o3_u, finother);
      tmp = finnow; finnow = finother; finother = tmp;
      if (bdztail !== 0) {
        twoOneProduct(p1, p0, bdztail);
        finlength = fastExpansionSumZeroelim(finlength, finnow, 4, o3_u, finother);
        tmp = finnow; finnow = finother; finother = tmp;
      }
    }
    if (bdytail !== 0) {
      negate = -cdxtail;
      let p1 = negate * bdytail;
      c = SPLITTER * negate;
      abig = c - negate;
      ahi = c - abig;
      alo = negate - ahi;
      c = SPLITTER * bdytail;
      abig = c - bdytail;
      bhi = c - abig;
      blo = bdytail - bhi;
      err1 = p1 - ahi * bhi;
      err2 = err1 - alo * bhi;
      err3 = err2 - ahi * blo;
      let p0 = alo * blo - err3;

      twoOneProduct(p1, p0, adz);
      finlength = fastExpansionSumZeroelim(finlength, finnow, 4, o3_u, finother);
      tmp = finnow; finnow = finother; finother = tmp;
      if (adztail !== 0) {
        twoOneProduct(p1, p0, adztail);
        finlength = fastExpansionSumZeroelim(finlength, finnow, 4, o3_u, finother);
        tmp = finnow; finnow = finother; finother = tmp;
      }
    }
  }

  if (adztail !== 0) {
    wlen = scaleExpansionZeroelim(bctlen, o3_bct, adztail, o3_w);
    finlength = fastExpansionSumZeroelim(finlength, finnow, wlen, o3_w, finother);
    tmp = finnow; finnow = finother; finother = tmp;
  }
  if (bdztail !== 0) {
    wlen = scaleExpansionZeroelim(catlen, o3_cat, bdztail, o3_w);
    finlength = fastExpansionSumZeroelim(finlength, finnow, wlen, o3_w, finother);
    tmp = finnow; finnow = finother; finother = tmp;
  }
  if (cdztail !== 0) {
    wlen = scaleExpansionZeroelim(abtlen, o3_abt, cdztail, o3_w);
    finlength = fastExpansionSumZeroelim(finlength, finnow, wlen, o3_w, finother);
    tmp = finnow; finnow = finother; finother = tmp;
  }

  return finnow[finlength - 1];
}

function orient3d(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  dx: number,
  dy: number,
  dz: number,
): number {
  const adx = ax - dx;
  const bdx = bx - dx;
  const cdx = cx - dx;
  const ady = ay - dy;
  const bdy = by - dy;
  const cdy = cy - dy;
  const adz = az - dz;
  const bdz = bz - dz;
  const cdz = cz - dz;

  const bdxcdy = bdx * cdy;
  const cdxbdy = cdx * bdy;
  const cdxady = cdx * ady;
  const adxcdy = adx * cdy;
  const adxbdy = adx * bdy;
  const bdxady = bdx * ady;

  const det =
    adz * (bdxcdy - cdxbdy) +
    bdz * (cdxady - adxcdy) +
    cdz * (adxbdy - bdxady);

  const permanent =
    (Math.abs(bdxcdy) + Math.abs(cdxbdy)) * Math.abs(adz) +
    (Math.abs(cdxady) + Math.abs(adxcdy)) * Math.abs(bdz) +
    (Math.abs(adxbdy) + Math.abs(bdxady)) * Math.abs(cdz);

  const errbound = O3DERRBOUND_A * permanent;
  if (det > errbound || -det > errbound) return det > 0 ? 1 : det < 0 ? -1 : 0;

  const r = orient3dAdapt(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, permanent);
  return r > 0 ? 1 : r < 0 ? -1 : 0;
}

// -----------------------------------------------------------------------
// incircle
// -----------------------------------------------------------------------

function incircleAdapt(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  permanent: number,
): number {
  const adx = ax - dx;
  const bdx = bx - dx;
  const cdx = cx - dx;
  const ady = ay - dy;
  const bdy = by - dy;
  const cdy = cy - dy;

  let c: number, abig: number, ahi: number, alo: number, bhi: number, blo: number;
  let err1: number, err2: number, err3: number;
  let bvirt: number, avirt: number, bround: number, around: number;
  let _i: number, _j: number;
  let x: number;

  // bc = bdx*cdy - cdx*bdy
  let s1 = bdx * cdy;
  c = SPLITTER * bdx; abig = c - bdx; ahi = c - abig; alo = bdx - ahi;
  c = SPLITTER * cdy; abig = c - cdy; bhi = c - abig; blo = cdy - bhi;
  err1 = s1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
  let s0 = alo * blo - err3;

  let t1 = cdx * bdy;
  c = SPLITTER * cdx; abig = c - cdx; ahi = c - abig; alo = cdx - ahi;
  c = SPLITTER * bdy; abig = c - bdy; bhi = c - abig; blo = bdy - bhi;
  err1 = t1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
  let t0 = alo * blo - err3;

  x = s0 - t0; bvirt = s0 - x; avirt = x + bvirt; bround = bvirt - t0; around = s0 - avirt;
  ic_bc[0] = around + bround; _i = x;
  x = s1 + _i; bvirt = x - s1; avirt = x - bvirt; bround = _i - bvirt; around = s1 - avirt;
  ic_bc[1] = around + bround; _j = x;
  x = ic_bc[1] - t1; bvirt = ic_bc[1] - x; avirt = x + bvirt; bround = bvirt - t1; around = ic_bc[1] - avirt;
  ic_bc[1] = around + bround; _i = x;
  x = _j + _i; bvirt = x - _j; avirt = x - bvirt; bround = _i - bvirt; around = _j - avirt;
  ic_bc[2] = around + bround;
  ic_bc[3] = x;

  const axbclen = scaleExpansionZeroelim(4, ic_bc, adx, ic_axbc);
  const axxbclen = scaleExpansionZeroelim(axbclen, ic_axbc, adx, ic_axxbc);
  const aybclen = scaleExpansionZeroelim(4, ic_bc, ady, ic_aybc);
  const ayybclen = scaleExpansionZeroelim(aybclen, ic_aybc, ady, ic_ayybc);
  const alen = fastExpansionSumZeroelim(axxbclen, ic_axxbc, ayybclen, ic_ayybc, ic_adet);

  // ca = cdx*ady - adx*cdy
  s1 = cdx * ady;
  c = SPLITTER * cdx; abig = c - cdx; ahi = c - abig; alo = cdx - ahi;
  c = SPLITTER * ady; abig = c - ady; bhi = c - abig; blo = ady - bhi;
  err1 = s1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
  s0 = alo * blo - err3;

  t1 = adx * cdy;
  c = SPLITTER * adx; abig = c - adx; ahi = c - abig; alo = adx - ahi;
  c = SPLITTER * cdy; abig = c - cdy; bhi = c - abig; blo = cdy - bhi;
  err1 = t1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
  t0 = alo * blo - err3;

  x = s0 - t0; bvirt = s0 - x; avirt = x + bvirt; bround = bvirt - t0; around = s0 - avirt;
  ic_ca[0] = around + bround; _i = x;
  x = s1 + _i; bvirt = x - s1; avirt = x - bvirt; bround = _i - bvirt; around = s1 - avirt;
  ic_ca[1] = around + bround; _j = x;
  x = ic_ca[1] - t1; bvirt = ic_ca[1] - x; avirt = x + bvirt; bround = bvirt - t1; around = ic_ca[1] - avirt;
  ic_ca[1] = around + bround; _i = x;
  x = _j + _i; bvirt = x - _j; avirt = x - bvirt; bround = _i - bvirt; around = _j - avirt;
  ic_ca[2] = around + bround;
  ic_ca[3] = x;

  const bxcalen = scaleExpansionZeroelim(4, ic_ca, bdx, ic_bxca);
  const bxxcalen = scaleExpansionZeroelim(bxcalen, ic_bxca, bdx, ic_bxxca);
  const bycalen = scaleExpansionZeroelim(4, ic_ca, bdy, ic_byca);
  const byycalen = scaleExpansionZeroelim(bycalen, ic_byca, bdy, ic_byyca);
  const blen = fastExpansionSumZeroelim(bxxcalen, ic_bxxca, byycalen, ic_byyca, ic_bdet);

  // ab = adx*bdy - bdx*ady
  s1 = adx * bdy;
  c = SPLITTER * adx; abig = c - adx; ahi = c - abig; alo = adx - ahi;
  c = SPLITTER * bdy; abig = c - bdy; bhi = c - abig; blo = bdy - bhi;
  err1 = s1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
  s0 = alo * blo - err3;

  t1 = bdx * ady;
  c = SPLITTER * bdx; abig = c - bdx; ahi = c - abig; alo = bdx - ahi;
  c = SPLITTER * ady; abig = c - ady; bhi = c - abig; blo = ady - bhi;
  err1 = t1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
  t0 = alo * blo - err3;

  x = s0 - t0; bvirt = s0 - x; avirt = x + bvirt; bround = bvirt - t0; around = s0 - avirt;
  ic_ab[0] = around + bround; _i = x;
  x = s1 + _i; bvirt = x - s1; avirt = x - bvirt; bround = _i - bvirt; around = s1 - avirt;
  ic_ab[1] = around + bround; _j = x;
  x = ic_ab[1] - t1; bvirt = ic_ab[1] - x; avirt = x + bvirt; bround = bvirt - t1; around = ic_ab[1] - avirt;
  ic_ab[1] = around + bround; _i = x;
  x = _j + _i; bvirt = x - _j; avirt = x - bvirt; bround = _i - bvirt; around = _j - avirt;
  ic_ab[2] = around + bround;
  ic_ab[3] = x;

  const cxablen = scaleExpansionZeroelim(4, ic_ab, cdx, ic_cxab);
  const cxxablen = scaleExpansionZeroelim(cxablen, ic_cxab, cdx, ic_cxxab);
  const cyablen = scaleExpansionZeroelim(4, ic_ab, cdy, ic_cyab);
  const cyyablen = scaleExpansionZeroelim(cyablen, ic_cyab, cdy, ic_cyyab);
  const clen = fastExpansionSumZeroelim(cxxablen, ic_cxxab, cyyablen, ic_cyyab, ic_cdet);

  const ablen = fastExpansionSumZeroelim(alen, ic_adet, blen, ic_bdet, ic_abdet);
  let finlength = fastExpansionSumZeroelim(ablen, ic_abdet, clen, ic_cdet, ic_fin1);

  let det = estimate(finlength, ic_fin1);
  let errbound = ICCERRBOUND_B * permanent;
  if (det >= errbound || -det >= errbound) return det;

  // tail terms
  let adxtail: number;
  x = ax - dx; bvirt = ax - x; avirt = x + bvirt; bround = bvirt - dx; around = ax - avirt;
  adxtail = around + bround;

  let adytail: number;
  x = ay - dy; bvirt = ay - x; avirt = x + bvirt; bround = bvirt - dy; around = ay - avirt;
  adytail = around + bround;

  let bdxtail: number;
  x = bx - dx; bvirt = bx - x; avirt = x + bvirt; bround = bvirt - dx; around = bx - avirt;
  bdxtail = around + bround;

  let bdytail: number;
  x = by - dy; bvirt = by - x; avirt = x + bvirt; bround = bvirt - dy; around = by - avirt;
  bdytail = around + bround;

  let cdxtail: number;
  x = cx - dx; bvirt = cx - x; avirt = x + bvirt; bround = bvirt - dx; around = cx - avirt;
  cdxtail = around + bround;

  let cdytail: number;
  x = cy - dy; bvirt = cy - x; avirt = x + bvirt; bround = bvirt - dy; around = cy - avirt;
  cdytail = around + bround;

  if (adxtail === 0 && bdxtail === 0 && cdxtail === 0
      && adytail === 0 && bdytail === 0 && cdytail === 0) {
    return det;
  }

  errbound = ICCERRBOUND_C * permanent + RESULTERRBOUND * Math.abs(det);
  det += ((adx * adx + ady * ady) * ((bdx * cdytail + cdy * bdxtail)
                                     - (bdy * cdxtail + cdx * bdytail))
          + 2.0 * (adx * adxtail + ady * adytail) * (bdx * cdy - bdy * cdx))
       + ((bdx * bdx + bdy * bdy) * ((cdx * adytail + ady * cdxtail)
                                     - (cdy * adxtail + adx * cdytail))
          + 2.0 * (bdx * bdxtail + bdy * bdytail) * (cdx * ady - cdy * adx))
       + ((cdx * cdx + cdy * cdy) * ((adx * bdytail + bdy * adxtail)
                                     - (ady * bdxtail + bdx * adytail))
          + 2.0 * (cdx * cdxtail + cdy * cdytail) * (adx * bdy - ady * bdx));
  if (det >= errbound || -det >= errbound) return det;

  // Stage 4 -- enormous expansion. Direct port of incircleadapt.
  let finnow = ic_fin1;
  let finother = ic_fin2;
  let tmp: Float64Array;

  // Compute aa = (adx)^2 + (ady)^2 expansion of length 4 if needed.
  // Same for bb, cc.
  // Two_Two_Sum of two squares.
  const buildSumOfSquares = (px: number, py: number, out: Float64Array) => {
    // Square(px) -> p1, p0
    let p1 = px * px;
    let cc = SPLITTER * px;
    let aabig = cc - px;
    let aahi = cc - aabig;
    let aalo = px - aahi;
    let e1 = p1 - aahi * aahi;
    let e3 = e1 - (aahi + aahi) * aalo;
    let p0 = aalo * aalo - e3;
    // Square(py) -> q1, q0
    let q1 = py * py;
    cc = SPLITTER * py;
    aabig = cc - py;
    aahi = cc - aabig;
    aalo = py - aahi;
    e1 = q1 - aahi * aahi;
    e3 = e1 - (aahi + aahi) * aalo;
    let q0 = aalo * aalo - e3;
    // Two_Two_Sum(p1, p0, q1, q0) -> out[0..3]
    // Two_One_Sum(p1, p0, q0, _j, _0, out[0])
    //   Two_Sum(p0, q0, _i, out[0])
    let xx = p0 + q0; let bv = xx - p0; let av = xx - bv; let br = q0 - bv; let ar = p0 - av;
    out[0] = ar + br;
    let _ii = xx;
    //   Two_Sum(p1, _i, _j, _0)
    xx = p1 + _ii; bv = xx - p1; av = xx - bv; br = _ii - bv; ar = p1 - av;
    let _0a = ar + br;
    let _jj = xx;
    // Two_One_Sum(_j, _0, q1, out[3], out[2], out[1])
    //   Two_Sum(_0, q1, _i, out[1])
    xx = _0a + q1; bv = xx - _0a; av = xx - bv; br = q1 - bv; ar = _0a - av;
    out[1] = ar + br;
    _ii = xx;
    //   Two_Sum(_j, _i, out[3], out[2])
    xx = _jj + _ii; bv = xx - _jj; av = xx - bv; br = _ii - bv; ar = _jj - av;
    out[2] = ar + br;
    out[3] = xx;
  };

  if (bdxtail !== 0 || bdytail !== 0 || cdxtail !== 0 || cdytail !== 0) {
    buildSumOfSquares(adx, ady, ic_aa);
  }
  if (cdxtail !== 0 || cdytail !== 0 || adxtail !== 0 || adytail !== 0) {
    buildSumOfSquares(bdx, bdy, ic_bb);
  }
  if (adxtail !== 0 || adytail !== 0 || bdxtail !== 0 || bdytail !== 0) {
    buildSumOfSquares(cdx, cdy, ic_cc);
  }

  // axtbclen, aytbclen kept for stage 4 reuse.
  let axtbclen = 0, aytbclen = 0, bxtcalen = 0, bytcalen = 0, cxtablen = 0, cytablen = 0;

  if (adxtail !== 0) {
    axtbclen = scaleExpansionZeroelim(4, ic_bc, adxtail, ic_axtbc);
    let temp16alen = scaleExpansionZeroelim(axtbclen, ic_axtbc, 2.0 * adx, ic_temp16a);
    let axtcclen = scaleExpansionZeroelim(4, ic_cc, adxtail, ic_axtcc);
    let temp16blen = scaleExpansionZeroelim(axtcclen, ic_axtcc, bdy, ic_temp16b);
    let axtbblen = scaleExpansionZeroelim(4, ic_bb, adxtail, ic_axtbb);
    let temp16clen = scaleExpansionZeroelim(axtbblen, ic_axtbb, -cdy, ic_temp16c);

    let temp32alen = fastExpansionSumZeroelim(temp16alen, ic_temp16a, temp16blen, ic_temp16b, ic_temp32a);
    let temp48len = fastExpansionSumZeroelim(temp16clen, ic_temp16c, temp32alen, ic_temp32a, ic_temp48);
    finlength = fastExpansionSumZeroelim(finlength, finnow, temp48len, ic_temp48, finother);
    tmp = finnow; finnow = finother; finother = tmp;
  }
  if (adytail !== 0) {
    aytbclen = scaleExpansionZeroelim(4, ic_bc, adytail, ic_aytbc);
    let temp16alen = scaleExpansionZeroelim(aytbclen, ic_aytbc, 2.0 * ady, ic_temp16a);
    let aytbblen = scaleExpansionZeroelim(4, ic_bb, adytail, ic_aytbb);
    let temp16blen = scaleExpansionZeroelim(aytbblen, ic_aytbb, cdx, ic_temp16b);
    let aytcclen = scaleExpansionZeroelim(4, ic_cc, adytail, ic_aytcc);
    let temp16clen = scaleExpansionZeroelim(aytcclen, ic_aytcc, -bdx, ic_temp16c);
    let temp32alen = fastExpansionSumZeroelim(temp16alen, ic_temp16a, temp16blen, ic_temp16b, ic_temp32a);
    let temp48len = fastExpansionSumZeroelim(temp16clen, ic_temp16c, temp32alen, ic_temp32a, ic_temp48);
    finlength = fastExpansionSumZeroelim(finlength, finnow, temp48len, ic_temp48, finother);
    tmp = finnow; finnow = finother; finother = tmp;
  }
  if (bdxtail !== 0) {
    bxtcalen = scaleExpansionZeroelim(4, ic_ca, bdxtail, ic_bxtca);
    let temp16alen = scaleExpansionZeroelim(bxtcalen, ic_bxtca, 2.0 * bdx, ic_temp16a);
    let bxtaalen = scaleExpansionZeroelim(4, ic_aa, bdxtail, ic_bxtaa);
    let temp16blen = scaleExpansionZeroelim(bxtaalen, ic_bxtaa, cdy, ic_temp16b);
    let bxtcclen = scaleExpansionZeroelim(4, ic_cc, bdxtail, ic_bxtcc);
    let temp16clen = scaleExpansionZeroelim(bxtcclen, ic_bxtcc, -ady, ic_temp16c);
    let temp32alen = fastExpansionSumZeroelim(temp16alen, ic_temp16a, temp16blen, ic_temp16b, ic_temp32a);
    let temp48len = fastExpansionSumZeroelim(temp16clen, ic_temp16c, temp32alen, ic_temp32a, ic_temp48);
    finlength = fastExpansionSumZeroelim(finlength, finnow, temp48len, ic_temp48, finother);
    tmp = finnow; finnow = finother; finother = tmp;
  }
  if (bdytail !== 0) {
    bytcalen = scaleExpansionZeroelim(4, ic_ca, bdytail, ic_bytca);
    let temp16alen = scaleExpansionZeroelim(bytcalen, ic_bytca, 2.0 * bdy, ic_temp16a);
    let bytcclen = scaleExpansionZeroelim(4, ic_cc, bdytail, ic_bytcc);
    let temp16blen = scaleExpansionZeroelim(bytcclen, ic_bytcc, adx, ic_temp16b);
    let bytaalen = scaleExpansionZeroelim(4, ic_aa, bdytail, ic_bytaa);
    let temp16clen = scaleExpansionZeroelim(bytaalen, ic_bytaa, -cdx, ic_temp16c);
    let temp32alen = fastExpansionSumZeroelim(temp16alen, ic_temp16a, temp16blen, ic_temp16b, ic_temp32a);
    let temp48len = fastExpansionSumZeroelim(temp16clen, ic_temp16c, temp32alen, ic_temp32a, ic_temp48);
    finlength = fastExpansionSumZeroelim(finlength, finnow, temp48len, ic_temp48, finother);
    tmp = finnow; finnow = finother; finother = tmp;
  }
  if (cdxtail !== 0) {
    cxtablen = scaleExpansionZeroelim(4, ic_ab, cdxtail, ic_cxtab);
    let temp16alen = scaleExpansionZeroelim(cxtablen, ic_cxtab, 2.0 * cdx, ic_temp16a);
    let cxtbblen = scaleExpansionZeroelim(4, ic_bb, cdxtail, ic_cxtbb);
    let temp16blen = scaleExpansionZeroelim(cxtbblen, ic_cxtbb, ady, ic_temp16b);
    let cxtaalen = scaleExpansionZeroelim(4, ic_aa, cdxtail, ic_cxtaa);
    let temp16clen = scaleExpansionZeroelim(cxtaalen, ic_cxtaa, -bdy, ic_temp16c);
    let temp32alen = fastExpansionSumZeroelim(temp16alen, ic_temp16a, temp16blen, ic_temp16b, ic_temp32a);
    let temp48len = fastExpansionSumZeroelim(temp16clen, ic_temp16c, temp32alen, ic_temp32a, ic_temp48);
    finlength = fastExpansionSumZeroelim(finlength, finnow, temp48len, ic_temp48, finother);
    tmp = finnow; finnow = finother; finother = tmp;
  }
  if (cdytail !== 0) {
    cytablen = scaleExpansionZeroelim(4, ic_ab, cdytail, ic_cytab);
    let temp16alen = scaleExpansionZeroelim(cytablen, ic_cytab, 2.0 * cdy, ic_temp16a);
    let cytaalen = scaleExpansionZeroelim(4, ic_aa, cdytail, ic_cytaa);
    let temp16blen = scaleExpansionZeroelim(cytaalen, ic_cytaa, bdx, ic_temp16b);
    let cytbblen = scaleExpansionZeroelim(4, ic_bb, cdytail, ic_cytbb);
    let temp16clen = scaleExpansionZeroelim(cytbblen, ic_cytbb, -adx, ic_temp16c);
    let temp32alen = fastExpansionSumZeroelim(temp16alen, ic_temp16a, temp16blen, ic_temp16b, ic_temp32a);
    let temp48len = fastExpansionSumZeroelim(temp16clen, ic_temp16c, temp32alen, ic_temp32a, ic_temp48);
    finlength = fastExpansionSumZeroelim(finlength, finnow, temp48len, ic_temp48, finother);
    tmp = finnow; finnow = finother; finother = tmp;
  }

  // Helpers for higher-order tail*tail products.
  // Two_Two_Sum: writes 4-component expansion into `out`, given (a1,a0)+(b1,b0).
  const twoTwoSum = (a1: number, a0: number, b1: number, b0: number, out: Float64Array) => {
    // Two_One_Sum(a1, a0, b0, _j, _0, out[0])
    let xx = a0 + b0; let bv = xx - a0; let av = xx - bv; let br = b0 - bv; let ar = a0 - av;
    out[0] = ar + br;
    let _ii = xx;
    xx = a1 + _ii; bv = xx - a1; av = xx - bv; br = _ii - bv; ar = a1 - av;
    let _0a = ar + br;
    let _jj = xx;
    // Two_One_Sum(_j, _0, b1, out[3], out[2], out[1])
    xx = _0a + b1; bv = xx - _0a; av = xx - bv; br = b1 - bv; ar = _0a - av;
    out[1] = ar + br;
    _ii = xx;
    xx = _jj + _ii; bv = xx - _jj; av = xx - bv; br = _ii - bv; ar = _jj - av;
    out[2] = ar + br;
    out[3] = xx;
  };
  const twoTwoDiff = (a1: number, a0: number, b1: number, b0: number, out: Float64Array) => {
    let xx = a0 - b0; let bv = a0 - xx; let av = xx + bv; let br = bv - b0; let ar = a0 - av;
    out[0] = ar + br;
    let _ii = xx;
    xx = a1 + _ii; bv = xx - a1; av = xx - bv; br = _ii - bv; ar = a1 - av;
    let _0a = ar + br;
    let _jj = xx;
    xx = _0a - b1; bv = _0a - xx; av = xx + bv; br = bv - b1; ar = _0a - av;
    out[1] = ar + br;
    _ii = xx;
    xx = _jj + _ii; bv = xx - _jj; av = xx - bv; br = _ii - bv; ar = _jj - av;
    out[2] = ar + br;
    out[3] = xx;
  };

  // bct, bctt
  let bctlen: number, bcttlen: number;
  if ((adxtail !== 0) || (adytail !== 0)) {
    if ((bdxtail !== 0) || (bdytail !== 0) || (cdxtail !== 0) || (cdytail !== 0)) {
      // Two_Product(bdxtail, cdy)
      let p1 = bdxtail * cdy;
      c = SPLITTER * bdxtail; abig = c - bdxtail; ahi = c - abig; alo = bdxtail - ahi;
      c = SPLITTER * cdy; abig = c - cdy; bhi = c - abig; blo = cdy - bhi;
      err1 = p1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let p0 = alo * blo - err3;
      let q1 = bdx * cdytail;
      c = SPLITTER * bdx; abig = c - bdx; ahi = c - abig; alo = bdx - ahi;
      c = SPLITTER * cdytail; abig = c - cdytail; bhi = c - abig; blo = cdytail - bhi;
      err1 = q1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let q0 = alo * blo - err3;
      twoTwoSum(p1, p0, q1, q0, ic_u);

      let neg = -bdy;
      let r1 = cdxtail * neg;
      c = SPLITTER * cdxtail; abig = c - cdxtail; ahi = c - abig; alo = cdxtail - ahi;
      c = SPLITTER * neg; abig = c - neg; bhi = c - abig; blo = neg - bhi;
      err1 = r1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let r0 = alo * blo - err3;
      neg = -bdytail;
      let s1b = cdx * neg;
      c = SPLITTER * cdx; abig = c - cdx; ahi = c - abig; alo = cdx - ahi;
      c = SPLITTER * neg; abig = c - neg; bhi = c - abig; blo = neg - bhi;
      err1 = s1b - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let s0b = alo * blo - err3;
      twoTwoSum(r1, r0, s1b, s0b, ic_v);

      bctlen = fastExpansionSumZeroelim(4, ic_u, 4, ic_v, ic_bct);

      // bctt
      let t1b = bdxtail * cdytail;
      c = SPLITTER * bdxtail; abig = c - bdxtail; ahi = c - abig; alo = bdxtail - ahi;
      c = SPLITTER * cdytail; abig = c - cdytail; bhi = c - abig; blo = cdytail - bhi;
      err1 = t1b - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let t0b = alo * blo - err3;
      let u1b = cdxtail * bdytail;
      c = SPLITTER * cdxtail; abig = c - cdxtail; ahi = c - abig; alo = cdxtail - ahi;
      c = SPLITTER * bdytail; abig = c - bdytail; bhi = c - abig; blo = bdytail - bhi;
      err1 = u1b - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let u0b = alo * blo - err3;
      twoTwoDiff(t1b, t0b, u1b, u0b, ic_bctt);
      bcttlen = 4;
    } else {
      ic_bct[0] = 0; bctlen = 1;
      ic_bctt[0] = 0; bcttlen = 1;
    }

    if (adxtail !== 0) {
      let temp16alen = scaleExpansionZeroelim(axtbclen, ic_axtbc, adxtail, ic_temp16a);
      let axtbctlen = scaleExpansionZeroelim(bctlen, ic_bct, adxtail, ic_axtbct);
      let temp32alen = scaleExpansionZeroelim(axtbctlen, ic_axtbct, 2.0 * adx, ic_temp32a);
      let temp48len = fastExpansionSumZeroelim(temp16alen, ic_temp16a, temp32alen, ic_temp32a, ic_temp48);
      finlength = fastExpansionSumZeroelim(finlength, finnow, temp48len, ic_temp48, finother);
      tmp = finnow; finnow = finother; finother = tmp;
      if (bdytail !== 0) {
        let temp8len = scaleExpansionZeroelim(4, ic_cc, adxtail, ic_temp8);
        let temp16alen2 = scaleExpansionZeroelim(temp8len, ic_temp8, bdytail, ic_temp16a);
        finlength = fastExpansionSumZeroelim(finlength, finnow, temp16alen2, ic_temp16a, finother);
        tmp = finnow; finnow = finother; finother = tmp;
      }
      if (cdytail !== 0) {
        let temp8len = scaleExpansionZeroelim(4, ic_bb, -adxtail, ic_temp8);
        let temp16alen2 = scaleExpansionZeroelim(temp8len, ic_temp8, cdytail, ic_temp16a);
        finlength = fastExpansionSumZeroelim(finlength, finnow, temp16alen2, ic_temp16a, finother);
        tmp = finnow; finnow = finother; finother = tmp;
      }

      let temp32alen2 = scaleExpansionZeroelim(axtbctlen, ic_axtbct, adxtail, ic_temp32a);
      let axtbcttlen = scaleExpansionZeroelim(bcttlen, ic_bctt, adxtail, ic_axtbctt);
      let temp16alen2 = scaleExpansionZeroelim(axtbcttlen, ic_axtbctt, 2.0 * adx, ic_temp16a);
      let temp16blen = scaleExpansionZeroelim(axtbcttlen, ic_axtbctt, adxtail, ic_temp16b);
      let temp32blen = fastExpansionSumZeroelim(temp16alen2, ic_temp16a, temp16blen, ic_temp16b, ic_temp32b);
      let temp64len = fastExpansionSumZeroelim(temp32alen2, ic_temp32a, temp32blen, ic_temp32b, ic_temp64);
      finlength = fastExpansionSumZeroelim(finlength, finnow, temp64len, ic_temp64, finother);
      tmp = finnow; finnow = finother; finother = tmp;
    }
    if (adytail !== 0) {
      let temp16alen = scaleExpansionZeroelim(aytbclen, ic_aytbc, adytail, ic_temp16a);
      let aytbctlen = scaleExpansionZeroelim(bctlen, ic_bct, adytail, ic_aytbct);
      let temp32alen = scaleExpansionZeroelim(aytbctlen, ic_aytbct, 2.0 * ady, ic_temp32a);
      let temp48len = fastExpansionSumZeroelim(temp16alen, ic_temp16a, temp32alen, ic_temp32a, ic_temp48);
      finlength = fastExpansionSumZeroelim(finlength, finnow, temp48len, ic_temp48, finother);
      tmp = finnow; finnow = finother; finother = tmp;

      let temp32alen2 = scaleExpansionZeroelim(aytbctlen, ic_aytbct, adytail, ic_temp32a);
      let aytbcttlen = scaleExpansionZeroelim(bcttlen, ic_bctt, adytail, ic_aytbctt);
      let temp16alen2 = scaleExpansionZeroelim(aytbcttlen, ic_aytbctt, 2.0 * ady, ic_temp16a);
      let temp16blen = scaleExpansionZeroelim(aytbcttlen, ic_aytbctt, adytail, ic_temp16b);
      let temp32blen = fastExpansionSumZeroelim(temp16alen2, ic_temp16a, temp16blen, ic_temp16b, ic_temp32b);
      let temp64len = fastExpansionSumZeroelim(temp32alen2, ic_temp32a, temp32blen, ic_temp32b, ic_temp64);
      finlength = fastExpansionSumZeroelim(finlength, finnow, temp64len, ic_temp64, finother);
      tmp = finnow; finnow = finother; finother = tmp;
    }
  }
  // cat / catt for bdxtail/bdytail.
  let catlen: number, cattlen: number;
  if ((bdxtail !== 0) || (bdytail !== 0)) {
    if ((cdxtail !== 0) || (cdytail !== 0) || (adxtail !== 0) || (adytail !== 0)) {
      let p1 = cdxtail * ady;
      c = SPLITTER * cdxtail; abig = c - cdxtail; ahi = c - abig; alo = cdxtail - ahi;
      c = SPLITTER * ady; abig = c - ady; bhi = c - abig; blo = ady - bhi;
      err1 = p1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let p0 = alo * blo - err3;
      let q1 = cdx * adytail;
      c = SPLITTER * cdx; abig = c - cdx; ahi = c - abig; alo = cdx - ahi;
      c = SPLITTER * adytail; abig = c - adytail; bhi = c - abig; blo = adytail - bhi;
      err1 = q1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let q0 = alo * blo - err3;
      twoTwoSum(p1, p0, q1, q0, ic_u);

      let neg = -cdy;
      let r1 = adxtail * neg;
      c = SPLITTER * adxtail; abig = c - adxtail; ahi = c - abig; alo = adxtail - ahi;
      c = SPLITTER * neg; abig = c - neg; bhi = c - abig; blo = neg - bhi;
      err1 = r1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let r0 = alo * blo - err3;
      neg = -cdytail;
      let s1c = adx * neg;
      c = SPLITTER * adx; abig = c - adx; ahi = c - abig; alo = adx - ahi;
      c = SPLITTER * neg; abig = c - neg; bhi = c - abig; blo = neg - bhi;
      err1 = s1c - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let s0c = alo * blo - err3;
      twoTwoSum(r1, r0, s1c, s0c, ic_v);

      catlen = fastExpansionSumZeroelim(4, ic_u, 4, ic_v, ic_cat);

      let t1c = cdxtail * adytail;
      c = SPLITTER * cdxtail; abig = c - cdxtail; ahi = c - abig; alo = cdxtail - ahi;
      c = SPLITTER * adytail; abig = c - adytail; bhi = c - abig; blo = adytail - bhi;
      err1 = t1c - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let t0c = alo * blo - err3;
      let u1c = adxtail * cdytail;
      c = SPLITTER * adxtail; abig = c - adxtail; ahi = c - abig; alo = adxtail - ahi;
      c = SPLITTER * cdytail; abig = c - cdytail; bhi = c - abig; blo = cdytail - bhi;
      err1 = u1c - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let u0c = alo * blo - err3;
      twoTwoDiff(t1c, t0c, u1c, u0c, ic_catt);
      cattlen = 4;
    } else {
      ic_cat[0] = 0; catlen = 1;
      ic_catt[0] = 0; cattlen = 1;
    }

    if (bdxtail !== 0) {
      let temp16alen = scaleExpansionZeroelim(bxtcalen, ic_bxtca, bdxtail, ic_temp16a);
      let bxtcatlen = scaleExpansionZeroelim(catlen, ic_cat, bdxtail, ic_bxtcat);
      let temp32alen = scaleExpansionZeroelim(bxtcatlen, ic_bxtcat, 2.0 * bdx, ic_temp32a);
      let temp48len = fastExpansionSumZeroelim(temp16alen, ic_temp16a, temp32alen, ic_temp32a, ic_temp48);
      finlength = fastExpansionSumZeroelim(finlength, finnow, temp48len, ic_temp48, finother);
      tmp = finnow; finnow = finother; finother = tmp;
      if (cdytail !== 0) {
        let temp8len = scaleExpansionZeroelim(4, ic_aa, bdxtail, ic_temp8);
        let temp16alen2 = scaleExpansionZeroelim(temp8len, ic_temp8, cdytail, ic_temp16a);
        finlength = fastExpansionSumZeroelim(finlength, finnow, temp16alen2, ic_temp16a, finother);
        tmp = finnow; finnow = finother; finother = tmp;
      }
      if (adytail !== 0) {
        let temp8len = scaleExpansionZeroelim(4, ic_cc, -bdxtail, ic_temp8);
        let temp16alen2 = scaleExpansionZeroelim(temp8len, ic_temp8, adytail, ic_temp16a);
        finlength = fastExpansionSumZeroelim(finlength, finnow, temp16alen2, ic_temp16a, finother);
        tmp = finnow; finnow = finother; finother = tmp;
      }

      let temp32alen2 = scaleExpansionZeroelim(bxtcatlen, ic_bxtcat, bdxtail, ic_temp32a);
      let bxtcattlen = scaleExpansionZeroelim(cattlen, ic_catt, bdxtail, ic_bxtcatt);
      let temp16alen2 = scaleExpansionZeroelim(bxtcattlen, ic_bxtcatt, 2.0 * bdx, ic_temp16a);
      let temp16blen = scaleExpansionZeroelim(bxtcattlen, ic_bxtcatt, bdxtail, ic_temp16b);
      let temp32blen = fastExpansionSumZeroelim(temp16alen2, ic_temp16a, temp16blen, ic_temp16b, ic_temp32b);
      let temp64len = fastExpansionSumZeroelim(temp32alen2, ic_temp32a, temp32blen, ic_temp32b, ic_temp64);
      finlength = fastExpansionSumZeroelim(finlength, finnow, temp64len, ic_temp64, finother);
      tmp = finnow; finnow = finother; finother = tmp;
    }
    if (bdytail !== 0) {
      let temp16alen = scaleExpansionZeroelim(bytcalen, ic_bytca, bdytail, ic_temp16a);
      let bytcatlen = scaleExpansionZeroelim(catlen, ic_cat, bdytail, ic_bytcat);
      let temp32alen = scaleExpansionZeroelim(bytcatlen, ic_bytcat, 2.0 * bdy, ic_temp32a);
      let temp48len = fastExpansionSumZeroelim(temp16alen, ic_temp16a, temp32alen, ic_temp32a, ic_temp48);
      finlength = fastExpansionSumZeroelim(finlength, finnow, temp48len, ic_temp48, finother);
      tmp = finnow; finnow = finother; finother = tmp;

      let temp32alen2 = scaleExpansionZeroelim(bytcatlen, ic_bytcat, bdytail, ic_temp32a);
      let bytcattlen = scaleExpansionZeroelim(cattlen, ic_catt, bdytail, ic_bytcatt);
      let temp16alen2 = scaleExpansionZeroelim(bytcattlen, ic_bytcatt, 2.0 * bdy, ic_temp16a);
      let temp16blen = scaleExpansionZeroelim(bytcattlen, ic_bytcatt, bdytail, ic_temp16b);
      let temp32blen = fastExpansionSumZeroelim(temp16alen2, ic_temp16a, temp16blen, ic_temp16b, ic_temp32b);
      let temp64len = fastExpansionSumZeroelim(temp32alen2, ic_temp32a, temp32blen, ic_temp32b, ic_temp64);
      finlength = fastExpansionSumZeroelim(finlength, finnow, temp64len, ic_temp64, finother);
      tmp = finnow; finnow = finother; finother = tmp;
    }
  }
  // abt
  let abtlen: number, abttlen: number;
  if ((cdxtail !== 0) || (cdytail !== 0)) {
    if ((adxtail !== 0) || (adytail !== 0) || (bdxtail !== 0) || (bdytail !== 0)) {
      let p1 = adxtail * bdy;
      c = SPLITTER * adxtail; abig = c - adxtail; ahi = c - abig; alo = adxtail - ahi;
      c = SPLITTER * bdy; abig = c - bdy; bhi = c - abig; blo = bdy - bhi;
      err1 = p1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let p0 = alo * blo - err3;
      let q1 = adx * bdytail;
      c = SPLITTER * adx; abig = c - adx; ahi = c - abig; alo = adx - ahi;
      c = SPLITTER * bdytail; abig = c - bdytail; bhi = c - abig; blo = bdytail - bhi;
      err1 = q1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let q0 = alo * blo - err3;
      twoTwoSum(p1, p0, q1, q0, ic_u);

      let neg = -ady;
      let r1 = bdxtail * neg;
      c = SPLITTER * bdxtail; abig = c - bdxtail; ahi = c - abig; alo = bdxtail - ahi;
      c = SPLITTER * neg; abig = c - neg; bhi = c - abig; blo = neg - bhi;
      err1 = r1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let r0 = alo * blo - err3;
      neg = -adytail;
      let s1d = bdx * neg;
      c = SPLITTER * bdx; abig = c - bdx; ahi = c - abig; alo = bdx - ahi;
      c = SPLITTER * neg; abig = c - neg; bhi = c - abig; blo = neg - bhi;
      err1 = s1d - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let s0d = alo * blo - err3;
      twoTwoSum(r1, r0, s1d, s0d, ic_v);

      abtlen = fastExpansionSumZeroelim(4, ic_u, 4, ic_v, ic_abt);

      let t1d = adxtail * bdytail;
      c = SPLITTER * adxtail; abig = c - adxtail; ahi = c - abig; alo = adxtail - ahi;
      c = SPLITTER * bdytail; abig = c - bdytail; bhi = c - abig; blo = bdytail - bhi;
      err1 = t1d - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let t0d = alo * blo - err3;
      let u1d = bdxtail * adytail;
      c = SPLITTER * bdxtail; abig = c - bdxtail; ahi = c - abig; alo = bdxtail - ahi;
      c = SPLITTER * adytail; abig = c - adytail; bhi = c - abig; blo = adytail - bhi;
      err1 = u1d - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
      let u0d = alo * blo - err3;
      twoTwoDiff(t1d, t0d, u1d, u0d, ic_abtt);
      abttlen = 4;
    } else {
      ic_abt[0] = 0; abtlen = 1;
      ic_abtt[0] = 0; abttlen = 1;
    }

    if (cdxtail !== 0) {
      let temp16alen = scaleExpansionZeroelim(cxtablen, ic_cxtab, cdxtail, ic_temp16a);
      let cxtabtlen = scaleExpansionZeroelim(abtlen, ic_abt, cdxtail, ic_cxtabt);
      let temp32alen = scaleExpansionZeroelim(cxtabtlen, ic_cxtabt, 2.0 * cdx, ic_temp32a);
      let temp48len = fastExpansionSumZeroelim(temp16alen, ic_temp16a, temp32alen, ic_temp32a, ic_temp48);
      finlength = fastExpansionSumZeroelim(finlength, finnow, temp48len, ic_temp48, finother);
      tmp = finnow; finnow = finother; finother = tmp;
      if (adytail !== 0) {
        let temp8len = scaleExpansionZeroelim(4, ic_bb, cdxtail, ic_temp8);
        let temp16alen2 = scaleExpansionZeroelim(temp8len, ic_temp8, adytail, ic_temp16a);
        finlength = fastExpansionSumZeroelim(finlength, finnow, temp16alen2, ic_temp16a, finother);
        tmp = finnow; finnow = finother; finother = tmp;
      }
      if (bdytail !== 0) {
        let temp8len = scaleExpansionZeroelim(4, ic_aa, -cdxtail, ic_temp8);
        let temp16alen2 = scaleExpansionZeroelim(temp8len, ic_temp8, bdytail, ic_temp16a);
        finlength = fastExpansionSumZeroelim(finlength, finnow, temp16alen2, ic_temp16a, finother);
        tmp = finnow; finnow = finother; finother = tmp;
      }

      let temp32alen2 = scaleExpansionZeroelim(cxtabtlen, ic_cxtabt, cdxtail, ic_temp32a);
      let cxtabttlen = scaleExpansionZeroelim(abttlen, ic_abtt, cdxtail, ic_cxtabtt);
      let temp16alen2 = scaleExpansionZeroelim(cxtabttlen, ic_cxtabtt, 2.0 * cdx, ic_temp16a);
      let temp16blen = scaleExpansionZeroelim(cxtabttlen, ic_cxtabtt, cdxtail, ic_temp16b);
      let temp32blen = fastExpansionSumZeroelim(temp16alen2, ic_temp16a, temp16blen, ic_temp16b, ic_temp32b);
      let temp64len = fastExpansionSumZeroelim(temp32alen2, ic_temp32a, temp32blen, ic_temp32b, ic_temp64);
      finlength = fastExpansionSumZeroelim(finlength, finnow, temp64len, ic_temp64, finother);
      tmp = finnow; finnow = finother; finother = tmp;
    }
    if (cdytail !== 0) {
      let temp16alen = scaleExpansionZeroelim(cytablen, ic_cytab, cdytail, ic_temp16a);
      let cytabtlen = scaleExpansionZeroelim(abtlen, ic_abt, cdytail, ic_cytabt);
      let temp32alen = scaleExpansionZeroelim(cytabtlen, ic_cytabt, 2.0 * cdy, ic_temp32a);
      let temp48len = fastExpansionSumZeroelim(temp16alen, ic_temp16a, temp32alen, ic_temp32a, ic_temp48);
      finlength = fastExpansionSumZeroelim(finlength, finnow, temp48len, ic_temp48, finother);
      tmp = finnow; finnow = finother; finother = tmp;

      let temp32alen2 = scaleExpansionZeroelim(cytabtlen, ic_cytabt, cdytail, ic_temp32a);
      let cytabttlen = scaleExpansionZeroelim(abttlen, ic_abtt, cdytail, ic_cytabtt);
      let temp16alen2 = scaleExpansionZeroelim(cytabttlen, ic_cytabtt, 2.0 * cdy, ic_temp16a);
      let temp16blen = scaleExpansionZeroelim(cytabttlen, ic_cytabtt, cdytail, ic_temp16b);
      let temp32blen = fastExpansionSumZeroelim(temp16alen2, ic_temp16a, temp16blen, ic_temp16b, ic_temp32b);
      let temp64len = fastExpansionSumZeroelim(temp32alen2, ic_temp32a, temp32blen, ic_temp32b, ic_temp64);
      finlength = fastExpansionSumZeroelim(finlength, finnow, temp64len, ic_temp64, finother);
      tmp = finnow; finnow = finother; finother = tmp;
    }
  }

  return finnow[finlength - 1];
}

function incircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): number {
  const adx = ax - dx;
  const bdx = bx - dx;
  const cdx = cx - dx;
  const ady = ay - dy;
  const bdy = by - dy;
  const cdy = cy - dy;

  const bdxcdy = bdx * cdy;
  const cdxbdy = cdx * bdy;
  const alift = adx * adx + ady * ady;
  const cdxady = cdx * ady;
  const adxcdy = adx * cdy;
  const blift = bdx * bdx + bdy * bdy;
  const adxbdy = adx * bdy;
  const bdxady = bdx * ady;
  const clift = cdx * cdx + cdy * cdy;

  const det =
    alift * (bdxcdy - cdxbdy) +
    blift * (cdxady - adxcdy) +
    clift * (adxbdy - bdxady);

  const permanent =
    (Math.abs(bdxcdy) + Math.abs(cdxbdy)) * alift +
    (Math.abs(cdxady) + Math.abs(adxcdy)) * blift +
    (Math.abs(adxbdy) + Math.abs(bdxady)) * clift;

  const errbound = ICCERRBOUND_A * permanent;
  if (det > errbound || -det > errbound) return det > 0 ? 1 : det < 0 ? -1 : 0;

  const r = incircleAdapt(ax, ay, bx, by, cx, cy, dx, dy, permanent);
  return r > 0 ? 1 : r < 0 ? -1 : 0;
}

// -----------------------------------------------------------------------
// insphere -- adapt + insphereExact fallback.
// -----------------------------------------------------------------------

// Helper: build a length-4 expansion of (ax*by - bx*ay) given two scalars.
function twoTwoCrossDiff(
  ax: number, ay: number, bx: number, by: number, out: Float64Array,
) {
  let c: number, abig: number, ahi: number, alo: number, bhi: number, blo: number;
  let err1: number, err2: number, err3: number;
  let bvirt: number, avirt: number, bround: number, around: number;
  let _i: number, _j: number, x: number;

  let s1 = ax * by;
  c = SPLITTER * ax; abig = c - ax; ahi = c - abig; alo = ax - ahi;
  c = SPLITTER * by; abig = c - by; bhi = c - abig; blo = by - bhi;
  err1 = s1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
  let s0 = alo * blo - err3;

  let t1 = bx * ay;
  c = SPLITTER * bx; abig = c - bx; ahi = c - abig; alo = bx - ahi;
  c = SPLITTER * ay; abig = c - ay; bhi = c - abig; blo = ay - bhi;
  err1 = t1 - ahi * bhi; err2 = err1 - alo * bhi; err3 = err2 - ahi * blo;
  let t0 = alo * blo - err3;

  // Two_Two_Diff(s1, s0, t1, t0) → out[0..3]
  x = s0 - t0; bvirt = s0 - x; avirt = x + bvirt; bround = bvirt - t0; around = s0 - avirt;
  out[0] = around + bround; _i = x;
  x = s1 + _i; bvirt = x - s1; avirt = x - bvirt; bround = _i - bvirt; around = s1 - avirt;
  out[1] = around + bround; _j = x;
  x = out[1] - t1; bvirt = out[1] - x; avirt = x + bvirt; bround = bvirt - t1; around = out[1] - avirt;
  out[1] = around + bround; _i = x;
  x = _j + _i; bvirt = x - _j; avirt = x - bvirt; bround = _i - bvirt; around = _j - avirt;
  out[2] = around + bround;
  out[3] = x;
}

// insphereExact: monolithic exact in-sphere via expansions on raw coordinates.
// Mirrors `insphereexact` in predicates.c. Used as the deepest stage-4 fallback.
function insphereExact(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number,
  ex: number, ey: number, ez: number,
): number {
  // 10 cross-pair expansions length-4 each on raw coordinates.
  twoTwoCrossDiff(ax, ay, bx, by, ise_ab); // ax*by - bx*ay
  twoTwoCrossDiff(bx, by, cx, cy, ise_bc);
  twoTwoCrossDiff(cx, cy, dx, dy, ise_cd);
  twoTwoCrossDiff(dx, dy, ex, ey, ise_de);
  twoTwoCrossDiff(ex, ey, ax, ay, ise_ea);
  twoTwoCrossDiff(ax, ay, cx, cy, ise_ac);
  twoTwoCrossDiff(bx, by, dx, dy, ise_bd);
  twoTwoCrossDiff(cx, cy, ex, ey, ise_ce);
  twoTwoCrossDiff(dx, dy, ax, ay, ise_da);
  twoTwoCrossDiff(ex, ey, bx, by, ise_eb);

  // abc = bc * az - ac * bz + ab * cz
  let l = scaleExpansionZeroelim(4, ise_bc, az, ise_temp8a);
  let m = scaleExpansionZeroelim(4, ise_ac, -bz, ise_temp8b);
  let n = fastExpansionSumZeroelim(l, ise_temp8a, m, ise_temp8b, ise_temp16);
  l = scaleExpansionZeroelim(4, ise_ab, cz, ise_temp8a);
  const abclen = fastExpansionSumZeroelim(l, ise_temp8a, n, ise_temp16, ise_abc);

  // bcd = cd * bz - bd * cz + bc * dz
  l = scaleExpansionZeroelim(4, ise_cd, bz, ise_temp8a);
  m = scaleExpansionZeroelim(4, ise_bd, -cz, ise_temp8b);
  n = fastExpansionSumZeroelim(l, ise_temp8a, m, ise_temp8b, ise_temp16);
  l = scaleExpansionZeroelim(4, ise_bc, dz, ise_temp8a);
  const bcdlen = fastExpansionSumZeroelim(l, ise_temp8a, n, ise_temp16, ise_bcd);

  // cde = de * cz - ce * dz + cd * ez
  l = scaleExpansionZeroelim(4, ise_de, cz, ise_temp8a);
  m = scaleExpansionZeroelim(4, ise_ce, -dz, ise_temp8b);
  n = fastExpansionSumZeroelim(l, ise_temp8a, m, ise_temp8b, ise_temp16);
  l = scaleExpansionZeroelim(4, ise_cd, ez, ise_temp8a);
  const cdelen = fastExpansionSumZeroelim(l, ise_temp8a, n, ise_temp16, ise_cde);

  // dea = ea*dz - da*ez + de*az
  l = scaleExpansionZeroelim(4, ise_ea, dz, ise_temp8a);
  m = scaleExpansionZeroelim(4, ise_da, -ez, ise_temp8b);
  n = fastExpansionSumZeroelim(l, ise_temp8a, m, ise_temp8b, ise_temp16);
  l = scaleExpansionZeroelim(4, ise_de, az, ise_temp8a);
  const dealen = fastExpansionSumZeroelim(l, ise_temp8a, n, ise_temp16, ise_dea);

  // eab = ab*ez - eb*az + ea*bz
  l = scaleExpansionZeroelim(4, ise_ab, ez, ise_temp8a);
  m = scaleExpansionZeroelim(4, ise_eb, -az, ise_temp8b);
  n = fastExpansionSumZeroelim(l, ise_temp8a, m, ise_temp8b, ise_temp16);
  l = scaleExpansionZeroelim(4, ise_ea, bz, ise_temp8a);
  const eablen = fastExpansionSumZeroelim(l, ise_temp8a, n, ise_temp16, ise_eab);

  // abd = bd*az + da*bz + ab*dz
  l = scaleExpansionZeroelim(4, ise_bd, az, ise_temp8a);
  m = scaleExpansionZeroelim(4, ise_da, bz, ise_temp8b);
  n = fastExpansionSumZeroelim(l, ise_temp8a, m, ise_temp8b, ise_temp16);
  l = scaleExpansionZeroelim(4, ise_ab, dz, ise_temp8a);
  const abdlen = fastExpansionSumZeroelim(l, ise_temp8a, n, ise_temp16, ise_abd);

  // bce = ce*bz + eb*cz + bc*ez
  l = scaleExpansionZeroelim(4, ise_ce, bz, ise_temp8a);
  m = scaleExpansionZeroelim(4, ise_eb, cz, ise_temp8b);
  n = fastExpansionSumZeroelim(l, ise_temp8a, m, ise_temp8b, ise_temp16);
  l = scaleExpansionZeroelim(4, ise_bc, ez, ise_temp8a);
  const bcelen = fastExpansionSumZeroelim(l, ise_temp8a, n, ise_temp16, ise_bce);

  // cda = da*cz + ac*dz + cd*az
  l = scaleExpansionZeroelim(4, ise_da, cz, ise_temp8a);
  m = scaleExpansionZeroelim(4, ise_ac, dz, ise_temp8b);
  n = fastExpansionSumZeroelim(l, ise_temp8a, m, ise_temp8b, ise_temp16);
  l = scaleExpansionZeroelim(4, ise_cd, az, ise_temp8a);
  const cdalen = fastExpansionSumZeroelim(l, ise_temp8a, n, ise_temp16, ise_cda);

  // deb = eb*dz + bd*ez + de*bz
  l = scaleExpansionZeroelim(4, ise_eb, dz, ise_temp8a);
  m = scaleExpansionZeroelim(4, ise_bd, ez, ise_temp8b);
  n = fastExpansionSumZeroelim(l, ise_temp8a, m, ise_temp8b, ise_temp16);
  l = scaleExpansionZeroelim(4, ise_de, bz, ise_temp8a);
  const deblen = fastExpansionSumZeroelim(l, ise_temp8a, n, ise_temp16, ise_deb);

  // eac = ac*ez + ce*az + ea*cz
  l = scaleExpansionZeroelim(4, ise_ac, ez, ise_temp8a);
  m = scaleExpansionZeroelim(4, ise_ce, az, ise_temp8b);
  n = fastExpansionSumZeroelim(l, ise_temp8a, m, ise_temp8b, ise_temp16);
  l = scaleExpansionZeroelim(4, ise_ea, cz, ise_temp8a);
  const eaclen = fastExpansionSumZeroelim(l, ise_temp8a, n, ise_temp16, ise_eac);

  // bcde = (cde + bce) - (deb + bcd)
  let temp48alen = fastExpansionSumZeroelim(cdelen, ise_cde, bcelen, ise_bce, ise_temp48a);
  let temp48blen = fastExpansionSumZeroelim(deblen, ise_deb, bcdlen, ise_bcd, ise_temp48b);
  for (let i = 0; i < temp48blen; i++) ise_temp48b[i] = -ise_temp48b[i];
  const bcdelen = fastExpansionSumZeroelim(temp48alen, ise_temp48a, temp48blen, ise_temp48b, ise_bcde);
  let xlen = scaleExpansionZeroelim(bcdelen, ise_bcde, ax, ise_temp192);
  xlen = scaleExpansionZeroelim(xlen, ise_temp192, ax, ise_det384x);
  let ylen = scaleExpansionZeroelim(bcdelen, ise_bcde, ay, ise_temp192);
  ylen = scaleExpansionZeroelim(ylen, ise_temp192, ay, ise_det384y);
  let zlen = scaleExpansionZeroelim(bcdelen, ise_bcde, az, ise_temp192);
  zlen = scaleExpansionZeroelim(zlen, ise_temp192, az, ise_det384z);
  let xylen = fastExpansionSumZeroelim(xlen, ise_det384x, ylen, ise_det384y, ise_detxy);
  const alen = fastExpansionSumZeroelim(xylen, ise_detxy, zlen, ise_det384z, ise_adet);

  // cdea = (dea + cda) - (eac + cde)
  temp48alen = fastExpansionSumZeroelim(dealen, ise_dea, cdalen, ise_cda, ise_temp48a);
  temp48blen = fastExpansionSumZeroelim(eaclen, ise_eac, cdelen, ise_cde, ise_temp48b);
  for (let i = 0; i < temp48blen; i++) ise_temp48b[i] = -ise_temp48b[i];
  const cdealen = fastExpansionSumZeroelim(temp48alen, ise_temp48a, temp48blen, ise_temp48b, ise_cdea);
  xlen = scaleExpansionZeroelim(cdealen, ise_cdea, bx, ise_temp192);
  xlen = scaleExpansionZeroelim(xlen, ise_temp192, bx, ise_det384x);
  ylen = scaleExpansionZeroelim(cdealen, ise_cdea, by, ise_temp192);
  ylen = scaleExpansionZeroelim(ylen, ise_temp192, by, ise_det384y);
  zlen = scaleExpansionZeroelim(cdealen, ise_cdea, bz, ise_temp192);
  zlen = scaleExpansionZeroelim(zlen, ise_temp192, bz, ise_det384z);
  xylen = fastExpansionSumZeroelim(xlen, ise_det384x, ylen, ise_det384y, ise_detxy);
  const blen = fastExpansionSumZeroelim(xylen, ise_detxy, zlen, ise_det384z, ise_bdet);

  // deab = (eab + deb) - (abd + dea)
  temp48alen = fastExpansionSumZeroelim(eablen, ise_eab, deblen, ise_deb, ise_temp48a);
  temp48blen = fastExpansionSumZeroelim(abdlen, ise_abd, dealen, ise_dea, ise_temp48b);
  for (let i = 0; i < temp48blen; i++) ise_temp48b[i] = -ise_temp48b[i];
  const deablen = fastExpansionSumZeroelim(temp48alen, ise_temp48a, temp48blen, ise_temp48b, ise_deab);
  xlen = scaleExpansionZeroelim(deablen, ise_deab, cx, ise_temp192);
  xlen = scaleExpansionZeroelim(xlen, ise_temp192, cx, ise_det384x);
  ylen = scaleExpansionZeroelim(deablen, ise_deab, cy, ise_temp192);
  ylen = scaleExpansionZeroelim(ylen, ise_temp192, cy, ise_det384y);
  zlen = scaleExpansionZeroelim(deablen, ise_deab, cz, ise_temp192);
  zlen = scaleExpansionZeroelim(zlen, ise_temp192, cz, ise_det384z);
  xylen = fastExpansionSumZeroelim(xlen, ise_det384x, ylen, ise_det384y, ise_detxy);
  const clen = fastExpansionSumZeroelim(xylen, ise_detxy, zlen, ise_det384z, ise_cdet);

  // eabc = (abc + eac) - (bce + eab)
  temp48alen = fastExpansionSumZeroelim(abclen, ise_abc, eaclen, ise_eac, ise_temp48a);
  temp48blen = fastExpansionSumZeroelim(bcelen, ise_bce, eablen, ise_eab, ise_temp48b);
  for (let i = 0; i < temp48blen; i++) ise_temp48b[i] = -ise_temp48b[i];
  const eabclen = fastExpansionSumZeroelim(temp48alen, ise_temp48a, temp48blen, ise_temp48b, ise_eabc);
  xlen = scaleExpansionZeroelim(eabclen, ise_eabc, dx, ise_temp192);
  xlen = scaleExpansionZeroelim(xlen, ise_temp192, dx, ise_det384x);
  ylen = scaleExpansionZeroelim(eabclen, ise_eabc, dy, ise_temp192);
  ylen = scaleExpansionZeroelim(ylen, ise_temp192, dy, ise_det384y);
  zlen = scaleExpansionZeroelim(eabclen, ise_eabc, dz, ise_temp192);
  zlen = scaleExpansionZeroelim(zlen, ise_temp192, dz, ise_det384z);
  xylen = fastExpansionSumZeroelim(xlen, ise_det384x, ylen, ise_det384y, ise_detxy);
  const dlen = fastExpansionSumZeroelim(xylen, ise_detxy, zlen, ise_det384z, ise_ddet);

  // abcd = (bcd + abd) - (cda + abc)
  temp48alen = fastExpansionSumZeroelim(bcdlen, ise_bcd, abdlen, ise_abd, ise_temp48a);
  temp48blen = fastExpansionSumZeroelim(cdalen, ise_cda, abclen, ise_abc, ise_temp48b);
  for (let i = 0; i < temp48blen; i++) ise_temp48b[i] = -ise_temp48b[i];
  const abcdlen = fastExpansionSumZeroelim(temp48alen, ise_temp48a, temp48blen, ise_temp48b, ise_abcd);
  xlen = scaleExpansionZeroelim(abcdlen, ise_abcd, ex, ise_temp192);
  xlen = scaleExpansionZeroelim(xlen, ise_temp192, ex, ise_det384x);
  ylen = scaleExpansionZeroelim(abcdlen, ise_abcd, ey, ise_temp192);
  ylen = scaleExpansionZeroelim(ylen, ise_temp192, ey, ise_det384y);
  zlen = scaleExpansionZeroelim(abcdlen, ise_abcd, ez, ise_temp192);
  zlen = scaleExpansionZeroelim(zlen, ise_temp192, ez, ise_det384z);
  xylen = fastExpansionSumZeroelim(xlen, ise_det384x, ylen, ise_det384y, ise_detxy);
  const elen = fastExpansionSumZeroelim(xylen, ise_detxy, zlen, ise_det384z, ise_edet);

  const ablen = fastExpansionSumZeroelim(alen, ise_adet, blen, ise_bdet, ise_abdet);
  const cdlen2 = fastExpansionSumZeroelim(clen, ise_cdet, dlen, ise_ddet, ise_cddet);
  const cdelen2 = fastExpansionSumZeroelim(cdlen2, ise_cddet, elen, ise_edet, ise_cdedet);
  const deterlen = fastExpansionSumZeroelim(ablen, ise_abdet, cdelen2, ise_cdedet, ise_deter);

  return ise_deter[deterlen - 1];
}

function insphereAdapt(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number,
  ex: number, ey: number, ez: number,
  permanent: number,
): number {
  const aex = ax - ex;
  const bex = bx - ex;
  const cex = cx - ex;
  const dex = dx - ex;
  const aey = ay - ey;
  const bey = by - ey;
  const cey = cy - ey;
  const dey = dy - ey;
  const aez = az - ez;
  const bez = bz - ez;
  const cez = cz - ez;
  const dez = dz - ez;

  // Six length-4 cross-pair expansions on the (i)-(e) shifts.
  twoTwoCrossDiff(aex, aey, bex, bey, is_ab);
  twoTwoCrossDiff(bex, bey, cex, cey, is_bc);
  twoTwoCrossDiff(cex, cey, dex, dey, is_cd);
  twoTwoCrossDiff(dex, dey, aex, aey, is_da);
  twoTwoCrossDiff(aex, aey, cex, cey, is_ac);
  twoTwoCrossDiff(bex, bey, dex, dey, is_bd);

  // adet = -|p|^2 (cd*bez - bd*cez + bc*dez)
  let l = scaleExpansionZeroelim(4, is_cd, bez, is_temp8a);
  let m = scaleExpansionZeroelim(4, is_bd, -cez, is_temp8b);
  let n = scaleExpansionZeroelim(4, is_bc, dez, is_temp8c);
  let temp16len = fastExpansionSumZeroelim(l, is_temp8a, m, is_temp8b, is_temp16);
  let temp24len = fastExpansionSumZeroelim(n, is_temp8c, temp16len, is_temp16, is_temp24);
  let temp48len = scaleExpansionZeroelim(temp24len, is_temp24, aex, is_temp48);
  let xlen = scaleExpansionZeroelim(temp48len, is_temp48, -aex, is_xdet);
  temp48len = scaleExpansionZeroelim(temp24len, is_temp24, aey, is_temp48);
  let ylen = scaleExpansionZeroelim(temp48len, is_temp48, -aey, is_ydet);
  temp48len = scaleExpansionZeroelim(temp24len, is_temp24, aez, is_temp48);
  let zlen = scaleExpansionZeroelim(temp48len, is_temp48, -aez, is_zdet);
  let xylen = fastExpansionSumZeroelim(xlen, is_xdet, ylen, is_ydet, is_xydet);
  const alen = fastExpansionSumZeroelim(xylen, is_xydet, zlen, is_zdet, is_adet);

  // bdet = +|p|^2 (da*cez + ac*dez + cd*aez)
  l = scaleExpansionZeroelim(4, is_da, cez, is_temp8a);
  m = scaleExpansionZeroelim(4, is_ac, dez, is_temp8b);
  n = scaleExpansionZeroelim(4, is_cd, aez, is_temp8c);
  temp16len = fastExpansionSumZeroelim(l, is_temp8a, m, is_temp8b, is_temp16);
  temp24len = fastExpansionSumZeroelim(n, is_temp8c, temp16len, is_temp16, is_temp24);
  temp48len = scaleExpansionZeroelim(temp24len, is_temp24, bex, is_temp48);
  xlen = scaleExpansionZeroelim(temp48len, is_temp48, bex, is_xdet);
  temp48len = scaleExpansionZeroelim(temp24len, is_temp24, bey, is_temp48);
  ylen = scaleExpansionZeroelim(temp48len, is_temp48, bey, is_ydet);
  temp48len = scaleExpansionZeroelim(temp24len, is_temp24, bez, is_temp48);
  zlen = scaleExpansionZeroelim(temp48len, is_temp48, bez, is_zdet);
  xylen = fastExpansionSumZeroelim(xlen, is_xdet, ylen, is_ydet, is_xydet);
  const blen = fastExpansionSumZeroelim(xylen, is_xydet, zlen, is_zdet, is_bdet);

  // cdet = -|p|^2 (ab*dez + bd*aez + da*bez)
  l = scaleExpansionZeroelim(4, is_ab, dez, is_temp8a);
  m = scaleExpansionZeroelim(4, is_bd, aez, is_temp8b);
  n = scaleExpansionZeroelim(4, is_da, bez, is_temp8c);
  temp16len = fastExpansionSumZeroelim(l, is_temp8a, m, is_temp8b, is_temp16);
  temp24len = fastExpansionSumZeroelim(n, is_temp8c, temp16len, is_temp16, is_temp24);
  temp48len = scaleExpansionZeroelim(temp24len, is_temp24, cex, is_temp48);
  xlen = scaleExpansionZeroelim(temp48len, is_temp48, -cex, is_xdet);
  temp48len = scaleExpansionZeroelim(temp24len, is_temp24, cey, is_temp48);
  ylen = scaleExpansionZeroelim(temp48len, is_temp48, -cey, is_ydet);
  temp48len = scaleExpansionZeroelim(temp24len, is_temp24, cez, is_temp48);
  zlen = scaleExpansionZeroelim(temp48len, is_temp48, -cez, is_zdet);
  xylen = fastExpansionSumZeroelim(xlen, is_xdet, ylen, is_ydet, is_xydet);
  const clen = fastExpansionSumZeroelim(xylen, is_xydet, zlen, is_zdet, is_cdet);

  // ddet = +|p|^2 (bc*aez - ac*bez + ab*cez)
  l = scaleExpansionZeroelim(4, is_bc, aez, is_temp8a);
  m = scaleExpansionZeroelim(4, is_ac, -bez, is_temp8b);
  n = scaleExpansionZeroelim(4, is_ab, cez, is_temp8c);
  temp16len = fastExpansionSumZeroelim(l, is_temp8a, m, is_temp8b, is_temp16);
  temp24len = fastExpansionSumZeroelim(n, is_temp8c, temp16len, is_temp16, is_temp24);
  temp48len = scaleExpansionZeroelim(temp24len, is_temp24, dex, is_temp48);
  xlen = scaleExpansionZeroelim(temp48len, is_temp48, dex, is_xdet);
  temp48len = scaleExpansionZeroelim(temp24len, is_temp24, dey, is_temp48);
  ylen = scaleExpansionZeroelim(temp48len, is_temp48, dey, is_ydet);
  temp48len = scaleExpansionZeroelim(temp24len, is_temp24, dez, is_temp48);
  zlen = scaleExpansionZeroelim(temp48len, is_temp48, dez, is_zdet);
  xylen = fastExpansionSumZeroelim(xlen, is_xdet, ylen, is_ydet, is_xydet);
  const dlen = fastExpansionSumZeroelim(xylen, is_xydet, zlen, is_zdet, is_ddet);

  const ablen = fastExpansionSumZeroelim(alen, is_adet, blen, is_bdet, is_abdet);
  const cdlen = fastExpansionSumZeroelim(clen, is_cdet, dlen, is_ddet, is_cddet);
  const finlength = fastExpansionSumZeroelim(ablen, is_abdet, cdlen, is_cddet, is_fin1);

  let det = estimate(finlength, is_fin1);
  let errbound = ISPERRBOUND_B * permanent;
  if (det >= errbound || -det >= errbound) return det;

  // tail terms (12 of them).
  let bvirt: number, avirt: number, bround: number, around: number;
  let x: number;
  let aextail: number; x = ax - ex; bvirt = ax - x; avirt = x + bvirt; bround = bvirt - ex; around = ax - avirt; aextail = around + bround;
  let aeytail: number; x = ay - ey; bvirt = ay - x; avirt = x + bvirt; bround = bvirt - ey; around = ay - avirt; aeytail = around + bround;
  let aeztail: number; x = az - ez; bvirt = az - x; avirt = x + bvirt; bround = bvirt - ez; around = az - avirt; aeztail = around + bround;
  let bextail: number; x = bx - ex; bvirt = bx - x; avirt = x + bvirt; bround = bvirt - ex; around = bx - avirt; bextail = around + bround;
  let beytail: number; x = by - ey; bvirt = by - x; avirt = x + bvirt; bround = bvirt - ey; around = by - avirt; beytail = around + bround;
  let beztail: number; x = bz - ez; bvirt = bz - x; avirt = x + bvirt; bround = bvirt - ez; around = bz - avirt; beztail = around + bround;
  let cextail: number; x = cx - ex; bvirt = cx - x; avirt = x + bvirt; bround = bvirt - ex; around = cx - avirt; cextail = around + bround;
  let ceytail: number; x = cy - ey; bvirt = cy - x; avirt = x + bvirt; bround = bvirt - ey; around = cy - avirt; ceytail = around + bround;
  let ceztail: number; x = cz - ez; bvirt = cz - x; avirt = x + bvirt; bround = bvirt - ez; around = cz - avirt; ceztail = around + bround;
  let dextail: number; x = dx - ex; bvirt = dx - x; avirt = x + bvirt; bround = bvirt - ex; around = dx - avirt; dextail = around + bround;
  let deytail: number; x = dy - ey; bvirt = dy - x; avirt = x + bvirt; bround = bvirt - ey; around = dy - avirt; deytail = around + bround;
  let deztail: number; x = dz - ez; bvirt = dz - x; avirt = x + bvirt; bround = bvirt - ez; around = dz - avirt; deztail = around + bround;

  if (aextail === 0 && aeytail === 0 && aeztail === 0
      && bextail === 0 && beytail === 0 && beztail === 0
      && cextail === 0 && ceytail === 0 && ceztail === 0
      && dextail === 0 && deytail === 0 && deztail === 0) {
    return det;
  }

  errbound = ISPERRBOUND_C * permanent + RESULTERRBOUND * Math.abs(det);

  // ab3 etc: high components of the length-4 expansions.
  const ab3 = is_ab[3], bc3 = is_bc[3], cd3 = is_cd[3], da3 = is_da[3], ac3 = is_ac[3], bd3 = is_bd[3];

  const abeps = aex * beytail + bey * aextail - (aey * bextail + bex * aeytail);
  const bceps = bex * ceytail + cey * bextail - (bey * cextail + cex * beytail);
  const cdeps = cex * deytail + dey * cextail - (cey * dextail + dex * ceytail);
  const daeps = dex * aeytail + aey * dextail - (dey * aextail + aex * deytail);
  const aceps = aex * ceytail + cey * aextail - (aey * cextail + cex * aeytail);
  const bdeps = bex * deytail + dey * bextail - (bey * dextail + dex * beytail);

  det += (((bex * bex + bey * bey + bez * bez)
           * ((cez * daeps + dez * aceps + aez * cdeps)
              + (ceztail * da3 + deztail * ac3 + aeztail * cd3))
           + (dex * dex + dey * dey + dez * dez)
           * ((aez * bceps - bez * aceps + cez * abeps)
              + (aeztail * bc3 - beztail * ac3 + ceztail * ab3)))
          - ((aex * aex + aey * aey + aez * aez)
           * ((bez * cdeps - cez * bdeps + dez * bceps)
              + (beztail * cd3 - ceztail * bd3 + deztail * bc3))
           + (cex * cex + cey * cey + cez * cez)
           * ((dez * abeps + aez * bdeps + bez * daeps)
              + (deztail * ab3 + aeztail * bd3 + beztail * da3))))
       + 2.0 * (((bex * bextail + bey * beytail + bez * beztail)
                 * (cez * da3 + dez * ac3 + aez * cd3)
                 + (dex * dextail + dey * deytail + dez * deztail)
                 * (aez * bc3 - bez * ac3 + cez * ab3))
                - ((aex * aextail + aey * aeytail + aez * aeztail)
                 * (bez * cd3 - cez * bd3 + dez * bc3)
                 + (cex * cextail + cey * ceytail + cez * ceztail)
                 * (dez * ab3 + aez * bd3 + bez * da3)));
  if (det >= errbound || -det >= errbound) return det;

  // Stage 4: full exact form. Mirrors predicates.c which falls through
  // to insphereexact() at this point.
  return insphereExact(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, ex, ey, ez);
}

function insphere(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number,
  ex: number, ey: number, ez: number,
): number {
  const aex = ax - ex, aey = ay - ey, aez = az - ez;
  const bex = bx - ex, bey = by - ey, bez = bz - ez;
  const cex = cx - ex, cey = cy - ey, cez = cz - ez;
  const dex = dx - ex, dey = dy - ey, dez = dz - ez;

  const aexbey = aex * bey, bexaey = bex * aey;
  const ab = aexbey - bexaey;
  const bexcey = bex * cey, cexbey = cex * bey;
  const bc = bexcey - cexbey;
  const cexdey = cex * dey, dexcey = dex * cey;
  const cd = cexdey - dexcey;
  const dexaey = dex * aey, aexdey = aex * dey;
  const da = dexaey - aexdey;
  const aexcey = aex * cey, cexaey = cex * aey;
  const ac = aexcey - cexaey;
  const bexdey = bex * dey, dexbey = dex * bey;
  const bd = bexdey - dexbey;

  const abc = aez * bc - bez * ac + cez * ab;
  const bcd = bez * cd - cez * bd + dez * bc;
  const cda = cez * da + dez * ac + aez * cd;
  const dab = dez * ab + aez * bd + bez * da;

  const alift = aex * aex + aey * aey + aez * aez;
  const blift = bex * bex + bey * bey + bez * bez;
  const clift = cex * cex + cey * cey + cez * cez;
  const dlift = dex * dex + dey * dey + dez * dez;

  const det = (dlift * abc - clift * dab) + (blift * cda - alift * bcd);

  const aezp = Math.abs(aez), bezp = Math.abs(bez), cezp = Math.abs(cez), dezp = Math.abs(dez);
  const aexbeyp = Math.abs(aexbey), bexaeyp = Math.abs(bexaey);
  const bexceyp = Math.abs(bexcey), cexbeyp = Math.abs(cexbey);
  const cexdeyp = Math.abs(cexdey), dexceyp = Math.abs(dexcey);
  const dexaeyp = Math.abs(dexaey), aexdeyp = Math.abs(aexdey);
  const aexceyp = Math.abs(aexcey), cexaeyp = Math.abs(cexaey);
  const bexdeyp = Math.abs(bexdey), dexbeyp = Math.abs(dexbey);

  const permanent =
    ((cexdeyp + dexceyp) * bezp + (dexbeyp + bexdeyp) * cezp + (bexceyp + cexbeyp) * dezp) * alift +
    ((dexaeyp + aexdeyp) * cezp + (aexceyp + cexaeyp) * dezp + (cexdeyp + dexceyp) * aezp) * blift +
    ((aexbeyp + bexaeyp) * dezp + (bexdeyp + dexbeyp) * aezp + (dexaeyp + aexdeyp) * bezp) * clift +
    ((bexceyp + cexbeyp) * aezp + (cexaeyp + aexceyp) * bezp + (aexbeyp + bexaeyp) * cezp) * dlift;

  const errbound = ISPERRBOUND_A * permanent;
  if (det > errbound || -det > errbound) return det > 0 ? 1 : det < 0 ? -1 : 0;

  const r = insphereAdapt(
    ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, ex, ey, ez, permanent,
  );
  return r > 0 ? 1 : r < 0 ? -1 : 0;
}

// -----------------------------------------------------------------------
// Tier H: LCG-driven query stream (must match verifier_protocol.md exactly).
//
// The 64-bit LCG of MMIX (Knuth):
//   A = 6364136223846793005, C = 1442695040888963407, modulus = 2^64.
// We emulate 64-bit arithmetic with a pair of unsigned-32-bit doubles
// (sH, sL). This avoids the BigInt allocator on the hot path; pure-JS
// 32x32 -> 64 multiplication via 16-bit chunking keeps everything in
// the SMI/double regime that V8 can keep on the stack.
//
// Cross-checked against a BigInt reference for thousands of seeds.
// -----------------------------------------------------------------------

const A_HI = 1481765933;
const A_LO = 1284865837;
const C_HI = 335903614;
const C_LO = 4150755663;
const POW32 = 4294967296;
const POW21 = 2097152;
const INV_2_53 = 1.0 / 9007199254740992.0;

// Splitting A_LO = aLh*2^16 + aLl is hot-path-fixed.
const A_LO_H = A_LO >>> 16;
const A_LO_L = A_LO & 0xffff;

// -----------------------------------------------------------------------
// I/O glue.
// -----------------------------------------------------------------------

import * as fs from "fs";

function main() {
  const raw = fs.readFileSync(0, "utf8");
  const input = JSON.parse(raw);
  const predicate: string = input.predicate;

  let signs: number[];

  if (input.format === "generated") {
    const g = input.generator;
    const seedBig = BigInt(g.seed);
    const n: number = g.n;
    const lo: number = g.lo;
    const hi: number = g.hi;
    const span = hi - lo;

    // Initialize state from seed (only place where BigInt is touched).
    const stateMasked = seedBig & ((1n << 64n) - 1n);
    let sH = Number(stateMasked >> 32n);
    let sL = Number(stateMasked & 0xffffffffn);

    // The hot inline:
    //   advance state, compute u in [0,1) from top 53 bits, return lo + span*u.
    // We declare it as a closure so V8 can inline; performance critical.
    const nextDouble = (): number => {
      // sL * A_LO via 16-bit splits for 32x32 -> 64 unsigned.
      const sLh = sL >>> 16;
      const sLl = sL & 0xffff;
      const ll = sLl * A_LO_L;
      const lh = sLl * A_LO_H;
      const hl = sLh * A_LO_L;
      const hh = sLh * A_LO_H;
      const mid = (ll >>> 16) + (lh & 0xffff) + (hl & 0xffff);
      const sLaL_lo = ((mid << 16) | (ll & 0xffff)) >>> 0;
      const sLaL_hi =
        (hh + (lh >>> 16) + (hl >>> 16) + (mid >>> 16)) >>> 0;
      const sH_aL = Math.imul(sH, A_LO) >>> 0;
      const sL_aH = Math.imul(sL, A_HI) >>> 0;
      const middle = (sH_aL + sL_aH) >>> 0;
      const stateA_hi = (sLaL_hi + middle) >>> 0;
      const lowSum = sLaL_lo + C_LO;
      const carry = lowSum >= POW32 ? 1 : 0;
      sL = lowSum >>> 0;
      sH = (stateA_hi + C_HI + carry) >>> 0;
      const u = (sH * POW21 + (sL >>> 11)) * INV_2_53;
      return lo + span * u;
    };

    signs = new Array(n);

    if (predicate === "orient2d") {
      for (let i = 0; i < n; i++) {
        const ax = nextDouble(); const ay = nextDouble();
        const bx = nextDouble(); const by = nextDouble();
        const cx = nextDouble(); const cy = nextDouble();
        signs[i] = orient2d(ax, ay, bx, by, cx, cy);
      }
    } else if (predicate === "orient3d") {
      for (let i = 0; i < n; i++) {
        const ax = nextDouble(); const ay = nextDouble(); const az = nextDouble();
        const bx = nextDouble(); const by = nextDouble(); const bz = nextDouble();
        const cx = nextDouble(); const cy = nextDouble(); const cz = nextDouble();
        const dx = nextDouble(); const dy = nextDouble(); const dz = nextDouble();
        signs[i] = orient3d(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
      }
    } else if (predicate === "incircle") {
      for (let i = 0; i < n; i++) {
        const ax = nextDouble(); const ay = nextDouble();
        const bx = nextDouble(); const by = nextDouble();
        const cx = nextDouble(); const cy = nextDouble();
        const dx = nextDouble(); const dy = nextDouble();
        signs[i] = incircle(ax, ay, bx, by, cx, cy, dx, dy);
      }
    } else if (predicate === "insphere") {
      for (let i = 0; i < n; i++) {
        const ax = nextDouble(); const ay = nextDouble(); const az = nextDouble();
        const bx = nextDouble(); const by = nextDouble(); const bz = nextDouble();
        const cx = nextDouble(); const cy = nextDouble(); const cz = nextDouble();
        const dx = nextDouble(); const dy = nextDouble(); const dz = nextDouble();
        const ex = nextDouble(); const ey = nextDouble(); const ez = nextDouble();
        signs[i] = insphere(
          ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, ex, ey, ez,
        );
      }
    } else {
      throw new Error("unknown predicate: " + predicate);
    }
  } else {
    const queries: number[][][] = input.queries;
    const n = queries.length;
    signs = new Array(n);
    if (predicate === "orient2d") {
      for (let i = 0; i < n; i++) {
        const q = queries[i];
        signs[i] = orient2d(q[0][0], q[0][1], q[1][0], q[1][1], q[2][0], q[2][1]);
      }
    } else if (predicate === "orient3d") {
      for (let i = 0; i < n; i++) {
        const q = queries[i];
        signs[i] = orient3d(
          q[0][0], q[0][1], q[0][2],
          q[1][0], q[1][1], q[1][2],
          q[2][0], q[2][1], q[2][2],
          q[3][0], q[3][1], q[3][2],
        );
      }
    } else if (predicate === "incircle") {
      for (let i = 0; i < n; i++) {
        const q = queries[i];
        signs[i] = incircle(
          q[0][0], q[0][1],
          q[1][0], q[1][1],
          q[2][0], q[2][1],
          q[3][0], q[3][1],
        );
      }
    } else if (predicate === "insphere") {
      for (let i = 0; i < n; i++) {
        const q = queries[i];
        signs[i] = insphere(
          q[0][0], q[0][1], q[0][2],
          q[1][0], q[1][1], q[1][2],
          q[2][0], q[2][1], q[2][2],
          q[3][0], q[3][1], q[3][2],
          q[4][0], q[4][1], q[4][2],
        );
      }
    } else {
      throw new Error("unknown predicate: " + predicate);
    }
  }

  process.stdout.write(JSON.stringify({ signs }) + "\n");
}

main();
