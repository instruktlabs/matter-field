// src/typegpu/primitives.js
import tgpu, { d } from "typegpu";
import { abs, floor, isBeingTranspiled, max, min } from "typegpu/std";

// src/hash.js
function hashU32(ix, iz, ox, oz) {
  const a = ix + ox | 0;
  const b = iz + oz | 0;
  let h = Math.imul(a, 2246822507) ^ Math.imul(b, 3266489917) | 0;
  h = Math.imul(h ^ h >>> 13, 668265263) | 0;
  return (h ^ h >>> 15) >>> 0;
}

// src/typegpu/primitives.js
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
  const x1 = __tsover_add(__tsover_mul(__tsover_sub(__tsover_mul(x, RC), __tsover_mul(z, RS)), LAC), OSX);
  const z1 = __tsover_add(__tsover_mul(__tsover_add(__tsover_mul(x, RS), __tsover_mul(z, RC)), LAC), OSZ);
  sum = __tsover_add(sum, __tsover_mul(typegpuVnoise(x1, z1, d.u32(0), d.u32(0)), 0.25));
  const x2 = __tsover_add(__tsover_mul(__tsover_sub(__tsover_mul(x1, RC), __tsover_mul(z1, RS)), LAC), OSX);
  const z2 = __tsover_add(__tsover_mul(__tsover_add(__tsover_mul(x1, RS), __tsover_mul(z1, RC)), LAC), OSZ);
  sum = __tsover_add(sum, __tsover_mul(typegpuVnoise(x2, z2, d.u32(0), d.u32(0)), 0.125));
  return __tsover_mul(sum, __tsover_div(1, 0.875));
}), {
  v: 1,
  name: "typegpuFbm3",
  ast: { "params": [{ "type": "i", "name": "x0" }, { "type": "i", "name": "z0" }, { "type": "i", "name": "freq" }], "body": [0, [[13, "x", [1, "x0", "*", "freq"]], [13, "z", [1, "z0", "*", "freq"]], [12, "sum", [1, [6, "typegpuVnoise", ["x", "z", [6, [7, "d", "u32"], [[5, "0"]]], [6, [7, "d", "u32"], [[5, "0"]]]]], "*", [5, "0.5"]]], [13, "x1", [1, [1, [1, [1, "x", "*", "RC"], "-", [1, "z", "*", "RS"]], "*", "LAC"], "+", "OSX"]], [13, "z1", [1, [1, [1, [1, "x", "*", "RS"], "+", [1, "z", "*", "RC"]], "*", "LAC"], "+", "OSZ"]], [2, "sum", "=", [1, "sum", "+", [1, [6, "typegpuVnoise", ["x1", "z1", [6, [7, "d", "u32"], [[5, "0"]]], [6, [7, "d", "u32"], [[5, "0"]]]]], "*", [5, "0.25"]]]], [13, "x2", [1, [1, [1, [1, "x1", "*", "RC"], "-", [1, "z1", "*", "RS"]], "*", "LAC"], "+", "OSX"]], [13, "z2", [1, [1, [1, [1, "x1", "*", "RS"], "+", [1, "z1", "*", "RC"]], "*", "LAC"], "+", "OSZ"]], [2, "sum", "=", [1, "sum", "+", [1, [6, "typegpuVnoise", ["x2", "z2", [6, [7, "d", "u32"], [[5, "0"]]], [6, [7, "d", "u32"], [[5, "0"]]]]], "*", [5, "0.125"]]]], [10, [1, "sum", "*", [1, [5, "1"], "/", [5, "0.875"]]]]]], "externalNames": ["typegpuVnoise", "d", "RC", "RS", "LAC", "OSX", "OSZ"] },
  externals: () => ({ typegpuVnoise, d, RC, RS, LAC, OSX, OSZ })
}) && $.f)({});
var typegpuFbm2 = /* @__PURE__ */ (($) => (globalThis.__TYPEGPU_META__ ??= /* @__PURE__ */ new WeakMap()).set($.f = (function typegpuFbm22(x0, z0, freq) {
  "use gpu";
  const x = __tsover_mul(x0, freq);
  const z = __tsover_mul(z0, freq);
  let sum = __tsover_mul(typegpuVnoise(x, z, d.u32(0), d.u32(0)), 0.5);
  const x1 = __tsover_add(__tsover_mul(__tsover_sub(__tsover_mul(x, RC), __tsover_mul(z, RS)), LAC), OSX);
  const z1 = __tsover_add(__tsover_mul(__tsover_add(__tsover_mul(x, RS), __tsover_mul(z, RC)), LAC), OSZ);
  sum = __tsover_add(sum, __tsover_mul(typegpuVnoise(x1, z1, d.u32(0), d.u32(0)), 0.25));
  return __tsover_mul(sum, __tsover_div(1, 0.75));
}), {
  v: 1,
  name: "typegpuFbm2",
  ast: { "params": [{ "type": "i", "name": "x0" }, { "type": "i", "name": "z0" }, { "type": "i", "name": "freq" }], "body": [0, [[13, "x", [1, "x0", "*", "freq"]], [13, "z", [1, "z0", "*", "freq"]], [12, "sum", [1, [6, "typegpuVnoise", ["x", "z", [6, [7, "d", "u32"], [[5, "0"]]], [6, [7, "d", "u32"], [[5, "0"]]]]], "*", [5, "0.5"]]], [13, "x1", [1, [1, [1, [1, "x", "*", "RC"], "-", [1, "z", "*", "RS"]], "*", "LAC"], "+", "OSX"]], [13, "z1", [1, [1, [1, [1, "x", "*", "RS"], "+", [1, "z", "*", "RC"]], "*", "LAC"], "+", "OSZ"]], [2, "sum", "=", [1, "sum", "+", [1, [6, "typegpuVnoise", ["x1", "z1", [6, [7, "d", "u32"], [[5, "0"]]], [6, [7, "d", "u32"], [[5, "0"]]]]], "*", [5, "0.25"]]]], [10, [1, "sum", "*", [1, [5, "1"], "/", [5, "0.75"]]]]]], "externalNames": ["typegpuVnoise", "d", "RC", "RS", "LAC", "OSX", "OSZ"] },
  externals: () => ({ typegpuVnoise, d, RC, RS, LAC, OSX, OSZ })
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
  const t3 = __tsover_mul(__tsover_mul(t, t), t);
  return __tsover_mul(t3, __tsover_add(__tsover_mul(t, __tsover_sub(__tsover_mul(t, 6), 15)), 10));
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
var RC = 0.7583618759905082;
var RS = 0.6518337710215366;
var LAC = 2.03;
var OSX = 37.71;
var OSZ = 17.34;
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
import tgpu2, { d as d2 } from "typegpu";
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
export {
  TYPEGPU_LATTICE_OFFSET,
  typegpuDunes,
  typegpuFade,
  typegpuFbm2,
  typegpuFbm3,
  typegpuHash01,
  typegpuHashU32,
  typegpuHashU32Kernel,
  typegpuKernels,
  typegpuPrimitiveKernels,
  typegpuPwave,
  typegpuRidge,
  typegpuSerpentRadius,
  typegpuSerpentSpine,
  typegpuSerpentX,
  typegpuSerpentY,
  typegpuSerpentZ,
  typegpuSmooth,
  typegpuStamp,
  typegpuSwell,
  typegpuVnoise,
  typegpuWind,
  typegpuWindX,
  typegpuWindZ
};
//# sourceMappingURL=index.js.map
