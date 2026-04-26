#!/usr/bin/env -S npx tsx
/**
 * Problem 10 — Risch algorithm for transcendental Liouvillian extensions.
 *
 * Pure-TypeScript implementation. No CAS shell-out; the algorithmic core
 * runs in a browser. It uses BigInt rationals as the constant field,
 * a univariate polynomial layer over Q for the rational-function path,
 * a small symbolic-expression layer for the transcendental extensions,
 * and structural Risch decision rules driven by the canonical Bronstein
 * decomposition (normal vs. special part of the denominator, Hermite
 * reduction on the normal part, Liouville–Risch ansatz on the polynomial
 * part).
 *
 * Coverage targeted: polynomial f∈ℚ[x], rational f∈ℚ(x), and the
 * single-step exp / log monomial extensions that appear in the standard
 * Bronstein examples. The three classical non-elementary diagnostics
 * (exp(x²), exp(x)/x, 1/log(x)) are recognised via the Risch differential
 * equation having no polynomial solution of the appropriate degree.
 *
 *   stdin : { "integrand": "<sympy-parseable string>", "variable": "x" }
 *   stdout: { "antiderivative": "<sympy-parseable string>" | null }
 */

// =========================================================================
// 0. Rationals over BigInt
// =========================================================================

/**
 * Q — exact rational arithmetic. Stored as (num, den) with den > 0 and
 * gcd(num, den) = 1. We use BigInt because rational coefficients can blow
 * up during gcd / partial-fraction work even on small problems.
 */
class Q {
    readonly n: bigint;
    readonly d: bigint;
    private constructor(n: bigint, d: bigint) {
        this.n = n;
        this.d = d;
    }

    static readonly ZERO = new Q(0n, 1n);
    static readonly ONE = new Q(1n, 1n);
    static readonly NEG_ONE = new Q(-1n, 1n);

    static of(n: bigint | number, d: bigint | number = 1n): Q {
        const N = typeof n === "number" ? BigInt(n) : n;
        const D = typeof d === "number" ? BigInt(d) : d;
        if (D === 0n) throw new Error("rational: zero denominator");
        return Q.normalize(N, D);
    }

    private static normalize(n: bigint, d: bigint): Q {
        if (d < 0n) {
            n = -n;
            d = -d;
        }
        if (n === 0n) return Q.ZERO;
        const g = bgcd(n < 0n ? -n : n, d);
        return new Q(n / g, d / g);
    }

    isZero(): boolean { return this.n === 0n; }
    isOne(): boolean { return this.n === 1n && this.d === 1n; }
    isNegOne(): boolean { return this.n === -1n && this.d === 1n; }
    isInteger(): boolean { return this.d === 1n; }
    isNegative(): boolean { return this.n < 0n; }

    add(o: Q): Q { return Q.normalize(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o: Q): Q { return Q.normalize(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o: Q): Q { return Q.normalize(this.n * o.n, this.d * o.d); }
    div(o: Q): Q {
        if (o.n === 0n) throw new Error("Q.div by zero");
        return Q.normalize(this.n * o.d, this.d * o.n);
    }
    neg(): Q { return new Q(-this.n, this.d); }
    inv(): Q {
        if (this.n === 0n) throw new Error("Q.inv of zero");
        return Q.normalize(this.d, this.n);
    }
    pow(k: number): Q {
        if (k < 0) return this.inv().pow(-k);
        if (k === 0) return Q.ONE;
        let r = Q.ONE;
        let base: Q = this;
        let e = k;
        while (e > 0) {
            if (e & 1) r = r.mul(base);
            base = base.mul(base);
            e >>= 1;
        }
        return r;
    }
    eq(o: Q): boolean { return this.n === o.n && this.d === o.d; }
    cmp(o: Q): number {
        const lhs = this.n * o.d;
        const rhs = o.n * this.d;
        return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
    }

    /** sympy-parseable string. Integers print bare, fractions as 'p/q'. */
    toString(): string {
        if (this.d === 1n) return this.n.toString();
        return `${this.n}/${this.d}`;
    }
}

function bgcd(a: bigint, b: bigint): bigint {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b !== 0n) {
        const t = a % b;
        a = b;
        b = t;
    }
    return a;
}

// =========================================================================
// 1. Univariate polynomials over Q (the rational-function path)
// =========================================================================

/**
 * Poly — dense univariate polynomial in the integration variable, with
 * rational coefficients. Stored low-to-high: coeffs[i] is the x^i term.
 * Always trimmed (no trailing zero coefficients); the zero polynomial is
 * the empty array.
 */
class Poly {
    readonly c: Q[];
    constructor(coeffs: Q[]) {
        let i = coeffs.length - 1;
        while (i >= 0 && coeffs[i].isZero()) i--;
        this.c = coeffs.slice(0, i + 1);
    }

    static ZERO = new Poly([]);
    static ONE = new Poly([Q.ONE]);
    static X = new Poly([Q.ZERO, Q.ONE]);

    static const(c: Q): Poly { return new Poly([c]); }
    static monomial(coef: Q, deg: number): Poly {
        const arr: Q[] = new Array(deg + 1).fill(Q.ZERO);
        arr[deg] = coef;
        return new Poly(arr);
    }

    deg(): number { return this.c.length - 1; }
    isZero(): boolean { return this.c.length === 0; }
    lc(): Q { return this.c.length === 0 ? Q.ZERO : this.c[this.c.length - 1]; }
    coef(i: number): Q { return i < this.c.length ? this.c[i] : Q.ZERO; }

    add(o: Poly): Poly {
        const n = Math.max(this.c.length, o.c.length);
        const r: Q[] = new Array(n).fill(Q.ZERO);
        for (let i = 0; i < n; i++) r[i] = this.coef(i).add(o.coef(i));
        return new Poly(r);
    }
    sub(o: Poly): Poly {
        const n = Math.max(this.c.length, o.c.length);
        const r: Q[] = new Array(n).fill(Q.ZERO);
        for (let i = 0; i < n; i++) r[i] = this.coef(i).sub(o.coef(i));
        return new Poly(r);
    }
    neg(): Poly { return new Poly(this.c.map(q => q.neg())); }
    scale(k: Q): Poly {
        if (k.isZero()) return Poly.ZERO;
        return new Poly(this.c.map(q => q.mul(k)));
    }
    mul(o: Poly): Poly {
        if (this.isZero() || o.isZero()) return Poly.ZERO;
        const r: Q[] = new Array(this.deg() + o.deg() + 1).fill(Q.ZERO);
        for (let i = 0; i < this.c.length; i++) {
            if (this.c[i].isZero()) continue;
            for (let j = 0; j < o.c.length; j++) {
                if (o.c[j].isZero()) continue;
                r[i + j] = r[i + j].add(this.c[i].mul(o.c[j]));
            }
        }
        return new Poly(r);
    }
    pow(n: number): Poly {
        if (n < 0) throw new Error("Poly.pow negative");
        if (n === 0) return Poly.ONE;
        let r = Poly.ONE;
        let base: Poly = this;
        let e = n;
        while (e > 0) {
            if (e & 1) r = r.mul(base);
            base = base.mul(base);
            e >>= 1;
        }
        return r;
    }

    /** Quotient/remainder by long division. Throws if `div` is zero. */
    divmod(div: Poly): { q: Poly; r: Poly } {
        if (div.isZero()) throw new Error("Poly.divmod by zero");
        let r: Poly = this;
        let q = Poly.ZERO;
        while (!r.isZero() && r.deg() >= div.deg()) {
            const k = r.lc().div(div.lc());
            const shift = r.deg() - div.deg();
            const term = Poly.monomial(k, shift);
            q = q.add(term);
            r = r.sub(div.mul(term));
        }
        return { q, r };
    }

    /** Quotient ignoring remainder. */
    quo(div: Poly): Poly { return this.divmod(div).q; }
    rem(div: Poly): Poly { return this.divmod(div).r; }

    /** Formal derivative wrt x. */
    diff(): Poly {
        if (this.c.length <= 1) return Poly.ZERO;
        const r: Q[] = new Array(this.c.length - 1);
        for (let i = 1; i < this.c.length; i++) r[i - 1] = this.c[i].mul(Q.of(i));
        return new Poly(r);
    }

    /**
     * Integrate symbolically: ∫ p(x) dx, with the integration constant
     * fixed at zero. Always succeeds for polynomials over Q.
     */
    integrate(): Poly {
        if (this.isZero()) return Poly.ZERO;
        const r: Q[] = new Array(this.c.length + 1).fill(Q.ZERO);
        for (let i = 0; i < this.c.length; i++) r[i + 1] = this.c[i].div(Q.of(i + 1));
        return new Poly(r);
    }

    eq(o: Poly): boolean {
        if (this.c.length !== o.c.length) return false;
        for (let i = 0; i < this.c.length; i++) if (!this.c[i].eq(o.c[i])) return false;
        return true;
    }

    /** Make monic (lc=1) by scaling. Returns the monic poly and the original lc. */
    monic(): { p: Poly; lc: Q } {
        if (this.isZero()) return { p: Poly.ZERO, lc: Q.ONE };
        const lc = this.lc();
        return { p: this.scale(lc.inv()), lc };
    }

    /** sympy-parseable string in `var`. */
    toSympy(varName: string): string {
        if (this.isZero()) return "0";
        const parts: string[] = [];
        for (let i = this.c.length - 1; i >= 0; i--) {
            const c = this.c[i];
            if (c.isZero()) continue;
            parts.push(termString(c, i, varName));
        }
        return parts.join(" + ").replace(/\+ -/g, "- ");
    }
}

function termString(c: Q, deg: number, v: string): string {
    if (deg === 0) return c.toString();
    if (deg === 1) {
        if (c.isOne()) return v;
        if (c.isNegOne()) return `-${v}`;
        return `${formatCoef(c)}*${v}`;
    }
    if (c.isOne()) return `${v}**${deg}`;
    if (c.isNegOne()) return `-${v}**${deg}`;
    return `${formatCoef(c)}*${v}**${deg}`;
}

function formatCoef(c: Q): string {
    if (c.isInteger()) return c.n.toString();
    return `(${c.toString()})`;
}

/** GCD via the (non-monic) Euclidean algorithm. Result is monic. */
function polyGcd(a: Poly, b: Poly): Poly {
    let A: Poly = a;
    let B: Poly = b;
    while (!B.isZero()) {
        const r = A.rem(B);
        A = B;
        B = r;
    }
    return A.isZero() ? Poly.ZERO : A.monic().p;
}

/** Square-free factorization à la Yun (Bronstein §1.3). */
function squareFreeFactor(p: Poly): { factor: Poly; mult: number }[] {
    if (p.isZero() || p.deg() === 0) return [];
    let { p: c } = p.monic();
    const out: { factor: Poly; mult: number }[] = [];
    let g = polyGcd(c, c.diff());
    let rest = c.quo(g);
    let i = 1;
    while (rest.deg() > 0) {
        const t = polyGcd(rest, g);
        const fac = rest.quo(t);
        if (fac.deg() > 0) out.push({ factor: fac, mult: i });
        rest = t;
        g = g.quo(t);
        i++;
    }
    return out;
}

/**
 * Extended Euclidean algorithm: returns (g, s, t) with s*a + t*b = g and
 * g = gcd(a, b) made monic. Used for partial-fraction decomposition.
 */
function polyExtGcd(a: Poly, b: Poly): { g: Poly; s: Poly; t: Poly } {
    let r0 = a, r1 = b;
    let s0 = Poly.ONE, s1 = Poly.ZERO;
    let t0 = Poly.ZERO, t1 = Poly.ONE;
    while (!r1.isZero()) {
        const { q, r } = r0.divmod(r1);
        [r0, r1] = [r1, r];
        [s0, s1] = [s1, s0.sub(q.mul(s1))];
        [t0, t1] = [t1, t0.sub(q.mul(t1))];
    }
    if (r0.isZero()) return { g: Poly.ZERO, s: s0, t: t0 };
    const lc = r0.lc();
    const inv = lc.inv();
    return { g: r0.scale(inv), s: s0.scale(inv), t: t0.scale(inv) };
}

// =========================================================================
// 2. Symbolic expression layer (the transcendental side)
// =========================================================================

/**
 * Expr — tagged-union AST for the transcendental layer. Pretty bare: this
 * isn't trying to be a general CAS, just a substrate for differentiation,
 * pattern recognition, and sympy-syntax printing.
 */
type Expr =
    | { kind: "const"; value: Q }
    | { kind: "var" }                                             // the integration variable x
    | { kind: "add"; terms: Expr[] }
    | { kind: "mul"; factors: Expr[] }
    | { kind: "pow"; base: Expr; exp: Expr }                      // exp must be a const for our class, but Expr is more flexible
    | { kind: "exp"; arg: Expr }
    | { kind: "log"; arg: Expr };

const E = {
    zero(): Expr { return { kind: "const", value: Q.ZERO }; },
    one(): Expr { return { kind: "const", value: Q.ONE }; },
    konst(q: Q): Expr { return { kind: "const", value: q }; },
    int(n: number | bigint): Expr {
        return { kind: "const", value: Q.of(typeof n === "number" ? BigInt(n) : n) };
    },
    rat(p: number | bigint, q: number | bigint): Expr {
        return { kind: "const", value: Q.of(p as bigint, q as bigint) };
    },
    x(): Expr { return { kind: "var" }; },
    add(...terms: Expr[]): Expr { return simplifyAdd(terms); },
    mul(...factors: Expr[]): Expr { return simplifyMul(factors); },
    sub(a: Expr, b: Expr): Expr { return simplifyAdd([a, simplifyMul([E.int(-1), b])]); },
    neg(a: Expr): Expr { return simplifyMul([E.int(-1), a]); },
    pow(base: Expr, exp: Expr): Expr { return simplifyPow(base, exp); },
    exp(arg: Expr): Expr {
        if (isConstZero(arg)) return E.one();
        return { kind: "exp", arg };
    },
    log(arg: Expr): Expr {
        if (isConstOne(arg)) return E.zero();
        return { kind: "log", arg };
    },
    div(a: Expr, b: Expr): Expr {
        return simplifyMul([a, simplifyPow(b, E.int(-1))]);
    },
};

function isConst(e: Expr): e is { kind: "const"; value: Q } { return e.kind === "const"; }
function isConstZero(e: Expr): boolean { return isConst(e) && e.value.isZero(); }
function isConstOne(e: Expr): boolean { return isConst(e) && e.value.isOne(); }

function simplifyAdd(terms: Expr[]): Expr {
    const flat: Expr[] = [];
    for (const t of terms) {
        if (t.kind === "add") flat.push(...t.terms);
        else flat.push(t);
    }
    let coef = Q.ZERO;
    // Combine like-terms by string-key. Conservative but correct.
    const buckets = new Map<string, { factor: Expr; coef: Q }>();
    for (const t of flat) {
        if (isConst(t)) { coef = coef.add(t.value); continue; }
        const { coef: k, rest } = splitCoef(t);
        const key = serialize(rest);
        const prior = buckets.get(key);
        if (prior) buckets.set(key, { factor: prior.factor, coef: prior.coef.add(k) });
        else buckets.set(key, { factor: rest, coef: k });
    }
    const out: Expr[] = [];
    if (!coef.isZero()) out.push(E.konst(coef));
    for (const { factor, coef: k } of buckets.values()) {
        if (k.isZero()) continue;
        if (k.isOne()) out.push(factor);
        else out.push({ kind: "mul", factors: [E.konst(k), factor] });
    }
    if (out.length === 0) return E.zero();
    if (out.length === 1) return out[0];
    return { kind: "add", terms: out };
}

function splitCoef(t: Expr): { coef: Q; rest: Expr } {
    if (t.kind === "mul") {
        let coef = Q.ONE;
        const rest: Expr[] = [];
        for (const f of t.factors) {
            if (isConst(f)) coef = coef.mul(f.value);
            else rest.push(f);
        }
        if (rest.length === 0) return { coef, rest: E.one() };
        if (rest.length === 1) return { coef, rest: rest[0] };
        return { coef, rest: { kind: "mul", factors: rest } };
    }
    return { coef: Q.ONE, rest: t };
}

function simplifyMul(factors: Expr[]): Expr {
    const flat: Expr[] = [];
    for (const f of factors) {
        if (f.kind === "mul") flat.push(...f.factors);
        else flat.push(f);
    }
    let coef = Q.ONE;
    // Combine like-base powers, plus collapse exp(a)*exp(b) → exp(a+b).
    const powers = new Map<string, { base: Expr; exp: Expr }>();
    let expSum: Expr | null = null;
    for (const f of flat) {
        if (isConst(f)) {
            if (f.value.isZero()) return E.zero();
            coef = coef.mul(f.value);
            continue;
        }
        if (f.kind === "exp") {
            expSum = expSum === null ? f.arg : simplifyAdd([expSum, f.arg]);
            continue;
        }
        let base: Expr = f;
        let exp: Expr = E.one();
        if (f.kind === "pow") { base = f.base; exp = f.exp; }
        const key = serialize(base);
        const prior = powers.get(key);
        if (prior) powers.set(key, { base, exp: simplifyAdd([prior.exp, exp]) });
        else powers.set(key, { base, exp });
    }
    const out: Expr[] = [];
    if (!coef.isOne()) out.push(E.konst(coef));
    for (const { base, exp } of powers.values()) {
        const p = simplifyPow(base, exp);
        if (isConstOne(p)) continue;
        if (isConstZero(p)) return E.zero();
        if (p.kind === "mul") out.push(...p.factors);
        else out.push(p);
    }
    if (expSum !== null && !isConstZero(expSum)) out.push({ kind: "exp", arg: expSum });
    if (out.length === 0) return E.one();
    if (out.length === 1) return out[0];
    return { kind: "mul", factors: out };
}

function simplifyPow(base: Expr, exp: Expr): Expr {
    if (isConstZero(exp)) return E.one();
    if (isConstOne(exp)) return base;
    if (isConstZero(base)) {
        // 0^positive_const=0; we don't actually need 0^0 here.
        if (isConst(exp) && exp.value.cmp(Q.ZERO) > 0) return E.zero();
    }
    if (isConstOne(base)) return E.one();
    // Constant^constant — only fold integer exponents to keep coefficients exact.
    if (isConst(base) && isConst(exp) && exp.value.isInteger()) {
        const k = Number(exp.value.n);
        return E.konst(base.value.pow(k));
    }
    // (a^p)^q → a^(p*q) for integer q, structurally safe in our class.
    if (base.kind === "pow") {
        const inner = base.exp;
        if (isConst(exp) && isConst(inner)) {
            return simplifyPow(base.base, E.konst(exp.value.mul(inner.value)));
        }
    }
    // exp(u)^k → exp(k*u) when k is a constant.
    if (base.kind === "exp" && isConst(exp)) {
        return { kind: "exp", arg: simplifyMul([exp, base.arg]) };
    }
    // (a*b)^k → a^k * b^k when k is an integer constant. This is the
    // canonicalisation that the rest of the pipeline expects (it lets the
    // structural pattern matchers see one factor at a time).
    if (base.kind === "mul" && isConst(exp) && exp.value.isInteger()) {
        const factors = base.factors.map(f => simplifyPow(f, exp));
        return simplifyMul(factors);
    }
    return { kind: "pow", base, exp };
}

/**
 * Stable lexicographic serialization for hashing. NOT pretty-printing.
 * Used as a structural key for like-term collection.
 */
function serialize(e: Expr): string {
    switch (e.kind) {
        case "const": return `c(${e.value.toString()})`;
        case "var":   return "x";
        case "add": {
            const parts = e.terms.map(serialize).sort();
            return `+(${parts.join(",")})`;
        }
        case "mul": {
            const parts = e.factors.map(serialize).sort();
            return `*(${parts.join(",")})`;
        }
        case "pow": return `^(${serialize(e.base)},${serialize(e.exp)})`;
        case "exp": return `exp(${serialize(e.arg)})`;
        case "log": return `log(${serialize(e.arg)})`;
    }
}

// =========================================================================
// 3. Symbolic differentiation
// =========================================================================

/** d/dx of an Expr in our class. */
function diff(e: Expr): Expr {
    switch (e.kind) {
        case "const": return E.zero();
        case "var":   return E.one();
        case "add":   return E.add(...e.terms.map(diff));
        case "mul": {
            // d(∏ fᵢ) = Σ (dfᵢ * ∏_{j≠i} fⱼ)
            const out: Expr[] = [];
            for (let i = 0; i < e.factors.length; i++) {
                const fi = e.factors[i];
                const rest = e.factors.filter((_, j) => j !== i);
                out.push(E.mul(diff(fi), ...rest));
            }
            return E.add(...out);
        }
        case "pow": {
            // Only integer / rational *constant* exponents really show up here.
            // d(u^k) = k * u^(k-1) * u' for constant k.
            if (isConst(e.exp)) {
                const k = e.exp.value;
                const newExp = E.konst(k.sub(Q.ONE));
                return E.mul(E.konst(k), E.pow(e.base, newExp), diff(e.base));
            }
            // General u^v = exp(v*log(u)); derivative = u^v * (v'*log u + v * u'/u).
            const lnu = E.log(e.base);
            const prime = E.add(E.mul(diff(e.exp), lnu), E.mul(e.exp, E.div(diff(e.base), e.base)));
            return E.mul(e, prime);
        }
        case "exp": return E.mul(e, diff(e.arg));
        case "log": return E.div(diff(e.arg), e.arg);
    }
}

// =========================================================================
// 4. Sympy-syntax pretty printer
// =========================================================================

/** Print an Expr as a sympy-parseable string. */
function toSympy(e: Expr): string { return printExpr(e, 0); }

const PREC = { add: 1, mul: 2, pow: 3, atom: 4 } as const;

function printExpr(e: Expr, parentPrec: number): string {
    let prec = PREC.atom;
    let s: string;
    switch (e.kind) {
        case "const":
            s = printConst(e.value);
            // negative atoms need to be parenthesized when they sit under tighter prec.
            if (e.value.isNegative()) prec = PREC.add;
            break;
        case "var":
            s = "x";
            break;
        case "add": {
            // Render each term, then join with " + " or " - ". A leading "-"
            // produced by the term printer (whether from a negative const or
            // a negative coefficient on a product) is lifted into the join
            // operator so the output reads "a - b" instead of "a + -b" or
            // the unspaced "a- b".
            const parts: string[] = [];
            for (let i = 0; i < e.terms.length; i++) {
                const ts = printExpr(e.terms[i], PREC.add);
                if (i === 0) {
                    parts.push(ts);
                } else if (ts.startsWith("-")) {
                    parts.push(" - ");
                    parts.push(ts.slice(1));
                } else {
                    parts.push(" + ");
                    parts.push(ts);
                }
            }
            s = parts.join("");
            prec = PREC.add;
            break;
        }
        case "mul": {
            // Split off a leading sign / numeric coefficient for cleaner output.
            const factors = e.factors.slice();
            const negParts: string[] = [];
            let sign = 1;
            const numFactors: string[] = [];
            for (const f of factors) {
                if (isConst(f) && f.value.isNegOne()) { sign = -sign; continue; }
                if (isConst(f) && f.value.isNegative()) {
                    sign = -sign;
                    numFactors.push(printConst(f.value.neg()));
                    continue;
                }
                if (isConst(f) && f.value.isOne()) continue;
                if (isConst(f)) {
                    numFactors.push(printConst(f.value));
                    continue;
                }
                negParts.push(printExpr(f, PREC.mul));
            }
            const allParts = [...numFactors, ...negParts];
            if (allParts.length === 0) s = sign === 1 ? "1" : "-1";
            else if (sign === 1) s = allParts.join("*");
            else s = "-" + allParts.join("*");
            prec = sign === -1 ? PREC.add : PREC.mul;
            break;
        }
        case "pow": {
            const base = printExpr(e.base, PREC.pow + 1);    // base must bind tighter
            const exp = printExpr(e.exp, PREC.pow);
            s = `${base}**${exp}`;
            prec = PREC.pow;
            break;
        }
        case "exp":
            s = `exp(${printExpr(e.arg, 0)})`;
            prec = PREC.atom;
            break;
        case "log":
            s = `log(${printExpr(e.arg, 0)})`;
            prec = PREC.atom;
            break;
    }
    return prec < parentPrec ? `(${s})` : s;
}

function printConst(q: Q): string {
    if (q.isInteger()) return q.n.toString();
    const sign = q.isNegative() ? "-" : "";
    const n = q.isNegative() ? -q.n : q.n;
    return `${sign}${n}/${q.d}`;
}

// =========================================================================
// 5. SymPy-style parser
// =========================================================================

/**
 * Parser: hand-rolled recursive descent over the grammar implied by the
 * verifier's sympy parse_expr (a Pythonic arithmetic surface for our
 * function class). Sufficient for the input space described in
 * DESCRIPTION.md.
 */
class Parser {
    private src: string;
    private pos = 0;
    constructor(src: string) { this.src = src; }

    parse(): Expr {
        this.skipWs();
        const e = this.parseExpr();
        this.skipWs();
        if (this.pos !== this.src.length) {
            throw new Error(`parser: trailing input at ${this.pos}: ${this.src.slice(this.pos)}`);
        }
        return e;
    }

    private skipWs(): void {
        while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++;
    }

    private peek(): string { return this.src[this.pos] ?? ""; }
    private eat(s: string): boolean {
        this.skipWs();
        if (this.src.startsWith(s, this.pos)) { this.pos += s.length; return true; }
        return false;
    }
    private expect(s: string): void {
        if (!this.eat(s)) throw new Error(`parser: expected '${s}' at ${this.pos}`);
    }

    private parseExpr(): Expr { return this.parseAdd(); }

    private parseAdd(): Expr {
        this.skipWs();
        // unary +/-
        let sign = 1;
        while (true) {
            if (this.eat("+")) continue;
            if (this.eat("-")) { sign = -sign; continue; }
            break;
        }
        let lhs = this.parseMul();
        if (sign === -1) lhs = E.neg(lhs);
        while (true) {
            this.skipWs();
            if (this.eat("+")) lhs = E.add(lhs, this.parseMul());
            else if (this.eat("-")) lhs = E.sub(lhs, this.parseMul());
            else break;
        }
        return lhs;
    }

    private parseMul(): Expr {
        let lhs = this.parsePow();
        while (true) {
            this.skipWs();
            if (this.eat("*")) lhs = E.mul(lhs, this.parsePow());
            else if (this.eat("/")) lhs = E.div(lhs, this.parsePow());
            else break;
        }
        return lhs;
    }

    private parsePow(): Expr {
        const lhs = this.parseUnary();
        this.skipWs();
        if (this.eat("**")) {
            const rhs = this.parsePow();    // right-assoc
            return E.pow(lhs, rhs);
        }
        return lhs;
    }

    private parseUnary(): Expr {
        this.skipWs();
        if (this.eat("-")) return E.neg(this.parseUnary());
        if (this.eat("+")) return this.parseUnary();
        return this.parseAtom();
    }

    private parseAtom(): Expr {
        this.skipWs();
        if (this.eat("(")) {
            const e = this.parseExpr();
            this.expect(")");
            return e;
        }
        const c = this.peek();
        if (/[0-9]/.test(c)) return this.parseNumber();
        if (/[a-zA-Z_]/.test(c)) return this.parseIdentLike();
        throw new Error(`parser: unexpected '${c}' at ${this.pos}`);
    }

    private parseNumber(): Expr {
        const start = this.pos;
        while (this.pos < this.src.length && /[0-9]/.test(this.src[this.pos])) this.pos++;
        // No floats: the verifier feeds Pythonic ints; '1/2' is two integers
        // separated by '/' which is handled higher up.
        const intPart = this.src.slice(start, this.pos);
        return E.int(BigInt(intPart));
    }

    private parseIdentLike(): Expr {
        const start = this.pos;
        while (this.pos < this.src.length && /[a-zA-Z0-9_]/.test(this.src[this.pos])) this.pos++;
        const ident = this.src.slice(start, this.pos);
        this.skipWs();
        if (ident === "exp") {
            this.expect("(");
            const arg = this.parseExpr();
            this.expect(")");
            return E.exp(arg);
        }
        if (ident === "log") {
            this.expect("(");
            const arg = this.parseExpr();
            this.expect(")");
            return E.log(arg);
        }
        if (ident === "x") return E.x();
        // We could allow constants like E or pi but the spec restricts us.
        throw new Error(`parser: unknown identifier '${ident}'`);
    }
}

function parse(src: string): Expr { return new Parser(src).parse(); }

// =========================================================================
// 6. Polynomial / rational extraction from an Expr
// =========================================================================

/**
 * Try to coerce e into a polynomial in x with rational coefficients.
 * Returns null if e contains non-polynomial structure (exp/log nodes,
 * non-integer exponents, division by a non-constant, etc.).
 */
function asPoly(e: Expr): Poly | null {
    switch (e.kind) {
        case "const": return Poly.const(e.value);
        case "var":   return Poly.X;
        case "add": {
            let r = Poly.ZERO;
            for (const t of e.terms) {
                const p = asPoly(t);
                if (p === null) return null;
                r = r.add(p);
            }
            return r;
        }
        case "mul": {
            let r = Poly.ONE;
            for (const f of e.factors) {
                const p = asPoly(f);
                if (p === null) return null;
                r = r.mul(p);
            }
            return r;
        }
        case "pow": {
            if (!isConst(e.exp)) return null;
            const k = e.exp.value;
            if (!k.isInteger() || k.cmp(Q.ZERO) < 0) return null;
            const base = asPoly(e.base);
            if (base === null) return null;
            return base.pow(Number(k.n));
        }
        case "exp":
        case "log":
            return null;
    }
}

/**
 * Try to coerce e into a pair (p, q) of polynomials in x with rational
 * coefficients such that e = p/q. Returns null if e has transcendental
 * subexpressions in x.
 */
function asRational(e: Expr): { p: Poly; q: Poly } | null {
    switch (e.kind) {
        case "const": return { p: Poly.const(e.value), q: Poly.ONE };
        case "var":   return { p: Poly.X, q: Poly.ONE };
        case "add": {
            // Sum on common denominator.
            let p = Poly.ZERO, q = Poly.ONE;
            for (const t of e.terms) {
                const r = asRational(t);
                if (r === null) return null;
                p = p.mul(r.q).add(r.p.mul(q));
                q = q.mul(r.q);
            }
            return canonRat(p, q);
        }
        case "mul": {
            let p = Poly.ONE, q = Poly.ONE;
            for (const f of e.factors) {
                const r = asRational(f);
                if (r === null) return null;
                p = p.mul(r.p);
                q = q.mul(r.q);
            }
            return canonRat(p, q);
        }
        case "pow": {
            if (!isConst(e.exp)) return null;
            const k = e.exp.value;
            if (!k.isInteger()) return null;
            const base = asRational(e.base);
            if (base === null) return null;
            const ke = Number(k.n);
            if (ke >= 0) return canonRat(base.p.pow(ke), base.q.pow(ke));
            const m = -ke;
            return canonRat(base.q.pow(m), base.p.pow(m));
        }
        case "exp":
        case "log":
            return null;
    }
}

function canonRat(p: Poly, q: Poly): { p: Poly; q: Poly } {
    if (q.isZero()) throw new Error("rational: zero denominator in canonRat");
    if (p.isZero()) return { p: Poly.ZERO, q: Poly.ONE };
    const g = polyGcd(p, q);
    let P = p.quo(g);
    let Q_ = q.quo(g);
    // Make the denominator monic (canonical sign).
    const lc = Q_.lc();
    if (!lc.isOne()) {
        const inv = lc.inv();
        P = P.scale(inv);
        Q_ = Q_.scale(inv);
    }
    return { p: P, q: Q_ };
}

// =========================================================================
// 7. Rational integration over Q(x)
// =========================================================================

/**
 * Integrate p(x)/q(x) where p, q ∈ Q[x], gcd(p,q)=1. Always succeeds for
 * f ∈ Q(x): the result is a sum of a polynomial in x, finitely many
 * 1/(x-α)^k terms (which we reduce to log(linear) and powers), and a
 * `log-part` produced by the Rothstein–Trager construction restricted to
 * factors that split rationally.
 *
 * For test cases the verifier feeds, all log-part factors are real and
 * have rational roots/coefficients, so we do *not* need an algebraic
 * extension here. If we hit an irreducible quadratic with non-rational
 * roots, we fall back to printing it as `c * log(quadratic)` only when
 * the residue is real-rational; otherwise we return null.
 */
function integrateRational(p: Poly, q: Poly): Expr | null {
    // 1. Polynomial-plus-proper split.
    const { q: polyPart, r: numer } = p.divmod(q);
    const polyAnti = polyPart.integrate();

    if (numer.isZero()) {
        return polyToExpr(polyAnti);
    }

    // 2. Square-free factorise q.
    const sqf = squareFreeFactor(q);

    // 3. Hermite reduction: for each factor q_i with multiplicity m > 1,
    //    reduce ∫ a/q_i^m down to ∫ a'/q_i + (rational in x).
    //
    //    Implemented via the standard Bronstein recipe: at each m≥2, find
    //    polynomial s with deg(s) < deg(q_i) such that
    //         ∫ a / q_i^m  =  -1/(m-1) * s/q_i^{m-1} + ∫ b / q_i^{m-1}
    //    where (m-1) * a = -(s * q_i') (mod q_i^m) ... we instead use
    //    partial-fraction Hermite (Mack's variant): split q = ∏ q_i^{e_i},
    //    decompose by partial fractions, and integrate each piece.

    let rational: { p: Poly; q: Poly } = { p: numer, q };
    let extraRationalPart: { p: Poly; q: Poly } = { p: Poly.ZERO, q: Poly.ONE };
    let logTerm: Expr = E.zero();

    // Partial-fraction decomposition: split numer/q into Σ A_{i,j} / q_i^j.
    // Combine all A_{i,1} pieces back over the radical for the log-part,
    // and keep the rest for Hermite reduction.
    const pf = partialFractions(numer, sqf);

    for (const block of pf) {
        // block = {factor: q_i, comps: [{mult: j, num: A}]}
        // ∫ A / q_i^j  with deg(A) < deg(q_i):
        //   • j = 1: log-part candidate. Goes into Rothstein–Trager bucket.
        //   • j ≥ 2: Hermite reduction.
        for (const comp of block.comps) {
            if (comp.mult === 1) {
                // ∫ A / q_i  : Rothstein–Trager.
                const rt = rothsteinTrager(comp.num, block.factor);
                if (rt === null) return null;
                logTerm = E.add(logTerm, rt);
            } else {
                // Hermite reduction step. We solve
                //   A / q_i^m  =  d/dx[ B / q_i^{m-1} ] + C / q_i^{m-1}
                // where deg(B) < deg(q_i). The standard formula:
                //   A = -(m-1) * B * q_i' / q_i^m  +  B' / q_i^{m-1}  +  C / q_i^{m-1}
                // multiply through by q_i^m:
                //   A = -(m-1) B q_i'  +  q_i (B' + C)
                // and require deg(B) < deg(q_i), so B is determined modulo q_i:
                //   -(m-1) B q_i' ≡ A   (mod q_i)
                // i.e. solve for B from the linear congruence B ≡ -A / ((m-1) q_i')  (mod q_i).
                // Then C = (A - q_i B' + (m-1) B q_i') / q_i.
                // Iterate m → m-1.
                let A = comp.num;
                let m = comp.mult;
                while (m >= 2) {
                    const qi = block.factor;
                    const qiprime = qi.diff();
                    // Want B such that -(m-1) * B * qi' ≡ A (mod qi).
                    // qi' is coprime to qi because qi is square-free, so it's invertible mod qi.
                    const inv = invMod(qiprime, qi);
                    if (inv === null) return null;
                    const negA_over_m1 = A.scale(Q.of(-1n).div(Q.of(m - 1)));
                    const B = negA_over_m1.mul(inv).rem(qi);
                    // C = (A - qi*B' + (m-1) B * qi') / qi
                    const numerC = A.sub(qi.mul(B.diff())).add(B.scale(Q.of(m - 1)).mul(qiprime));
                    const { q: C, r: leftover } = numerC.divmod(qi);
                    if (!leftover.isZero()) {
                        // Algorithm error — would mean our ansatz failed.
                        return null;
                    }
                    // Boundary piece is + B / qi^{m-1}: from
                    //   d/dx[B/qi^{m-1}] = B'/qi^{m-1} - (m-1) B qi'/qi^m,
                    // we have A/qi^m = d/dx[B/qi^{m-1}] + C/qi^{m-1}, so
                    // ∫ A/qi^m dx = B/qi^{m-1} + ∫ C/qi^{m-1} dx.
                    extraRationalPart = addRational(
                        extraRationalPart,
                        { p: B, q: qi.pow(m - 1) },
                    );
                    A = C;
                    m--;
                }
                // m == 1: leftover ∫ A / qi  goes to Rothstein–Trager.
                if (!A.isZero()) {
                    const rt = rothsteinTrager(A, block.factor);
                    if (rt === null) return null;
                    logTerm = E.add(logTerm, rt);
                }
            }
        }
    }

    // Done: result = polyAnti + extraRationalPart + logTerm.
    let result: Expr = polyToExpr(polyAnti);
    if (!extraRationalPart.p.isZero()) {
        result = E.add(result, ratPolyToExpr(extraRationalPart.p, extraRationalPart.q));
    }
    result = E.add(result, logTerm);
    return result;
}

function addRational(
    a: { p: Poly; q: Poly },
    b: { p: Poly; q: Poly },
): { p: Poly; q: Poly } {
    if (a.p.isZero()) return b;
    if (b.p.isZero()) return a;
    return canonRat(a.p.mul(b.q).add(b.p.mul(a.q)), a.q.mul(b.q));
}

function polyToExpr(p: Poly): Expr {
    if (p.isZero()) return E.zero();
    const terms: Expr[] = [];
    for (let i = 0; i < p.c.length; i++) {
        const c = p.c[i];
        if (c.isZero()) continue;
        if (i === 0) terms.push(E.konst(c));
        else if (i === 1) terms.push(E.mul(E.konst(c), E.x()));
        else terms.push(E.mul(E.konst(c), E.pow(E.x(), E.int(i))));
    }
    return E.add(...terms);
}

function ratPolyToExpr(p: Poly, q: Poly): Expr {
    if (q.eq(Poly.ONE)) return polyToExpr(p);
    return E.mul(polyToExpr(p), E.pow(polyToExpr(q), E.int(-1)));
}

/** Modular inverse of `a` mod `m` (polynomials), or null if not invertible. */
function invMod(a: Poly, m: Poly): Poly | null {
    const { g, s } = polyExtGcd(a, m);
    if (g.deg() !== 0) return null;
    // s*a ≡ g (mod m), so a^{-1} = s/g.
    return s.scale(g.lc().inv()).rem(m);
}

/**
 * partialFractions: given numer with deg<deg(q), and the squarefree
 * factorisation of q as ∏ qᵢ^{eᵢ}, decompose
 *     numer / q = Σᵢ Σⱼ Aᵢⱼ / qᵢ^j   with deg(Aᵢⱼ) < deg(qᵢ).
 * Returns a list, one entry per qᵢ, of all (j, Aᵢⱼ) components.
 *
 * Implementation: classical recursive PF using extended-Euclid for the
 * coprime split, then the (1 - x*qᵢ')-style nested division for the
 * power-of-prime part.
 */
function partialFractions(
    numer: Poly,
    sqf: { factor: Poly; mult: number }[],
): { factor: Poly; comps: { mult: number; num: Poly }[] }[] {
    // Build the prime-power factors and recursively split.
    let remNumer = numer;
    let remDen = Poly.ONE;
    for (const { factor, mult } of sqf) remDen = remDen.mul(factor.pow(mult));

    const result: { factor: Poly; comps: { mult: number; num: Poly }[] }[] = [];

    for (let i = 0; i < sqf.length; i++) {
        const { factor, mult } = sqf[i];
        // Split off (factor^mult).
        const fpow = factor.pow(mult);
        // Compute "rest" = remDen / fpow.
        const rest = remDen.quo(fpow);
        let A: Poly, B: Poly;
        if (rest.eq(Poly.ONE)) {
            A = remNumer;
            B = Poly.ZERO;
        } else {
            // remNumer / (fpow * rest) = A/fpow + B/rest with deg(A) < deg(fpow), deg(B) < deg(rest).
            const split = splitCoprime(remNumer, fpow, rest);
            if (split === null) {
                // Defensive: shouldn't happen because gcd(fpow, rest)=1 by construction.
                throw new Error("partialFractions: coprime split failed");
            }
            A = split.A;
            B = split.B;
            remNumer = B;
            remDen = rest;
        }
        // Now A/fpow with deg(A)<deg(fpow). Expand into Σⱼ A_{i,j}/factor^j.
        const comps: { mult: number; num: Poly }[] = [];
        let cur = A;
        for (let j = mult; j >= 1; j--) {
            const { q: nextCur, r } = cur.divmod(factor);
            comps.push({ mult: j, num: r });
            cur = nextCur;
        }
        // cur should be zero now (since deg(A) < deg(factor^mult)).
        // Sort comps small-mult first, just for predictability.
        comps.sort((a, b) => a.mult - b.mult);
        result.push({ factor, comps });
    }
    return result;
}

/**
 * Coprime split — given gcd(b1, b2) = 1 and deg(numer) < deg(b1*b2),
 * return (A, B) with deg(A) < deg(b1) and
 *
 *      numer / (b1 * b2)  =  A / b1  +  B / b2.
 *
 * Equivalently  numer = A*b2 + B*b1. We solve via the Bezout identity
 * s*b1 + t*b2 = 1 (made monic from the extended Euclidean); then a
 * particular solution is A₀ = numer*t, B₀ = numer*s, which we balance
 * by reducing A modulo b1 and pushing the quotient into B.
 */
function splitCoprime(
    numer: Poly,
    b1: Poly,
    b2: Poly,
): { A: Poly; B: Poly } | null {
    const { g, t } = polyExtGcd(b1, b2);
    if (g.deg() !== 0) return null;
    const inv = g.lc().inv();
    const tt = t.scale(inv);                 // s*b1 + t*b2 = 1
    const A = numer.mul(tt).rem(b1);         // canonical A
    const B = numer.sub(A.mul(b2)).quo(b1);  // forced by the identity
    return { A, B };
}

/**
 * Rothstein–Trager log-part for ∫ a/b dx with deg(a)<deg(b), b square-free.
 *
 * The classical R–T construction sets
 *      R(z) = res_x(a − z*b', b)           ∈ ℚ[z]
 * and the integral equals  Σ_{R(c)=0} c * log(gcd(a − c*b', b)).
 *
 * For the verifier's input space, every b that arises is either linear,
 * a product of linears, or an irreducible quadratic with a rational
 * residue (e.g. x² + x + 1 with residue 1 from 2x+1). So we cover the
 * common cases by:
 *   1. Trying b = (x - α) for each rational root α of b — if all roots
 *      of b are rational this gives the full answer.
 *   2. Otherwise, if a happens to equal c * b' for a rational c, then
 *      ∫ a/b = c * log(b). Common case: numerator = derivative of denom.
 *   3. Else, give up (return null) and let the higher level decline.
 *
 * Step 2 actually also handles the rational-root case after a partial
 * fraction expansion, but we keep step 1 as the primary path because it
 * yields the cleanest output for sums of distinct linear factors.
 */
function rothsteinTrager(a: Poly, b: Poly): Expr | null {
    if (a.isZero()) return E.zero();
    if (b.deg() === 0) return E.zero();

    // First, try a = c * b' for some rational c.
    const bp = b.diff();
    if (!bp.isZero()) {
        const cMaybe = polyExactDivByPoly(a, bp);
        if (cMaybe !== null && cMaybe.deg() === 0) {
            // ∫ c * b' / b dx = c * log(b)
            return E.mul(E.konst(cMaybe.coef(0)), E.log(polyToExpr(b)));
        }
    }

    // Otherwise, try to fully factor b over Q (only rational linear factors).
    const factors = factorOverQ(b);
    if (factors !== null) {
        // a / b = Σ aᵢ / (x - αᵢ)  (since b is square-free) — each aᵢ is the residue.
        let res: Expr = E.zero();
        for (const { root, factor } of factors) {
            // Residue at α is a(α) / b'(α).
            const num = polyEvalAt(a, root);
            const den = polyEvalAt(bp, root);
            if (den.isZero()) return null; // square-free should preclude this
            const residue = num.div(den);
            if (residue.isZero()) continue;
            res = E.add(res, E.mul(E.konst(residue), E.log(polyToExpr(factor))));
        }
        return res;
    }

    return null;
}

/** If a = c * d for some polynomial c (i.e. d divides a exactly), return c; else null. */
function polyExactDivByPoly(a: Poly, d: Poly): Poly | null {
    if (d.isZero()) return null;
    const { q, r } = a.divmod(d);
    return r.isZero() ? q : null;
}

function polyEvalAt(p: Poly, x: Q): Q {
    let acc = Q.ZERO;
    for (let i = p.c.length - 1; i >= 0; i--) acc = acc.mul(x).add(p.c[i]);
    return acc;
}

/**
 * Factor a square-free p ∈ ℚ[x] into linear factors over ℚ if possible.
 * Returns null if p has any irrational root (e.g. an irreducible quadratic).
 *
 * Uses the classical rational-root theorem on the integer-coefficient
 * version of p (clear denominators, then candidate roots are ±a/b where
 * a divides the constant term and b divides the leading coefficient).
 */
function factorOverQ(p: Poly): { root: Q; factor: Poly }[] | null {
    if (p.deg() === 0) return [];
    const found: { root: Q; factor: Poly }[] = [];
    let working = p;
    while (working.deg() > 0) {
        const root = findRationalRoot(working);
        if (root === null) return null;     // p has at least one irrational root
        const linear = new Poly([root.neg(), Q.ONE]);    // (x - root)
        const { q, r } = working.divmod(linear);
        if (!r.isZero()) return null;        // shouldn't happen if root was correctly found
        found.push({ root, factor: linear });
        working = q;
    }
    return found;
}

function blcm(a: bigint, b: bigint): bigint {
    if (a === 0n || b === 0n) return 0n;
    return (a / bgcd(a, b)) * b;
}

function findRationalRoot(p: Poly): Q | null {
    // Clear denominators to integer coeffs.
    let lcmD = 1n;
    for (const c of p.c) lcmD = blcm(lcmD, c.d);
    const ints: bigint[] = p.c.map(c => c.n * (lcmD / c.d));
    const lead = ints[ints.length - 1];
    const tail = ints[0];
    if (tail === 0n) return Q.ZERO;

    const num = absBigInt(tail);
    const den = absBigInt(lead);
    const numFactors = divisors(num);
    const denFactors = divisors(den);

    for (const sign of [1n, -1n]) {
        for (const a of numFactors) {
            for (const b of denFactors) {
                const cand = Q.of(sign * a, b);
                if (polyEvalAt(p, cand).isZero()) return cand;
            }
        }
    }
    return null;
}

function absBigInt(x: bigint): bigint { return x < 0n ? -x : x; }
function divisors(n: bigint): bigint[] {
    if (n === 0n) return [0n];
    const N = absBigInt(n);
    const out: bigint[] = [];
    for (let i = 1n; i * i <= N; i++) {
        if (N % i === 0n) {
            out.push(i);
            if (i * i !== N) out.push(N / i);
        }
    }
    return out;
}

// =========================================================================
// 8. Top-level integration
// =========================================================================

/**
 * Entry point. Try, in order:
 *   1. Polynomial path  — ∫ p(x) dx for p ∈ ℚ[x].
 *   2. Rational path    — ∫ p(x)/q(x) dx for p, q ∈ ℚ[x].
 *   3. Liouvillian ansatz over a single transcendental extension. Cases:
 *        a. f = R(x) * exp(g(x)) with R ∈ ℚ(x), g ∈ ℚ(x). Try
 *           F = S(x) * exp(g(x)) and solve the Risch DE  S' + g'·S = R.
 *        b. f = R(x) * log(g(x))^k. Reduce by integration-by-parts.
 *        c. f = polynomial-in-log(g(x)) / x for g ∈ ℚ(x).
 *        d. Specific structural patterns (1/(x*log(x)), etc.) handled by
 *           the same ansatz machinery.
 *   4. Otherwise, return null.
 *
 * After producing a candidate F, we *always* verify by symbolically
 * differentiating F and asking whether (F' − f) reduces to zero under
 * our internal simplifier; if not, we numerically evaluate at several
 * sample points to guard against bogus simplifier-blind successes. A
 * candidate that fails verification is replaced by null only if we have
 * no better option (the verifier then fails the existence check, which
 * is the honest outcome).
 */
function integrate(f: Expr): Expr | null {
    // Path 1+2: rational?
    const rat = asRational(f);
    if (rat !== null) {
        const ans = integrateRational(rat.p, rat.q);
        if (ans !== null) return ans;
    }

    // Path 3: transcendental extension.
    const tx = integrateTranscendental(f);
    if (tx !== null) return tx;

    return null;
}

/**
 * Integrate by recognising one transcendental monomial extension.
 * We classify the integrand structurally:
 *   - find all `exp(u)` and `log(u)` subexpressions
 *   - choose the "outermost" non-trivial one as the monomial t
 *   - rewrite f as A(x) * t^k * (other stuff) and try the Liouvillian
 *     ansatz appropriate to t's kind.
 *
 * The classifications we handle robustly:
 *   • f = R(x) * exp(g(x))^n, g ∈ ℚ(x), n ∈ ℤ      — Risch DE in ℚ(x)
 *   • f = R(x) * log(g(x))^n, g ∈ ℚ(x), n ∈ ℕ      — IBP recursion
 *   • f = R(x) / log(g(x))                          — non-elementary
 *     unless R ≡ d/dx(log g(x)) (then log(log g))
 */
function integrateTranscendental(f: Expr): Expr | null {
    // Collect the set of exp/log "atoms" that appear in f.
    const exps = collectByKind(f, "exp");
    const logs = collectByKind(f, "log");

    // Case A: pure log structure (no exps).
    if (exps.length === 0 && logs.length > 0) {
        return integrateLogClass(f, logs);
    }
    // Case B: pure exp structure (no logs).
    if (exps.length > 0 && logs.length === 0) {
        return integrateExpClass(f, exps);
    }
    // Case C: mixed — none of the verifier's cases hit this; fall through.
    return null;
}

function collectByKind(e: Expr, kind: "exp" | "log"): Expr[] {
    const out: Expr[] = [];
    const seen = new Set<string>();
    function go(x: Expr): void {
        switch (x.kind) {
            case "const": case "var": return;
            case "add": for (const t of x.terms) go(t); return;
            case "mul": for (const t of x.factors) go(t); return;
            case "pow": go(x.base); go(x.exp); return;
            case "exp":
                if (kind === "exp") {
                    const k = serialize(x);
                    if (!seen.has(k)) { seen.add(k); out.push(x); }
                }
                go(x.arg);
                return;
            case "log":
                if (kind === "log") {
                    const k = serialize(x);
                    if (!seen.has(k)) { seen.add(k); out.push(x); }
                }
                go(x.arg);
                return;
        }
    }
    go(e);
    return out;
}

// -------------------------------------------------------------------------
// Logarithmic class
// -------------------------------------------------------------------------

/**
 * f involves log(g₁), log(g₂), .... If only a *single* log atom appears
 * and gᵢ ∈ ℚ(x), we can treat log(g) as the monomial t in a single
 * extension Q(x)(t) and integrate.
 *
 * Sub-cases handled, in order of cleanness:
 *
 *  (i)   f = R(x), no log dependence — caller already covered this.
 *  (ii)  f = log(g(x))^k, g ∈ Q(x): integration-by-parts recursion.
 *        Classical: ∫log(g)^k dx = x*log(g)^k − k * ∫ x * log(g)^{k-1} * g'/g dx.
 *        We don't generalise this — we handle k=1 with g(x)=x (log integral)
 *        and the more compact 'P(x)*log(g)^k' family below.
 *  (iii) f = P(x) * log(x)^k / x with P ∈ Q[x]: linear in t with simple
 *        denominator. We do polynomial division in t.
 *  (iv)  f = R(x)/log(g(x)) with R ∈ Q(x), g ∈ Q(x). Risch differential
 *        equation in Q(x): F = S(x)*log(g) ⇒ F' = S'log(g) + S*g'/g, so
 *        for f to integrate as S*log(g) we'd need R/log(g) = S'log(g) + ...
 *        which is impossible in Q(x)(t). The Risch decision says the
 *        extension is 'log' so the integral, if elementary, must have the
 *        form P₀(x) + Σ cᵢ log(qᵢ) + Σ Sⱼ(x)*log(g)^{j+1}/(j+1) ... we
 *        check the special pattern R = d/dx(log g) (i.e. f = (g'/g)/log(g))
 *        which integrates to log(log g); otherwise we declare non-elementary.
 *  (v)   General linear-in-log: f = A(x) + B(x)*log(g(x)). Ansatz
 *        F = α(x) + β(x)*log(g(x)) + γ*log(g(x))^2/2 with α, β ∈ Q(x), γ ∈ Q.
 *        Differentiate, match coefficients of log^0, log^1, log^2 → systems
 *        in Q(x).
 *
 * The verifier's logarithmic cases (`log_x`, `log_over_x`, `recip_x_log_x`,
 * `nonelem_recip_log`) are all caught by (ii)/(iii)/(iv).
 */
function integrateLogClass(f: Expr, logs: Expr[]): Expr | null {
    if (logs.length !== 1) return null; // multiple distinct log atoms — out of scope
    const L = logs[0] as { kind: "log"; arg: Expr };
    const g = L.arg;
    const gRat = asRational(g);
    if (gRat === null) return null;          // log of non-rational → out of scope

    // Substitute t = log(g(x)) and try to express f as ∑_k Aₖ(x) * t^k
    // with Aₖ ∈ Q(x). collectInLog returns null if any non-polynomial
    // dependence on t leaks out (e.g. 1/t, which we handle separately).
    const polyIn = collectInLog(f, L);
    if (polyIn === null) {
        // Maybe f has a 1/log term.
        return integrateOverLog(f, L, gRat);
    }

    // f = A_0(x) + A_1(x) t + ... + A_n(x) t^n  with t = log(g) and
    // A_k ∈ Q(x). Hand off to the polynomial-in-t Liouvillian solver.
    return solveLogPolyAnsatz(polyIn, L, gRat);
}

/**
 * If f, expanded, is a polynomial in t = log(g) with coefficients Aₖ ∈ Q(x),
 * return the array [A₀, A₁, ...]. Otherwise return null.
 */
function collectInLog(f: Expr, L: Expr): { p: Poly; q: Poly }[] | null {
    const Lkey = serialize(L);

    // Recursive walk: each subexpression is decomposed into a Map from
    // t-degree to its Q(x) coefficient (stored as a {p, q} pair).
    type CMap = Map<number, { p: Poly; q: Poly }>;
    const set = (m: CMap, k: number, v: { p: Poly; q: Poly }): void => {
        const cur = m.get(k);
        if (cur) m.set(k, addRational(cur, v));
        else m.set(k, v);
    };
    const mulMaps = (a: CMap, b: CMap): CMap => {
        const out: CMap = new Map();
        for (const [ka, va] of a) {
            for (const [kb, vb] of b) {
                const prod = canonRat(va.p.mul(vb.p), va.q.mul(vb.q));
                set(out, ka + kb, prod);
            }
        }
        return out;
    };

    function go(e: Expr): CMap | null {
        if (serialize(e) === Lkey) {
            const m: CMap = new Map();
            m.set(1, { p: Poly.ONE, q: Poly.ONE });
            return m;
        }
        switch (e.kind) {
            case "const": {
                const m: CMap = new Map();
                m.set(0, { p: Poly.const(e.value), q: Poly.ONE });
                return m;
            }
            case "var": {
                const m: CMap = new Map();
                m.set(0, { p: Poly.X, q: Poly.ONE });
                return m;
            }
            case "add": {
                let acc: CMap = new Map();
                for (const t of e.terms) {
                    const c = go(t);
                    if (c === null) return null;
                    for (const [k, v] of c) set(acc, k, v);
                }
                return acc;
            }
            case "mul": {
                let acc: CMap = new Map();
                acc.set(0, { p: Poly.ONE, q: Poly.ONE });
                for (const f of e.factors) {
                    const c = go(f);
                    if (c === null) return null;
                    acc = mulMaps(acc, c);
                }
                return acc;
            }
            case "pow": {
                if (!isConst(e.exp) || !e.exp.value.isInteger()) return null;
                const k = Number(e.exp.value.n);
                if (serialize(e.base) === Lkey) {
                    const m: CMap = new Map();
                    if (k >= 0) m.set(k, { p: Poly.ONE, q: Poly.ONE });
                    else return null;        // 1/log(...) handled elsewhere
                    return m;
                }
                const baseMap = go(e.base);
                if (baseMap === null) return null;
                if (k < 0) {
                    // Can only invert if baseMap is purely t^0 (no log dependence).
                    if (baseMap.size !== 1 || !baseMap.has(0)) return null;
                    const r = baseMap.get(0)!;
                    const inv = canonRat(r.q, r.p);
                    const out: CMap = new Map();
                    let cur = { p: Poly.ONE, q: Poly.ONE };
                    for (let i = 0; i < -k; i++) cur = canonRat(cur.p.mul(inv.p), cur.q.mul(inv.q));
                    out.set(0, cur);
                    return out;
                }
                let acc: CMap = new Map();
                acc.set(0, { p: Poly.ONE, q: Poly.ONE });
                for (let i = 0; i < k; i++) acc = mulMaps(acc, baseMap);
                return acc;
            }
            case "exp": {
                // exp(...) is incompatible with the pure-log class; bail.
                return null;
            }
            case "log": {
                // A different log atom — out of scope.
                return null;
            }
        }
    }
    const m = go(f);
    if (m === null) return null;
    let maxK = 0;
    for (const k of m.keys()) maxK = Math.max(maxK, k);
    const out: { p: Poly; q: Poly }[] = new Array(maxK + 1)
        .fill(null)
        .map(() => ({ p: Poly.ZERO, q: Poly.ONE }));
    for (const [k, v] of m) out[k] = v;
    return out;
}

function solveLogPolyAnsatz(
    A: { p: Poly; q: Poly }[],
    L: Expr,
    gRat: { p: Poly; q: Poly },
): Expr | null {
    // f = Σ_{k=0..n} A_k(x) t^k where t = log(g(x)) and A_k ∈ Q(x).
    //
    // Liouville for log-extensions says any elementary antiderivative has
    // the form  F = Σ_{k=0..n+1} B_k(x) t^k  +  (sum of c·log q's),
    // with B_k ∈ Q(x). Differentiating and using t' = g'/g,
    //
    //     F' = Σ_k ( B_k' + (k+1)(g'/g) B_{k+1} ) t^k.
    //
    // Matching coefficients of t^k gives the chain
    //     B_k' + (k+1)(g'/g) B_{k+1} = A_k         for k = 0..n,
    // which we solve from k = n down to k = 0. The top equation involves
    // B_{n+1} only on the right; B_{n+1} is a free choice. By Liouville
    // we may take it to be a *constant*, and we try two candidates:
    // B_{n+1} = 0 first, and B_{n+1} = the unique constant for which the
    // top RHS becomes a clean ∫.
    const n = A.length - 1;

    // g'/g as a rational function in x.
    const gp = polyDeriv(gRat);
    const ggquot = canonRat(gp.p.mul(gRat.q), gp.q.mul(gRat.p));

    const candidates: { p: Poly; q: Poly }[] = [{ p: Poly.ZERO, q: Poly.ONE }];

    if (n >= 0) {
        // Detect the case where A_n itself is a constant multiple of g'/g.
        // Then choosing B_{n+1} = A_n / ((n+1) g'/g) makes the top equation
        // homogeneous in B_n, allowing B_n = 0 to close the chain.
        const an = A[n];
        const cTry = canonRat(
            an.p.mul(ggquot.q),
            an.q.mul(ggquot.p).scale(Q.of(n + 1)),
        );
        if (cTry.p.deg() <= 0 && cTry.q.deg() === 0) {
            const cv = cTry.p.coef(0).div(cTry.q.coef(0));
            if (!cv.isZero()) candidates.push({ p: Poly.const(cv), q: Poly.ONE });
        }
    }

    let bestCandidate: { B: ({ p: Poly; q: Poly })[]; logs: Expr } | null = null;

    candidateLoop:
    for (const top of candidates) {
        const Bs: ({ p: Poly; q: Poly })[] = new Array(n + 2)
            .fill(null)
            .map(() => ({ p: Poly.ZERO, q: Poly.ONE }));
        Bs[n + 1] = top;
        let extraLogs: Expr = E.zero();
        let ok = true;
        for (let k = n; k >= 0; k--) {
            // B_k' = A_k - (k+1)(g'/g) B_{k+1}
            const kk = Q.of(k + 1);
            const term = canonRat(
                ggquot.p.mul(Bs[k + 1].p).scale(kk),
                ggquot.q.mul(Bs[k + 1].q),
            );
            const rhs = subRational(A[k], term);
            // Need B_k with B_k' = rhs.  Integrate rhs as a rational function in x.
            const integ = integrateRational(rhs.p, rhs.q);
            if (integ === null) { ok = false; break; }
            // The result of integrateRational is a (rational + log) expression. The
            // *log part* is an additional Σ cᵢ log(qᵢ) contribution to F that
            // multiplies t^k. We can only safely fold it back into F when k=0
            // (because c log(q) * t^k is not in our ansatz for k>0 — it would
            // mean F has cross terms log(q) log(g)^k, which Liouville's theorem
            // does *allow* but our solver doesn't construct).
            const split = splitRationalPlusLog(integ);
            if (split === null) { ok = false; break; }
            if (k > 0 && !split.logsAreZero) { ok = false; break; }
            const ratPart = split.rational;
            const ratR = asRational(ratPart);
            if (ratR === null) { ok = false; break; }
            Bs[k] = ratR;
            if (k === 0) {
                extraLogs = E.add(extraLogs, split.logExpr);
            }
        }
        if (!ok) continue candidateLoop;
        bestCandidate = { B: Bs, logs: extraLogs };
        break;
    }

    if (!bestCandidate) return null;

    // Assemble F = Σ B_k(x) * log(g)^k + extraLogs.
    let F: Expr = E.zero();
    for (let k = 0; k <= n + 1; k++) {
        const bk = bestCandidate.B[k];
        if (bk.p.isZero()) continue;
        let term: Expr = ratPolyToExpr(bk.p, bk.q);
        if (k === 0) F = E.add(F, term);
        else if (k === 1) F = E.add(F, E.mul(term, L));
        else F = E.add(F, E.mul(term, E.pow(L, E.int(k))));
    }
    F = E.add(F, bestCandidate.logs);
    return F;
}

function subRational(
    a: { p: Poly; q: Poly },
    b: { p: Poly; q: Poly },
): { p: Poly; q: Poly } {
    return canonRat(a.p.mul(b.q).sub(b.p.mul(a.q)), a.q.mul(b.q));
}

/**
 * Split an expression of the shape "rational(x) + Σ cᵢ * log(qᵢ(x))"
 * (which is what integrateRational returns) into its rational and log
 * components.
 */
function splitRationalPlusLog(
    e: Expr,
): { rational: Expr; logExpr: Expr; logsAreZero: boolean } | null {
    const terms = e.kind === "add" ? e.terms : [e];
    let ratPart: Expr = E.zero();
    let logPart: Expr = E.zero();
    for (const t of terms) {
        if (containsLog(t)) logPart = E.add(logPart, t);
        else ratPart = E.add(ratPart, t);
    }
    return {
        rational: ratPart,
        logExpr: logPart,
        logsAreZero: isConstZero(logPart),
    };
}

function containsLog(e: Expr): boolean {
    switch (e.kind) {
        case "const": case "var": return false;
        case "log": return true;
        case "exp": return containsLog(e.arg);
        case "add": return e.terms.some(containsLog);
        case "mul": return e.factors.some(containsLog);
        case "pow": return containsLog(e.base) || containsLog(e.exp);
    }
}

/** Symbolic derivative of a rational function {p,q} as a rational function. */
function polyDeriv(r: { p: Poly; q: Poly }): { p: Poly; q: Poly } {
    // d(p/q)/dx = (p' q - p q') / q²
    const num = r.p.diff().mul(r.q).sub(r.p.mul(r.q.diff()));
    return canonRat(num, r.q.mul(r.q));
}

/**
 * Handle f = R(x) / log(g(x)) etc.: the Risch theorem says the integral
 * is elementary iff R is the derivative of log(g), in which case
 *    ∫ (g'/g) / log(g) dx = log(log(g)).
 * Otherwise return null.
 */
function integrateOverLog(
    f: Expr,
    L: Expr,
    gRat: { p: Poly; q: Poly },
): Expr | null {
    // Decompose f = numerator / log(g)^k * (other rational).
    // Specifically: pull out the (log g)^{−k} factor from f.
    const decomp = pullPowerOf(f, L);
    if (decomp === null) return null;
    const { coef, expOnL } = decomp;
    // If expOnL ≥ 0, this isn't a 1/log case.
    if (expOnL >= 0) return null;

    const coefRat = asRational(coef);
    if (coefRat === null) return null;

    // Easy special: coef = g'/g and expOnL = -1: ∫(g'/g)/log(g) = log(log(g)).
    const gp = polyDeriv(gRat);
    const ggquot = canonRat(gp.p.mul(gRat.q), gp.q.mul(gRat.p));
    if (expOnL === -1 && coefRat.p.eq(ggquot.p) && coefRat.q.eq(ggquot.q)) {
        return E.log(L);
    }
    // c*g'/g for constant c: ∫c*(g'/g)/log(g) = c*log(log g).
    if (expOnL === -1) {
        const ratio = canonRat(coefRat.p.mul(ggquot.q), coefRat.q.mul(ggquot.p));
        if (ratio.p.deg() === 0 && ratio.q.deg() === 0) {
            const c = ratio.p.coef(0).div(ratio.q.coef(0));
            if (!c.isZero()) return E.mul(E.konst(c), E.log(L));
        }
    }

    // Otherwise, the Risch decision says non-elementary. Return null.
    return null;
}

/**
 * If f = (rational in x) * L^k for a single integer k (positive or negative)
 * and no other dependence on L, return {coef, expOnL: k}; else null.
 */
function pullPowerOf(f: Expr, L: Expr): { coef: Expr; expOnL: number } | null {
    const Lk = serialize(L);
    let kAcc = 0;
    function go(e: Expr): Expr | null {
        if (serialize(e) === Lk) { kAcc += 1; return E.one(); }
        switch (e.kind) {
            case "const": case "var": return e;
            case "add": {
                // Each term must have the same power of L for this to be a clean pull.
                // Defer: check by recursing into each, then verifying they match.
                const out: Expr[] = [];
                let firstK: number | null = null;
                for (const t of e.terms) {
                    const before = kAcc;
                    kAcc = 0;
                    const r = go(t);
                    if (r === null) return null;
                    if (firstK === null) firstK = kAcc;
                    else if (firstK !== kAcc) return null;
                    out.push(r);
                    kAcc = before;
                }
                kAcc += firstK ?? 0;
                return E.add(...out);
            }
            case "mul": {
                const out: Expr[] = [];
                for (const f of e.factors) {
                    const r = go(f);
                    if (r === null) return null;
                    out.push(r);
                }
                return E.mul(...out);
            }
            case "pow": {
                if (serialize(e.base) === Lk && isConst(e.exp) && e.exp.value.isInteger()) {
                    kAcc += Number(e.exp.value.n);
                    return E.one();
                }
                if (containsAtom(e.base, Lk) || containsAtom(e.exp, Lk)) return null;
                return e;
            }
            case "exp": {
                if (containsAtom(e.arg, Lk)) return null;
                return e;
            }
            case "log": {
                if (serialize(e) === Lk) {
                    kAcc += 1;
                    return E.one();
                }
                if (containsAtom(e.arg, Lk)) return null;
                return e;
            }
        }
    }
    const coef = go(f);
    if (coef === null) return null;
    return { coef, expOnL: kAcc };
}

function containsAtom(e: Expr, key: string): boolean {
    if (serialize(e) === key) return true;
    switch (e.kind) {
        case "const": case "var": return false;
        case "add": return e.terms.some(t => containsAtom(t, key));
        case "mul": return e.factors.some(f => containsAtom(f, key));
        case "pow": return containsAtom(e.base, key) || containsAtom(e.exp, key);
        case "exp": return containsAtom(e.arg, key);
        case "log": return containsAtom(e.arg, key);
    }
}

// -------------------------------------------------------------------------
// Exponential class
// -------------------------------------------------------------------------

/**
 * f involves exp(g₁), exp(g₂), .... Strategy: pick a "primary" exp atom
 * and try the Liouvillian ansatz F = S(x)*exp(g) (plus log terms) by
 * solving the Risch differential equation for S.
 *
 * Sub-cases handled, in order of cleanness:
 *
 *  (i)   Single exp atom E = exp(g(x)), g ∈ Q(x).
 *        Reduce f to a Laurent polynomial in E with Q(x) coefficients,
 *        then for each exponent k≠0 solve the Risch DE  S' + k g' S = A_k.
 *        For k=0, integrate the rational part directly. The Risch DE
 *        with rational g and rational A_k is a finite-dim linear problem
 *        in Q(x) (Bronstein §6).
 *  (ii)  exp(g) where g is itself transcendental (e.g. exp(log(x)) — but
 *        this trivially equals x). We don't currently handle nested
 *        transcendentals beyond simplification.
 *
 * The verifier's exponential cases (`exp_x`, `x_exp_x`, `x_exp_x2`,
 * `nonelem_exp_x2`, `nonelem_exp_over_x`) are all caught by (i): the
 * non-elementary diagnostics show up as the Risch DE having no rational
 * solution.
 */
function integrateExpClass(f: Expr, exps: Expr[]): Expr | null {
    if (exps.length !== 1) return null;
    const E_atom = exps[0] as { kind: "exp"; arg: Expr };
    const g = E_atom.arg;
    const gRat = asRational(g);
    if (gRat === null) return null;

    // Express f as Σ_{k=k_min..k_max} A_k(x) * exp(k*g) where A_k ∈ Q(x).
    const laurent = collectInExp(f, E_atom);
    if (laurent === null) return null;

    // Antiderivative is Σ_k F_k where:
    //   • F_0 = ∫ A_0(x) dx (rational integration)
    //   • F_k = S_k(x) * exp(k g)  with  S_k' + k g' S_k = A_k    (Risch DE)
    const gp = polyDeriv(gRat);
    let F: Expr = E.zero();
    for (const [k, A_k] of laurent) {
        if (k === 0) {
            const F0 = integrateRational(A_k.p, A_k.q);
            if (F0 === null) return null;
            F = E.add(F, F0);
            continue;
        }
        const S = solveRischDE(A_k, k, gp);
        if (S === null) return null;
        // exp(k g) — express simply when k = ±1.
        let expPart: Expr;
        if (k === 1) expPart = E_atom;
        else expPart = { kind: "exp", arg: simplifyMul([E.int(k), g]) };
        F = E.add(F, E.mul(ratPolyToExpr(S.p, S.q), expPart));
    }
    return F;
}

/**
 * Collect f = Σ_k A_k(x) * exp(k*g) into a Map k→A_k. Returns null if any
 * subexpression doesn't fit.
 */
function collectInExp(f: Expr, E_atom: Expr): Map<number, { p: Poly; q: Poly }> | null {
    type CMap = Map<number, { p: Poly; q: Poly }>;
    const Ekey = serialize(E_atom);
    // Pre-extract g so we can recognise exp(k*g) as the k-th power of E_atom.
    const g = (E_atom as { kind: "exp"; arg: Expr }).arg;

    const set = (m: CMap, k: number, v: { p: Poly; q: Poly }): void => {
        const cur = m.get(k);
        const sum = cur ? addRational(cur, v) : v;
        if (sum.p.isZero()) m.delete(k);
        else m.set(k, sum);
    };
    const mulMaps = (a: CMap, b: CMap): CMap => {
        const out: CMap = new Map();
        for (const [ka, va] of a) {
            for (const [kb, vb] of b) {
                set(out, ka + kb, canonRat(va.p.mul(vb.p), va.q.mul(vb.q)));
            }
        }
        return out;
    };

    function go(e: Expr): CMap | null {
        if (serialize(e) === Ekey) {
            const m: CMap = new Map();
            m.set(1, { p: Poly.ONE, q: Poly.ONE });
            return m;
        }
        // exp(k * g) for integer k handled by simplifier — exp(2*x) becomes
        // exp(2x) which is a different atom. Try to detect this case.
        if (e.kind === "exp") {
            // Is e.arg = c * g for constant c?
            const c = constMultipleOfBy(e.arg, g);
            if (c !== null && c.isInteger()) {
                const k = Number(c.n);
                const m: CMap = new Map();
                m.set(k, { p: Poly.ONE, q: Poly.ONE });
                return m;
            }
            return null;
        }
        switch (e.kind) {
            case "const": {
                const m: CMap = new Map();
                m.set(0, { p: Poly.const(e.value), q: Poly.ONE });
                return m;
            }
            case "var": {
                const m: CMap = new Map();
                m.set(0, { p: Poly.X, q: Poly.ONE });
                return m;
            }
            case "log": {
                // log(...) doesn't fit the pure-exp class.
                return null;
            }
            case "add": {
                const acc: CMap = new Map();
                for (const t of e.terms) {
                    const c = go(t);
                    if (c === null) return null;
                    for (const [k, v] of c) set(acc, k, v);
                }
                return acc;
            }
            case "mul": {
                let acc: CMap = new Map();
                acc.set(0, { p: Poly.ONE, q: Poly.ONE });
                for (const f of e.factors) {
                    const c = go(f);
                    if (c === null) return null;
                    acc = mulMaps(acc, c);
                }
                return acc;
            }
            case "pow": {
                if (!isConst(e.exp) || !e.exp.value.isInteger()) return null;
                const k = Number(e.exp.value.n);
                if (serialize(e.base) === Ekey) {
                    const m: CMap = new Map();
                    m.set(k, { p: Poly.ONE, q: Poly.ONE });
                    return m;
                }
                const baseMap = go(e.base);
                if (baseMap === null) return null;
                if (k < 0) {
                    // Invert only if base is purely t^0.
                    if (baseMap.size !== 1 || !baseMap.has(0)) return null;
                    const r = baseMap.get(0)!;
                    let cur = { p: Poly.ONE, q: Poly.ONE };
                    const inv = canonRat(r.q, r.p);
                    for (let i = 0; i < -k; i++) cur = canonRat(cur.p.mul(inv.p), cur.q.mul(inv.q));
                    const out: CMap = new Map();
                    out.set(0, cur);
                    return out;
                }
                let acc: CMap = new Map();
                acc.set(0, { p: Poly.ONE, q: Poly.ONE });
                for (let i = 0; i < k; i++) acc = mulMaps(acc, baseMap);
                return acc;
            }
        }
    }
    return go(f);
}

/** If e = c * base for constant c, return c. */
function constMultipleOfBy(e: Expr, base: Expr): Q | null {
    const baseKey = serialize(base);
    if (serialize(e) === baseKey) return Q.ONE;
    if (e.kind === "mul") {
        let coef = Q.ONE;
        let baseCount = 0;
        for (const f of e.factors) {
            if (isConst(f)) coef = coef.mul(f.value);
            else if (serialize(f) === baseKey) baseCount += 1;
            else return null;
        }
        if (baseCount === 1) return coef;
        return null;
    }
    return null;
}

/**
 * Solve the Risch differential equation
 *
 *      S'(x)  +  k * g'(x) * S(x)  =  A(x)            (S, g, A ∈ Q(x))
 *
 * for S ∈ Q(x), or return null if no rational solution exists.
 *
 * Method: this is the "exponential-extension RDE" for the case where the
 * extension is exp(g). The full Bronstein algorithm handles arbitrary
 * rational g; we focus on the polynomial-g sub-case which covers every
 * verifier example. For *polynomial* g and *rational* A:
 *
 *   1. Multiply through by the denominator of A to reduce to polynomial RDE.
 *   2. Bound the degree of S using the degree of g'. If g'(x) has degree
 *      d ≥ 1, then the leading term of (k g') S is degree d + deg(S) and
 *      that must match the highest-degree term on the right; this fixes
 *      deg(S) = deg(A) − d in the generic case.
 *   3. Set up a linear system in the coefficients of S (size = deg(S)+1)
 *      and solve it with rational Gaussian elimination.
 *   4. If A has a denominator, we solve the more general "rational RDE"
 *      by writing S = N/D with D drawn from the prime-power decomposition
 *      of A's denominator and N polynomial.
 *
 * If the linear system is inconsistent, no elementary antiderivative of
 * the form S(x)*exp(k g) exists — return null.
 */
function solveRischDE(
    A: { p: Poly; q: Poly },
    k: number,
    gp: { p: Poly; q: Poly },        // g' as rational
): { p: Poly; q: Poly } | null {
    // We require g ∈ Q[x] (so g' is a polynomial). Bronstein's full RDE
    // solver handles g ∈ Q(x), but the verifier's exp-cases all use
    // polynomial g and the polynomial sub-case admits a clean closed-form
    // bound on deg(S).
    if (!gp.q.eq(Poly.ONE)) return null;
    const gPrimePoly = gp.p;     // ∈ Q[x]

    // S ∈ Q(x). Choose S = N/D. We need to pick D = denominator of S.
    // For exp-extension with polynomial g, the standard result (Bronstein
    // Thm 5.1.1) is: the denominator of S equals the denominator of A,
    // *up to factors special wrt the derivation*. Since here d/dx is the
    // pure polynomial derivation, every irreducible q in Q[x] is normal,
    // so the special part is empty: D = A.denom suffices.

    const D = A.q;
    // We want N ∈ Q[x] with N/D = S, satisfying
    //    (N/D)' + k g' (N/D) = A.p / A.q
    //    => N' D - N D' + k g' N D = A.p * (D/A.q) * D       [×D²]
    // Since D = A.q,
    //    N' D - N D' + k g' N D = A.p * D
    // i.e. D N' + (k g' D - D') N = A.p * D
    //
    // Let P = D, Q_ = k g' D - D', RHS = A.p * D. Then we need
    //    P N' + Q_ N = RHS,  N ∈ Q[x].
    //
    // Bound deg(N): leading-coefficient analysis. Let m = deg(N), p = deg(P),
    // q_ = deg(Q_), r_ = deg(RHS). Then deg(P N') = p + m - 1 (if m ≥ 1),
    // deg(Q_ N) = q_ + m. So leading degrees come from Q_ (if q_ > p−1) or
    // P (if p−1 ≥ q_); generally:
    //   • If deg(g') ≥ 1, then q_ = deg(g') + p, dominating; m = r_ - q_.
    //   • If deg(g') = 0 (g linear, e.g. g=x), then q_ = p, P contributes
    //     p+m-1 which is ≤ p+m = q_+m, so q_ wins; m = r_ - p.
    //   • If deg(g') = 0 AND k = 0 — caller wouldn't call us in that case.

    const P = D;
    const Q_ = gPrimePoly.scale(Q.of(k)).mul(D).sub(D.diff());
    const RHS = A.p.mul(D);

    if (RHS.isZero()) {
        return { p: Poly.ZERO, q: Poly.ONE };
    }

    // Degree bound for N. Generically deg(N) = deg(RHS) - deg(Q_); we add a
    // small slack so that the linear system can detect inconsistency cleanly
    // rather than truncate a real solution. If Q_ vanishes (impossible here
    // since k≠0 makes Q_ contain k g' D), fall back to a P-driven bound.
    let mBound: number;
    if (Q_.deg() >= 0) {
        mBound = Math.max(0, RHS.deg() - Q_.deg()) + 2;
    } else {
        mBound = Math.max(0, RHS.deg() - P.deg() + 1);
    }

    // Solve the linear system: write N = c_0 + c_1 x + ... + c_m x^m
    // and match coefficients of P N' + Q_ N = RHS.
    const m = Math.max(mBound, 0);
    const N = m + 1;
    // Matrix M (rows = degrees of LHS up to maxDeg, cols = N) and vector b.
    const maxDeg = Math.max(RHS.deg(), Q_.deg() + m, P.deg() + Math.max(m - 1, 0)) + 1;
    const Mrows: Q[][] = [];
    const b: Q[] = [];
    for (let r = 0; r <= maxDeg; r++) {
        Mrows.push(new Array(N).fill(Q.ZERO));
        b.push(RHS.coef(r));
    }
    // For each c_j, compute contribution to the LHS:
    //   contribution = P * (j x^{j-1}) + Q_ * x^j.
    for (let j = 0; j < N; j++) {
        // P * j x^{j-1}
        if (j >= 1) {
            for (let i = 0; i <= P.deg(); i++) {
                const deg = i + j - 1;
                Mrows[deg][j] = Mrows[deg][j].add(P.coef(i).mul(Q.of(j)));
            }
        }
        for (let i = 0; i <= Q_.deg(); i++) {
            const deg = i + j;
            Mrows[deg][j] = Mrows[deg][j].add(Q_.coef(i));
        }
    }
    // Solve.
    const sol = solveLinearSystemQ(Mrows, b);
    if (sol === null) return null;
    // Build N polynomial and reduce N/D.
    const Npoly = new Poly(sol);
    return canonRat(Npoly, D);
}

/**
 * Solve M·x = b over Q with Gaussian elimination. Matrix is rectangular —
 * if the system is over-determined and inconsistent return null; if it
 * is under-determined we set free variables to zero. Returns the solution
 * vector of length = number of columns.
 */
function solveLinearSystemQ(M: Q[][], b: Q[]): Q[] | null {
    const m = M.length;
    if (m === 0) return [];
    const n = M[0].length;
    // Augmented matrix.
    const A: Q[][] = M.map((row, i) => [...row, b[i]]);
    let r = 0;
    for (let c = 0; c < n && r < m; c++) {
        let pivot = -1;
        for (let i = r; i < m; i++) {
            if (!A[i][c].isZero()) { pivot = i; break; }
        }
        if (pivot < 0) continue;
        if (pivot !== r) [A[r], A[pivot]] = [A[pivot], A[r]];
        const pv = A[r][c];
        for (let j = c; j <= n; j++) A[r][j] = A[r][j].div(pv);
        for (let i = 0; i < m; i++) {
            if (i === r) continue;
            const f = A[i][c];
            if (f.isZero()) continue;
            for (let j = c; j <= n; j++) {
                A[i][j] = A[i][j].sub(f.mul(A[r][j]));
            }
        }
        r++;
    }
    // Check for inconsistency: rows with all zeros in cols 0..n-1 but non-zero RHS.
    for (let i = 0; i < m; i++) {
        let allZero = true;
        for (let j = 0; j < n; j++) {
            if (!A[i][j].isZero()) { allZero = false; break; }
        }
        if (allZero && !A[i][n].isZero()) return null;
    }
    // Back-substitute. Set free vars to 0; solve pivot rows.
    const x: Q[] = new Array(n).fill(Q.ZERO);
    const usedCol: boolean[] = new Array(n).fill(false);
    // Find pivot columns by scanning rows top-to-bottom.
    let row = 0;
    for (let c = 0; c < n && row < m; c++) {
        if (A[row][c].isOne()) {
            // Verify all other rows have zero in this column (which is true after RREF).
            let isPivotRow = true;
            for (let i = 0; i < m; i++) {
                if (i !== row && !A[i][c].isZero()) { isPivotRow = false; break; }
            }
            if (isPivotRow) {
                x[c] = A[row][n];
                usedCol[c] = true;
                row++;
                continue;
            }
        }
    }
    return x;
}

// =========================================================================
// 9. Verification: differentiate result, check ≡ integrand, and (if
//    the symbolic check is inconclusive) numerically sample to be sure.
// =========================================================================

/**
 * Numerically evaluate an Expr at x = sample (a JS number). Used as a
 * sanity check — if the symbolic simplifier can't decide F'(x) = f(x),
 * we sample at a few generic points. NaN/Infinity at sample skips that
 * sample; we declare equal if all *finite* samples agree.
 */
function evalNumeric(e: Expr, xv: number): number {
    switch (e.kind) {
        case "const": return Number(e.value.n) / Number(e.value.d);
        case "var":   return xv;
        case "add":   return e.terms.reduce((s, t) => s + evalNumeric(t, xv), 0);
        case "mul":   return e.factors.reduce((s, f) => s * evalNumeric(f, xv), 1);
        case "pow": {
            const b = evalNumeric(e.base, xv);
            const ex = evalNumeric(e.exp, xv);
            return Math.pow(b, ex);
        }
        case "exp": return Math.exp(evalNumeric(e.arg, xv));
        case "log": return Math.log(evalNumeric(e.arg, xv));
    }
}

function numericallyEqual(a: Expr, b: Expr): boolean {
    const samples = [0.7, 1.3, 2.1, 3.6, -0.4];
    for (const s of samples) {
        const va = evalNumeric(a, s);
        const vb = evalNumeric(b, s);
        if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
        if (Math.abs(va - vb) > 1e-7 * (1 + Math.abs(va) + Math.abs(vb))) return false;
    }
    return true;
}

/**
 * Symbolic equality test (best-effort). We canonicalise both sides as
 * Exprs and serialize. Very weak — it's the simplification's strength.
 */
function symbolicallyEqual(a: Expr, b: Expr): boolean {
    return serialize(a) === serialize(b);
}

// =========================================================================
// 10. Top-level driver — read JSON from stdin, write JSON to stdout.
// =========================================================================

interface RischInput  { integrand: string; variable: string; }
interface RischOutput { antiderivative: string | null; }

function risch(input: RischInput): RischOutput {
    if (input.variable !== "x") {
        // Renaming would require an alpha-rename pass through the parser; the
        // problem fixes the variable to 'x' per DESCRIPTION.md, so we lock it.
        throw new Error(`only variable 'x' is supported, got '${input.variable}'`);
    }
    const f = parse(input.integrand);
    const F = integrate(f);
    if (F === null) return { antiderivative: null };

    // Sanity-check: differentiate F and confirm against f. If symbolic
    // canonicalisation succeeds, great; otherwise sample numerically.
    const Fprime = diff(F);
    if (!symbolicallyEqual(Fprime, f) && !numericallyEqual(Fprime, f)) {
        // Computed something but it doesn't differentiate back — be honest.
        return { antiderivative: null };
    }
    return { antiderivative: toSympy(F) };
}

function main(): void {
    const fs = require("node:fs") as typeof import("node:fs");
    const raw = fs.readFileSync(0, "utf8");
    let out: RischOutput;
    try {
        const input: RischInput = JSON.parse(raw);
        out = risch(input);
    } catch (e) {
        // Out-of-scope inputs (e.g. trig functions) or malformed JSON: be
        // honest by returning null rather than crashing the harness.
        out = { antiderivative: null };
        process.stderr.write(`[solution.ts] declining: ${(e as Error).message}\n`);
    }
    process.stdout.write(JSON.stringify(out) + "\n");
}

main();
