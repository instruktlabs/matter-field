// matter-field: plain-number backends.
//
// numberAdapter - f64, the authoritative CPU oracle. ECMAScript specifies the
// restricted arithmetic used here. The shipped example goldens are tested
// bit-exact across the runtime configurations named in CI; that evidence does
// not prove every user-authored field or input.
//
// makeF32Adapter - the same algebra with Math.fround after every operation:
// a CPU-side emulation of GPU f32 arithmetic. Running a field on both number
// backends measures the f64->f32 quantization drift WITHOUT a GPU, which
// provides a useful CPU-side baseline for the CPU<->GPU divergence you might
// observe. It is not a bound: GPUs may round differently per op, fuse, or
// reassociate within spec.
// Part of the assay kit, not a gameplay backend.

import { LATTICE_OFFSET, hash01, hash01f32 } from './hash.js';

export { LATTICE_OFFSET };

/** f64 backend. V = number. */
export const numberAdapter = Object.freeze({
  f: (x) => x,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  abs: Math.abs,
  floor: Math.floor,
  sqrt: Math.sqrt,
  min: Math.min,
  max: Math.max,
  mix: (a, b, t) => a + (b - a) * t,
  clamp01: (x) => (x < 0 ? 0 : x > 1 ? 1 : x),
  smooth: (e0, e1, x) => {
    const t = (x - e0) / (e1 - e0);
    const c = t < 0 ? 0 : t > 1 ? 1 : t;
    return c * c * (3 - 2 * c);
  },
  latt: (fx) => (fx + LATTICE_OFFSET) | 0,
  hash01,
  cache: (v) => v,
});

const fr = Math.fround;

/**
 * f32-emulation backend. V = number, but every op result is rounded to f32.
 * The formulas mirror numberAdapter exactly, op for op, in the same order.
 */
export function makeF32Adapter() {
  return Object.freeze({
    f: (x) => fr(x),
    add: (a, b) => fr(a + b),
    sub: (a, b) => fr(a - b),
    mul: (a, b) => fr(a * b),
    abs: (a) => fr(Math.abs(a)),
    floor: (a) => fr(Math.floor(a)),
    sqrt: (a) => fr(Math.sqrt(a)),
    min: (a, b) => fr(Math.min(a, b)),
    max: (a, b) => fr(Math.max(a, b)),
    mix: (a, b, t) => fr(a + fr(fr(b - a) * t)),
    clamp01: (x) => (x < 0 ? 0 : x > 1 ? 1 : fr(x)),
    smooth: (e0, e1, x) => {
      const t = fr(fr(x - fr(e0)) / fr(fr(e1) - fr(e0)));
      const c = t < 0 ? 0 : t > 1 ? 1 : t;
      return fr(fr(c * c) * fr(3 - fr(2 * c)));
    },
    latt: (fx) => (fx + LATTICE_OFFSET) | 0,
    hash01: hash01f32,
    cache: (v) => v,
  });
}
