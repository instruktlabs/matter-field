// matter-field: write field math once; run it everywhere that matters.
//
//   import { numberAdapter } from 'matter-field';        // f64 CPU oracle
//   import { makeF32Adapter } from 'matter-field';       // GPU-drift emulation
//   import { dualAdapter, surfaceNormal } from 'matter-field';  // gradients
//   import { makeTslAdapter } from 'matter-field/backend-tsl';  // shader graph
//   import { runCpuAssay } from 'matter-field/parity';   // measured CPU assay

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
export {
  LATTICE_OFFSET, LATTICE_FLOOR_MIN, LATTICE_FLOOR_MAX,
  hash01, hash01f32, HASH_WGSL, HASH_GLSL,
} from './hash.js';
export { numberAdapter, makeF32Adapter } from './number.js';
export { dualAdapter, dualInputs, evalWithGradient, surfaceNormal } from './dual.js';
export { fade, vnoise, fbm, ridge, stamp } from './noise.js';
