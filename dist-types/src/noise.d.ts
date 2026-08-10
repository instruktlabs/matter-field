import type { Adapter } from './adapter.js';
export type StampOptions = {
    cx: number;
    cz: number;
    rIn: number;
    rOut: number;
    level: number;
};
/** @import { Adapter } from './adapter.js' */
/**
 * @typedef {{
 *   cx: number,
 *   cz: number,
 *   rIn: number,
 *   rOut: number,
 *   level: number,
 * }} StampOptions
 */
/** Quintic fade: t^3 (t (6t - 15) + 10). C1-continuous value noise. */
/**
 * @template V
 * @template L
 * @param {Adapter<V, L>} A
 * @param {V} t
 * @returns {V}
 */
export declare function fade<V, L>(A: Adapter<V, L>, t: V): V;
/**
 * Value noise on the integer lattice, output [0, 1).
 * 4 hashes, bilinear blend with quintic weights, no gradients to store.
 * @param {object} A adapter
 * @param {*} x V, in lattice cells (pre-multiply by frequency)
 * @param {*} z V
 * @param {number} [ox] channel offset (decorrelates layers)
 * @param {number} [oz] channel offset
 */
/**
 * @template V
 * @template L
 * @param {Adapter<V, L>} A
 * @param {V} x
 * @param {V} z
 * @param {number} [ox]
 * @param {number} [oz]
 * @returns {V}
 */
export declare function vnoise<V, L>(A: Adapter<V, L>, x: V, z: V, ox?: number, oz?: number): V;
/**
 * Fractal Brownian motion: `oct` octaves of value noise, rotated + offset
 * per octave to bury lattice alignment. Output normalized to [0, 1].
 * @param {object} A adapter
 * @param {*} x0 V, in world units
 * @param {*} z0 V
 * @param {number} freq cells per world unit for octave 0
 * @param {number} oct octave count (plain int - loop unrolls into shaders)
 * @param {number} [gain] amplitude falloff per octave
 * @param {number} [lac] lacunarity (frequency growth per octave)
 */
/**
 * @template V
 * @template L
 * @param {Adapter<V, L>} A
 * @param {V} x0
 * @param {V} z0
 * @param {number} freq
 * @param {number} oct
 * @param {number} [gain]
 * @param {number} [lac]
 * @returns {V}
 */
export declare function fbm<V, L>(A: Adapter<V, L>, x0: V, z0: V, freq: number, oct: number, gain?: number, lac?: number): V;
/**
 * Ridge shaping: 1 - |2n - 1|, crests where n = 0.5, sharpened.
 * pow(r, s) is approximated as mix(r, r*r, s - 1) for s in [1, 2] - a
 * branch-free, transcendental-free stand-in matched on every backend
 * (adapter.js rule 2: an exact pow would not be portable).
 * @param {*} n V in [0, 1]
 * @param {number} sharp plain, in [1, 2]
 */
/**
 * @template V
 * @template L
 * @param {Adapter<V, L>} A
 * @param {V} n
 * @param {number} sharp
 * @returns {V}
 */
export declare function ridge<V, L>(A: Adapter<V, L>, n: V, sharp: number): V;
/**
 * Smooth periodic wave WITHOUT sin: sawtooth via floor, folded to a
 * triangle, cubic-smoothed. Output [0, 1], period 1, C1-continuous.
 * This is how the contract does oscillation - sin/cos have no cross-vendor
 * precision contract on GPUs (rule 2) and their large-argument behavior is
 * exactly what breaks fract(sin())-style code. Floor is exact for the finite
 * represented input; callers must still wrap large f32 phases before they lose
 * fractional precision. Feed it `phase` in periods (already scaled).
 * @param {*} t V, in periods
 */
/**
 * @template V
 * @template L
 * @param {Adapter<V, L>} A
 * @param {V} t
 * @returns {V}
 */
export declare function pwave<V, L>(A: Adapter<V, L>, t: V): V;
/**
 * Circular flatten stamp: blends a field value toward `level` inside a disc,
 * smoothstep falloff over squared distance (no sqrt). This is how authored
 * content (landing pads, foundations, basins) coexists with procedural
 * fields while staying inside the contract; cx/cz/rIn/rOut/level are plain
 * constants that unroll into shaders.
 * NOTE: stamps do not commute - float mix order is part of the field
 * (adapter.js rule 4). Apply them in one canonical order everywhere.
 * @param {*} h V field value at (x, z)
 * @param {*} x V
 * @param {*} z V
 */
/**
 * @template V
 * @template L
 * @param {Adapter<V, L>} A
 * @param {V} h
 * @param {V} x
 * @param {V} z
 * @param {StampOptions} options
 * @returns {V}
 */
export declare function stamp<V, L>(A: Adapter<V, L>, h: V, x: V, z: V, { cx, cz, rIn, rOut, level }: StampOptions): V;
//# sourceMappingURL=noise.d.ts.map