// Noise kit properties on the number backend.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberAdapter as A } from '../src/number.js';
import { vnoise, fbm, ridge, stamp, pwave, fade } from '../src/noise.js';
import { makeLcg } from '../parity/golden.js';

test('vnoise is in [0, 1) and deterministic', () => {
  const rand = makeLcg(42);
  for (let i = 0; i < 2000; i++) {
    const x = (rand() * 2 - 1) * 5000;
    const z = (rand() * 2 - 1) * 5000;
    const n = vnoise(A, x, z);
    assert.ok(n >= 0 && n < 1, `out of range at (${x}, ${z}): ${n}`);
    assert.ok(Object.is(n, vnoise(A, x, z)));
  }
});

test('vnoise is continuous across integer cell boundaries', () => {
  // The classic lattice-noise bug is a value jump at cell edges. Quintic
  // fade means value AND derivative approach the corner hash smoothly.
  const eps = 1e-6;
  for (const z of [0.3, 7.77, -12.4]) {
    for (const x of [3, -5, 100]) {
      const below = vnoise(A, x - eps, z);
      const above = vnoise(A, x + eps, z);
      assert.ok(Math.abs(below - above) < 1e-4, `jump at x=${x}: ${below} vs ${above}`);
    }
  }
});

test('fade endpoints and midpoint', () => {
  assert.equal(fade(A, 0), 0);
  assert.equal(fade(A, 1), 1);
  assert.equal(fade(A, 0.5), 0.5);
});

test('fbm stays in [0, 1] and octave count changes detail, not range', () => {
  const rand = makeLcg(7);
  for (let i = 0; i < 500; i++) {
    const x = (rand() * 2 - 1) * 20000;
    const z = (rand() * 2 - 1) * 20000;
    for (const oct of [1, 3, 5]) {
      const n = fbm(A, x, z, 0.002, oct);
      assert.ok(n >= 0 && n <= 1, `oct=${oct} out of range: ${n}`);
    }
  }
});

test('ridge peaks where noise crosses 0.5 and floors at extremes', () => {
  assert.equal(ridge(A, 0.5, 1), 1);
  assert.equal(ridge(A, 0, 1), 0);
  assert.equal(ridge(A, 1, 1), 0);
  // sharp=2 is the r^2 end of the approximation: lower flanks, same crest.
  assert.ok(ridge(A, 0.25, 2) < ridge(A, 0.25, 1));
  assert.equal(ridge(A, 0.5, 2), 1);
});

test('stamp flattens the centre exactly and leaves the far field alone', () => {
  const s = { cx: 0, cz: 0, rIn: 10, rOut: 30, level: 5 };
  assert.equal(stamp(A, 99, 0, 0, s), 5);
  assert.equal(stamp(A, 99, 5, 5, s), 5); // inside rIn
  assert.equal(stamp(A, 99, 100, 0, s), 99); // beyond rOut
  const mid = stamp(A, 99, 20, 0, s); // in the falloff band
  assert.ok(mid > 5 && mid < 99);
});

test('pwave: period 1, range [0, 1], smooth at the fold points', () => {
  for (const t of [0, 0.25, 0.5, 0.75, 1.23, -3.4]) {
    const v = pwave(A, t);
    assert.ok(v >= 0 && v <= 1);
    assert.ok(Math.abs(pwave(A, t + 1) - v) < 1e-12, `period broken at ${t}`);
    assert.ok(Math.abs(pwave(A, t - 7) - v) < 1e-12);
  }
  assert.equal(pwave(A, 0.5), 1); // crest
  assert.equal(pwave(A, 0), 0); // trough
  // C1 at the triangle folds: finite-difference slope ~0 near t=0 and t=0.5.
  const eps = 1e-5;
  for (const t of [0, 0.5, 1]) {
    const slope = (pwave(A, t + eps) - pwave(A, t - eps)) / (2 * eps);
    assert.ok(Math.abs(slope) < 1e-3, `kink at ${t}: slope ${slope}`);
  }
});
