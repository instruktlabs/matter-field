import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { d } from 'typegpu';
import { abs, floor } from 'typegpu/std';
import { makeF32Adapter, numberAdapter } from '../../src/number.js';
import { dunesField } from '../../examples/dunes.js';
import { typegpuDunes } from '../../src/typegpu/fields.js';
import { typegpuHash01, typegpuSmooth } from '../../src/typegpu/primitives.js';
import { makeAssayPoints } from '../../scripts/build-gpu-probe.mjs';
import {
  CanonicalIrBuilder,
  canonicalIrOpCounts,
  canonicalIrProblems,
  canonicalIrSha256,
  encodeF64,
  evaluateCanonicalIr,
  evaluateCanonicalIrF32,
  serializeCanonicalIr,
} from '../../research/canonical-ir/canonical-ir.js';
import { buildDunesCanonicalIr } from '../../research/canonical-ir/dunes-ir.js';
import { emitTypeGpuSource } from '../../research/canonical-ir/typegpu-emitter.js';

test('canonical constants preserve exact f64 identity including negative zero', () => {
  assert.equal(encodeF64(0), '0x0000000000000000');
  assert.equal(encodeF64(-0), '0x8000000000000000');

  const positive = new CanonicalIrBuilder({ name: 'zero', parameters: ['x'] });
  const positiveIr = positive.finish(positive.adapter.add(positive.inputs.x, positive.adapter.f(0)));
  const negative = new CanonicalIrBuilder({ name: 'zero', parameters: ['x'] });
  const negativeIr = negative.finish(negative.adapter.add(negative.inputs.x, negative.adapter.f(-0)));

  assert.notEqual(serializeCanonicalIr(positiveIr), serializeCanonicalIr(negativeIr));
  assert.notEqual(canonicalIrSha256(positiveIr), canonicalIrSha256(negativeIr));
  assert.ok(Object.is(evaluateCanonicalIr(negativeIr, { x: -0 }), -0));
});

test('recorder rejects float-to-lattice paths that do not come from floor', () => {
  const builder = new CanonicalIrBuilder({ name: 'badLattice', parameters: ['x'] });
  assert.throws(
    () => builder.adapter.latt(builder.inputs.x),
    /derive directly from floor/,
  );
});

test('dunes canonical IR is deterministic, valid, ordered, and semantically explicit', () => {
  const first = buildDunesCanonicalIr();
  const second = buildDunesCanonicalIr();
  assert.deepEqual(canonicalIrProblems(first), []);
  assert.equal(serializeCanonicalIr(first), serializeCanonicalIr(second));
  assert.equal(canonicalIrSha256(first), canonicalIrSha256(second));

  for (const node of first.nodes) {
    for (const argument of node.args ?? []) assert.ok(argument < node.id, `node ${node.id} -> ${argument}`);
  }
  const counts = canonicalIrOpCounts(first);
  assert.equal(counts.floor, 14, 'two floors for each of seven expanded vnoise calls');
  assert.equal(counts.latt, 14, 'every floor-derived axis becomes a lattice value');
  assert.equal(counts.hash01, 28, 'four integer hashes for each expanded vnoise call');
  assert.equal(counts.smooth, 2, 'dune mask plus landing-pad falloff');
  assert.ok(counts.cache > 0, 'cache boundaries remain explicit nodes');
  assert.equal(first.semantics.mix, 'a + (b - a) * t');
  assert.match(first.semantics.lattice, /floor-derived-value/);
  assert.match(first.semantics.hash01, /hashU32/);
});

test('IR f64 evaluation is bit-identical to authoritative and handwritten TypeGPU dunes at committed assay points', () => {
  const ir = buildDunesCanonicalIr();
  for (const { id, x, z } of makeAssayPoints(300)) {
    const authoritative = dunesField(numberAdapter, x, z);
    const recorded = evaluateCanonicalIr(ir, { x, z });
    assert.ok(Object.is(recorded, authoritative), `IR mismatch at ${id} (${x}, ${z})`);
    assert.ok(Object.is(recorded, typegpuDunes(x, z)), `handwritten TypeGPU mismatch at ${id} (${x}, ${z})`);
  }
});

test('IR f32 evaluation is bit-identical to the operation-wise f32 adapter at committed assay points', () => {
  const ir = buildDunesCanonicalIr();
  const f32 = makeF32Adapter();
  for (const { id, x, z } of makeAssayPoints(300)) {
    const authoritative = dunesField(f32, x, z);
    const recorded = evaluateCanonicalIrF32(ir, { x, z });
    assert.ok(Object.is(recorded, authoritative), `IR f32 mismatch at ${id} (${x}, ${z})`);
  }
});

test('generated dunes source executes identically and preserves the reviewable structural footprint', async () => {
  const ir = buildDunesCanonicalIr();
  const source = emitTypeGpuSource(ir);
  assert.equal(source, emitTypeGpuSource(buildDunesCanonicalIr()));
  assert.match(source, new RegExp(`canonical-ir-sha256: ${canonicalIrSha256(ir)}`));
  assert.match(source, /'use gpu'/);
  assert.match(source, /d\.u32\(/);
  assert.match(source, /typegpuHash01\(/);
  assert.match(source, /typegpuSmooth\(/);
  assert.match(source, /cache boundary/);
  assert.match(source, /0\.8138784566625339/);
  assert.match(source, /0\.5810351605373051/);

  const functionStart = source.indexOf('export function generatedDunes');
  const functionEnd = source.indexOf('\nexport const generatedDunesKernel');
  const functionSource = source
    .slice(functionStart, functionEnd)
    .replace('export function generatedDunes', 'function generatedDunes');
  const generatedDunes = Function(
    'd',
    'abs',
    'floor',
    'typegpuHash01',
    'typegpuSmooth',
    `${functionSource}\nreturn generatedDunes;`,
  )(
    d,
    abs,
    floor,
    typegpuHash01,
    typegpuSmooth,
  );
  for (const { id, x, z } of makeAssayPoints(300)) {
    assert.ok(
      Object.is(generatedDunes(x, z), typegpuDunes(x, z)),
      `generated TypeGPU direct-CPU mismatch at ${id} (${x}, ${z})`,
    );
  }

  const handwritten = await readFile(new URL('../../src/typegpu/fields.js', import.meta.url), 'utf8');
  const dunesStart = handwritten.indexOf('export function typegpuDunes');
  const dunesEnd = handwritten.indexOf('\n}\n', dunesStart);
  const handwrittenDunes = handwritten.slice(dunesStart, dunesEnd + 3);
  assert.equal((handwrittenDunes.match(/typegpuFbm2\(/g) ?? []).length, 2);
  assert.equal((handwrittenDunes.match(/typegpuFbm3\(/g) ?? []).length, 1);
  assert.equal((handwrittenDunes.match(/typegpuRidge\(/g) ?? []).length, 1);
  assert.equal((handwrittenDunes.match(/typegpuStamp\(/g) ?? []).length, 1);

  // The generated form deliberately expands those helpers, so semantic
  // bit-equality above plus this 2+1 FBM / ridge / stamp footprint is the
  // useful comparison. Textual AST equality would be misleading.
  const counts = canonicalIrOpCounts(ir);
  assert.equal(counts.hash01, 4 * (2 + 2 + 3));
});
