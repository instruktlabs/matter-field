import { fbm, pwave } from '../../src/noise.js';

export const DUNES_DISPLAY_SCALE = 1.5;
export const SWELL_DISPLAY_SCALE = 1.35;

const DEMO_SWELL_PRIMARY = Object.freeze({
  ca: 0.8775825618903728,
  sa: 0.479425538604203,
  wavelength: 52,
  amplitude: 1,
  speed: 7.5,
});
const DEMO_SWELL_CROSS = Object.freeze({
  ca: -0.19611613513818404,
  sa: 0.9805806756909202,
  wavelength: 34,
  amplitude: 0.12,
  speed: 5.2,
});

export const ROVER_TUNING = Object.freeze({
  forwardAcceleration: 60,
  reverseAcceleration: 24,
  drag: 0.9,
  maxForwardSpeed: 52,
  maxReverseSpeed: 20,
});

export function scaleDunesHeight(A, height, padLevel) {
  const level = A.f(padLevel);
  return A.add(level, A.mul(A.sub(height, level), A.f(DUNES_DISPLAY_SCALE)));
}

export function scaleSwellHeight(A, height) {
  return A.mul(height, A.f(SWELL_DISPLAY_SCALE));
}

export function scaleSwellBuoyancy(sample) {
  return {
    heave: sample.heave * SWELL_DISPLAY_SCALE,
    pitch: Math.atan(Math.tan(sample.pitch) * SWELL_DISPLAY_SCALE),
    roll: Math.atan(Math.tan(sample.roll) * SWELL_DISPLAY_SCALE),
  };
}

function shapedWave(A, phase) {
  const centered = A.mul(A.sub(pwave(A, phase), A.f(0.5)), A.f(2));
  const crestShape = A.add(A.f(0.82), A.mul(A.abs(centered), A.f(0.18)));
  return A.mul(centered, crestShape);
}

export function demoSwellField(A, x, z, t) {
  const primaryDistance = A.add(
    A.mul(x, A.f(DEMO_SWELL_PRIMARY.ca)),
    A.mul(z, A.f(DEMO_SWELL_PRIMARY.sa)),
  );
  const primaryPhase = A.mul(
    A.sub(primaryDistance, A.mul(t, A.f(DEMO_SWELL_PRIMARY.speed))),
    A.f(1 / DEMO_SWELL_PRIMARY.wavelength),
  );
  const primary = A.mul(shapedWave(A, primaryPhase), A.f(DEMO_SWELL_PRIMARY.amplitude));

  const crossDistance = A.add(
    A.mul(x, A.f(DEMO_SWELL_CROSS.ca)),
    A.mul(z, A.f(DEMO_SWELL_CROSS.sa)),
  );
  const crossPhase = A.mul(
    A.sub(crossDistance, A.mul(t, A.f(DEMO_SWELL_CROSS.speed))),
    A.f(1 / DEMO_SWELL_CROSS.wavelength),
  );
  const cross = A.mul(shapedWave(A, crossPhase), A.f(DEMO_SWELL_CROSS.amplitude));

  const chopX = A.add(x, A.mul(t, A.f(1.25)));
  const chopZ = A.sub(z, A.mul(t, A.f(0.7)));
  const chop = A.mul(
    A.sub(fbm(A, chopX, chopZ, 0.045, 2), A.f(0.5)),
    A.f(0.1),
  );
  return A.cache(A.add(A.add(primary, cross), chop));
}

export function demoSwellBuoyancy(A, boat, t) {
  const cosine = Math.cos(boat.yaw);
  const sine = Math.sin(boat.yaw);
  const corner = (forward, side) => demoSwellField(
    A,
    boat.x + forward * cosine - side * sine,
    boat.z + forward * sine + side * cosine,
    t,
  );
  const bow = corner(boat.halfL, 0);
  const stern = corner(-boat.halfL, 0);
  const port = corner(0, -boat.halfW);
  const starboard = corner(0, boat.halfW);
  return {
    heave: (bow + stern + port + starboard) / 4,
    pitch: Math.atan2(bow - stern, 2 * boat.halfL),
    roll: Math.atan2(starboard - port, 2 * boat.halfW),
  };
}

export function stepRoverSpeed(speed, throttle, dt) {
  const acceleration = throttle >= 0
    ? ROVER_TUNING.forwardAcceleration
    : ROVER_TUNING.reverseAcceleration;
  const accelerated = speed + throttle * acceleration * dt;
  const damped = accelerated * Math.exp(-ROVER_TUNING.drag * dt);
  return Math.max(
    -ROVER_TUNING.maxReverseSpeed,
    Math.min(ROVER_TUNING.maxForwardSpeed, damped),
  );
}
