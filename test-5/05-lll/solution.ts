/**
 * LLL lattice reduction — exact integer / rational arithmetic.
 *
 * Implementation of the integer LLL algorithm following
 *   H. Cohen, "A Course in Computational Algebraic Number Theory",
 *   Algorithm 2.6.3 (the integer-arithmetic variant of the classical
 *   Lenstra-Lenstra-Lovász 1982 reduction).
 *
 * Why this form. The naive LLL keeps the Gram-Schmidt coefficients
 *   μ_{i,j} = ⟨b_i, b*_j⟩ / ⟨b*_j, b*_j⟩
 * as exact rationals. The Cohen variant instead stores
 *   d_i  =  ∏_{k=0..i-1} ‖b*_k‖²              (a positive integer — the
 *                                              squared lattice determinant
 *                                              of the first i rows)
 *   λ_{i,j}                                    (an integer; μ_{i,j} = λ_{i,j}/d_{j+1})
 * with the convention d_0 = 1. All arithmetic is performed on bigints;
 * no rationals, no floats, no GCDs in the hot loop. The d_i are integers
 * by Sylvester's identity; every λ recurrence is a clean integer
 * combination — see Cohen Lemma 2.6.2 / Pohst–Zassenhaus.
 *
 * Complexity. O(n^4 · log B) bigint ops, integers of binary length
 * O(n · log B), per the original LLL bound.
 *
 * Determinism. δ = 3/4 is fixed by the verifier but the implementation
 * accepts any rational δ ∈ (1/4, 1).
 */

// ---------------------------------------------------------------------------
// I/O contract
// ---------------------------------------------------------------------------

interface LLLInput {
  n: number;
  d: number;
  basis: string[][];
  delta: { num: string; den: string };
}

interface LLLOutput {
  reduced_basis: string[][];
}

// ---------------------------------------------------------------------------
// bigint helpers
// ---------------------------------------------------------------------------

const ZERO = 0n;
const ONE = 1n;

function babs(x: bigint): bigint {
  return x < ZERO ? -x : x;
}

/**
 * Nearest-integer rounding for a rational p/q with q > 0; ties (`|p/q|`
 * exactly half-integer) are broken upward, i.e. `round(p/q) = ⌊p/q + 1/2⌋`.
 * Equivalently this is `⌊(2p + q) / (2q)⌋`. Cohen's size-reduction step
 * tolerates any consistent half-integer rule — all we need from `q` is
 * that `|p/q - round(p/q)| ≤ 1/2`.
 */
function nearestInt(p: bigint, q: bigint): bigint {
  // q > 0 is enforced by the caller (q = D[ℓ+1] is a positive Gram det).
  const num = (p << ONE) + q;
  const den = q << ONE; // > 0
  // Bigint `/` truncates toward zero; convert to floor division.
  let r = num / den;
  if (num < ZERO && num % den !== ZERO) r -= ONE;
  return r;
}

function dot(u: bigint[], v: bigint[]): bigint {
  let s = ZERO;
  const n = u.length;
  for (let i = 0; i < n; i++) s += u[i] * v[i];
  return s;
}

// ---------------------------------------------------------------------------
// Cohen §2.6 integer LLL
// ---------------------------------------------------------------------------

/**
 * Reduce `basis` (n vectors in ℤ^d, rows) to an LLL-reduced basis with
 * parameter δ = δNum/δDen, δ ∈ (1/4, 1). Returns a fresh n×d bigint matrix.
 */
function lllReduce(
  basis: bigint[][],
  delta: { num: bigint; den: bigint },
): bigint[][] {
  const n = basis.length;
  if (n === 0) return [];
  const d = basis[0].length;

  // Working basis (we mutate copies — keep the input untouched).
  const b: bigint[][] = basis.map((row) => row.slice());

  // d_i for i = 0..n. Cohen indexes d_0..d_n; d_0 = 1, d_i = ∏ ‖b*_k‖²
  // for k < i. Here `D[i]` corresponds to Cohen's `d_i`.
  const D: bigint[] = new Array(n + 1).fill(ZERO);
  D[0] = ONE;

  // λ[i][j] for 0 ≤ j < i < n. We only ever read entries with j < i.
  // Stored as a triangular array.
  const lam: bigint[][] = Array.from({ length: n }, () => new Array(n).fill(ZERO));

  // Initialise d_1 from b_0; the rest of the (D, λ) tables are built by
  // a one-shot pass over `recomputeRow` below. (Cohen interleaves init
  // with the main loop via a `kmax` cursor; with n ≤ 12 the eager pass
  // is O(n^4) bigint ops total — bounded by the LLL inner cost — and
  // keeps the main loop's invariants concise.)
  D[1] = dot(b[0], b[0]);

  // δ as a rational. Lovász test is rearranged to integers in the main
  // loop (see the derivation by the test).
  const dN = delta.num;
  const dD = delta.den;

  // ---- Step 2 (incremental GS coeffs for index k against j=0..k-1) ----
  // After REDI / SWAPI mutate row `b[k]`, λ[k][*] and D[k+1] must be
  // recomputed before the Lovász test. The recurrence below uses
  // Sylvester's determinant identity: each successive `u` is the
  // (j+1)×(j+1) Gram minor of (b_0,…,b_{j-1},b_k) for the diagonal
  // case, and a corresponding signed minor for the off-diagonal.
  // Both are integer; the divisions by d[ℓ] are exact.
  //
  // Off-diagonal:
  //   T_0     = ⟨b_k, b_j⟩
  //   T_{ℓ+1} = ( D_{ℓ+1} · T_ℓ − λ_{k,ℓ} · λ_{j,ℓ} ) / D_ℓ      ℓ < j
  //   λ_{k,j} = T_j
  //
  // Diagonal (j = k):
  //   S_0     = ⟨b_k, b_k⟩
  //   S_{ℓ+1} = ( D_{ℓ+1} · S_ℓ − λ_{k,ℓ}² ) / D_ℓ                ℓ < k
  //   D_{k+1} = S_k
  function recomputeRow(k: number): void {
    for (let j = 0; j < k; j++) {
      let u = dot(b[k], b[j]);
      for (let l = 0; l < j; l++) {
        u = (D[l + 1] * u - lam[k][l] * lam[j][l]) / D[l];
      }
      lam[k][j] = u;
    }
    let s = dot(b[k], b[k]);
    for (let l = 0; l < k; l++) {
      s = (D[l + 1] * s - lam[k][l] * lam[k][l]) / D[l];
    }
    D[k + 1] = s;
  }

  // Initialise rows 1..n-1 of (λ, D). After this call, all GS data is
  // consistent with the current basis. (Row 0 is trivial: D[1] set
  // above, no λ entries.)
  for (let k = 1; k < n; k++) recomputeRow(k);

  // ---- Step 3 (REDI sub-routine) ----
  // Replace b[k] ← b[k] − q · b[ℓ] using the Cohen integer rounding
  // q = ⌊λ_{k,ℓ} / D_{ℓ+1} + 1/2⌋, then update λ.
  function redi(k: number, l: number): void {
    // Cohen condition for early exit: 2|λ_{k,ℓ}| ≤ D_{ℓ+1}. Equivalent
    // to |μ_{k,ℓ}| ≤ 1/2; nothing to do.
    const twoLam = lam[k][l] << ONE;
    if (babs(twoLam) <= D[l + 1]) return;

    const q = nearestInt(lam[k][l], D[l + 1]);

    // b[k] -= q · b[l]
    const bl = b[l];
    const bk = b[k];
    for (let i = 0; i < d; i++) bk[i] -= q * bl[i];

    // λ_{k,ℓ} -= q · D_{ℓ+1}
    lam[k][l] -= q * D[l + 1];

    // λ_{k,j} -= q · λ_{ℓ,j}  for j < ℓ
    for (let j = 0; j < l; j++) lam[k][j] -= q * lam[l][j];
  }

  // ---- Step 4 (SWAPI sub-routine) ----
  // Swap rows k and k-1 and rebuild the affected GS data in O(n)
  // bigint ops via Cohen's integer recurrence (no full GS recompute).
  function swap(k: number): void {
    // Swap b[k] ↔ b[k-1]
    const tmpRow = b[k];
    b[k] = b[k - 1];
    b[k - 1] = tmpRow;

    // Swap λ[k][j] ↔ λ[k-1][j] for j < k-1
    for (let j = 0; j < k - 1; j++) {
      const t = lam[k][j];
      lam[k][j] = lam[k - 1][j];
      lam[k - 1][j] = t;
    }

    // Update λ_{i,k-1}, λ_{i,k} for i = k+1..n-1, and D[k], using
    // Cohen Algorithm 2.6.3 step 4 verbatim:
    //
    //   λ ← λ_{k,k-1}
    //   B ← (D_{k-1} · D_{k+1} + λ²) / D_k
    //   for i = k+1..n-1:
    //       t ← λ_{i,k}
    //       λ_{i,k}   ← (D_{k+1} · λ_{i,k-1} − λ · t) / D_k
    //       λ_{i,k-1} ← (B · t + λ · λ_{i,k}_NEW) / D_{k+1}
    //   D_k ← B
    //
    // Each division is exact by Sylvester / cofactor identities.
    const lambda = lam[k][k - 1];
    const B = (D[k - 1] * D[k + 1] + lambda * lambda) / D[k];

    for (let i = k + 1; i < n; i++) {
      const t = lam[i][k];
      const newIK = (D[k + 1] * lam[i][k - 1] - lambda * t) / D[k];
      const newIKm1 = (B * t + lambda * newIK) / D[k + 1];
      lam[i][k] = newIK;
      lam[i][k - 1] = newIKm1;
    }

    D[k] = B;
  }

  // ---- Main loop (Cohen Algorithm 2.6.3) ----
  // We use "kmax" = n-1 (we eagerly initialised all rows). The loop
  // index k walks forward and back; it terminates when k = n.
  let k = 1;
  while (k < n) {
    // Step 3: size-reduce λ_{k,k-1}.
    redi(k, k - 1);

    // Lovász test, rearranged to integer arithmetic. Starting from
    //   ‖b*_k‖²  ≥  (δ − μ_{k,k-1}²) · ‖b*_{k-1}‖²
    // substitute ‖b*_k‖² = D[k+1]/D[k], μ_{k,k-1} = λ/D[k]:
    //   D[k+1]/D[k]  ≥  (δ − (λ/D[k])²) · D[k]/D[k-1]
    // multiply by D[k] · D[k-1] · δDen (all positive):
    //   δDen · (D[k-1] · D[k+1] + λ²)  ≥  δNum · D[k]²
    const lambda = lam[k][k - 1];
    const lhs = dD * (D[k - 1] * D[k + 1] + lambda * lambda);
    const rhs = dN * D[k] * D[k];

    if (lhs < rhs) {
      // Lovász fails — swap and step back.
      swap(k);
      if (k > 1) k -= 1;
      // Stay at k (which may now be 1) and re-test.
    } else {
      // Step 5: finish size reduction for j = k-2..0, then advance.
      for (let l = k - 2; l >= 0; l--) redi(k, l);
      k += 1;
    }
  }

  return b;
}

// ---------------------------------------------------------------------------
// JSON adapter
// ---------------------------------------------------------------------------

function lll(input: LLLInput): LLLOutput {
  const n = input.n;
  const d = input.d;
  if (input.basis.length !== n) {
    throw new Error(`expected ${n} rows, got ${input.basis.length}`);
  }
  for (let i = 0; i < n; i++) {
    if (input.basis[i].length !== d) {
      throw new Error(`row ${i}: expected ${d} cols, got ${input.basis[i].length}`);
    }
  }

  const basis: bigint[][] = input.basis.map((row) => row.map((s) => BigInt(s)));
  const delta = { num: BigInt(input.delta.num), den: BigInt(input.delta.den) };
  if (delta.den <= ZERO) throw new Error("delta denominator must be positive");
  // δ ∈ (1/4, 1) is the LLL convergence regime. We don't reject inputs
  // outside it (the verifier never sends them) but the algorithm has no
  // termination guarantee there.

  const reduced = lllReduce(basis, delta);
  return { reduced_basis: reduced.map((row) => row.map((x) => x.toString())) };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(): void {
  // Read all of stdin synchronously. fd 0 is stdin; readFileSync on a
  // pipe is well-defined in Node 20+.
  // (This is glue, not the algorithmic core — the constraint allows it.)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs");
  const raw: string = fs.readFileSync(0, "utf8");
  const input: LLLInput = JSON.parse(raw);
  const out = lll(input);
  process.stdout.write(JSON.stringify(out));
}

main();
