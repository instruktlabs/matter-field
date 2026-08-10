export type Adapter<V, L> = import('./adapter.js').Adapter<V, L>;
export type Field<V, L, Args extends readonly unknown[]> = import('./adapter.js').Field<V, L, Args>;
export type Dual = import('./dual.js').Dual;
export type SurfaceNormal = import('./dual.js').SurfaceNormal;
/**
 * @template V
 * @template L
 * @typedef {import('./adapter.js').Adapter<V, L>} Adapter
 */
/**
 * @template V
 * @template L
 * @template {readonly unknown[]} Args
 * @typedef {import('./adapter.js').Field<V, L, Args>} Field
 */
/** @typedef {import('./dual.js').Dual} Dual */
/** @typedef {import('./dual.js').SurfaceNormal} SurfaceNormal */
export { ADAPTER_OPS, adapterProblems, numericAdapterProblems } from './adapter.js';
export { LATTICE_OFFSET, LATTICE_FLOOR_MIN, LATTICE_FLOOR_MAX, hash01, hash01f32, HASH_WGSL, HASH_GLSL, } from './hash.js';
export { numberAdapter, makeF32Adapter } from './number.js';
export { dualAdapter, dualInputs, evalWithGradient, surfaceNormal } from './dual.js';
export { fade, vnoise, fbm, ridge, stamp } from './noise.js';
//# sourceMappingURL=index.d.ts.map