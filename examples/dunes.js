// matter-field example: a miniature dune-sea heightfield, written ONCE.
//
// Demonstrates the whole discipline in ~40 lines: fbm base, wind-aligned
// ridged dunes (trig folded on the host - rule 2), a mask, a landing-pad
// stamp (rule 4: stamp order is canonical), everything branch-free.
//
// The same function runs as: f64 collision oracle, f32 drift emulation,
// dual-number gradients/normals, and (given three/tsl) a GPU vertex graph.

import { fbm, ridge, stamp } from '../src/noise.js';

// Host-folded wind rotation (f64 literals shared by every backend).
const CA = 0.81387845666253389; // cos(0.62), folded and committed
const SA = 0.58103516053730508; // sin(0.62), folded and committed

export const DUNES_PAD = Object.freeze({
  cx: 120, cz: -340, rIn: 40, rOut: 90, level: 14,
});

/**
 * Height (world units) at (x, z). Single-output field over the contract.
 * @param {object} A math adapter
 * @param {*} x V
 * @param {*} z V
 */
export function dunesField(A, x, z) {
  // Broad base undulation, +-12 around 0.
  const base = fbm(A, x, z, 0.0016, 2);
  const hBase = A.mul(A.sub(base, A.f(0.5)), A.f(24));

  // Dune-field mask: where the sand sea is thick.
  const mRaw = fbm(A, A.add(x, A.f(4100)), A.sub(z, A.f(2900)), 0.0009, 2);
  const mask = A.cache(A.smooth(0.35, 0.7, mRaw));

  // Wind-aligned ridged dunes: compress across-wind, stretch along-wind.
  const u = A.add(A.mul(x, A.f(CA)), A.mul(z, A.f(SA)));
  const v = A.sub(A.mul(z, A.f(CA)), A.mul(x, A.f(SA)));
  const dn = fbm(A, A.mul(u, A.f(0.011)), A.mul(v, A.f(0.0028)), 1, 3);
  const crests = ridge(A, dn, 1.7);
  const hDunes = A.mul(A.mul(crests, A.f(18)), A.add(A.f(0.25), A.mul(mask, A.f(0.75))));

  // Sum, then the authored pad stamp LAST (canonical order).
  const h = A.add(hBase, hDunes);
  return A.cache(stamp(A, h, x, z, DUNES_PAD));
}
