/**
 * Problem 1 — Iterative Radix-2 Cooley–Tukey FFT (in-place, bit-reversal).
 *
 * Engineering convention:
 *     forward   : X_k = Σ_j x_j · exp(-2πi · j · k / N)        (no 1/N)
 *     inverse   : x_j = (1/N) · Σ_k X_k · exp(+2πi · j · k / N)
 *
 * Algorithmic shape:
 *     1.  Validate that N is a power of two (1, 2, 4, 8, …).
 *     2.  Decimation-in-time bit-reversal pre-permutation, in place.
 *     3.  log₂ N butterfly passes with twiddles W_s,k = exp(±2πi · k / 2^s)
 *         precomputed once into a flat (re,im) table of length N/2.
 *     4.  For the inverse direction, divide the final buffer by N.
 *
 * Storage model. Complex vectors live in two parallel Float64Arrays (re/im)
 * rather than an array of [re,im] tuples or {re,im} objects. This keeps the
 * inner butterfly loop branchless, allocation-free, and friendly to v8's
 * monomorphic JIT — the hot path looks like straight numeric kernel code.
 *
 * The JSON I/O wrapper unboxes [re, im] pairs at the boundary and re-boxes
 * them on the way out, so the in-place property is a property of the
 * algorithm itself, not of the JSON shell.
 */

type Complex = [number, number];

interface FFTInput {
  n: number;
  direction: "forward" | "inverse";
  x: Complex[];
}

// ─── core kernel ─────────────────────────────────────────────────────────────

/** True iff n is a non-negative power of two: 1, 2, 4, 8, … */
function isPow2(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;
}

/** log₂ n for n a power of two in [1, 2³⁰]. */
function log2Pow2(n: number): number {
  // `31 - clz32(n)` is the exact bit-position of the single set bit; this is
  // both faster and more honest than `Math.log2(n)` rounded.
  return 31 - Math.clz32(n);
}

/**
 * In-place bit-reversal permutation of the parallel arrays (re, im).
 *
 * Uses the classic "incrementing reversed integer" trick (see Press et al.,
 * Numerical Recipes §12.2): we maintain `j` as the bit-reversal of `i`, and
 * advance `j` by inspecting bits from the top down. Net cost is O(N), no
 * allocations, no log² N table.
 */
function bitReverseInPlace(re: Float64Array, im: Float64Array, n: number): void {
  let j = 0;
  for (let i = 1; i < n; i++) {
    // Increment j as the bit-reversal of i.
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;

    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
}

/**
 * Iterative radix-2 in-place Cooley–Tukey, decimation-in-time.
 *
 * `sign = -1` ⇒ forward DFT;  `sign = +1` ⇒ inverse DFT (the 1/N is applied
 * by the caller). The twiddle table holds exp(sign · 2πi · k / N) for
 * k = 0 … N/2 − 1; each butterfly stage of size m=2^s consumes a strided
 * subset of it (stride N/m), which is the standard way to avoid recomputing
 * trig at every level.
 */
function fftKernel(
  re: Float64Array,
  im: Float64Array,
  n: number,
  sign: -1 | 1,
): void {
  if (n <= 1) return;

  bitReverseInPlace(re, im, n);

  // Precompute twiddles W^k = exp(sign · 2πi · k / N), k = 0 … N/2 - 1.
  const half = n >> 1;
  const twRe = new Float64Array(half);
  const twIm = new Float64Array(half);
  const theta = (sign * 2 * Math.PI) / n;
  for (let k = 0; k < half; k++) {
    twRe[k] = Math.cos(theta * k);
    twIm[k] = Math.sin(theta * k);
  }

  // Butterfly passes. Stage s ∈ {1, …, log₂N} operates on blocks of size
  // m = 2^s, pairing index k with index k + m/2 across each block. The
  // twiddle for that pair is W^{k · stride}, where stride = N/m walks the
  // shared twiddle table at the right resolution for this stage.
  const stages = log2Pow2(n);
  for (let s = 1; s <= stages; s++) {
    const m = 1 << s;
    const mh = m >> 1;
    const stride = n >> s; // = n / m

    for (let block = 0; block < n; block += m) {
      let twIdx = 0;
      for (let k = 0; k < mh; k++) {
        const i0 = block + k;
        const i1 = i0 + mh;

        const wr = twRe[twIdx];
        const wi = twIm[twIdx];
        twIdx += stride;

        const xr = re[i1];
        const xi = im[i1];

        // t = W · x[i1]
        const tr = wr * xr - wi * xi;
        const ti = wr * xi + wi * xr;

        // Cooley–Tukey DIT butterfly:
        //   x[i0] ← x[i0] + W · x[i1]
        //   x[i1] ← x[i0] − W · x[i1]
        const ur = re[i0];
        const ui = im[i0];

        re[i0] = ur + tr;
        im[i0] = ui + ti;
        re[i1] = ur - tr;
        im[i1] = ui - ti;
      }
    }
  }
}

// ─── public surface ──────────────────────────────────────────────────────────

/**
 * FFT of a JSON-shaped complex vector. Returns a freshly-allocated array of
 * [re, im] pairs; the underlying kernel is in-place over Float64Arrays.
 */
function fft(input: FFTInput): Complex[] {
  const { n, direction, x } = input;

  if (!isPow2(n)) {
    throw new Error(`radix-2 FFT requires n to be a power of two; got n=${n}`);
  }
  if (!Array.isArray(x) || x.length !== n) {
    throw new Error(`input length ${x?.length} does not match declared n=${n}`);
  }
  if (direction !== "forward" && direction !== "inverse") {
    throw new Error(`direction must be "forward" or "inverse"; got ${direction!}`);
  }

  // Unbox into parallel typed arrays. This is the only copy we do.
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const pair = x[i];
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error(`x[${i}] must be a [re, im] pair`);
    }
    re[i] = +pair[0];
    im[i] = +pair[1];
  }

  // n = 1 is the identity in both directions; skip the kernel entirely.
  if (n > 1) {
    const sign: -1 | 1 = direction === "forward" ? -1 : 1;
    fftKernel(re, im, n, sign);

    if (direction === "inverse") {
      const inv = 1 / n;
      for (let i = 0; i < n; i++) {
        re[i] *= inv;
        im[i] *= inv;
      }
    }
  }

  // Re-box for the JSON contract.
  const out: Complex[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = [re[i], im[i]];
  return out;
}

// ─── stdin → stdout JSON glue ────────────────────────────────────────────────

function readAllStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main(): Promise<void> {
  const raw = await readAllStdin();
  const input = JSON.parse(raw) as FFTInput;
  const out = fft(input);
  // Compact JSON keeps stress-case output (n=65536) at the smallest size that
  // still round-trips through jq / verify.py without precision loss.
  process.stdout.write(JSON.stringify(out));
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
