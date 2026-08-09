// src/typegpu/three.js
import * as t3 from "@typegpu/three";
import { d as d3 } from "typegpu";

// src/hash.js
var LATTICE_OFFSET = 131072;
function hashU32(ix, iz, ox, oz) {
  const a = ix + ox | 0;
  const b = iz + oz | 0;
  let h = Math.imul(a, 2246822507) ^ Math.imul(b, 3266489917) | 0;
  h = Math.imul(h ^ h >>> 13, 668265263) | 0;
  return (h ^ h >>> 15) >>> 0;
}

// src/backend-tsl.js
function makeTslHashU32(tsl, { fnName = "mfHashU32" } = {}) {
  const { Fn, uint } = tsl;
  const hashCore = Fn(([a, b]) => {
    const h = a.mul(uint(2246822507)).bitXor(b.mul(uint(3266489917))).toVar();
    h.assign(h.bitXor(h.shiftRight(uint(13))).mul(uint(668265263)));
    h.assign(h.bitXor(h.shiftRight(uint(15))));
    return h;
  }).setLayout({
    name: fnName,
    type: "uint",
    inputs: [
      { name: "a", type: "uint" },
      { name: "b", type: "uint" }
    ]
  });
  return function hashU322(ix, iz, ox, oz) {
    const a = ox === 0 ? ix : ix.add(uint(ox));
    const b = oz === 0 ? iz : iz.add(uint(oz));
    return hashCore(a, b);
  };
}
function makeTslHash(tsl, { fnName = "mfHash01" } = {}) {
  const { float } = tsl;
  const hashBits = makeTslHashU32(tsl, { fnName: `${fnName}Bits` });
  return function hash01(ix, iz, ox, oz) {
    return float(hashBits(ix, iz, ox, oz)).mul(1 / 4294967296);
  };
}
function makeTslAdapter(tsl, opts = {}) {
  const { float, uint, abs: abs2, floor: floor2, min: min2, max: max2, mix, clamp, smoothstep } = tsl;
  const hash01 = opts.hash01 ?? makeTslHash(tsl, opts);
  return {
    f: (x) => float(x),
    add: (a, b) => a.add(b),
    sub: (a, b) => a.sub(b),
    mul: (a, b) => a.mul(b),
    abs: (a) => abs2(a),
    floor: (a) => floor2(a),
    sqrt: (a) => a.sqrt(),
    min: (a, b) => min2(a, b),
    max: (a, b) => max2(a, b),
    mix: (a, b, t) => mix(a, b, t),
    clamp01: (a) => clamp(a, 0, 1),
    smooth: (e0, e1, x) => smoothstep(float(e0), float(e1), x),
    latt: (fx) => uint(fx.add(LATTICE_OFFSET)),
    hash01,
    cache: (v) => v.toVar()
  };
}

// src/noise.js
function fade(A, t) {
  const t32 = A.mul(A.mul(t, t), t);
  return A.mul(t32, A.add(A.mul(t, A.sub(A.mul(t, A.f(6)), A.f(15))), A.f(10)));
}
function vnoise(A, x, z, ox = 0, oz = 0) {
  const fx = A.cache(A.floor(x));
  const fz = A.cache(A.floor(z));
  const tx = A.sub(x, fx);
  const tz = A.sub(z, fz);
  const ux = A.cache(fade(A, tx));
  const uz = A.cache(fade(A, tz));
  const ix = A.latt(fx);
  const iz = A.latt(fz);
  const h00 = A.hash01(ix, iz, ox, oz);
  const h10 = A.hash01(ix, iz, ox + 1, oz);
  const h01 = A.hash01(ix, iz, ox, oz + 1);
  const h11 = A.hash01(ix, iz, ox + 1, oz + 1);
  const a = A.mix(h00, h10, ux);
  const b = A.mix(h01, h11, ux);
  return A.cache(A.mix(a, b, uz));
}
var RC = 0.7583618759905082;
var RS = 0.6518337710215366;
var OSX = 37.71;
var OSZ = 17.34;
function fbm(A, x0, z0, freq, oct, gain = 0.5, lac = 2.03) {
  let x = A.cache(A.mul(x0, A.f(freq)));
  let z = A.cache(A.mul(z0, A.f(freq)));
  let amp = 0.5;
  let sum = null;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = vnoise(A, x, z);
    const term = A.mul(n, A.f(amp));
    sum = sum === null ? term : A.add(sum, term);
    norm += amp;
    amp *= gain;
    if (i < oct - 1) {
      const nx = A.add(A.mul(A.sub(A.mul(x, A.f(RC)), A.mul(z, A.f(RS))), A.f(lac)), A.f(OSX));
      const nz = A.add(A.mul(A.add(A.mul(x, A.f(RS)), A.mul(z, A.f(RC))), A.f(lac)), A.f(OSZ));
      x = A.cache(nx);
      z = A.cache(nz);
    }
  }
  return A.cache(A.mul(sum, A.f(1 / norm)));
}
function ridge(A, n, sharp) {
  const r = A.sub(A.f(1), A.abs(A.sub(A.mul(n, A.f(2)), A.f(1))));
  return A.cache(A.mix(r, A.mul(r, r), A.f(sharp - 1)));
}
function pwave(A, t) {
  const saw = A.sub(t, A.floor(t));
  const tri = A.sub(A.f(1), A.abs(A.sub(A.mul(saw, A.f(2)), A.f(1))));
  return A.mul(A.mul(tri, tri), A.sub(A.f(3), A.mul(tri, A.f(2))));
}
function stamp(A, h, x, z, { cx, cz, rIn, rOut, level }) {
  const dx = A.sub(x, A.f(cx));
  const dz = A.sub(z, A.f(cz));
  const d22 = A.add(A.mul(dx, dx), A.mul(dz, dz));
  const w = A.sub(A.f(1), A.smooth(rIn * rIn, rOut * rOut, d22));
  return A.mix(h, A.f(level), w);
}

// examples/dunes.js
var CA = 0.8138784566625339;
var SA = 0.5810351605373051;
var DUNES_PAD = Object.freeze({
  cx: 120,
  cz: -340,
  rIn: 40,
  rOut: 90,
  level: 14
});
function dunesField(A, x, z) {
  const base = fbm(A, x, z, 16e-4, 2);
  const hBase = A.mul(A.sub(base, A.f(0.5)), A.f(24));
  const mRaw = fbm(A, A.add(x, A.f(4100)), A.sub(z, A.f(2900)), 9e-4, 2);
  const mask = A.cache(A.smooth(0.35, 0.7, mRaw));
  const u = A.add(A.mul(x, A.f(CA)), A.mul(z, A.f(SA)));
  const v = A.sub(A.mul(z, A.f(CA)), A.mul(x, A.f(SA)));
  const dn = fbm(A, A.mul(u, A.f(0.011)), A.mul(v, A.f(28e-4)), 1, 3);
  const crests = ridge(A, dn, 1.7);
  const hDunes = A.mul(A.mul(crests, A.f(18)), A.add(A.f(0.25), A.mul(mask, A.f(0.75))));
  const h = A.add(hBase, hDunes);
  return A.cache(stamp(A, h, x, z, DUNES_PAD));
}

// examples/swell.js
var T1 = { ca: 0.8775825618903728, sa: 0.479425538604203, wl: 60, amp: 0.9, spd: 8 };
var T2 = { ca: -0.5885011172553458, sa: 0.8084964038195901, wl: 23, amp: 0.35, spd: 5 };
function swellField(A, x, z, t) {
  const u1 = A.add(A.mul(x, A.f(T1.ca)), A.mul(z, A.f(T1.sa)));
  const p1 = A.mul(A.sub(u1, A.mul(t, A.f(T1.spd))), A.f(1 / T1.wl));
  const w1 = A.mul(A.sub(pwave(A, p1), A.f(0.5)), A.f(2 * T1.amp));
  const u2 = A.add(A.mul(x, A.f(T2.ca)), A.mul(z, A.f(T2.sa)));
  const p2 = A.mul(A.sub(u2, A.mul(t, A.f(T2.spd))), A.f(1 / T2.wl));
  const w2 = A.mul(A.sub(pwave(A, p2), A.f(0.5)), A.f(2 * T2.amp));
  const cx = A.add(x, A.mul(t, A.f(1.7)));
  const cz = A.sub(z, A.mul(t, A.f(1.1)));
  const chop = A.mul(A.sub(fbm(A, cx, cz, 0.08, 2), A.f(0.5)), A.f(0.5));
  return A.cache(A.add(A.add(w1, w2), chop));
}

// examples/serpent.js
var SPAN = 90;
var LAG = 0.35;
var HUMP_AMP = 7;
var HUMP_FREQ = 1.4;
var SWAY_AMP = 4;
var SWAY_FREQ = 0.55;
var BASE_Y = 0;
var MIN_RADIUS = 1.25;
var RADIUS_RANGE = 3.2;
function serpentRadius(A, u) {
  return A.cache(A.add(A.f(MIN_RADIUS), A.mul(pwave(A, u), A.f(RADIUS_RANGE))));
}
function serpentSpine(A, u, t) {
  const rt = A.cache(A.sub(t, A.mul(u, A.f(LAG))));
  const x = A.mul(u, A.f(SPAN));
  const humpRaw = A.mul(pwave(A, A.mul(rt, A.f(HUMP_FREQ))), A.f(HUMP_AMP));
  const env = A.smooth(0.05, 0.3, u);
  const y = A.add(A.f(BASE_Y), A.mul(humpRaw, env));
  const sway = A.mul(A.sub(pwave(A, A.mul(rt, A.f(SWAY_FREQ))), A.f(0.5)), A.f(2 * SWAY_AMP));
  const z = A.mul(sway, env);
  return { x: A.cache(x), y: A.cache(y), z: A.cache(z) };
}

// examples/wind.js
var PREVAIL = { ca: 0.6216099682706644, sa: 0.7833269096274834, speed: 6 };
function windField(A, x, z, t) {
  const surge = A.add(A.f(0.4), A.mul(pwave(A, A.mul(t, A.f(1 / 18))), A.f(0.6)));
  const ax = A.add(x, A.mul(t, A.f(-PREVAIL.ca * PREVAIL.speed)));
  const az = A.add(z, A.mul(t, A.f(-PREVAIL.sa * PREVAIL.speed)));
  const m1 = A.mul(A.sub(fbm(A, ax, az, 4e-3, 3), A.f(0.5)), A.f(2));
  const m2 = A.mul(A.sub(fbm(A, A.add(ax, A.f(7300)), A.sub(az, A.f(1900)), 4e-3, 3), A.f(0.5)), A.f(2));
  const wx = A.mul(A.add(A.f(PREVAIL.ca * PREVAIL.speed), A.mul(m1, A.f(2.5))), surge);
  const wz = A.mul(A.add(A.f(PREVAIL.sa * PREVAIL.speed), A.mul(m2, A.f(2.5))), surge);
  return { wx: A.cache(wx), wz: A.cache(wz) };
}

// src/typegpu/fields.js
import tgpu2, { d as d2 } from "typegpu";

// src/typegpu/primitives.js
import tgpu, { d } from "typegpu";
import { abs, floor, isBeingTranspiled, max, min } from "typegpu/std";
var typegpuStamp = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuStamp2(h, x, z, cx, cz, rIn, rOut, level) {
  "use gpu";
  const dx = __tsover_sub(x, cx);
  const dz = __tsover_sub(z, cz);
  const d22 = __tsover_add(__tsover_mul(dx, dx), __tsover_mul(dz, dz));
  const w = __tsover_sub(1, typegpuSmooth(__tsover_mul(rIn, rIn), __tsover_mul(rOut, rOut), d22));
  return __tsover_add(h, __tsover_mul(__tsover_sub(level, h), w));
}), {
  v: 1,
  name: "typegpuStamp",
  ast: { "params": [{ "type": "i", "name": "h" }, { "type": "i", "name": "x" }, { "type": "i", "name": "z" }, { "type": "i", "name": "cx" }, { "type": "i", "name": "cz" }, { "type": "i", "name": "rIn" }, { "type": "i", "name": "rOut" }, { "type": "i", "name": "level" }], "body": [0, [[13, "dx", [1, "x", "-", "cx"]], [13, "dz", [1, "z", "-", "cz"]], [13, "d2", [1, [1, "dx", "*", "dx"], "+", [1, "dz", "*", "dz"]]], [13, "w", [1, [5, "1"], "-", [6, "typegpuSmooth", [[1, "rIn", "*", "rIn"], [1, "rOut", "*", "rOut"], "d2"]]]], [10, [1, "h", "+", [1, [1, "level", "-", "h"], "*", "w"]]]]], "externalNames": ["typegpuSmooth"] },
  externals: () => ({ typegpuSmooth })
}) && $.f)({});
var typegpuPwave = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuPwave2(t) {
  "use gpu";
  const saw = __tsover_sub(t, floor(t));
  const tri = __tsover_sub(1, abs(__tsover_sub(__tsover_mul(saw, 2), 1)));
  return __tsover_mul(__tsover_mul(tri, tri), __tsover_sub(3, __tsover_mul(tri, 2)));
}), {
  v: 1,
  name: "typegpuPwave",
  ast: { "params": [{ "type": "i", "name": "t" }], "body": [0, [[13, "saw", [1, "t", "-", [6, "floor", ["t"]]]], [13, "tri", [1, [5, "1"], "-", [6, "abs", [[1, [1, "saw", "*", [5, "2"]], "-", [5, "1"]]]]]], [10, [1, [1, "tri", "*", "tri"], "*", [1, [5, "3"], "-", [1, "tri", "*", [5, "2"]]]]]]], "externalNames": ["floor", "abs"] },
  externals: () => ({ floor, abs })
}) && $.f)({});
var typegpuRidge = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuRidge2(n, sharp) {
  "use gpu";
  const r = __tsover_sub(1, abs(__tsover_sub(__tsover_mul(n, 2), 1)));
  return __tsover_add(r, __tsover_mul(__tsover_sub(__tsover_mul(r, r), r), __tsover_sub(sharp, 1)));
}), {
  v: 1,
  name: "typegpuRidge",
  ast: { "params": [{ "type": "i", "name": "n" }, { "type": "i", "name": "sharp" }], "body": [0, [[13, "r", [1, [5, "1"], "-", [6, "abs", [[1, [1, "n", "*", [5, "2"]], "-", [5, "1"]]]]]], [10, [1, "r", "+", [1, [1, [1, "r", "*", "r"], "-", "r"], "*", [1, "sharp", "-", [5, "1"]]]]]]], "externalNames": ["abs"] },
  externals: () => ({ abs })
}) && $.f)({});
var typegpuFbm3 = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuFbm32(x0, z0, freq) {
  "use gpu";
  const x = __tsover_mul(x0, freq);
  const z = __tsover_mul(z0, freq);
  let sum = __tsover_mul(typegpuVnoise(x, z, d.u32(0), d.u32(0)), 0.5);
  const x1 = __tsover_add(__tsover_mul(__tsover_sub(__tsover_mul(x, RC2), __tsover_mul(z, RS2)), LAC), OSX2);
  const z1 = __tsover_add(__tsover_mul(__tsover_add(__tsover_mul(x, RS2), __tsover_mul(z, RC2)), LAC), OSZ2);
  sum = __tsover_add(sum, __tsover_mul(typegpuVnoise(x1, z1, d.u32(0), d.u32(0)), 0.25));
  const x2 = __tsover_add(__tsover_mul(__tsover_sub(__tsover_mul(x1, RC2), __tsover_mul(z1, RS2)), LAC), OSX2);
  const z2 = __tsover_add(__tsover_mul(__tsover_add(__tsover_mul(x1, RS2), __tsover_mul(z1, RC2)), LAC), OSZ2);
  sum = __tsover_add(sum, __tsover_mul(typegpuVnoise(x2, z2, d.u32(0), d.u32(0)), 0.125));
  return __tsover_mul(sum, __tsover_div(1, 0.875));
}), {
  v: 1,
  name: "typegpuFbm3",
  ast: { "params": [{ "type": "i", "name": "x0" }, { "type": "i", "name": "z0" }, { "type": "i", "name": "freq" }], "body": [0, [[13, "x", [1, "x0", "*", "freq"]], [13, "z", [1, "z0", "*", "freq"]], [12, "sum", [1, [6, "typegpuVnoise", ["x", "z", [6, [7, "d", "u32"], [[5, "0"]]], [6, [7, "d", "u32"], [[5, "0"]]]]], "*", [5, "0.5"]]], [13, "x1", [1, [1, [1, [1, "x", "*", "RC"], "-", [1, "z", "*", "RS"]], "*", "LAC"], "+", "OSX"]], [13, "z1", [1, [1, [1, [1, "x", "*", "RS"], "+", [1, "z", "*", "RC"]], "*", "LAC"], "+", "OSZ"]], [2, "sum", "=", [1, "sum", "+", [1, [6, "typegpuVnoise", ["x1", "z1", [6, [7, "d", "u32"], [[5, "0"]]], [6, [7, "d", "u32"], [[5, "0"]]]]], "*", [5, "0.25"]]]], [13, "x2", [1, [1, [1, [1, "x1", "*", "RC"], "-", [1, "z1", "*", "RS"]], "*", "LAC"], "+", "OSX"]], [13, "z2", [1, [1, [1, [1, "x1", "*", "RS"], "+", [1, "z1", "*", "RC"]], "*", "LAC"], "+", "OSZ"]], [2, "sum", "=", [1, "sum", "+", [1, [6, "typegpuVnoise", ["x2", "z2", [6, [7, "d", "u32"], [[5, "0"]]], [6, [7, "d", "u32"], [[5, "0"]]]]], "*", [5, "0.125"]]]], [10, [1, "sum", "*", [1, [5, "1"], "/", [5, "0.875"]]]]]], "externalNames": ["typegpuVnoise", "d", "RC", "RS", "LAC", "OSX", "OSZ"] },
  externals: () => ({ typegpuVnoise, d, RC: RC2, RS: RS2, LAC, OSX: OSX2, OSZ: OSZ2 })
}) && $.f)({});
var typegpuFbm2 = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuFbm22(x0, z0, freq) {
  "use gpu";
  const x = __tsover_mul(x0, freq);
  const z = __tsover_mul(z0, freq);
  let sum = __tsover_mul(typegpuVnoise(x, z, d.u32(0), d.u32(0)), 0.5);
  const x1 = __tsover_add(__tsover_mul(__tsover_sub(__tsover_mul(x, RC2), __tsover_mul(z, RS2)), LAC), OSX2);
  const z1 = __tsover_add(__tsover_mul(__tsover_add(__tsover_mul(x, RS2), __tsover_mul(z, RC2)), LAC), OSZ2);
  sum = __tsover_add(sum, __tsover_mul(typegpuVnoise(x1, z1, d.u32(0), d.u32(0)), 0.25));
  return __tsover_mul(sum, __tsover_div(1, 0.75));
}), {
  v: 1,
  name: "typegpuFbm2",
  ast: { "params": [{ "type": "i", "name": "x0" }, { "type": "i", "name": "z0" }, { "type": "i", "name": "freq" }], "body": [0, [[13, "x", [1, "x0", "*", "freq"]], [13, "z", [1, "z0", "*", "freq"]], [12, "sum", [1, [6, "typegpuVnoise", ["x", "z", [6, [7, "d", "u32"], [[5, "0"]]], [6, [7, "d", "u32"], [[5, "0"]]]]], "*", [5, "0.5"]]], [13, "x1", [1, [1, [1, [1, "x", "*", "RC"], "-", [1, "z", "*", "RS"]], "*", "LAC"], "+", "OSX"]], [13, "z1", [1, [1, [1, [1, "x", "*", "RS"], "+", [1, "z", "*", "RC"]], "*", "LAC"], "+", "OSZ"]], [2, "sum", "=", [1, "sum", "+", [1, [6, "typegpuVnoise", ["x1", "z1", [6, [7, "d", "u32"], [[5, "0"]]], [6, [7, "d", "u32"], [[5, "0"]]]]], "*", [5, "0.25"]]]], [10, [1, "sum", "*", [1, [5, "1"], "/", [5, "0.75"]]]]]], "externalNames": ["typegpuVnoise", "d", "RC", "RS", "LAC", "OSX", "OSZ"] },
  externals: () => ({ typegpuVnoise, d, RC: RC2, RS: RS2, LAC, OSX: OSX2, OSZ: OSZ2 })
}) && $.f)({});
var typegpuVnoise = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuVnoise2(x, z, ox, oz) {
  "use gpu";
  const fx = floor(x);
  const fz = floor(z);
  const tx = __tsover_sub(x, fx);
  const tz = __tsover_sub(z, fz);
  const ux = typegpuFade(tx);
  const uz = typegpuFade(tz);
  const ix = d.u32(__tsover_add(fx, TYPEGPU_LATTICE_OFFSET));
  const iz = d.u32(__tsover_add(fz, TYPEGPU_LATTICE_OFFSET));
  const h00 = typegpuHash01(ix, iz, ox, oz);
  const h10 = typegpuHash01(ix, iz, __tsover_add(ox, d.u32(1)), oz);
  const h01 = typegpuHash01(ix, iz, ox, __tsover_add(oz, d.u32(1)));
  const h11 = typegpuHash01(ix, iz, __tsover_add(ox, d.u32(1)), __tsover_add(oz, d.u32(1)));
  const a = __tsover_add(h00, __tsover_mul(__tsover_sub(h10, h00), ux));
  const b = __tsover_add(h01, __tsover_mul(__tsover_sub(h11, h01), ux));
  return __tsover_add(a, __tsover_mul(__tsover_sub(b, a), uz));
}), {
  v: 1,
  name: "typegpuVnoise",
  ast: { "params": [{ "type": "i", "name": "x" }, { "type": "i", "name": "z" }, { "type": "i", "name": "ox" }, { "type": "i", "name": "oz" }], "body": [0, [[13, "fx", [6, "floor", ["x"]]], [13, "fz", [6, "floor", ["z"]]], [13, "tx", [1, "x", "-", "fx"]], [13, "tz", [1, "z", "-", "fz"]], [13, "ux", [6, "typegpuFade", ["tx"]]], [13, "uz", [6, "typegpuFade", ["tz"]]], [13, "ix", [6, [7, "d", "u32"], [[1, "fx", "+", "TYPEGPU_LATTICE_OFFSET"]]]], [13, "iz", [6, [7, "d", "u32"], [[1, "fz", "+", "TYPEGPU_LATTICE_OFFSET"]]]], [13, "h00", [6, "typegpuHash01", ["ix", "iz", "ox", "oz"]]], [13, "h10", [6, "typegpuHash01", ["ix", "iz", [1, "ox", "+", [6, [7, "d", "u32"], [[5, "1"]]]], "oz"]]], [13, "h01", [6, "typegpuHash01", ["ix", "iz", "ox", [1, "oz", "+", [6, [7, "d", "u32"], [[5, "1"]]]]]]], [13, "h11", [6, "typegpuHash01", ["ix", "iz", [1, "ox", "+", [6, [7, "d", "u32"], [[5, "1"]]]], [1, "oz", "+", [6, [7, "d", "u32"], [[5, "1"]]]]]]], [13, "a", [1, "h00", "+", [1, [1, "h10", "-", "h00"], "*", "ux"]]], [13, "b", [1, "h01", "+", [1, [1, "h11", "-", "h01"], "*", "ux"]]], [10, [1, "a", "+", [1, [1, "b", "-", "a"], "*", "uz"]]]]], "externalNames": ["floor", "typegpuFade", "d", "TYPEGPU_LATTICE_OFFSET", "typegpuHash01"] },
  externals: () => ({ floor, typegpuFade, d, TYPEGPU_LATTICE_OFFSET, typegpuHash01 })
}) && $.f)({});
var typegpuFade = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuFade2(t) {
  "use gpu";
  const t32 = __tsover_mul(__tsover_mul(t, t), t);
  return __tsover_mul(t32, __tsover_add(__tsover_mul(t, __tsover_sub(__tsover_mul(t, 6), 15)), 10));
}), {
  v: 1,
  name: "typegpuFade",
  ast: { "params": [{ "type": "i", "name": "t" }], "body": [0, [[13, "t3", [1, [1, "t", "*", "t"], "*", "t"]], [10, [1, "t3", "*", [1, [1, "t", "*", [1, [1, "t", "*", [5, "6"]], "-", [5, "15"]]], "+", [5, "10"]]]]]], "externalNames": [] },
  externals: () => ({})
}) && $.f)({});
var typegpuSmooth = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuSmooth2(e0, e1, x) {
  "use gpu";
  const t = __tsover_div(__tsover_sub(x, e0), __tsover_sub(e1, e0));
  const c = max(0, min(1, t));
  return __tsover_mul(__tsover_mul(c, c), __tsover_sub(3, __tsover_mul(2, c)));
}), {
  v: 1,
  name: "typegpuSmooth",
  ast: { "params": [{ "type": "i", "name": "e0" }, { "type": "i", "name": "e1" }, { "type": "i", "name": "x" }], "body": [0, [[13, "t", [1, [1, "x", "-", "e0"], "/", [1, "e1", "-", "e0"]]], [13, "c", [6, "max", [[5, "0"], [6, "min", [[5, "1"], "t"]]]]], [10, [1, [1, "c", "*", "c"], "*", [1, [5, "3"], "-", [1, [5, "2"], "*", "c"]]]]]], "externalNames": ["max", "min"] },
  externals: () => ({ max, min })
}) && $.f)({});
var typegpuHash01 = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuHash012(ix, iz, ox, oz) {
  "use gpu";
  const bits = typegpuHashU32(ix, iz, ox, oz);
  return isBeingTranspiled() ? __tsover_mul(d.f32(bits), HASH_SCALE) : __tsover_mul(bits, HASH_SCALE);
}), {
  v: 1,
  name: "typegpuHash01",
  ast: { "params": [{ "type": "i", "name": "ix" }, { "type": "i", "name": "iz" }, { "type": "i", "name": "ox" }, { "type": "i", "name": "oz" }], "body": [0, [[13, "bits", [6, "typegpuHashU32", ["ix", "iz", "ox", "oz"]]], [10, [105, [6, "isBeingTranspiled", []], [1, [6, [7, "d", "f32"], ["bits"]], "*", "HASH_SCALE"], [1, "bits", "*", "HASH_SCALE"]]]]], "externalNames": ["typegpuHashU32", "isBeingTranspiled", "d", "HASH_SCALE"] },
  externals: () => ({ typegpuHashU32, isBeingTranspiled, d, HASH_SCALE })
}) && $.f)({});
var typegpuHashU32 = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuHashU322(ix, iz, ox, oz) {
  "use gpu";
  return isBeingTranspiled() ? hashU32Gpu(ix, iz, ox, oz) : hashU32(ix, iz, ox, oz);
}), {
  v: 1,
  name: "typegpuHashU32",
  ast: { "params": [{ "type": "i", "name": "ix" }, { "type": "i", "name": "iz" }, { "type": "i", "name": "ox" }, { "type": "i", "name": "oz" }], "body": [0, [[10, [105, [6, "isBeingTranspiled", []], [6, "hashU32Gpu", ["ix", "iz", "ox", "oz"]], [6, "hashU32Cpu", ["ix", "iz", "ox", "oz"]]]]]], "externalNames": ["isBeingTranspiled", "hashU32Gpu", "hashU32Cpu"] },
  externals: () => ({ isBeingTranspiled, hashU32Gpu, hashU32Cpu: hashU32 })
}) && $.f)({});
var hashU32GpuImpl = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function hashU32GpuImpl2(ix, iz, ox, oz) {
  "use gpu";
  const a = d.u32(__tsover_add(ix, ox));
  const b = d.u32(__tsover_add(iz, oz));
  let h = d.u32(__tsover_mul(a, d.u32(2246822507))) ^ d.u32(__tsover_mul(b, d.u32(3266489917)));
  h = d.u32(__tsover_mul(h ^ h >> d.u32(13), d.u32(668265263)));
  return h ^ h >> d.u32(15);
}), {
  v: 1,
  name: "hashU32GpuImpl",
  ast: { "params": [{ "type": "i", "name": "ix" }, { "type": "i", "name": "iz" }, { "type": "i", "name": "ox" }, { "type": "i", "name": "oz" }], "body": [0, [[13, "a", [6, [7, "d", "u32"], [[1, "ix", "+", "ox"]]]], [13, "b", [6, [7, "d", "u32"], [[1, "iz", "+", "oz"]]]], [12, "h", [1, [6, [7, "d", "u32"], [[1, "a", "*", [6, [7, "d", "u32"], [[5, "2246822507"]]]]]], "^", [6, [7, "d", "u32"], [[1, "b", "*", [6, [7, "d", "u32"], [[5, "3266489917"]]]]]]]], [2, "h", "=", [6, [7, "d", "u32"], [[1, [1, "h", "^", [1, "h", ">>", [6, [7, "d", "u32"], [[5, "13"]]]]], "*", [6, [7, "d", "u32"], [[5, "668265263"]]]]]]], [10, [1, "h", "^", [1, "h", ">>", [6, [7, "d", "u32"], [[5, "15"]]]]]]]], "externalNames": ["d"] },
  externals: () => ({ d })
}) && $.f)({});
var TYPEGPU_LATTICE_OFFSET = 131072;
var HASH_SCALE = 1 / 4294967296;
var RC2 = 0.7583618759905082;
var RS2 = 0.6518337710215366;
var LAC = 2.03;
var OSX2 = 37.71;
var OSZ2 = 17.34;
var hashU32Gpu = tgpu.fn([d.u32, d.u32, d.u32, d.u32], d.u32)(hashU32GpuImpl).$name("mfHashU32Gpu");
var typegpuHashU32Kernel = tgpu.fn([d.u32, d.u32, d.u32, d.u32], d.u32)(typegpuHashU32).$name("mfHashU32");
var typegpuPrimitiveKernels = Object.freeze({
  hashU32: typegpuHashU32Kernel,
  vnoise: tgpu.fn([d.f32, d.f32, d.u32, d.u32], d.f32)(typegpuVnoise).$name("mfVnoise"),
  fbm2: tgpu.fn([d.f32, d.f32, d.f32], d.f32)(typegpuFbm2).$name("mfFbm2"),
  fbm3: tgpu.fn([d.f32, d.f32, d.f32], d.f32)(typegpuFbm3).$name("mfFbm3"),
  pwave: tgpu.fn([d.f32], d.f32)(typegpuPwave).$name("mfPwave")
});

// src/typegpu/fields.js
var typegpuSerpentSpine = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuSerpentSpine2(u, t) {
  "use gpu";
  return d2.vec3f(
    typegpuSerpentX(u, t),
    typegpuSerpentY(u, t),
    typegpuSerpentZ(u, t)
  );
}), {
  v: 1,
  name: "typegpuSerpentSpine",
  ast: { "params": [{ "type": "i", "name": "u" }, { "type": "i", "name": "t" }], "body": [0, [[10, [6, [7, "d", "vec3f"], [[6, "typegpuSerpentX", ["u", "t"]], [6, "typegpuSerpentY", ["u", "t"]], [6, "typegpuSerpentZ", ["u", "t"]]]]]]], "externalNames": ["d", "typegpuSerpentX", "typegpuSerpentY", "typegpuSerpentZ"] },
  externals: () => ({ d: d2, typegpuSerpentX, typegpuSerpentY, typegpuSerpentZ })
}) && $.f)({});
var typegpuSerpentZ = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuSerpentZ2(u, t) {
  "use gpu";
  const rt = __tsover_sub(t, __tsover_mul(u, SERPENT_LAG));
  const sway = __tsover_mul(__tsover_sub(typegpuPwave(__tsover_mul(rt, SERPENT_SWAY_FREQ)), 0.5), __tsover_mul(2, SERPENT_SWAY_AMP));
  return __tsover_mul(sway, typegpuSmooth(0.05, 0.3, u));
}), {
  v: 1,
  name: "typegpuSerpentZ",
  ast: { "params": [{ "type": "i", "name": "u" }, { "type": "i", "name": "t" }], "body": [0, [[13, "rt", [1, "t", "-", [1, "u", "*", "SERPENT_LAG"]]], [13, "sway", [1, [1, [6, "typegpuPwave", [[1, "rt", "*", "SERPENT_SWAY_FREQ"]]], "-", [5, "0.5"]], "*", [1, [5, "2"], "*", "SERPENT_SWAY_AMP"]]], [10, [1, "sway", "*", [6, "typegpuSmooth", [[5, "0.05"], [5, "0.3"], "u"]]]]]], "externalNames": ["SERPENT_LAG", "typegpuPwave", "SERPENT_SWAY_FREQ", "SERPENT_SWAY_AMP", "typegpuSmooth"] },
  externals: () => ({ SERPENT_LAG, typegpuPwave, SERPENT_SWAY_FREQ, SERPENT_SWAY_AMP, typegpuSmooth })
}) && $.f)({});
var typegpuSerpentY = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuSerpentY2(u, t) {
  "use gpu";
  const rt = __tsover_sub(t, __tsover_mul(u, SERPENT_LAG));
  const hump = __tsover_mul(typegpuPwave(__tsover_mul(rt, SERPENT_HUMP_FREQ)), SERPENT_HUMP_AMP);
  return __tsover_mul(hump, typegpuSmooth(0.05, 0.3, u));
}), {
  v: 1,
  name: "typegpuSerpentY",
  ast: { "params": [{ "type": "i", "name": "u" }, { "type": "i", "name": "t" }], "body": [0, [[13, "rt", [1, "t", "-", [1, "u", "*", "SERPENT_LAG"]]], [13, "hump", [1, [6, "typegpuPwave", [[1, "rt", "*", "SERPENT_HUMP_FREQ"]]], "*", "SERPENT_HUMP_AMP"]], [10, [1, "hump", "*", [6, "typegpuSmooth", [[5, "0.05"], [5, "0.3"], "u"]]]]]], "externalNames": ["SERPENT_LAG", "typegpuPwave", "SERPENT_HUMP_FREQ", "SERPENT_HUMP_AMP", "typegpuSmooth"] },
  externals: () => ({ SERPENT_LAG, typegpuPwave, SERPENT_HUMP_FREQ, SERPENT_HUMP_AMP, typegpuSmooth })
}) && $.f)({});
var typegpuSerpentX = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuSerpentX2(u, t) {
  "use gpu";
  return __tsover_mul(u, SERPENT_SPAN);
}), {
  v: 1,
  name: "typegpuSerpentX",
  ast: { "params": [{ "type": "i", "name": "u" }, { "type": "i", "name": "t" }], "body": [0, [[10, [1, "u", "*", "SERPENT_SPAN"]]]], "externalNames": ["SERPENT_SPAN"] },
  externals: () => ({ SERPENT_SPAN })
}) && $.f)({});
var typegpuSerpentRadius = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuSerpentRadius2(u) {
  "use gpu";
  return __tsover_add(1.25, __tsover_mul(typegpuPwave(u), 3.2));
}), {
  v: 1,
  name: "typegpuSerpentRadius",
  ast: { "params": [{ "type": "i", "name": "u" }], "body": [0, [[10, [1, [5, "1.25"], "+", [1, [6, "typegpuPwave", ["u"]], "*", [5, "3.2"]]]]]], "externalNames": ["typegpuPwave"] },
  externals: () => ({ typegpuPwave })
}) && $.f)({});
var typegpuWind = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuWind2(x, z, t) {
  "use gpu";
  return d2.vec2f(typegpuWindX(x, z, t), typegpuWindZ(x, z, t));
}), {
  v: 1,
  name: "typegpuWind",
  ast: { "params": [{ "type": "i", "name": "x" }, { "type": "i", "name": "z" }, { "type": "i", "name": "t" }], "body": [0, [[10, [6, [7, "d", "vec2f"], [[6, "typegpuWindX", ["x", "z", "t"]], [6, "typegpuWindZ", ["x", "z", "t"]]]]]]], "externalNames": ["d", "typegpuWindX", "typegpuWindZ"] },
  externals: () => ({ d: d2, typegpuWindX, typegpuWindZ })
}) && $.f)({});
var typegpuWindZ = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuWindZ2(x, z, t) {
  "use gpu";
  const ax = windAdvectedX(x, t);
  const az = windAdvectedZ(z, t);
  const m2 = __tsover_mul(__tsover_sub(typegpuFbm3(__tsover_add(ax, 7300), __tsover_sub(az, 1900), 4e-3), 0.5), 2);
  return __tsover_mul(__tsover_add(__tsover_mul(WIND_SA, WIND_SPEED), __tsover_mul(m2, 2.5)), windSurge(t));
}), {
  v: 1,
  name: "typegpuWindZ",
  ast: { "params": [{ "type": "i", "name": "x" }, { "type": "i", "name": "z" }, { "type": "i", "name": "t" }], "body": [0, [[13, "ax", [6, "windAdvectedX", ["x", "t"]]], [13, "az", [6, "windAdvectedZ", ["z", "t"]]], [13, "m2", [1, [1, [6, "typegpuFbm3", [[1, "ax", "+", [5, "7300"]], [1, "az", "-", [5, "1900"]], [5, "0.004"]]], "-", [5, "0.5"]], "*", [5, "2"]]], [10, [1, [1, [1, "WIND_SA", "*", "WIND_SPEED"], "+", [1, "m2", "*", [5, "2.5"]]], "*", [6, "windSurge", ["t"]]]]]], "externalNames": ["windAdvectedX", "windAdvectedZ", "typegpuFbm3", "WIND_SA", "WIND_SPEED", "windSurge"] },
  externals: () => ({ windAdvectedX, windAdvectedZ, typegpuFbm3, WIND_SA, WIND_SPEED, windSurge })
}) && $.f)({});
var typegpuWindX = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuWindX2(x, z, t) {
  "use gpu";
  const ax = windAdvectedX(x, t);
  const az = windAdvectedZ(z, t);
  const m1 = __tsover_mul(__tsover_sub(typegpuFbm3(ax, az, 4e-3), 0.5), 2);
  return __tsover_mul(__tsover_add(__tsover_mul(WIND_CA, WIND_SPEED), __tsover_mul(m1, 2.5)), windSurge(t));
}), {
  v: 1,
  name: "typegpuWindX",
  ast: { "params": [{ "type": "i", "name": "x" }, { "type": "i", "name": "z" }, { "type": "i", "name": "t" }], "body": [0, [[13, "ax", [6, "windAdvectedX", ["x", "t"]]], [13, "az", [6, "windAdvectedZ", ["z", "t"]]], [13, "m1", [1, [1, [6, "typegpuFbm3", ["ax", "az", [5, "0.004"]]], "-", [5, "0.5"]], "*", [5, "2"]]], [10, [1, [1, [1, "WIND_CA", "*", "WIND_SPEED"], "+", [1, "m1", "*", [5, "2.5"]]], "*", [6, "windSurge", ["t"]]]]]], "externalNames": ["windAdvectedX", "windAdvectedZ", "typegpuFbm3", "WIND_CA", "WIND_SPEED", "windSurge"] },
  externals: () => ({ windAdvectedX, windAdvectedZ, typegpuFbm3, WIND_CA, WIND_SPEED, windSurge })
}) && $.f)({});
var windAdvectedZ = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function windAdvectedZ2(z, t) {
  "use gpu";
  return __tsover_add(z, __tsover_mul(t, __tsover_mul(-WIND_SA, WIND_SPEED)));
}), {
  v: 1,
  name: "windAdvectedZ",
  ast: { "params": [{ "type": "i", "name": "z" }, { "type": "i", "name": "t" }], "body": [0, [[10, [1, "z", "+", [1, "t", "*", [1, [4, "-", "WIND_SA"], "*", "WIND_SPEED"]]]]]], "externalNames": ["WIND_SA", "WIND_SPEED"] },
  externals: () => ({ WIND_SA, WIND_SPEED })
}) && $.f)({});
var windAdvectedX = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function windAdvectedX2(x, t) {
  "use gpu";
  return __tsover_add(x, __tsover_mul(t, __tsover_mul(-WIND_CA, WIND_SPEED)));
}), {
  v: 1,
  name: "windAdvectedX",
  ast: { "params": [{ "type": "i", "name": "x" }, { "type": "i", "name": "t" }], "body": [0, [[10, [1, "x", "+", [1, "t", "*", [1, [4, "-", "WIND_CA"], "*", "WIND_SPEED"]]]]]], "externalNames": ["WIND_CA", "WIND_SPEED"] },
  externals: () => ({ WIND_CA, WIND_SPEED })
}) && $.f)({});
var windSurge = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function windSurge2(t) {
  "use gpu";
  return __tsover_add(0.4, __tsover_mul(typegpuPwave(__tsover_mul(t, __tsover_div(1, 18))), 0.6));
}), {
  v: 1,
  name: "windSurge",
  ast: { "params": [{ "type": "i", "name": "t" }], "body": [0, [[10, [1, [5, "0.4"], "+", [1, [6, "typegpuPwave", [[1, "t", "*", [1, [5, "1"], "/", [5, "18"]]]]], "*", [5, "0.6"]]]]]], "externalNames": ["typegpuPwave"] },
  externals: () => ({ typegpuPwave })
}) && $.f)({});
var typegpuSwell = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuSwell2(x, z, t) {
  "use gpu";
  const u1 = __tsover_add(__tsover_mul(x, SWELL_T1_CA), __tsover_mul(z, SWELL_T1_SA));
  const p1 = __tsover_mul(__tsover_sub(u1, __tsover_mul(t, 8)), __tsover_div(1, 60));
  const w1 = __tsover_mul(__tsover_sub(typegpuPwave(p1), 0.5), 1.8);
  const u2 = __tsover_add(__tsover_mul(x, SWELL_T2_CA), __tsover_mul(z, SWELL_T2_SA));
  const p2 = __tsover_mul(__tsover_sub(u2, __tsover_mul(t, 5)), __tsover_div(1, 23));
  const w2 = __tsover_mul(__tsover_sub(typegpuPwave(p2), 0.5), 0.7);
  const cx = __tsover_add(x, __tsover_mul(t, 1.7));
  const cz = __tsover_sub(z, __tsover_mul(t, 1.1));
  const chop = __tsover_mul(__tsover_sub(typegpuFbm2(cx, cz, 0.08), 0.5), 0.5);
  return __tsover_add(__tsover_add(w1, w2), chop);
}), {
  v: 1,
  name: "typegpuSwell",
  ast: { "params": [{ "type": "i", "name": "x" }, { "type": "i", "name": "z" }, { "type": "i", "name": "t" }], "body": [0, [[13, "u1", [1, [1, "x", "*", "SWELL_T1_CA"], "+", [1, "z", "*", "SWELL_T1_SA"]]], [13, "p1", [1, [1, "u1", "-", [1, "t", "*", [5, "8"]]], "*", [1, [5, "1"], "/", [5, "60"]]]], [13, "w1", [1, [1, [6, "typegpuPwave", ["p1"]], "-", [5, "0.5"]], "*", [5, "1.8"]]], [13, "u2", [1, [1, "x", "*", "SWELL_T2_CA"], "+", [1, "z", "*", "SWELL_T2_SA"]]], [13, "p2", [1, [1, "u2", "-", [1, "t", "*", [5, "5"]]], "*", [1, [5, "1"], "/", [5, "23"]]]], [13, "w2", [1, [1, [6, "typegpuPwave", ["p2"]], "-", [5, "0.5"]], "*", [5, "0.7"]]], [13, "cx", [1, "x", "+", [1, "t", "*", [5, "1.7"]]]], [13, "cz", [1, "z", "-", [1, "t", "*", [5, "1.1"]]]], [13, "chop", [1, [1, [6, "typegpuFbm2", ["cx", "cz", [5, "0.08"]]], "-", [5, "0.5"]], "*", [5, "0.5"]]], [10, [1, [1, "w1", "+", "w2"], "+", "chop"]]]], "externalNames": ["SWELL_T1_CA", "SWELL_T1_SA", "typegpuPwave", "SWELL_T2_CA", "SWELL_T2_SA", "typegpuFbm2"] },
  externals: () => ({ SWELL_T1_CA, SWELL_T1_SA, typegpuPwave, SWELL_T2_CA, SWELL_T2_SA, typegpuFbm2 })
}) && $.f)({});
var typegpuDunes = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuDunes2(x, z) {
  "use gpu";
  const base = typegpuFbm2(x, z, 16e-4);
  const hBase = __tsover_mul(__tsover_sub(base, 0.5), 24);
  const mRaw = typegpuFbm2(__tsover_add(x, 4100), __tsover_sub(z, 2900), 9e-4);
  const mask = typegpuSmooth(0.35, 0.7, mRaw);
  const u = __tsover_add(__tsover_mul(x, DUNE_CA), __tsover_mul(z, DUNE_SA));
  const v = __tsover_sub(__tsover_mul(z, DUNE_CA), __tsover_mul(x, DUNE_SA));
  const dn = typegpuFbm3(__tsover_mul(u, 0.011), __tsover_mul(v, 28e-4), 1);
  const crests = typegpuRidge(dn, 1.7);
  const hDunes = __tsover_mul(__tsover_mul(crests, 18), __tsover_add(0.25, __tsover_mul(mask, 0.75)));
  return typegpuStamp(__tsover_add(hBase, hDunes), x, z, 120, -340, 40, 90, 14);
}), {
  v: 1,
  name: "typegpuDunes",
  ast: { "params": [{ "type": "i", "name": "x" }, { "type": "i", "name": "z" }], "body": [0, [[13, "base", [6, "typegpuFbm2", ["x", "z", [5, "0.0016"]]]], [13, "hBase", [1, [1, "base", "-", [5, "0.5"]], "*", [5, "24"]]], [13, "mRaw", [6, "typegpuFbm2", [[1, "x", "+", [5, "4100"]], [1, "z", "-", [5, "2900"]], [5, "0.0009"]]]], [13, "mask", [6, "typegpuSmooth", [[5, "0.35"], [5, "0.7"], "mRaw"]]], [13, "u", [1, [1, "x", "*", "DUNE_CA"], "+", [1, "z", "*", "DUNE_SA"]]], [13, "v", [1, [1, "z", "*", "DUNE_CA"], "-", [1, "x", "*", "DUNE_SA"]]], [13, "dn", [6, "typegpuFbm3", [[1, "u", "*", [5, "0.011"]], [1, "v", "*", [5, "0.0028"]], [5, "1"]]]], [13, "crests", [6, "typegpuRidge", ["dn", [5, "1.7"]]]], [13, "hDunes", [1, [1, "crests", "*", [5, "18"]], "*", [1, [5, "0.25"], "+", [1, "mask", "*", [5, "0.75"]]]]], [10, [6, "typegpuStamp", [[1, "hBase", "+", "hDunes"], "x", "z", [5, "120"], [4, "-", [5, "340"]], [5, "40"], [5, "90"], [5, "14"]]]]]], "externalNames": ["typegpuFbm2", "typegpuSmooth", "DUNE_CA", "DUNE_SA", "typegpuFbm3", "typegpuRidge", "typegpuStamp"] },
  externals: () => ({ typegpuFbm2, typegpuSmooth, DUNE_CA, DUNE_SA, typegpuFbm3, typegpuRidge, typegpuStamp })
}) && $.f)({});
var DUNE_CA = 0.8138784566625339;
var DUNE_SA = 0.5810351605373051;
var SWELL_T1_CA = 0.8775825618903728;
var SWELL_T1_SA = 0.479425538604203;
var SWELL_T2_CA = -0.5885011172553458;
var SWELL_T2_SA = 0.8084964038195901;
var WIND_CA = 0.6216099682706644;
var WIND_SA = 0.7833269096274834;
var WIND_SPEED = 6;
var SERPENT_SPAN = 90;
var SERPENT_LAG = 0.35;
var SERPENT_HUMP_AMP = 7;
var SERPENT_HUMP_FREQ = 1.4;
var SERPENT_SWAY_AMP = 4;
var SERPENT_SWAY_FREQ = 0.55;
var typegpuKernels = Object.freeze({
  dunes: tgpu2.fn([d2.f32, d2.f32], d2.f32)(typegpuDunes).$name("matterDunes"),
  swell: tgpu2.fn([d2.f32, d2.f32, d2.f32], d2.f32)(typegpuSwell).$name("matterSwell"),
  windX: tgpu2.fn([d2.f32, d2.f32, d2.f32], d2.f32)(typegpuWindX).$name("matterWindX"),
  windZ: tgpu2.fn([d2.f32, d2.f32, d2.f32], d2.f32)(typegpuWindZ).$name("matterWindZ"),
  wind: tgpu2.fn([d2.f32, d2.f32, d2.f32], d2.vec2f)(typegpuWind).$name("matterWind"),
  serpentRadius: tgpu2.fn([d2.f32], d2.f32)(typegpuSerpentRadius).$name("matterSerpentRadius"),
  serpentSpine: tgpu2.fn([d2.f32, d2.f32], d2.vec3f)(typegpuSerpentSpine).$name("matterSerpentSpine")
});

// src/typegpu/three.js
var TYPEGPU_THREE_WEBGPU_ONLY = true;
function typegpuDunesNode(xNode, zNode) {
  const x = t3.fromTSL(xNode, d3.f32);
  const z = t3.fromTSL(zNode, d3.f32);
  return t3.toTSL(/* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (() => {
    "use gpu";
    return typegpuDunes(x.$, z.$);
  }), {
    v: 1,
    name: void 0,
    ast: { "params": [], "body": [0, [[10, [6, "typegpuDunes", [[7, "x", "$"], [7, "z", "$"]]]]]], "externalNames": ["typegpuDunes", "x", "z"] },
    externals: () => ({ typegpuDunes, x, z })
  }) && $.f)({}));
}
function typegpuSwellNode(xNode, zNode, timeNode) {
  const x = t3.fromTSL(xNode, d3.f32);
  const z = t3.fromTSL(zNode, d3.f32);
  const t = t3.fromTSL(timeNode, d3.f32);
  return t3.toTSL(/* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (() => {
    "use gpu";
    return typegpuSwell(x.$, z.$, t.$);
  }), {
    v: 1,
    name: void 0,
    ast: { "params": [], "body": [0, [[10, [6, "typegpuSwell", [[7, "x", "$"], [7, "z", "$"], [7, "t", "$"]]]]]], "externalNames": ["typegpuSwell", "x", "z", "t"] },
    externals: () => ({ typegpuSwell, x, z, t })
  }) && $.f)({}));
}
function typegpuWindNode(xNode, zNode, timeNode) {
  const x = t3.fromTSL(xNode, d3.f32);
  const z = t3.fromTSL(zNode, d3.f32);
  const t = t3.fromTSL(timeNode, d3.f32);
  return t3.toTSL(/* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (() => {
    "use gpu";
    return typegpuWind(x.$, z.$, t.$);
  }), {
    v: 1,
    name: void 0,
    ast: { "params": [], "body": [0, [[10, [6, "typegpuWind", [[7, "x", "$"], [7, "z", "$"], [7, "t", "$"]]]]]], "externalNames": ["typegpuWind", "x", "z", "t"] },
    externals: () => ({ typegpuWind, x, z, t })
  }) && $.f)({}));
}
function typegpuSerpentSpineNode(uNode, timeNode) {
  const u = t3.fromTSL(uNode, d3.f32);
  const t = t3.fromTSL(timeNode, d3.f32);
  return t3.toTSL(/* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (() => {
    "use gpu";
    return typegpuSerpentSpine(u.$, t.$);
  }), {
    v: 1,
    name: void 0,
    ast: { "params": [], "body": [0, [[10, [6, "typegpuSerpentSpine", [[7, "u", "$"], [7, "t", "$"]]]]]], "externalNames": ["typegpuSerpentSpine", "u", "t"] },
    externals: () => ({ typegpuSerpentSpine, u, t })
  }) && $.f)({}));
}
function typegpuSerpentRadiusNode(uNode) {
  const u = t3.fromTSL(uNode, d3.f32);
  return t3.toTSL(/* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (() => {
    "use gpu";
    return typegpuSerpentRadius(u.$);
  }), {
    v: 1,
    name: void 0,
    ast: { "params": [], "body": [0, [[10, [6, "typegpuSerpentRadius", [[7, "u", "$"]]]]]], "externalNames": ["typegpuSerpentRadius", "u"] },
    externals: () => ({ typegpuSerpentRadius, u })
  }) && $.f)({}));
}
function makeNativeTslCompatibility(tsl, options = {}) {
  const A = makeTslAdapter(tsl, options);
  return Object.freeze({
    webgpu: true,
    webgl2: true,
    dunes: (x, z) => dunesField(A, x, z),
    swell: (x, z, t) => swellField(A, x, z, t),
    wind: (x, z, t) => windField(A, x, z, t),
    serpentRadius: (u) => serpentRadius(A, u),
    serpentSpine: (u, t) => serpentSpine(A, u, t)
  });
}
export {
  TYPEGPU_THREE_WEBGPU_ONLY,
  makeNativeTslCompatibility,
  typegpuDunesNode,
  typegpuSerpentRadiusNode,
  typegpuSerpentSpineNode,
  typegpuSwellNode,
  typegpuWindNode
};
//# sourceMappingURL=three.js.map
