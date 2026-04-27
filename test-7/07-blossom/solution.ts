/**
 * Problem 7 — Edmonds' Blossom Algorithm (max-weight matching, general graphs).
 *
 * Edmonds 1965 + Galil 1986 weighted general-graph max-matching, primal-dual
 * with vertex duals u_i and blossom duals z_B, four-case δ update
 * (δ1..δ4), BFS labeling with blossom shrink/expand. Negative-weight edges
 * are never forced into the matching (the spec is "max-weight", not
 * "perfect"; δ1 = min u_v handles this naturally).
 *
 * Pure TypeScript / Node, no native bindings, no shellouts, no graph
 * libraries. BigInt arithmetic for weights so the decimal-string contract
 * is honoured exactly.
 *
 * Source layout (in order):
 *   1. JSON I/O glue (stdin → input, output → stdout).
 *   2. blossom() — the solver, one self-contained function holding all
 *      state plus inner helpers (slack, assignLabel, scanBlossom, addBlossom,
 *      expandBlossom, augmentBlossom, augmentMatching, plus the main
 *      stage/inner-loop driver).
 *   3. main() — entry point.
 *
 * The implementation follows the structure popularised by Van Rantwijk's
 * Python `mwmatching` (which itself is a clean port of Galil's exposition)
 * because it is the most-tested, most-cited formulation of Edmonds'
 * algorithm and handles every gnarly nested-blossom corner case correctly.
 *
 * Weight scaling: edge weights are stored as 2·w (BigInt). Vertex duals
 * start at max(|w|, w_max), so initial slack u_i + u_j − 2w ≥ 0 always.
 * Working in 2w keeps every δ value integer (δ3 = slack/2, and slack is
 * always even between two S blossoms, since both endpoints' u's move by
 * the same δ).
 */

import * as fs from "node:fs";

// ─────────────────────────────────────────────────────────────────────────────
// 1. JSON I/O glue
// ─────────────────────────────────────────────────────────────────────────────

type EdgeIn = [number, number, string];
type MatchPair = [number, number];

interface BlossomInput {
  n: number;
  edges: EdgeIn[];
}

interface BlossomOutput {
  matching: MatchPair[];
  total_weight: string;
}

function readAllStdin(): string {
  return fs.readFileSync(0, "utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. blossom() — Edmonds' weighted blossom algorithm
// ─────────────────────────────────────────────────────────────────────────────

function blossom(input: BlossomInput): BlossomOutput {
  const n = input.n;

  // Trivial cases.
  if (n === 0) return { matching: [], total_weight: "0" };

  // Collapse parallel edges by max weight; drop self-loops & out-of-range.
  type CleanEdge = { u: number; v: number; w: bigint };
  const edgeMap = new Map<string, CleanEdge>();
  for (const [a, b, ws] of input.edges) {
    if (a === b) continue;
    if (a < 0 || a >= n || b < 0 || b >= n) continue;
    const u = a < b ? a : b;
    const v = a < b ? b : a;
    const w = BigInt(ws);
    const key = u * (n + 1) + v;
    const k = `${key}`;
    const prior = edgeMap.get(k);
    if (prior === undefined || w > prior.w) edgeMap.set(k, { u, v, w });
  }
  const cleaned: CleanEdge[] = Array.from(edgeMap.values());
  const m = cleaned.length;

  if (m === 0) return { matching: [], total_weight: "0" };

  // Edge arrays in 2·w units.
  const edgeU = new Int32Array(m);
  const edgeV = new Int32Array(m);
  const edgeW: bigint[] = new Array(m);
  let maxW = 0n;
  for (let k = 0; k < m; k++) {
    edgeU[k] = cleaned[k].u;
    edgeV[k] = cleaned[k].v;
    edgeW[k] = cleaned[k].w * 2n;
    if (cleaned[k].w > maxW) maxW = cleaned[k].w;
  }
  if (maxW < 0n) maxW = 0n;

  // Endpoint table (Van Rantwijk convention):
  //   endpoint[2k]   = u  (the first vertex of edge k)
  //   endpoint[2k+1] = v  (the second vertex of edge k)
  // "Endpoint p" identifies an oriented half-edge; mate[s] = p means s's
  // partner is endpoint[p]. neighb[v] holds endpoint indices p such that
  // endpoint[p] is the OTHER end relative to v: from u (= endpoint[2k]),
  // the other end is at p = 2k+1; from v (= endpoint[2k+1]), at p = 2k.
  const endpoint = new Int32Array(2 * m);
  for (let k = 0; k < m; k++) {
    endpoint[2 * k] = edgeU[k];
    endpoint[2 * k + 1] = edgeV[k];
  }

  const neighb: number[][] = Array.from({ length: n }, () => []);
  for (let k = 0; k < m; k++) {
    // From edgeU[k]'s perspective, the OTHER end (v) is at endpoint 2k+1.
    neighb[edgeU[k]].push(2 * k + 1);
    // From edgeV[k]'s perspective, the OTHER end (u) is at endpoint 2k.
    neighb[edgeV[k]].push(2 * k);
  }

  // Slot count: vertices 0..n-1, blossoms n..2n-1.
  const N2 = 2 * n;

  // mate[v]: endpoint of the matched edge at v (so endpoint[mate[v]] is v's
  // partner and the edge is mate[v] >> 1). -1 if unmatched.
  const mate = new Int32Array(n).fill(-1);

  // label[b]: 0 unlabeled, 1 = S (outer), 2 = T (inner). Indexed by either
  // a vertex (b < n) or a blossom (b ≥ n). For TOP-LEVEL blossoms it's the
  // tree label; for vertices inside a labeled top-level blossom, it mirrors
  // that label.
  const label = new Int32Array(N2);

  // labelEnd[b]: endpoint by which b was labeled (-1 if labeled as a free
  // root). For S blossoms reached through an unmatched edge, labelEnd is the
  // endpoint at b's side. For T blossoms, labelEnd is the endpoint at b's
  // side of the entering edge.
  const labelEnd = new Int32Array(N2).fill(-1);

  // inBlossom[v]: top-level blossom currently containing v.
  const inBlossom = new Int32Array(n);
  for (let v = 0; v < n; v++) inBlossom[v] = v;

  // Blossom tree.
  const blossomBase = new Int32Array(N2);
  for (let v = 0; v < n; v++) blossomBase[v] = v;
  for (let b = n; b < N2; b++) blossomBase[b] = -1;

  const blossomChilds: (number[] | null)[] = new Array(N2).fill(null);
  const blossomEndps: (number[] | null)[] = new Array(N2).fill(null);
  const blossomParent = new Int32Array(N2).fill(-1);

  // bestEdge: per top-level S-blossom (or T-internal vertex), best candidate
  // edge for δ2/δ3 — minimum slack. -1 if none.
  const bestEdge = new Int32Array(N2).fill(-1);
  // For each non-trivial blossom: list of S-vs-S candidate edges.
  const blossomBestEdges: (number[] | null)[] = new Array(N2).fill(null);

  // Pool of unused blossom IDs.
  const unusedBlossoms: number[] = [];
  for (let b = N2 - 1; b >= n; b--) unusedBlossoms.push(b);

  // Dual variables.
  const dualVar: bigint[] = new Array(N2).fill(0n);
  for (let v = 0; v < n; v++) dualVar[v] = maxW;
  // (blossom z's start at 0)

  // allowEdge[k]: 1 if edge k is currently tight (slack==0) AND has been
  // permitted for the BFS scan.
  const allowEdge = new Uint8Array(m);

  // BFS queue of S-vertices to scan.
  let queue: number[] = [];

  // ── Inner helpers.

  function slack(k: number): bigint {
    return dualVar[edgeU[k]] + dualVar[edgeV[k]] - edgeW[k];
  }

  // Iterate vertices inside blossom b (vertex itself if b < n).
  function blossomLeaves(b: number): number[] {
    const out: number[] = [];
    if (b < n) {
      out.push(b);
      return out;
    }
    const stack: number[] = [b];
    while (stack.length) {
      const x = stack.pop()!;
      if (x < n) out.push(x);
      else {
        const ch = blossomChilds[x]!;
        for (let i = 0; i < ch.length; i++) stack.push(ch[i]);
      }
    }
    return out;
  }

  function assignLabel(w: number, t: number, p: number): void {
    const b = inBlossom[w];
    label[w] = t;
    label[b] = t;
    labelEnd[w] = p;
    labelEnd[b] = p;
    bestEdge[w] = -1;
    bestEdge[b] = -1;
    if (t === 1) {
      // S-blossom: enqueue all leaves for scanning.
      const leaves = blossomLeaves(b);
      for (let i = 0; i < leaves.length; i++) queue.push(leaves[i]);
    } else if (t === 2) {
      // T-blossom: assignLabel the matched neighbour of the base as S.
      const base = blossomBase[b];
      assignLabel(endpoint[mate[base]], 1, mate[base] ^ 1);
    }
  }

  function scanBlossom(v: number, w: number): number {
    const path: number[] = [];
    let base = -1;
    let vv = v;
    let ww = w;
    while (vv !== -1 || ww !== -1) {
      let b = inBlossom[vv];
      if (label[b] & 4) {
        base = blossomBase[b];
        break;
      }
      path.push(b);
      label[b] |= 4;
      // Traverse upward: labelEnd[b] is the endpoint by which b was reached
      // (its tree edge to a T parent or -1 for a root).
      if (labelEnd[b] === -1) {
        vv = -1;
      } else {
        vv = endpoint[labelEnd[b]];
        b = inBlossom[vv];
        // b is now T; its labelEnd points back into the next S blossom.
        vv = endpoint[labelEnd[b]];
      }
      // Swap.
      if (ww !== -1) {
        const t = vv;
        vv = ww;
        ww = t;
      }
    }
    for (let i = 0; i < path.length; i++) label[path[i]] &= ~4;
    return base;
  }

  function addBlossom(base: number, k: number): void {
    const v0 = edgeU[k];
    const w0 = edgeV[k];
    const bb = inBlossom[base];
    let bv = inBlossom[v0];
    let bw = inBlossom[w0];

    const b = unusedBlossoms.pop()!;
    blossomBase[b] = base;
    blossomParent[b] = -1;
    blossomParent[bb] = b;

    const path: number[] = [];
    const endps: number[] = [];

    // Walk from bv up the tree to the LCA bb. labelEnd[cur] is the endpoint
    // by which sub-blossom cur was labeled; chasing it lands on a T-blossom,
    // and labelEnd of THAT lands on the next S-blossom in the path. The
    // single-step formulation here works because S-blossoms above the cycle
    // alternate with T-blossoms whose labelEnd points back into S.
    let cur = bv;
    while (cur !== bb) {
      blossomParent[cur] = b;
      path.push(cur);
      endps.push(labelEnd[cur]);
      cur = inBlossom[endpoint[labelEnd[cur]]];
    }
    path.push(bb);
    path.reverse();
    endps.reverse();
    endps.push(2 * k);

    // Walk from bw up to the LCA bb. The endpoint we record is the SIBLING
    // half-edge (^ 1), since we'll traverse this side in the opposite sense
    // when rotating around the cycle.
    cur = bw;
    while (cur !== bb) {
      blossomParent[cur] = b;
      path.push(cur);
      endps.push(labelEnd[cur] ^ 1);
      cur = inBlossom[endpoint[labelEnd[cur]]];
    }

    blossomChilds[b] = path;
    blossomEndps[b] = endps;

    label[b] = 1;
    labelEnd[b] = labelEnd[bb];
    dualVar[b] = 0n;

    const leaves = blossomLeaves(b);
    for (let i = 0; i < leaves.length; i++) {
      const v = leaves[i];
      if (label[inBlossom[v]] === 2) queue.push(v);
      inBlossom[v] = b;
    }

    // Compute bestEdge for the new blossom by aggregating sub-blossoms.
    const bestEdgeTo = new Int32Array(N2).fill(-1);
    for (let i = 0; i < path.length; i++) {
      const sub = path[i];
      let lists: number[][];
      if (sub < n || blossomBestEdges[sub] === null) {
        // Generate all incident edges from leaves.
        const subLeaves = blossomLeaves(sub);
        lists = [];
        for (let j = 0; j < subLeaves.length; j++) {
          const arr: number[] = [];
          const nl = neighb[subLeaves[j]];
          for (let q = 0; q < nl.length; q++) arr.push(nl[q] >> 1);
          lists.push(arr);
        }
      } else {
        lists = [blossomBestEdges[sub]!];
      }
      for (let li = 0; li < lists.length; li++) {
        const list = lists[li];
        for (let lj = 0; lj < list.length; lj++) {
          const ek = list[lj];
          let ii = edgeU[ek], jj = edgeV[ek];
          if (inBlossom[jj] === b) { const t = ii; ii = jj; jj = t; }
          const bj = inBlossom[jj];
          if (bj !== b && label[bj] === 1) {
            const cur2 = bestEdgeTo[bj];
            if (cur2 === -1 || slack(ek) < slack(cur2)) bestEdgeTo[bj] = ek;
          }
        }
      }
      blossomBestEdges[sub] = null;
      bestEdge[sub] = -1;
    }
    const collected: number[] = [];
    for (let c = 0; c < N2; c++) if (bestEdgeTo[c] !== -1) collected.push(bestEdgeTo[c]);
    blossomBestEdges[b] = collected;
    bestEdge[b] = -1;
    for (let i = 0; i < collected.length; i++) {
      const ek = collected[i];
      if (bestEdge[b] === -1 || slack(ek) < slack(bestEdge[b])) bestEdge[b] = ek;
    }
  }

  // Modular indexing helper: returns ((i % n) + n) % n.
  function mod(i: number, ln: number): number {
    return ((i % ln) + ln) % ln;
  }

  function expandBlossom(b: number, endStage: boolean): void {
    const childs = blossomChilds[b]!;
    const endps = blossomEndps[b]!;
    const L = childs.length;
    for (let i = 0; i < L; i++) {
      const sub = childs[i];
      blossomParent[sub] = -1;
      if (sub < n) {
        inBlossom[sub] = sub;
      } else if (endStage && dualVar[sub] === 0n) {
        expandBlossom(sub, endStage);
      } else {
        const leaves = blossomLeaves(sub);
        for (let j = 0; j < leaves.length; j++) inBlossom[leaves[j]] = sub;
      }
    }

    if (!endStage && label[b] === 2) {
      // Mid-stage T-blossom expansion: rebuild the tree across what was b.
      const entryChild = inBlossom[endpoint[labelEnd[b] ^ 1]];
      let j = childs.indexOf(entryChild);
      let jStep: number;
      let endpTrick: number;
      if ((j & 1) !== 0) {
        // Odd index: walk forward (toward base via positive direction).
        j -= L;
        jStep = 1;
        endpTrick = 0;
      } else {
        jStep = -1;
        endpTrick = 1;
      }

      let p = labelEnd[b];
      while (j !== 0) {
        // Mark next child T using tight edge p.
        label[endpoint[p ^ 1]] = 0;
        const idxA = mod(j - endpTrick, L);
        label[endpoint[endps[idxA] ^ endpTrick ^ 1]] = 0;
        assignLabel(endpoint[p ^ 1], 2, p);
        // Permit the tree edge.
        allowEdge[endps[idxA] >> 1] = 1;
        j += jStep;
        const idxB = mod(j - endpTrick, L);
        p = endps[idxB] ^ 1;
        allowEdge[p >> 1] = 1;
        j += jStep;
      }
      // Re-label the sub-blossom that becomes the new T.
      const childAtJ = childs[mod(j, L)];
      label[endpoint[p ^ 1]] = 2;
      label[childAtJ] = 2;
      labelEnd[endpoint[p ^ 1]] = p;
      labelEnd[childAtJ] = p;
      bestEdge[childAtJ] = -1;

      // Continue around the cycle the other way; remaining children are
      // S-blossoms — re-label them by following matched edges.
      j = mod(j + jStep, L);
      while (childs[j] !== entryChild) {
        const bv = childs[j];
        if (label[bv] === 1) {
          j = mod(j + jStep, L);
          continue;
        }
        // Find a labeled vertex inside bv (one of its leaves had a label
        // before; clear and reassign).
        const subLeaves = blossomLeaves(bv);
        let v = -1;
        for (let q = 0; q < subLeaves.length; q++) if (label[subLeaves[q]] !== 0) { v = subLeaves[q]; break; }
        if (v !== -1) {
          label[v] = 0;
          label[endpoint[mate[blossomBase[bv]]]] = 0;
          assignLabel(v, 2, labelEnd[v]);
        }
        j = mod(j + jStep, L);
      }
    }

    // Recycle.
    label[b] = 0;
    labelEnd[b] = -1;
    blossomChilds[b] = null;
    blossomEndps[b] = null;
    blossomBase[b] = -1;
    blossomBestEdges[b] = null;
    bestEdge[b] = -1;
    unusedBlossoms.push(b);
  }

  function augmentBlossom(b: number, v: number): void {
    // Find the immediate sub-blossom of b containing v.
    let t = v;
    while (blossomParent[t] !== b) t = blossomParent[t];
    if (t >= n) augmentBlossom(t, v);

    const childs = blossomChilds[b]!;
    const endps = blossomEndps[b]!;
    const L = childs.length;
    let i = childs.indexOf(t);
    let j = i;
    let jStep: number;
    let endpTrick: number;
    if ((i & 1) !== 0) {
      j -= L;
      jStep = 1;
      endpTrick = 0;
    } else {
      jStep = -1;
      endpTrick = 1;
    }

    while (j !== 0) {
      j += jStep;
      let nxt = childs[mod(j, L)];
      const p = endps[mod(j - endpTrick, L)] ^ endpTrick;
      if (nxt >= n) augmentBlossom(nxt, endpoint[p]);
      j += jStep;
      nxt = childs[mod(j, L)];
      if (nxt >= n) augmentBlossom(nxt, endpoint[p ^ 1]);
      mate[endpoint[p]] = p ^ 1;
      mate[endpoint[p ^ 1]] = p;
    }
    // Rotate so that t (containing v) is at index 0.
    const newChilds = childs.slice(i).concat(childs.slice(0, i));
    const newEndps = endps.slice(i).concat(endps.slice(0, i));
    blossomChilds[b] = newChilds;
    blossomEndps[b] = newEndps;
    blossomBase[b] = blossomBase[newChilds[0]];
  }

  function augmentMatching(k: number): void {
    const v0 = edgeU[k];
    const w0 = edgeV[k];
    for (let side = 0; side < 2; side++) {
      let s: number, p: number;
      if (side === 0) { s = v0; p = 2 * k + 1; }   // partner of s = endpoint[p] = v = w0
      else            { s = w0; p = 2 * k; }       // partner of s = endpoint[p] = u = v0
      while (true) {
        const bs = inBlossom[s];
        if (bs >= n) augmentBlossom(bs, s);
        mate[s] = p;
        if (labelEnd[bs] === -1) break;
        const t = endpoint[labelEnd[bs]];
        const bt = inBlossom[t];
        // bt is T; labelEnd[bt] points back to the parent S-blossom's side.
        const sNext = endpoint[labelEnd[bt]];
        const j = endpoint[labelEnd[bt] ^ 1];
        if (bt >= n) augmentBlossom(bt, j);
        mate[j] = labelEnd[bt];
        s = sNext;
        p = labelEnd[bt] ^ 1;
      }
    }
  }

  // ── Main loop: at most n stages.
  for (let stage = 0; stage < n; stage++) {
    // Reset per-stage state.
    label.fill(0);
    labelEnd.fill(-1);
    bestEdge.fill(-1);
    for (let b = n; b < N2; b++) blossomBestEdges[b] = null;
    allowEdge.fill(0);
    queue = [];

    // Label every free vertex as an S root.
    for (let v = 0; v < n; v++) {
      if (mate[v] === -1 && label[inBlossom[v]] === 0) {
        assignLabel(v, 1, -1);
      }
    }

    let augmented = false;

    // Inner BFS + δ-step loop.
    outer: while (true) {
      while (queue.length > 0 && !augmented) {
        const v = queue.pop()!;
        const nl = neighb[v];
        for (let qi = 0; qi < nl.length; qi++) {
          const p = nl[qi];
          const k = p >> 1;
          const w = endpoint[p];
          if (inBlossom[v] === inBlossom[w]) continue;
          let kslack: bigint = 0n;
          if (allowEdge[k] === 0) {
            kslack = slack(k);
            if (kslack <= 0n) allowEdge[k] = 1;
          }
          if (allowEdge[k] === 1) {
            if (label[inBlossom[w]] === 0) {
              assignLabel(w, 2, p ^ 1);
            } else if (label[inBlossom[w]] === 1) {
              const base = scanBlossom(v, w);
              if (base >= 0) {
                addBlossom(base, k);
              } else {
                augmentMatching(k);
                augmented = true;
                break;
              }
            } else if (label[w] === 0) {
              label[w] = 2;
              labelEnd[w] = p ^ 1;
            }
          } else if (label[inBlossom[w]] === 1) {
            const bv = inBlossom[v];
            if (bestEdge[bv] === -1 || kslack < slack(bestEdge[bv])) bestEdge[bv] = k;
          } else if (label[w] === 0) {
            if (bestEdge[w] === -1 || kslack < slack(bestEdge[w])) bestEdge[w] = k;
          }
        }
      }
      if (augmented) break outer;

      // Schedule δ.
      let deltaType = -1;
      let delta: bigint = 0n;
      let deltaEdge = -1;
      let deltaBlossom = -1;

      // δ1: max-weight termination — min u_v over all vertices.
      // (For min-cost-perfect we'd skip this; for max-weight we include it.)
      deltaType = 1;
      delta = dualVar[0];
      for (let v = 1; v < n; v++) if (dualVar[v] < delta) delta = dualVar[v];

      // δ2: min slack on edge from S-vertex to free vertex.
      for (let v = 0; v < n; v++) {
        if (label[inBlossom[v]] === 0 && bestEdge[v] !== -1) {
          const d = slack(bestEdge[v]);
          if (d < delta) {
            delta = d;
            deltaType = 2;
            deltaEdge = bestEdge[v];
          }
        }
      }

      // δ3: half-min slack between two S-blossoms.
      for (let b = 0; b < N2; b++) {
        if (blossomParent[b] === -1 && label[b] === 1 && bestEdge[b] !== -1) {
          const sk = slack(bestEdge[b]);
          // sk is even (proof: u_i + u_j - 2w; both u_i and u_j started at
          // maxW, only ever changed by integer δ's same on each S endpoint).
          // Thus sk/2 is exact in BigInt.
          const d = sk / 2n;
          if (deltaType === -1 || d < delta) {
            delta = d;
            deltaType = 3;
            deltaEdge = bestEdge[b];
          }
        }
      }

      // δ4: min z_b among T-blossoms.
      for (let b = n; b < N2; b++) {
        if (blossomBase[b] >= 0 && blossomParent[b] === -1 && label[b] === 2) {
          if (deltaType === -1 || dualVar[b] < delta) {
            delta = dualVar[b];
            deltaType = 4;
            deltaBlossom = b;
          }
        }
      }

      // δ1 is always defined when n > 0, so deltaType is always set here.

      // Apply delta to duals.
      for (let v = 0; v < n; v++) {
        const lb = label[inBlossom[v]];
        if (lb === 1) dualVar[v] -= delta;
        else if (lb === 2) dualVar[v] += delta;
      }
      for (let b = n; b < N2; b++) {
        if (blossomBase[b] >= 0 && blossomParent[b] === -1) {
          if (label[b] === 1) dualVar[b] += delta;
          else if (label[b] === 2) dualVar[b] -= delta;
        }
      }

      if (deltaType === 1) {
        break outer;
      } else if (deltaType === 2) {
        allowEdge[deltaEdge] = 1;
        let i = edgeU[deltaEdge], j = edgeV[deltaEdge];
        if (label[inBlossom[i]] === 0) { const t = i; i = j; j = t; }
        queue.push(i);
      } else if (deltaType === 3) {
        allowEdge[deltaEdge] = 1;
        const i = edgeU[deltaEdge];
        queue.push(i);
      } else if (deltaType === 4) {
        expandBlossom(deltaBlossom, false);
      }
    }

    if (!augmented) break;

    // End of stage: expand zero-dual top-level blossoms.
    for (let b = n; b < N2; b++) {
      if (blossomParent[b] === -1 && blossomBase[b] >= 0 &&
          label[b] === 1 && dualVar[b] === 0n) {
        expandBlossom(b, true);
      }
    }
  }

  // ── Compose output.
  const matching: MatchPair[] = [];
  let total = 0n;
  const seen = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    if (mate[v] === -1) continue;
    if (seen[v]) continue;
    const partner = endpoint[mate[v]];
    if (partner < 0 || partner >= n) continue;
    if (seen[partner]) continue;
    const k = mate[v] >> 1;
    // Defensive: never include a strictly-negative edge in the output. The
    // dual machinery shouldn't produce one (δ1 keeps free vertices free),
    // but if it ever did, drop it.
    if (cleaned[k].w < 0n) continue;
    const a = v < partner ? v : partner;
    const b = v < partner ? partner : v;
    matching.push([a, b]);
    total += cleaned[k].w;
    seen[v] = 1;
    seen[partner] = 1;
  }

  return { matching, total_weight: total.toString() };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Entry point
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const raw = readAllStdin();
  const input: BlossomInput = JSON.parse(raw);
  const out = blossom(input);
  process.stdout.write(JSON.stringify(out));
}

main();
