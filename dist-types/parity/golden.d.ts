export type GoldenPoint = {
    id: string;
    x: number;
    z: number;
};
export type GoldenRecord = GoldenPoint & {
    v: number;
    f32: number;
};
export type GoldenMismatch = GoldenPoint & {
    want: number;
    got: number;
    ulp: number;
    abs: number;
};
export type GoldenComparison = {
    maxUlp: number;
    maxAbs: number;
    worst: GoldenMismatch | null;
    n: number;
};
/** @typedef {{ id: string, x: number, z: number }} GoldenPoint */
/** @typedef {GoldenPoint & { v: number, f32: number }} GoldenRecord */
/** @typedef {GoldenPoint & { want: number, got: number, ulp: number, abs: number }} GoldenMismatch */
/** @typedef {{ maxUlp: number, maxAbs: number, worst: GoldenMismatch | null, n: number }} GoldenComparison */
/** @param {number} n @returns {number} f32 bit pattern after rounding. */
export declare function f32Bits(n: number): number;
/**
 * Distance in f32 ulps between two numbers (after rounding each to f32).
 * Uses the monotonic total-order trick so values straddling zero measure
 * correctly. Identical bit patterns are 0.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export declare function ulpDelta32(a: number, b: number): number;
/**
 * Deterministic LCG so golden coordinates never depend on Math.random.
 * @param {number} [seed]
 * @returns {() => number}
 */
export declare function makeLcg(seed?: number): () => number;
/**
 * Deterministic golden coordinates over a world extent.
 * @param {number} n point count
 * @param {{ extent?: number, seed?: number }} [opts] world extent and seed
 * @returns {GoldenPoint[]}
 */
export declare function makeGoldenPoints(n: number, { extent, seed }?: {
    extent?: number;
    seed?: number;
}): GoldenPoint[];
/**
 * Record a golden report: field values at each point, as f64 and f32 bits.
 * Serializable; commit it next to the field it describes.
 * @param {(x: number, z: number) => number} sample plain-number field eval
 * @param {readonly GoldenPoint[]} points coordinates to record
 * @returns {GoldenRecord[]}
 */
export declare function captureGolden(sample: (x: number, z: number) => number, points: readonly GoldenPoint[]): GoldenRecord[];
/**
 * Compare a backend's values against a golden recording.
 * @param {(x: number, z: number) => number} sample backend eval
 * @param {readonly GoldenRecord[]} golden
 * @returns {GoldenComparison}
 */
export declare function compareToGolden(sample: (x: number, z: number) => number, golden: readonly GoldenRecord[]): GoldenComparison;
//# sourceMappingURL=golden.d.ts.map