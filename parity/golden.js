// matter-field parity: golden points and ulp arithmetic.
//
// A golden set is a deterministic list of sample coordinates plus the field's
// recorded f64 values and f32 bit patterns. Backends are compared AT THE SAME
// POINTS across machines, GPUs, and package versions; drift shows up as ulp
// deltas against the recording, not as vibes.

const F32 = new Float32Array(1);
const U32 = new Uint32Array(F32.buffer);

/** @typedef {{ id: string, x: number, z: number }} GoldenPoint */

/** @typedef {GoldenPoint & { v: number, f32: number }} GoldenRecord */

/** @typedef {GoldenPoint & { want: number, got: number, ulp: number, abs: number }} GoldenMismatch */

/** @typedef {{ maxUlp: number, maxAbs: number, worst: GoldenMismatch | null, n: number }} GoldenComparison */

/** @param {number} n @returns {number} f32 bit pattern after rounding. */
export function f32Bits(n) {
  F32[0] = n;
  return U32[0];
}

/**
 * Distance in f32 ulps between two numbers (after rounding each to f32).
 * Uses the monotonic total-order trick so values straddling zero measure
 * correctly. Identical bit patterns are 0.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function ulpDelta32(a, b) {
  const ia = orderable(f32Bits(a));
  const ib = orderable(f32Bits(b));
  return Math.abs(ia - ib);
}

/** @param {number} bits @returns {number} */
function orderable(bits) {
  // Map IEEE-754 bits onto a monotonically increasing integer line.
  return bits & 0x80000000 ? -(bits & 0x7fffffff) : bits;
}

/**
 * Deterministic LCG so golden coordinates never depend on Math.random.
 * @param {number} [seed]
 * @returns {() => number}
 */
export function makeLcg(seed = 0x9e3779b9) {
  let s = seed >>> 0;
  return function next() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Deterministic golden coordinates over a world extent.
 * @param {number} n point count
 * @param {{ extent?: number, seed?: number }} [opts] world extent and seed
 * @returns {GoldenPoint[]}
 */
export function makeGoldenPoints(n, { extent = 20000, seed = 0x9e3779b9 } = {}) {
  const rand = makeLcg(seed);
  const points = [];
  for (let i = 0; i < n; i++) {
    points.push({
      id: `g${String(i).padStart(4, '0')}`,
      x: (rand() * 2 - 1) * extent,
      z: (rand() * 2 - 1) * extent,
    });
  }
  return points;
}

/**
 * Record a golden report: field values at each point, as f64 and f32 bits.
 * Serializable; commit it next to the field it describes.
 * @param {(x: number, z: number) => number} sample plain-number field eval
 * @param {readonly GoldenPoint[]} points coordinates to record
 * @returns {GoldenRecord[]}
 */
export function captureGolden(sample, points) {
  return points.map((p) => {
    const v = sample(p.x, p.z);
    return { id: p.id, x: p.x, z: p.z, v, f32: f32Bits(v) };
  });
}

/**
 * Compare a backend's values against a golden recording.
 * @param {(x: number, z: number) => number} sample backend eval
 * @param {readonly GoldenRecord[]} golden
 * @returns {GoldenComparison}
 */
export function compareToGolden(sample, golden) {
  let maxUlp = 0;
  let maxAbs = 0;
  /** @type {GoldenMismatch | null} */
  let worst = null;
  for (const g of golden) {
    const v = sample(g.x, g.z);
    const ulp = ulpDelta32(v, g.v);
    const abs = Math.abs(v - g.v);
    if (ulp > maxUlp) {
      maxUlp = ulp;
      worst = { id: g.id, x: g.x, z: g.z, want: g.v, got: v, ulp, abs };
    }
    if (abs > maxAbs) maxAbs = abs;
  }
  return { maxUlp, maxAbs, worst, n: golden.length };
}
