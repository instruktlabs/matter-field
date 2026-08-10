import type { Adapter, Field } from './adapter.js';
export type Dual = {
    v: number;
    dx: number;
    dz: number;
};
export type SurfaceNormal = {
    x: number;
    y: number;
    z: number;
    h: number;
};
/**
 * Seed an evaluation point: x varies in dx, z varies in dz.
 * @param {number} x
 * @param {number} z
 * @returns {{ x: Dual, z: Dual }}
 */
export declare function dualInputs(x: number, z: number): {
    x: Dual;
    z: Dual;
};
/** @type {Adapter<Dual, number>} Dual-number backend. */
export declare const dualAdapter: Adapter<Dual, number>;
/**
 * Evaluate a field's value and gradient at (x, z) in one pass.
 * @param {Field<Dual, number, [Dual, Dual]>} field field over the contract
 * @param {number} x
 * @param {number} z
 * @returns {Dual}
 */
export declare function evalWithGradient(field: Field<Dual, number, [Dual, Dual]>, x: number, z: number): Dual;
/**
 * Y-up unit surface normal of a heightfield from one dual evaluation.
 * @param {Field<Dual, number, [Dual, Dual]>} heightField returns height V
 * @param {number} x
 * @param {number} z
 * @returns {SurfaceNormal}
 */
export declare function surfaceNormal(heightField: Field<Dual, number, [Dual, Dual]>, x: number, z: number): SurfaceNormal;
//# sourceMappingURL=dual.d.ts.map