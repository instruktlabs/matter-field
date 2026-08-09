// matter-field example: a wind vector field that gameplay can FEEL.
//
// THE WALL THIS BREAKS: visual-only GPU particles. The standard setup
// computes a flow/noise field inside a particle compute shader - a million
// motes drift beautifully - while gameplay objects (gliders, projectiles,
// smoke grenades, sailboats) feel nothing, because the CPU has no access to
// the field the GPU invented. Teams either fake forces with a second,
// unrelated CPU wind (visibly wrong next to the particles) or read the GPU
// field back (latency, stalls). Here the SAME vector field drives both: the
// TSL backend advects every particle, the number backend applies forces to
// gameplay bodies, and they agree because they are one function.
//
// Multi-output fields are just records of V - the contract does not care.
// The dual backend adds a party trick the GPU never had: analytic divergence
// and curl of the wind on the CPU (for gameplay logic like "am I in a
// vortex"), from the same tree.

import { fbm, pwave } from '../src/noise.js';

// Prevailing direction + gustiness (host-folded, rule 5).
const PREVAIL = { ca: Math.cos(0.9), sa: Math.sin(0.9), speed: 6 };

/**
 * Wind velocity (units/s) at (x, z), time t (seconds).
 * @returns {{ wx, wz }} record of V
 */
export function windField(A, x, z, t) {
  // Gust envelope: slow global surge, 18 s period, kept in [0.4, 1].
  const surge = A.add(A.f(0.4), A.mul(pwave(A, A.mul(t, A.f(1 / 18))), A.f(0.6)));

  // Meander: two decorrelated fbm channels advected downwind through time,
  // remapped to [-1, 1]. Channel offsets (ox, oz) keep them independent
  // without a second noise implementation.
  const ax = A.add(x, A.mul(t, A.f(-PREVAIL.ca * PREVAIL.speed)));
  const az = A.add(z, A.mul(t, A.f(-PREVAIL.sa * PREVAIL.speed)));
  const m1 = A.mul(A.sub(fbm(A, ax, az, 0.004, 3), A.f(0.5)), A.f(2));
  const m2 = A.mul(A.sub(fbm(A, A.add(ax, A.f(7300)), A.sub(az, A.f(1900)), 0.004, 3), A.f(0.5)), A.f(2));

  // Base flow + meander, scaled by the surge.
  const wx = A.mul(A.add(A.f(PREVAIL.ca * PREVAIL.speed), A.mul(m1, A.f(2.5))), surge);
  const wz = A.mul(A.add(A.f(PREVAIL.sa * PREVAIL.speed), A.mul(m2, A.f(2.5))), surge);
  return { wx: A.cache(wx), wz: A.cache(wz) };
}

/**
 * Consumer code: integrate a body under wind force (plain numbers).
 * drag ~ (wind - vel) * k. One step of semi-implicit Euler.
 */
export function applyWind(A, body, t, dt, k = 0.8) {
  const w = windField(A, A.f(body.x), A.f(body.z), A.f(t));
  body.vx += (w.wx - body.vx) * k * dt;
  body.vz += (w.wz - body.vz) * k * dt;
  body.x += body.vx * dt;
  body.z += body.vz * dt;
  return body;
}
