// Golden vectors + u32 semantics for the bit-exact hash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashU32, hash01, hash01f32, LATTICE_OFFSET, HASH_WGSL, HASH_GLSL } from '../src/hash.js';

// Frozen golden vectors. Captured 2026-08-09 from the reference JS
// implementation (identical constants to OBJEKT-62 heightcore, whose JS/TSL
// pair measured bit-identical on NVIDIA Turing WebGPU). If any of these ever
// changes, the hash is no longer the hash - that is the point of this test.
const GOLDEN = [
  [[0, 0, 0, 0], 0],
  [[1, 0, 0, 0], 0.69274670397862792],
  [[0, 1, 0, 0], 0.65064853313378990],
  [[131072, 131072, 0, 0], 0.22048451076261699],
  [[131072, 131072, 1, 0], 0.057693761074915528],
  [[131072, 131072, 0, 1], 0.40622987691313028],
  [[131072, 131072, 1, 1], 0.51618620567023754],
  [[262143, 1, 0, 0], 0.72244256106205285],
  [[123456, 654321, 3, 22], 0.50576725974678993],
  [[2147483647, 2147483647, 1, 1], 0],
  [[-5, -7, 0, 0], 0.41763473441824317],
];

test('hash01 matches frozen golden vectors bit-for-bit', () => {
  for (const [args, want] of GOLDEN) {
    assert.ok(Object.is(hash01(...args), want), `hash01(${args}) = ${hash01(...args)}, want ${want}`);
  }
});

test('hashU32 exposes the exact pre-float bits used by hash01', () => {
  for (const [args] of GOLDEN) {
    assert.equal(hash01(...args), hashU32(...args) * 2 ** -32);
  }
});

test('hash01 output is always in [0, 1)', () => {
  for (let i = 0; i < 5000; i++) {
    const h = hash01(i * 2654435761, i * 40503 + 7, i & 3, (i >> 2) & 3);
    assert.ok(h >= 0 && h < 1, `out of range at i=${i}: ${h}`);
  }
});

test('hash01 distribution is roughly uniform (mean near 0.5)', () => {
  let sum = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) sum += hash01(i, Math.imul(i, 7919), 0, 0);
  const mean = sum / n;
  assert.ok(Math.abs(mean - 0.5) < 0.01, `mean ${mean}`);
});

test('u32 wrapping is exact: values equal mod 2^32 hash identically', () => {
  // (ix + ox) | 0 wraps exactly like u32 addition mod 2^32 for the hash's
  // purposes; adding 2^32 to an input must not change the result.
  assert.equal(hash01(5, 9, 0, 0), hash01(5 + 4294967296, 9, 0, 0));
  assert.equal(hash01(5, 9, 0, 0), hash01(5, 9 + 4294967296, 0, 0));
});

test('channel offsets decorrelate', () => {
  // Same lattice point, different channels: must differ (these constants do).
  const a = hash01(1000, 2000, 0, 0);
  const b = hash01(1000, 2000, 1, 0);
  const c = hash01(1000, 2000, 0, 1);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.notEqual(b, c);
});

test('hash01f32 differs from hash01 only by final-step f32 rounding', () => {
  for (let i = 0; i < 2000; i++) {
    const a = hash01(i * 31 + 1, i * 17 + 3, 0, 0);
    const b = hash01f32(i * 31 + 1, i * 17 + 3, 0, 0);
    // f32 has 24 significand bits; the u32 -> f32 conversion loses at most
    // 2^-25 relative, so absolute error on [0,1) is bounded by ~6e-8.
    assert.ok(Math.abs(a - b) < 6e-8, `i=${i}: ${a} vs ${b}`);
  }
});

test('shader source constants match the JS implementation', () => {
  for (const src of [HASH_WGSL, HASH_GLSL]) {
    assert.match(src, /0x85ebca6bu/);
    assert.match(src, /0xc2b2ae3du/);
    assert.match(src, /0x27d4eb2fu/);
    assert.match(src, /13u/);
    assert.match(src, /15u/);
    assert.match(src, /2\.3283064365386963e-10/);
  }
});

test('LATTICE_OFFSET keeps sane world coords positive after floor', () => {
  assert.ok(Math.floor(-100000) + LATTICE_OFFSET > 0);
  assert.equal(LATTICE_OFFSET, 131072);
});
