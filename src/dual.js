// matter-field: dual-number backend - analytic gradients for free.
//
// V = { v, dx, dz }: the value and its partial derivatives with respect to
// the two seed coordinates. Forward-mode automatic differentiation through
// the SAME expression tree, so the gradient is the exact derivative of the
// exact field - no finite-difference epsilon, no second implementation.
//
// This backend closes the one hole the pattern otherwise has: CPU consumers
// wanting surface normals had to finite-difference (3 field evaluations,
// epsilon error), and GPU materials wanting gradients needed hand-mirrored
// analytic twins. With duals, normals/slopes/contact frames come from one
// evaluation of the one tree.
//
// The `.v` channel computes with EXACTLY the numberAdapter formulas in
// EXACTLY the same order, so dual values are bit-identical to number-backend
// values (asserted in tests). The derivative rules:
//
//   floor, hash01           piecewise constant  -> d = 0
//   abs                     d * sign(v)         (subgradient 1 at 0)
//   min/max                 the winning branch's derivative (a on ties)
//   clamp01, smooth         0 outside the active interval, chain rule inside
//   mix(a,b,t)              da + (db - da) t + (b - a) dt   (product rule)
//
// Kinks (abs/min/max/clamp/smoothstep edges) get one-sided derivatives -
// measure-zero and exactly what a shader's analytic gradient would pick.
//
// It is also the contract's best lint: naked `+` on a dual is NaN, so running
// a field through this backend catches any op that bypassed the adapter.

import { LATTICE_OFFSET, hash01 } from './hash.js';

/** Lift a plain constant. */
const K = (x) => ({ v: x, dx: 0, dz: 0 });

/** Seed an evaluation point: x varies in dx, z varies in dz. */
export function dualInputs(x, z) {
  return {
    x: { v: x, dx: 1, dz: 0 },
    z: { v: z, dx: 0, dz: 1 },
  };
}

/** Dual-number backend. V = { v, dx, dz }. */
export const dualAdapter = Object.freeze({
  f: K,
  add: (a, b) => ({ v: a.v + b.v, dx: a.dx + b.dx, dz: a.dz + b.dz }),
  sub: (a, b) => ({ v: a.v - b.v, dx: a.dx - b.dx, dz: a.dz - b.dz }),
  mul: (a, b) => ({
    v: a.v * b.v,
    dx: a.dx * b.v + a.v * b.dx,
    dz: a.dz * b.v + a.v * b.dz,
  }),
  abs: (a) => {
    const s = a.v < 0 ? -1 : 1;
    return { v: Math.abs(a.v), dx: a.dx * s, dz: a.dz * s };
  },
  floor: (a) => ({ v: Math.floor(a.v), dx: 0, dz: 0 }),
  sqrt: (a) => {
    const r = Math.sqrt(a.v);
    const g = r > 0 ? 0.5 / r : 0;
    return { v: r, dx: a.dx * g, dz: a.dz * g };
  },
  min: (a, b) => (a.v <= b.v ? a : b),
  max: (a, b) => (a.v >= b.v ? a : b),
  mix: (a, b, t) => ({
    v: a.v + (b.v - a.v) * t.v,
    dx: a.dx + (b.dx - a.dx) * t.v + (b.v - a.v) * t.dx,
    dz: a.dz + (b.dz - a.dz) * t.v + (b.v - a.v) * t.dz,
  }),
  clamp01: (a) => {
    if (a.v < 0) return { v: 0, dx: 0, dz: 0 };
    if (a.v > 1) return { v: 1, dx: 0, dz: 0 };
    return a;
  },
  smooth: (e0, e1, x) => {
    const t = (x.v - e0) / (e1 - e0);
    const c = t < 0 ? 0 : t > 1 ? 1 : t;
    const v = c * c * (3 - 2 * c);
    if (t <= 0 || t >= 1) return { v, dx: 0, dz: 0 };
    const g = (6 * c * (1 - c)) / (e1 - e0);
    return { v, dx: x.dx * g, dz: x.dz * g };
  },
  latt: (fa) => (fa.v + LATTICE_OFFSET) | 0,
  hash01: (ix, iz, ox, oz) => K(hash01(ix, iz, ox, oz)),
  cache: (v) => v,
});

/**
 * Evaluate a field's value and gradient at (x, z) in one pass.
 * @param {(A: object, x: any, z: any) => any} field  field over the contract,
 *        returning a single V
 * @returns {{ v: number, dx: number, dz: number }}
 */
export function evalWithGradient(field, x, z) {
  const s = dualInputs(x, z);
  return field(dualAdapter, s.x, s.z);
}

/**
 * Y-up unit surface normal of a heightfield from one dual evaluation.
 * @param {(A: object, x: any, z: any) => any} heightField returns height V
 */
export function surfaceNormal(heightField, x, z) {
  const g = evalWithGradient(heightField, x, z);
  const inv = 1 / Math.sqrt(g.dx * g.dx + 1 + g.dz * g.dz);
  return { x: -g.dx * inv, y: inv, z: -g.dz * inv, h: g.v };
}
