import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGoldenPoints } from '../parity/golden.js';
import { numberAdapter } from '../src/number.js';
import { hashU32 } from '../src/hash.js';
import { dunesField } from '../examples/dunes.js';
import { swellField } from '../examples/swell.js';
import { windField } from '../examples/wind.js';
import { serpentRadius, serpentSpine } from '../examples/serpent.js';
import {
  typegpuDunes,
  typegpuHashU32,
  typegpuSerpentRadius,
  typegpuSerpentSpine,
  typegpuSerpentX,
  typegpuSerpentY,
  typegpuSerpentZ,
  typegpuSwell,
  typegpuWind,
  typegpuWindX,
  typegpuWindZ,
} from '../src/typegpu/index.js';

test('TypeGPU direct CPU fields preserve the adapter f64 oracle at committed points', () => {
  for (const { x, z } of makeGoldenPoints(300)) {
    const wind = windField(numberAdapter, x, z, 1);
    assert.ok(Object.is(typegpuDunes(x, z), dunesField(numberAdapter, x, z)), `dunes at ${x},${z}`);
    assert.ok(Object.is(typegpuSwell(x, z, 2.5), swellField(numberAdapter, x, z, 2.5)), `swell at ${x},${z}`);
    assert.ok(Object.is(typegpuWindX(x, z, 1), wind.wx), `wind x at ${x},${z}`);
    assert.ok(Object.is(typegpuWindZ(x, z, 1), wind.wz), `wind z at ${x},${z}`);
  }
});

test('TypeGPU u32 CPU branch remains bit-exact across adversarial inputs', () => {
  const inputs = [
    [0, 0, 0, 0],
    [131072, 131072, 1, 1],
    [123456, 654321, 3, 22],
    [2147483647, 2147483647, 1, 1],
    [0xfffffffb, 0xfffffff9, 0, 0],
  ];
  for (const input of inputs) assert.equal(typegpuHashU32(...input), hashU32(...input));
});

test('TypeGPU serpent scalar functions preserve the f64 adapter field', () => {
  for (const u of [0, 0.2, 0.5, 0.85, 1]) {
    for (const t of [0, 1, 7.25]) {
      const want = serpentSpine(numberAdapter, u, t);
      assert.ok(Object.is(typegpuSerpentX(u, t), want.x));
      assert.ok(Object.is(typegpuSerpentY(u, t), want.y));
      assert.ok(Object.is(typegpuSerpentZ(u, t), want.z));
      assert.ok(Object.is(typegpuSerpentRadius(u), serpentRadius(numberAdapter, u)));
    }
  }
});

test('TypeGPU vector conveniences package scalar authority as explicit f32 values', () => {
  let observedRounding = false;
  for (const { x, z } of makeGoldenPoints(64)) {
    const wx = typegpuWindX(x, z, 1);
    const wz = typegpuWindZ(x, z, 1);
    const vector = typegpuWind(x, z, 1);
    assert.ok(Object.is(vector.x, Math.fround(wx)));
    assert.ok(Object.is(vector.y, Math.fround(wz)));
    observedRounding ||= !Object.is(vector.x, wx) || !Object.is(vector.y, wz);
  }
  const spine = typegpuSerpentSpine(0.37, 2.5);
  assert.ok(Object.is(spine.x, Math.fround(typegpuSerpentX(0.37, 2.5))));
  assert.ok(Object.is(spine.y, Math.fround(typegpuSerpentY(0.37, 2.5))));
  assert.ok(Object.is(spine.z, Math.fround(typegpuSerpentZ(0.37, 2.5))));
  assert.equal(observedRounding, true, 'sample set should exercise at least one f64-to-f32 packaging change');
});
