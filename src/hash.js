// matter-field: the bit-exact randomness primitive.
//
// A u32 integer-lattice hash whose JS form (Math.imul / ^ / >>>) is exactly
// 32-bit unsigned semantics, i.e. bit-identical to the same operation sequence
// in WGSL or GLSL u32 arithmetic. This is the linchpin of cross-backend
// parity: float transcendental hashes (fract(sin(x)*43758.5453)) are
// implementation-defined across GPU vendors; u32 mul/xor/shift are exact
// everywhere, with no accuracy-table latitude in any spec.
//
// The one trap (danilw, "Hash Noise in GPU Shaders"): an integer hash fed by
// FLOAT-derived inputs is still non-portable. Portability requires that the
// float -> integer transition goes through an operation that is exact by spec
// (floor is), and that both backends floor the SAME float value. That is what
// `latt` encodes: floor first, offset into positive range, truncate to int.

/**
 * Keeps lattice ints positive over any sane world extent so `u32(x)` on the
 * GPU and `| 0` in JS agree about the value being hashed.
 */
export const LATTICE_OFFSET = 131072;

/**
 * Raw u32 lattice hash bits. Exposed so the GPU assay can compare the integer
 * pipeline before the intentionally lossy u32 -> f32 conversion.
 */
export function hashU32(ix, iz, ox, oz) {
  const a = (ix + ox) | 0;
  const b = (iz + oz) | 0;
  let h = (Math.imul(a, 0x85ebca6b) ^ Math.imul(b, 0xc2b2ae3d)) | 0;
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f) | 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * u32 lattice hash -> [0, 1).
 * @param {number} ix  lattice int (already floored + offset, see latt)
 * @param {number} iz  lattice int
 * @param {number} ox  small int channel offset (plain JS number)
 * @param {number} oz  small int channel offset
 * @returns {number} in [0, 1), exactly h * 2^-32 for the u32 h
 */
export function hash01(ix, iz, ox, oz) {
  return hashU32(ix, iz, ox, oz) * (1 / 4294967296);
}

/**
 * The same hash, but the final u32 -> float conversion and multiply are done
 * in f32 like a GPU would (`float(h) * (1/4294967296)`). The u32 pipeline is
 * identical; only the last two ops round. Use with the f32 adapter when
 * emulating GPU arithmetic on the CPU.
 */
export function hash01f32(ix, iz, ox, oz) {
  const h = hashU32(ix, iz, ox, oz);
  // 1/4294967296 is 2^-32, exactly representable in f32, so the only rounding
  // is float(h) (u32 -> f32, loses bits above 2^24) and the f32 multiply.
  return Math.fround(Math.fround(h) * 4294967296 ** -1);
}

/**
 * WGSL source for the identical hash, for raw-WGSL backends or eyeballing.
 * Inputs are u32 lattice coords WITH the channel offsets already added
 * (or add them before calling, as the TSL backend does).
 */
export const HASH_WGSL = `fn mf_hash01(a: u32, b: u32) -> f32 {
  var h: u32 = (a * 0x85ebca6bu) ^ (b * 0xc2b2ae3du);
  h = (h ^ (h >> 13u)) * 0x27d4eb2fu;
  h = h ^ (h >> 15u);
  return f32(h) * 2.3283064365386963e-10; // 2^-32
}`;

/**
 * GLSL (ES 3.00 / #version 300 es, highp) source for the identical hash.
 */
export const HASH_GLSL = `float mf_hash01(uint a, uint b) {
  uint h = (a * 0x85ebca6bu) ^ (b * 0xc2b2ae3du);
  h = (h ^ (h >> 13u)) * 0x27d4eb2fu;
  h = h ^ (h >> 15u);
  return float(h) * 2.3283064365386963e-10; // 2^-32
}`;
