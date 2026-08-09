import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import tgpu from 'typegpu';
import * as tsl from 'three/tsl';
import { makeGoldenPoints } from '../parity/golden.js';
import { numberAdapter } from '../src/number.js';
import { hashU32 } from '../src/hash.js';
import { dunesField } from '../examples/dunes.js';
import { swellField } from '../examples/swell.js';
import { windField } from '../examples/wind.js';
import { serpentRadius, serpentSpine } from '../examples/serpent.js';
import { buildTypegpu } from '../scripts/build-typegpu.mjs';

const artifacts = join(dirname(fileURLToPath(import.meta.url)), '..', 'artifacts', 'tooling-tests');
await mkdir(artifacts, { recursive: true });
const temporary = await mkdtemp(join(artifacts, 'typegpu-'));
await buildTypegpu({ outDir: temporary, logLevel: 'silent' });
const compiled = await import(pathToFileURL(join(temporary, 'index.js')).href);
const compiledThree = await import(pathToFileURL(join(temporary, 'three.js')).href);

after(async () => {
  await rm(temporary, { recursive: true, force: true });
});

test('precompiled TypeGPU artifact preserves every adapter scalar at committed points', () => {
  for (const { x, z } of makeGoldenPoints(300)) {
    const wind = windField(numberAdapter, x, z, 1);
    assert.ok(Object.is(compiled.typegpuDunes(x, z), dunesField(numberAdapter, x, z)), `dunes at ${x},${z}`);
    assert.ok(Object.is(compiled.typegpuSwell(x, z, 2.5), swellField(numberAdapter, x, z, 2.5)), `swell at ${x},${z}`);
    assert.ok(Object.is(compiled.typegpuWindX(x, z, 1), wind.wx), `wind x at ${x},${z}`);
    assert.ok(Object.is(compiled.typegpuWindZ(x, z, 1), wind.wz), `wind z at ${x},${z}`);
  }
  for (const u of [0, 0.2, 0.5, 0.85, 1]) {
    for (const t of [0, 1, 7.25]) {
      const want = serpentSpine(numberAdapter, u, t);
      assert.ok(Object.is(compiled.typegpuSerpentX(u, t), want.x));
      assert.ok(Object.is(compiled.typegpuSerpentY(u, t), want.y));
      assert.ok(Object.is(compiled.typegpuSerpentZ(u, t), want.z));
      assert.ok(Object.is(compiled.typegpuSerpentRadius(u), serpentRadius(numberAdapter, u)));
    }
  }
});

test('every precompiled TypeGPU field kernel resolves to WGSL without a consumer transform', () => {
  for (const [name, kernel] of Object.entries(compiled.typegpuKernels)) {
    const wgsl = tgpu.resolve({ template: 'field', externals: { field: kernel } });
    assert.match(wgsl, /fn\s+\w+\(/u, `${name} did not resolve a WGSL function`);
    assert.doesNotMatch(wgsl, /Math\.imul|hashU32Cpu/u, `${name} leaked CPU-only hash code`);
  }
});

test('precompiled TypeGPU u32 kernel remains bit-exact on the CPU branch', () => {
  const inputs = [
    [0, 0, 0, 0],
    [131072, 131072, 1, 1],
    [123456, 654321, 3, 22],
    [2147483647, 2147483647, 1, 1],
    [0xfffffffb, 0xfffffff9, 0, 0],
  ];
  for (const input of inputs) assert.equal(compiled.typegpuHashU32(...input), hashU32(...input));
});

test('precompiled Three bridge keeps typed TypeGPU and native TSL node lanes', () => {
  const isNode = (value) => !!value && (value.isNode === true || typeof value.nodeType === 'string');
  assert.ok(isNode(compiledThree.typegpuDunesNode(tsl.float(1), tsl.float(2))));
  assert.ok(isNode(compiledThree.typegpuSwellNode(tsl.float(1), tsl.float(2), tsl.float(0.5))));
  assert.ok(isNode(compiledThree.typegpuWindNode(tsl.float(1), tsl.float(2), tsl.float(0.5))));
  assert.ok(isNode(compiledThree.typegpuSerpentSpineNode(tsl.float(0.5), tsl.float(1))));
  assert.ok(isNode(compiledThree.typegpuSerpentRadiusNode(tsl.float(0.5))));
  assert.equal(compiledThree.TYPEGPU_THREE_WEBGPU_ONLY, true);

  const portable = compiledThree.makeNativeTslCompatibility(tsl);
  assert.equal(portable.webgpu, true);
  assert.equal(portable.webgl2, true);
  assert.ok(isNode(portable.dunes(tsl.float(1), tsl.float(2))));
  assert.ok(isNode(portable.swell(tsl.float(1), tsl.float(2), tsl.float(0.5))));
  const wind = portable.wind(tsl.float(1), tsl.float(2), tsl.float(0.5));
  assert.ok(isNode(wind.wx) && isNode(wind.wz));
  const spine = portable.serpentSpine(tsl.float(0.5), tsl.float(1));
  assert.ok(isNode(spine.x) && isNode(spine.y) && isNode(spine.z));
  assert.ok(isNode(portable.serpentRadius(tsl.float(0.5))));
});
