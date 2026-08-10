import { LATTICE_OFFSET } from './hash.js';
import type { Adapter } from './adapter.js';
/** @import { Adapter } from './adapter.js' */
export { LATTICE_OFFSET };
/** f64 backend. V = number. */
/** @type {Adapter<number, number>} */
export declare const numberAdapter: Adapter<number, number>;
/**
 * f32-emulation backend. V = number, but every op result is rounded to f32.
 * The formulas mirror numberAdapter exactly, op for op, in the same order.
 */
/** @returns {Adapter<number, number>} */
export declare function makeF32Adapter(): Adapter<number, number>;
//# sourceMappingURL=number.d.ts.map