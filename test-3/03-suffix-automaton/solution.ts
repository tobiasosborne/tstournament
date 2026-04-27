/**
 * Online Suffix Automaton — Blumer et al. 1985.
 *
 * Construction is online: `SuffixAutomaton.extend(c)` transforms the SAM of
 * the current word w into the SAM of wc in amortised O(1) (independent of
 * the alphabet size, given a hash-map transition table). Three queries are
 * answered from the finished automaton:
 *
 *   - num_states                 (count of equivalence classes incl. initial)
 *   - num_distinct_substrings    (Σ_{v ≠ 0} len(v) − len(link(v)))
 *   - lcs(s, t)                  (walk t through SAM(s) with state/length)
 *
 * Implementation notes
 * --------------------
 *  - State data is a struct-of-arrays: two Int32Array fields (`len`, `link`)
 *    plus one `Map<number, number>[]` (`trans`). Typed arrays grow by
 *    doubling, which keeps allocation amortised O(1) and avoids the
 *    per-state object header you get with `class State {…}`. The state
 *    count is bounded by 2|s| − 1, so we can safely pre-size when |s| is
 *    known up front (the batch `build(s)` path does so).
 *  - Transitions are keyed by the character's UTF-16 code unit (a `number`).
 *    `Map<number, number>` is an honest general-alphabet structure: it does
 *    not rely on a fixed Σ size, while still being faster than a string-key
 *    map because we never allocate one-character strings on hot lookups.
 *  - `clone(q)` copies a Map via `new Map(trans[q])` — this is the standard
 *    duplication required when a non-solid edge is encountered (Crochemore
 *    & Vérin 1997 phrasing), and it is what makes the 2|s|−1 state bound
 *    tight.
 *  - `num_distinct_substrings` is accumulated in `bigint` — for the bench
 *    sizes the sum stays well inside 2^53, but bigint costs nothing here
 *    and removes a silent precision pitfall once |s| grows past ~10^4.5.
 *
 * The whole algorithm is roughly 80 lines; the rest of the file is the
 * JSON glue and a thin façade.
 *
 * No `child_process`, no `python`, no native binaries, no WASM, no CAS.
 * Pure TypeScript / JavaScript that would run unchanged in a browser.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Suffix automaton
// ─────────────────────────────────────────────────────────────────────────────

class SuffixAutomaton {
  /** longest substring in this state's end-equivalence class */
  private len: Int32Array;
  /** suffix link: index of the parent state (initial state's link is -1) */
  private link: Int32Array;
  /** transition tables, keyed by UTF-16 code unit */
  private trans: Map<number, number>[];
  /** number of allocated states */
  private size = 0;
  /** capacity of the typed-array backing store */
  private cap: number;
  /** state index of the longest suffix accepted so far ("last" in Ukkonen's
   *  notation, "L" in Blumer's) */
  private last = 0;

  constructor(initialCapacity = 2) {
    this.cap = Math.max(2, initialCapacity);
    this.len = new Int32Array(this.cap);
    this.link = new Int32Array(this.cap);
    this.trans = new Array(this.cap);
    // Initial state: len=0, link=-1, empty transitions.
    this.allocState(0, -1);
  }

  /**
   * Allocate a fresh state with the given (len, link). Returns its index.
   * Uses geometric growth on the typed-array backing store; the Map[] is
   * resized in lock-step.
   */
  private allocState(len: number, link: number): number {
    if (this.size === this.cap) {
      const newCap = this.cap * 2;
      const newLen = new Int32Array(newCap);
      newLen.set(this.len);
      const newLink = new Int32Array(newCap);
      newLink.set(this.link);
      this.len = newLen;
      this.link = newLink;
      this.trans.length = newCap;
      this.cap = newCap;
    }
    const idx = this.size++;
    this.len[idx] = len;
    this.link[idx] = link;
    this.trans[idx] = new Map();
    return idx;
  }

  /**
   * Online extension: append character `c` (as a UTF-16 code unit) to the
   * current word. Amortised O(1) per call — Blumer et al. 1985.
   *
   * We deliberately do *not* alias `this.len` / `this.link` into locals at
   * the top of the method: `allocState` may grow the typed-array backing
   * stores and reassign `this.len`/`this.link`, after which any cached
   * reference would point at the stale buffer. `this.trans` is a regular
   * `Array` so its identity survives a `length =` resize, but we keep the
   * style uniform by going through `this` everywhere here too.
   */
  extend(c: number): void {
    const cur = this.allocState(this.len[this.last] + 1, -1);

    // Walk up the suffix-link chain from `last`, adding a c-transition
    // pointing at `cur` until we hit a state that already has one.
    let p = this.last;
    while (p !== -1 && !this.trans[p].has(c)) {
      this.trans[p].set(c, cur);
      p = this.link[p];
    }

    if (p === -1) {
      // No suffix has a c-transition yet — `cur` falls back to initial.
      this.link[cur] = 0;
    } else {
      const q = this.trans[p].get(c)!;
      if (this.len[p] + 1 === this.len[q]) {
        // Solid edge: q's longest representative is exactly p's + 1, so
        // q's equivalence class is unchanged.
        this.link[cur] = q;
      } else {
        // Non-solid edge → clone q. The clone duplicates q's transitions
        // and takes over q's role on the suffix-link chain we just walked.
        const clone = this.allocState(this.len[p] + 1, this.link[q]);
        this.trans[clone] = new Map(this.trans[q]);

        // Redirect every p→q on c that we can still reach up the link
        // chain to the clone instead.
        while (p !== -1 && this.trans[p].get(c) === q) {
          this.trans[p].set(c, clone);
          p = this.link[p];
        }
        this.link[q] = clone;
        this.link[cur] = clone;
      }
    }

    this.last = cur;
  }

  /** Build the SAM from a string in one shot (still calls `extend` per char). */
  static fromString(s: string): SuffixAutomaton {
    // Best-effort pre-size: 2|s| states is a tight upper bound (state count
    // ≤ 2|s| − 1 for |s| ≥ 2), so allocating 2|s| + 2 avoids any growth.
    const sam = new SuffixAutomaton(Math.max(2, 2 * s.length + 2));
    for (let i = 0; i < s.length; i++) sam.extend(s.charCodeAt(i));
    return sam;
  }

  /** Number of allocated states (initial counted). */
  get numStates(): number {
    return this.size;
  }

  /**
   * Σ_{v ≠ 0} (len[v] − len[link[v]]). For the bench sizes this fits in a
   * `number`, but `bigint` is the honest general-purpose choice.
   */
  numDistinctSubstrings(): bigint {
    let total = 0n;
    const { len, link, size } = this;
    for (let v = 1; v < size; v++) {
      total += BigInt(len[v] - len[link[v]]);
    }
    return total;
  }

  /**
   * Length of the longest substring of `t` that occurs in the source string
   * of this SAM. Standard (state, matched-length) walk: descend the suffix
   * links when the current state has no outgoing edge for the next char,
   * otherwise advance the transition.
   */
  lcsAgainst(t: string): number {
    if (t.length === 0) return 0;
    const { len, link, trans } = this;
    let v = 0;
    let length = 0;
    let best = 0;
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      // If `v` doesn't have a c-transition, fall back along the suffix
      // links until we find one (or reach the initial state).
      while (v !== 0 && !trans[v].has(c)) {
        v = link[v];
        length = len[v];
      }
      const next = trans[v].get(c);
      if (next !== undefined) {
        v = next;
        length++;
      }
      if (length > best) best = length;
    }
    return best;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON I/O glue
// ─────────────────────────────────────────────────────────────────────────────

interface SAMInput {
  s: string;
  t?: string;
}

interface SAMOutput {
  num_states: number;
  num_distinct_substrings: string;
  lcs_length: number;
}

function suffixAutomaton(input: SAMInput): SAMOutput {
  const s = typeof input.s === "string" ? input.s : "";
  const t = typeof input.t === "string" ? input.t : "";

  const sam = SuffixAutomaton.fromString(s);
  return {
    num_states: sam.numStates,
    num_distinct_substrings: sam.numDistinctSubstrings().toString(10),
    lcs_length: sam.lcsAgainst(t),
  };
}

function readAllStdin(): string {
  // `readFileSync(0, "utf8")` is the standard idiom for slurping stdin in
  // Node, and avoids the back-and-forth of stream events for our one-shot
  // JSON payload. (Browser-portable code paths would replace this glue.)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs") as typeof import("fs");
  return fs.readFileSync(0, "utf8");
}

function main(): void {
  const raw = readAllStdin();
  const input: SAMInput = raw.trim().length === 0 ? { s: "", t: "" } : JSON.parse(raw);
  const out = suffixAutomaton(input);
  process.stdout.write(JSON.stringify(out) + "\n");
}

main();
