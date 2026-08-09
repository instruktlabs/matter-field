// matter-field example: animated ocean swell with CPU buoyancy.
//
// THE WALL THIS BREAKS: GPU-displaced water that physics cannot feel. The
// canonical version is Gerstner/FFT waves in the vertex shader with a boat
// bobbing on a flat collision plane - engine forums are full of "how do I
// get the wave height under my boat" threads, answered with either a second
// CPU implementation of the wave math (drift risk) or GPU readback (frames
// of latency). Here the swell is ONE time-parameterized field: the GPU
// displaces the water mesh with it, and buoyancy samples the same function
// at the hull points, same frame, no readback, no lag.
//
// Time is just a third input. Determinism bonus: a server can evaluate the
// identical sea state from the shared clock - networked buoyancy without
// streaming wave data.
//
// No sin anywhere (rule 2): swells are pwave (floor-based periodic), chop is
// value-noise fbm advected by time. Everything stays inside the contract.
//
// TIME PRECISION NOTE (a real shader bug class this example inherits): phase
// grows with t, and f32 phase loses fractional precision as t climbs - the
// same reason shader animations driven by a raw time uniform stutter after
// hours of uptime. The assay quantifies it instead of letting you find out
// live: at t ~ 2.5 the f64-vs-f32 drift here measures ~3e-4 units. For long
// sessions, wrap t on the HOST in f64 (modulo the wave system's common
// period) before lifting it - the origin codebase does exactly this for its
// detail bands ("reduced modulo DETAIL_TILE_M in f64 on the CPU").

import { fbm, pwave } from '../src/noise.js';

// Host-folded wave-train directions (f64 literals, rule 5).
const T1 = { ca: 0.87758256189037276, sa: 0.47942553860420301, wl: 60, amp: 0.9, spd: 8 };
const T2 = { ca: -0.58850111725534582, sa: 0.80849640381959009, wl: 23, amp: 0.35, spd: 5 };

/**
 * Sea-surface height (world units) at (x, z) and time t (seconds).
 * @param {object} A adapter
 * @param {*} x V
 * @param {*} z V
 * @param {*} t V - lift with A.f(seconds) or wire a shader time uniform
 */
export function swellField(A, x, z, t) {
  // Two directional swell trains. Phase in periods: (u - speed*t) / wl.
  const u1 = A.add(A.mul(x, A.f(T1.ca)), A.mul(z, A.f(T1.sa)));
  const p1 = A.mul(A.sub(u1, A.mul(t, A.f(T1.spd))), A.f(1 / T1.wl));
  const w1 = A.mul(A.sub(pwave(A, p1), A.f(0.5)), A.f(2 * T1.amp));

  const u2 = A.add(A.mul(x, A.f(T2.ca)), A.mul(z, A.f(T2.sa)));
  const p2 = A.mul(A.sub(u2, A.mul(t, A.f(T2.spd))), A.f(1 / T2.wl));
  const w2 = A.mul(A.sub(pwave(A, p2), A.f(0.5)), A.f(2 * T2.amp));

  // Broadband chop: fbm advected through time on both axes.
  const cx = A.add(x, A.mul(t, A.f(1.7)));
  const cz = A.sub(z, A.mul(t, A.f(1.1)));
  const chop = A.mul(A.sub(fbm(A, cx, cz, 0.08, 2), A.f(0.5)), A.f(0.5));

  return A.cache(A.add(A.add(w1, w2), chop));
}

/**
 * CPU buoyancy: sample the SAME field at four hull points, derive heave,
 * pitch and roll. This is consumer code (plain numbers), not field code -
 * loops and branches are fine out here.
 *
 * @param {object} A a plain-number adapter (numberAdapter)
 * @param {{x: number, z: number, yaw: number, halfL: number, halfW: number}} boat
 * @param {number} t seconds
 */
export function buoyancy(A, boat, t) {
  const c = Math.cos(boat.yaw), s = Math.sin(boat.yaw);
  const corner = (dl, dw) => {
    const x = boat.x + dl * c - dw * s;
    const z = boat.z + dl * s + dw * c;
    return swellField(A, A.f(x), A.f(z), A.f(t));
  };
  const bowH = corner(boat.halfL, 0);
  const sternH = corner(-boat.halfL, 0);
  const portH = corner(0, -boat.halfW);
  const stbdH = corner(0, boat.halfW);
  return {
    heave: (bowH + sternH + portH + stbdH) / 4,
    pitch: Math.atan2(bowH - sternH, 2 * boat.halfL),
    roll: Math.atan2(stbdH - portH, 2 * boat.halfW),
  };
}
