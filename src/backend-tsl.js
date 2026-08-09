// matter-field: Three.js TSL backend.
//
// Dependency-inverted: the caller passes their `three/tsl` module namespace,
// so this package has ZERO dependencies and never fights the host app over
// Three versions (TSL is still evolving; the adapter surface is 15 small
// functions, so re-validating a new Three release means re-running the assay,
// not porting code).
//
// The same field function that ran as numbers now builds a WGSL/GLSL
// expression graph. Guarantee tier for the float tree is "bounded by f32
// rounding" (WGSL 15.7: +,-,* correctly rounded but no mandated rounding
// direction; / at 2.5 ulp; smoothstep inherits /; sqrt via inverseSqrt at
// ~2 ulp; reassociation and FMA contraction permitted). The hash is bit-exact
// (u32 ops have no accuracy latitude). Measure your field with the parity
// probe; do not assume.

import { LATTICE_OFFSET } from './hash.js';

/**
 * Build the u32 hash as a named TSL function (emitted once in the shader).
 * @param {object} tsl the caller's `three/tsl` namespace
 * @returns {(ix, iz, ox: number, oz: number) => Node} hash01 for the adapter
 */
export function makeTslHash(tsl, { fnName = 'mfHash01' } = {}) {
  const { Fn, float, uint } = tsl;
  const hashCore = Fn(([a, b]) => {
    const h = a.mul(uint(0x85ebca6b)).bitXor(b.mul(uint(0xc2b2ae3d))).toVar();
    h.assign(h.bitXor(h.shiftRight(uint(13))).mul(uint(0x27d4eb2f)));
    h.assign(h.bitXor(h.shiftRight(uint(15))));
    return float(h).mul(1 / 4294967296);
  }).setLayout({
    name: fnName,
    type: 'float',
    inputs: [
      { name: 'a', type: 'uint' },
      { name: 'b', type: 'uint' },
    ],
  });
  return function hash01(ix, iz, ox, oz) {
    const a = ox === 0 ? ix : ix.add(uint(ox));
    const b = oz === 0 ? iz : iz.add(uint(oz));
    return hashCore(a, b);
  };
}

/**
 * The TSL adapter. V = TSL node.
 * @param {object} tsl the caller's `three/tsl` namespace
 */
export function makeTslAdapter(tsl, opts = {}) {
  const { float, uint, abs, floor, min, max, mix, clamp, smoothstep } = tsl;
  const hash01 = opts.hash01 ?? makeTslHash(tsl, opts);
  return {
    f: (x) => float(x),
    add: (a, b) => a.add(b),
    sub: (a, b) => a.sub(b),
    mul: (a, b) => a.mul(b),
    abs: (a) => abs(a),
    floor: (a) => floor(a),
    sqrt: (a) => a.sqrt(),
    min: (a, b) => min(a, b),
    max: (a, b) => max(a, b),
    mix: (a, b, t) => mix(a, b, t),
    clamp01: (a) => clamp(a, 0.0, 1.0),
    smooth: (e0, e1, x) => smoothstep(float(e0), float(e1), x),
    latt: (fx) => uint(fx.add(LATTICE_OFFSET)),
    hash01,
    cache: (v) => v.toVar(),
  };
}
