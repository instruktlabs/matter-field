import assert from 'node:assert/strict';
import test from 'node:test';
import { numberAdapter as N } from '../src/number.js';
import {
  DUNES_DISPLAY_SCALE,
  ROVER_TUNING,
  SWELL_DISPLAY_SCALE,
  demoSwellBuoyancy,
  demoSwellField,
  scaleDunesHeight,
  scaleSwellBuoyancy,
  scaleSwellHeight,
  stepRoverSpeed,
} from '../site/examples/demo-tuning.js';

test('demo relief scaling preserves authored anchors and applies the declared scale', () => {
  const pad = 14;
  assert.equal(scaleDunesHeight(N, pad, pad), pad);
  assert.equal(scaleDunesHeight(N, 4, pad), pad + (4 - pad) * DUNES_DISPLAY_SCALE);
  assert.equal(scaleSwellHeight(N, 1.25), 1.25 * SWELL_DISPLAY_SCALE);
});

test('display buoyancy scales heave and reconstructs pitch and roll from scaled height differences', () => {
  const sample = { heave: 0.75, pitch: 0.12, roll: -0.2 };
  const scaled = scaleSwellBuoyancy(sample);
  assert.equal(scaled.heave, sample.heave * SWELL_DISPLAY_SCALE);
  assert.ok(Math.abs(Math.tan(scaled.pitch) - Math.tan(sample.pitch) * SWELL_DISPLAY_SCALE) < 1e-12);
  assert.ok(Math.abs(Math.tan(scaled.roll) - Math.tan(sample.roll) * SWELL_DISPLAY_SCALE) < 1e-12);
});

test('demo swell is a directional wave train rather than an isotropic bump field', () => {
  const direction = { x: 0.8775825618903728, z: 0.479425538604203 };
  let across = 0;
  let along = 0;
  for (let index = 0; index < 32; index++) {
    const x = -120 + index * 7;
    const z = -60 + index * 3;
    const height = demoSwellField(N, x, z, 2.3);
    const acrossHeight = demoSwellField(N, x + direction.x * 8, z + direction.z * 8, 2.3);
    const alongHeight = demoSwellField(N, x - direction.z * 8, z + direction.x * 8, 2.3);
    across += (acrossHeight - height) ** 2;
    along += (alongHeight - height) ** 2;
  }
  assert.ok(Math.sqrt(across / 32) > Math.sqrt(along / 32) * 3);
  const buoyancy = demoSwellBuoyancy(N, { x: 4, z: -7, yaw: 0.6, halfL: 7, halfW: 3 }, 2.3);
  assert.ok(Object.values(buoyancy).every(Number.isFinite));
});

test('rover profile is materially faster while remaining bounded', () => {
  let speed = 0;
  for (let frame = 0; frame < 60; frame++) speed = stepRoverSpeed(speed, 1, 1 / 60);
  assert.ok(speed > 38, `expected more than 38 m/s after one second, received ${speed}`);
  for (let frame = 0; frame < 600; frame++) speed = stepRoverSpeed(speed, 1, 1 / 60);
  assert.ok(speed <= ROVER_TUNING.maxForwardSpeed);
  assert.ok(speed > 49);
});
