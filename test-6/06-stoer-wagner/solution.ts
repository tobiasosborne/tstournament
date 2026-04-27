/**
 * Stoer-Wagner global minimum cut.
 *
 * Reference: M. Stoer and F. Wagner, "A simple min-cut algorithm",
 * Journal of the ACM 44(4), 585-591, 1997.
 *
 * Pure TypeScript, no native deps, no shell-outs. Designed to run
 * unchanged in a browser.
 *
 * Approach
 * --------
 *   Adjacency matrix of `bigint` weights, flat row-major (`n*n`).
 *   `n - 1` minimum-cut phases. Each phase performs a maximum-adjacency
 *   ordering by linear-scan argmax over the active vertex set
 *   (O(n) per pick × n picks → O(n^2) per phase → O(n^3) total).
 *   At the end of a phase, the last-added vertex `t` is merged into
 *   the second-to-last `s`: row/column-wise weight addition, then `t`
 *   is marked inactive.
 *   The cut-of-phase is the weight degree of `t` against the active
 *   set just before the merge — that's the s-t cut in the contracted
 *   graph (lemma 2.3 in the paper). The minimum over all `n − 1`
 *   phase cuts is the global minimum cut.
 *
 *   To recover one optimal partition, every super-vertex carries the
 *   set of original vertices it absorbed. Whenever the running best
 *   phase cut is improved, we snapshot the membership of the current
 *   `t` — that's the `S` side of the cut at the moment it was
 *   produced.
 *
 *   Weights use `bigint` end-to-end. The MA-ordering "weight to A"
 *   priority is a sum of edge weights; staying in `bigint` is the
 *   only zero-cost guarantee against silent overflow under
 *   adversarial inputs.
 *
 * I/O contract
 * ------------
 *   stdin  : {"n": int, "edges": [[u, v, "w"], ...]}
 *   stdout : {"min_cut_value": "int", "partition_S": [...], "partition_T": [...]}
 */

type Edge = [number, number, string];

interface SWInput {
  n: number;
  edges: Edge[];
}

interface SWOutput {
  min_cut_value: string;
  partition_S: number[];
  partition_T: number[];
}

/**
 * Compute the global minimum cut via Stoer-Wagner.
 *
 * Returns the cut value and one partition `(S, T)` that achieves it.
 * For `n ≤ 1` returns the degenerate answers required by the contract.
 */
function stoerWagner(input: SWInput): SWOutput {
  const n = input.n | 0;

  // ── Degenerate sizes ──────────────────────────────────────────────
  if (n <= 0) {
    return { min_cut_value: "0", partition_S: [], partition_T: [] };
  }
  if (n === 1) {
    return { min_cut_value: "0", partition_S: [0], partition_T: [] };
  }

  // ── Build symmetric weight matrix (parallel edges sum) ────────────
  // Flat row-major, index = u * n + v. `bigint` throughout.
  const W = new Array<bigint>(n * n).fill(0n);
  for (const [uRaw, vRaw, wStr] of input.edges) {
    const u = uRaw | 0;
    const v = vRaw | 0;
    if (u === v) continue; // self-loops are no-ops in SW
    if (u < 0 || u >= n || v < 0 || v >= n) {
      throw new Error(`edge endpoint out of range: ${u}-${v} (n=${n})`);
    }
    const w = BigInt(wStr);
    W[u * n + v] += w;
    W[v * n + u] += w;
  }

  // ── Per-super-vertex membership of original vertices ──────────────
  // Initially super-vertex i contains exactly the original vertex i.
  // Merging `t` into `s` appends members(t) to members(s) and clears t.
  const members: number[][] = Array.from({ length: n }, (_, i) => [i]);

  // ── Active set, kept as a dense list for fast linear-scan argmax ──
  // `active` holds the current super-vertex ids; `alive[i]` mirrors it
  // for O(1) membership checks (used by the MA-ordering scan).
  const active: number[] = Array.from({ length: n }, (_, i) => i);
  const alive = new Uint8Array(n);
  alive.fill(1);

  // Best phase cut found so far, plus a snapshot of one side.
  let bestCut: bigint | null = null;
  let bestS: number[] | null = null;

  // Reusable per-phase scratch buffers.
  const wA = new Array<bigint>(n).fill(0n); // weight from each vertex to A
  const inA = new Uint8Array(n);            // membership flag for A

  // ── Stoer-Wagner main loop: `n − 1` minimum-cut phases ────────────
  while (active.length > 1) {
    // Reset MA scratch for vertices still active.
    for (const v of active) {
      wA[v] = 0n;
      inA[v] = 0;
    }

    // Seed `A` with the smallest active id (any choice is fine; this
    // makes runs deterministic and is friendly to a stable cache).
    const start = active[0];
    inA[start] = 1;
    let lastAdded = start;
    let prevToLast = -1;

    // Initialise wA for non-A actives via lastAdded's row.
    {
      const row = lastAdded * n;
      for (const v of active) {
        if (!inA[v]) wA[v] = W[row + v];
      }
    }

    // Add the remaining `active.length − 1` vertices, each time
    // picking the most tightly-connected-to-A vertex (argmax wA),
    // then folding its row into wA for the rest.
    const need = active.length - 1;
    for (let added = 0; added < need; added++) {
      // Linear scan argmax over active vertices not yet in A.
      let pick = -1;
      let pickW = -1n;
      for (const v of active) {
        if (inA[v]) continue;
        const wv = wA[v];
        if (pick === -1 || wv > pickW) {
          pick = v;
          pickW = wv;
        }
      }
      // pick is guaranteed valid: there are exactly (need - added) candidates left.
      inA[pick] = 1;
      prevToLast = lastAdded;
      lastAdded = pick;

      // Fold pick's row into wA for vertices still outside A.
      // Skip on the last step — wA isn't read after this.
      if (added < need - 1) {
        const row = pick * n;
        for (const v of active) {
          if (!inA[v]) wA[v] += W[row + v];
        }
      }
    }

    // ── Cut-of-phase: weight degree of `t = lastAdded` to active∖{t}.
    // By the MA-ordering lemma this equals wA[t] just before t was
    // added to A — i.e. precisely `pickW` on the last iteration —
    // but recomputing from W is simple, cheap (O(n)), and a useful
    // self-check against the priority arithmetic.
    const t = lastAdded;
    const s = prevToLast;
    let cutOfPhase = 0n;
    {
      const row = t * n;
      for (const v of active) {
        if (v !== t) cutOfPhase += W[row + v];
      }
    }

    // ── Track the best cut and snapshot one side of the partition ──
    // `members[t]` is exactly the set of original vertices on t's side
    // of the cut (the side that will become a single super-vertex
    // after the merge); the other side is everything else.
    if (bestCut === null || cutOfPhase < bestCut) {
      bestCut = cutOfPhase;
      bestS = members[t].slice();
    }

    // ── Merge t into s ─────────────────────────────────────────────
    // For every other active vertex u: W[s][u] += W[t][u]; W[t][·] = 0.
    {
      const rowS = s * n;
      const rowT = t * n;
      for (const u of active) {
        if (u === s || u === t) continue;
        const w = W[rowT + u];
        if (w !== 0n) {
          W[rowS + u] += w;
          W[u * n + s] += w;
          W[rowT + u] = 0n;
          W[u * n + t] = 0n;
        }
      }
      W[rowS + t] = 0n;
      W[rowT + s] = 0n;
    }
    // Roll t's membership into s, then deactivate t.
    for (const x of members[t]) members[s].push(x);
    members[t].length = 0;
    alive[t] = 0;
    // Remove t from `active` (O(n) but n ≤ 100, and it's hoisted out
    // of the hot inner loop above).
    const idx = active.indexOf(t);
    active.splice(idx, 1);
  }

  // ── Materialise the answer ────────────────────────────────────────
  // bestCut and bestS are non-null because n ≥ 2 and at least one
  // phase ran.
  const cut = bestCut as bigint;
  const S = (bestS as number[]).slice().sort((a, b) => a - b);
  const Sset = new Set(S);
  const T: number[] = [];
  for (let i = 0; i < n; i++) if (!Sset.has(i)) T.push(i);

  return {
    min_cut_value: cut.toString(),
    partition_S: S,
    partition_T: T,
  };
}

// ─── stdin/stdout glue ─────────────────────────────────────────────
// Read the whole stdin, parse JSON, run Stoer-Wagner, emit JSON.
function main(): void {
  // `fs.readFileSync(0, "utf8")` reads all of stdin in Node and is the
  // standard idiom for one-shot JSON-on-stdin tools.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs") as typeof import("fs");
  const raw = fs.readFileSync(0, "utf8");
  const input = JSON.parse(raw) as SWInput;
  const out = stoerWagner(input);
  process.stdout.write(JSON.stringify(out) + "\n");
}

main();
