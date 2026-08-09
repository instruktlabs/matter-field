// matter-field example: a closed-form creature spine the CPU can hit-test.
//
// THE WALL THIS BREAKS: vertex-animated creatures with no gameplay presence.
// GPU crowds/swarms/tentacles animated in the vertex shader are the standard
// trick for scale - and then the design asks "can the player shoot it?" and
// the answer is no, because the CPU has skeleton data at best, or nothing.
// The usual outs: simulate a coarse CPU proxy (drifts from the visual), or
// give up interaction.
//
// The origin codebase shipped this pattern as a sandworm: the breach
// trajectory is one pure function of breach time; a swarm particle at arc
// position u evaluates it at RETARDED time (t - u * LAG), so travelling
// coils fall out for free. GPU: every particle. CPU: hit test, head
// transform, camera framing. Same function, so the hitbox IS the visual.
//
// Inputs here are (u, t) - arc position and time - not (x, z). The contract
// does not know or care what the inputs mean. The dual backend seeded on u
// gives d(pos)/du = the spine TANGENT analytically (frames for particle
// orientation without finite differences).

import { pwave } from '../src/noise.js';

// Trajectory constants (host-folded f64 literals, rule 5).
const SPAN = 90;        // world units of forward travel over u in [0,1]
const LAG = 0.35;       // retarded-time seconds per unit of arc
const HUMP_AMP = 7;     // vertical coil amplitude
const HUMP_FREQ = 1.4;  // coils per second
const SWAY_AMP = 4;     // lateral weave amplitude
const SWAY_FREQ = 0.55;
const BASE_Y = 0;       // ground level of the demo world

/**
 * Spine position at arc position u in [0, 1] (head = 1), time t (seconds).
 * A swarm mote at u simply calls this with its own u; the whole body is
 * this one function at different retarded times.
 * @returns {{ x, y, z }} record of V
 */
export function serpentSpine(A, u, t) {
  // Retarded time: the tail replays where the head was LAG*u ago.
  const rt = A.cache(A.sub(t, A.mul(u, A.f(LAG))));

  // Forward travel along +x, head leading.
  const x = A.mul(u, A.f(SPAN));

  // Vertical coils: periodic humps clamped to stay out of the ground,
  // enveloped so the tail stays buried (0 near u=0, full by u=0.3).
  const humpRaw = A.mul(pwave(A, A.mul(rt, A.f(HUMP_FREQ))), A.f(HUMP_AMP));
  const env = A.smooth(0.05, 0.3, u);
  const y = A.add(A.f(BASE_Y), A.mul(humpRaw, env));

  // Lateral weave.
  const sway = A.mul(A.sub(pwave(A, A.mul(rt, A.f(SWAY_FREQ))), A.f(0.5)), A.f(2 * SWAY_AMP));
  const z = A.mul(sway, env);

  return { x: A.cache(x), y: A.cache(y), z: A.cache(z) };
}

/**
 * CPU hit test (consumer code, plain numbers): closest approach of a point
 * to the spine at time t, by coarse scan + refinement over u. The GPU swarm
 * IS this curve, so a hit here is a hit on what the player sees.
 * @returns {{ u: number, dist: number, point: {x,y,z} }}
 */
export function spineHitTest(A, p, t, { radius = 2.5, steps = 48 } = {}) {
  let best = { u: 0, d2: Infinity, pt: null };
  const probe = (u) => {
    const s = serpentSpine(A, A.f(u), A.f(t));
    const dx = s.x - p.x, dy = s.y - p.y, dz = s.z - p.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < best.d2) best = { u, d2, pt: s };
  };
  for (let i = 0; i <= steps; i++) probe(i / steps);
  // One refinement pass around the best coarse sample.
  const lo = Math.max(0, best.u - 1 / steps);
  const hi = Math.min(1, best.u + 1 / steps);
  for (let i = 0; i <= 16; i++) probe(lo + ((hi - lo) * i) / 16);
  const dist = Math.sqrt(best.d2);
  return { u: best.u, dist, point: best.pt, hit: dist <= radius };
}
