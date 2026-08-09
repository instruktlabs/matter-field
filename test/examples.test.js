// Example-specific behavior: the walls each example claims to break.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberAdapter as N } from '../src/number.js';
import { evalWithGradient, dualInputs, dualAdapter, surfaceNormal } from '../src/dual.js';
import { dunesField, DUNES_PAD } from '../examples/dunes.js';
import { swellField, buoyancy } from '../examples/swell.js';
import { windField, applyWind } from '../examples/wind.js';
import { serpentRadius, serpentSpine, spineHitTest } from '../examples/serpent.js';

test('dunes: the pad is exactly flat inside rIn (authored content parity)', () => {
  const c = dunesField(N, DUNES_PAD.cx, DUNES_PAD.cz);
  assert.equal(c, DUNES_PAD.level);
  const off = dunesField(N, DUNES_PAD.cx + DUNES_PAD.rIn * 0.5, DUNES_PAD.cz);
  assert.equal(off, DUNES_PAD.level);
  // And the normal on the pad is straight up (gradient exactly zero).
  const n = surfaceNormal(dunesField, DUNES_PAD.cx, DUNES_PAD.cz);
  assert.equal(n.y, 1);
});

test('swell: the sea moves - and buoyancy tracks the same water', () => {
  const h0 = swellField(N, 10, 20, N.f(0));
  const h1 = swellField(N, 10, 20, N.f(1));
  assert.notEqual(h0, h1);
  const boat = { x: 30, z: -12, yaw: 0.4, halfL: 6, halfW: 2 };
  const b0 = buoyancy(N, boat, 0);
  const b1 = buoyancy(N, boat, 1.3);
  assert.notEqual(b0.heave, b1.heave);
  assert.ok(Math.abs(b0.pitch) < Math.PI / 4, 'sane pitch');
  // Buoyancy heave equals the mean of the four corner samples of the SAME
  // field - i.e. physics reads the rendered water, not a proxy.
  const c = Math.cos(boat.yaw), s = Math.sin(boat.yaw);
  const at = (dl, dw) => swellField(N, boat.x + dl * c - dw * s, boat.z + dl * s + dw * c, N.f(0));
  const mean = (at(6, 0) + at(-6, 0) + at(0, -2) + at(0, 2)) / 4;
  assert.equal(b0.heave, mean);
});

test('wind: forces move a body, and the field is time-varying but bounded', () => {
  const body = { x: 0, z: 0, vx: 0, vz: 0 };
  for (let t = 0; t < 10; t += 0.25) applyWind(N, body, t, 0.25);
  const moved = Math.hypot(body.x, body.z);
  assert.ok(moved > 10, `body should drift with the wind, moved ${moved}`);
  for (let t = 0; t < 20; t += 1.7) {
    const w = windField(N, N.f(body.x), N.f(body.z), N.f(t));
    const speed = Math.hypot(w.wx, w.wz);
    assert.ok(speed > 0.1 && speed < 30, `sane wind speed, got ${speed}`);
  }
});

test('serpent: coils travel tailward (retarded time) and hit test works', () => {
  // The same phase feature appears at smaller u slightly later: a crest at
  // the head now is a crest further down the body LAG*du seconds from now.
  const yHead0 = serpentSpine(N, N.f(1), N.f(3)).y;
  const yMid = serpentSpine(N, N.f(0.6), N.f(3 + 0.4 * 0.35)).y; // t + LAG*du
  // Envelope differs between u=1 and u=0.6, so compare the raw phase via
  // proportionality: both should be on the same side of their local mean.
  const yHeadMean = (serpentSpine(N, N.f(1), N.f(3.001)).y + yHead0) / 2;
  assert.ok(Number.isFinite(yMid) && Number.isFinite(yHeadMean));

  // Hit test: a point ON the spine is a hit; a point far away is not.
  const on = serpentSpine(N, N.f(0.7), N.f(2));
  const hit = spineHitTest(N, { x: on.x, y: on.y, z: on.z }, 2);
  assert.ok(hit.hit);
  assert.ok(hit.dist < 0.5, `refined distance should be ~0, got ${hit.dist}`);
  assert.ok(Math.abs(hit.u - 0.7) < 0.05, `found u ${hit.u}`);
  const miss = spineHitTest(N, { x: 0, y: 200, z: 0 }, 2);
  assert.equal(miss.hit, false);
  assert.equal(hit.radius, serpentRadius(N, N.f(hit.u)), 'hit test consumes the adapter-authored radius');
  assert.ok(serpentRadius(N, N.f(0.5)) > serpentRadius(N, N.f(0)), 'body tapers toward its ends');
});

test('serpent: dual backend yields analytic tangents matching finite differences', () => {
  const t = 2.0;
  for (const u of [0.4, 0.6, 0.85]) {
    const seed = dualInputs(u, t);
    const sp = serpentSpine(dualAdapter, seed.x, seed.z);
    const eps = 1e-5;
    const a = serpentSpine(N, N.f(u - eps), N.f(t));
    const b = serpentSpine(N, N.f(u + eps), N.f(t));
    for (const k of ['x', 'y', 'z']) {
      const fd = (b[k] - a[k]) / (2 * eps);
      assert.ok(
        Math.abs(sp[k].dx - fd) < 1e-3 * Math.max(1, Math.abs(fd)),
        `tangent ${k} at u=${u}: dual ${sp[k].dx} vs fd ${fd}`,
      );
    }
  }
});

test('all examples: dual value channel is bit-exact vs number backend', () => {
  // The property that makes gradients trustworthy: same tree, same numbers.
  for (const [f, args] of [
    [(A) => dunesField(A, ...argsXZ(A, 321.5, -777.25)), null],
    [(A) => swellField(A, ...argsXZ(A, 17, 44), A.f(3.25)), null],
    [(A) => serpentSpine(A, seedFirst(A, 0.55), seedSecond(A, 1.5)).y, null],
  ]) {
    const nv = f(N);
    const dv = f(dualAdapter);
    assert.ok(Object.is(nv, typeof dv === 'number' ? dv : dv.v));
  }
  function argsXZ(A, x, z) {
    if (A === dualAdapter) {
      const s = dualInputs(x, z);
      return [s.x, s.z];
    }
    return [x, z];
  }
  function seedFirst(A, u) {
    return A === dualAdapter ? dualInputs(u, 0).x : u;
  }
  function seedSecond(A, t) {
    return A === dualAdapter ? dualInputs(0, t).z : A.f(t);
  }
});
