// matter-field: the noise kit, written once against the adapter contract.
//
// Generalized from a shipped open-world game's terrain core (OBJEKT-62
// heightcore). Everything here obeys the design rules in adapter.js: no
// branches, no transcendentals, randomness only via floor -> latt -> hash01.
// Rotation constants are f64 literals folded on the host (rule 5).

/** Quintic fade: t^3 (t (6t - 15) + 10). C1-continuous value noise. */
export function fade(A, t) {
  const t3 = A.mul(A.mul(t, t), t);
  return A.mul(t3, A.add(A.mul(t, A.sub(A.mul(t, A.f(6)), A.f(15))), A.f(10)));
}

/**
 * Value noise on the integer lattice, output [0, 1).
 * 4 hashes, bilinear blend with quintic weights, no gradients to store.
 * @param {object} A adapter
 * @param {*} x V, in lattice cells (pre-multiply by frequency)
 * @param {*} z V
 * @param {number} [ox] channel offset (decorrelates layers)
 * @param {number} [oz] channel offset
 */
export function vnoise(A, x, z, ox = 0, oz = 0) {
  const fx = A.cache(A.floor(x));
  const fz = A.cache(A.floor(z));
  const tx = A.sub(x, fx);
  const tz = A.sub(z, fz);
  const ux = A.cache(fade(A, tx));
  const uz = A.cache(fade(A, tz));
  const ix = A.latt(fx);
  const iz = A.latt(fz);
  const h00 = A.hash01(ix, iz, ox, oz);
  const h10 = A.hash01(ix, iz, ox + 1, oz);
  const h01 = A.hash01(ix, iz, ox, oz + 1);
  const h11 = A.hash01(ix, iz, ox + 1, oz + 1);
  const a = A.mix(h00, h10, ux);
  const b = A.mix(h01, h11, ux);
  return A.cache(A.mix(a, b, uz));
}

// Per-octave rotation + offset constants. These are committed f64 literals,
// not runtime Math.cos/Math.sin calls: ECMAScript transcendental results are
// implementation-approximated and would weaken Tier 1 across JS engines.
const RC = 0.75836187599050819;
const RS = 0.65183377102153661;
const OSX = 37.71;
const OSZ = 17.34;

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
export function fbm(A, x0, z0, freq, oct, gain = 0.5, lac = 2.03) {
  let x = A.cache(A.mul(x0, A.f(freq)));
  let z = A.cache(A.mul(z0, A.f(freq)));
  let amp = 0.5;
  let sum = null;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = vnoise(A, x, z);
    const term = A.mul(n, A.f(amp));
    sum = sum === null ? term : A.add(sum, term);
    norm += amp;
    amp *= gain;
    if (i < oct - 1) {
      const nx = A.add(A.mul(A.sub(A.mul(x, A.f(RC)), A.mul(z, A.f(RS))), A.f(lac)), A.f(OSX));
      const nz = A.add(A.mul(A.add(A.mul(x, A.f(RS)), A.mul(z, A.f(RC))), A.f(lac)), A.f(OSZ));
      x = A.cache(nx);
      z = A.cache(nz);
    }
  }
  return A.cache(A.mul(sum, A.f(1 / norm)));
}

/**
 * Ridge shaping: 1 - |2n - 1|, crests where n = 0.5, sharpened.
 * pow(r, s) is approximated as mix(r, r*r, s - 1) for s in [1, 2] - a
 * branch-free, transcendental-free stand-in matched on every backend
 * (adapter.js rule 2: an exact pow would not be portable).
 * @param {*} n V in [0, 1]
 * @param {number} sharp plain, in [1, 2]
 */
export function ridge(A, n, sharp) {
  const r = A.sub(A.f(1), A.abs(A.sub(A.mul(n, A.f(2)), A.f(1))));
  return A.cache(A.mix(r, A.mul(r, r), A.f(sharp - 1)));
}

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
export function pwave(A, t) {
  const saw = A.sub(t, A.floor(t));
  const tri = A.sub(A.f(1), A.abs(A.sub(A.mul(saw, A.f(2)), A.f(1))));
  return A.mul(A.mul(tri, tri), A.sub(A.f(3), A.mul(tri, A.f(2))));
}

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
export function stamp(A, h, x, z, { cx, cz, rIn, rOut, level }) {
  const dx = A.sub(x, A.f(cx));
  const dz = A.sub(z, A.f(cz));
  const d2 = A.add(A.mul(dx, dx), A.mul(dz, dz));
  const w = A.sub(A.f(1), A.smooth(rIn * rIn, rOut * rOut, d2));
  return A.mix(h, A.f(level), w);
}
