/**
 * Keeps lattice ints positive over any sane world extent so `u32(x)` on the
 * GPU and `| 0` in JS agree about the value being hashed.
 */
export declare const LATTICE_OFFSET = 131072;
export declare const LATTICE_FLOOR_MIN = -131072;
export declare const LATTICE_FLOOR_MAX = 131071;
/**
 * Raw u32 lattice hash bits. Exposed so the GPU assay can compare the integer
 * pipeline before the intentionally lossy u32 -> f32 conversion.
 */
/**
 * @param {number} ix
 * @param {number} iz
 * @param {number} ox
 * @param {number} oz
 * @returns {number}
 */
export declare function hashU32(ix: number, iz: number, ox: number, oz: number): number;
/**
 * u32 lattice hash -> [0, 1).
 * @param {number} ix  lattice int (already floored + offset, see latt)
 * @param {number} iz  lattice int
 * @param {number} ox  small int channel offset (plain JS number)
 * @param {number} oz  small int channel offset
 * @returns {number} in [0, 1), exactly h * 2^-32 for the u32 h
 */
export declare function hash01(ix: number, iz: number, ox: number, oz: number): number;
/**
 * The same hash, but the final u32 -> float conversion and multiply are done
 * in f32 like a GPU would (`float(h) * (1/4294967296)`). The u32 pipeline is
 * identical; only the last two ops round. Use with the f32 adapter when
 * emulating GPU arithmetic on the CPU.
 */
/**
 * @param {number} ix
 * @param {number} iz
 * @param {number} ox
 * @param {number} oz
 * @returns {number}
 */
export declare function hash01f32(ix: number, iz: number, ox: number, oz: number): number;
/**
 * WGSL source for the identical hash, for raw-WGSL backends or eyeballing.
 * Inputs are u32 lattice coords WITH the channel offsets already added
 * (or add them before calling, as the TSL backend does).
 */
export declare const HASH_WGSL = "fn mf_hash01(a: u32, b: u32) -> f32 {\n  var h: u32 = (a * 0x85ebca6bu) ^ (b * 0xc2b2ae3du);\n  h = (h ^ (h >> 13u)) * 0x27d4eb2fu;\n  h = h ^ (h >> 15u);\n  return f32(h) * 2.3283064365386963e-10; // 2^-32\n}";
/**
 * GLSL (ES 3.00 / #version 300 es, highp) source for the identical hash.
 */
export declare const HASH_GLSL = "float mf_hash01(uint a, uint b) {\n  uint h = (a * 0x85ebca6bu) ^ (b * 0xc2b2ae3du);\n  h = (h ^ (h >> 13u)) * 0x27d4eb2fu;\n  h = h ^ (h >> 15u);\n  return float(h) * 2.3283064365386963e-10; // 2^-32\n}";
//# sourceMappingURL=hash.d.ts.map