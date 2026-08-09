import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { makeGoldenPoints } from '../parity/golden.js';
import { cpuFieldBits } from '../scripts/cpu-browser-parity-core.js';

const EXPECTED_SHA256 = 'db340c484b206d57f05512bd04494731b976e93984368e9fb6d4d6d4bcbb68cc';

test('CPU field bits match the committed 300-point cross-runtime golden', () => {
  const points = makeGoldenPoints(300).map((point) => ({
    ...point,
    x: Math.fround(point.x),
    z: Math.fround(point.z),
  }));
  const actual = createHash('sha256')
    .update(JSON.stringify(cpuFieldBits(points)))
    .digest('hex');
  assert.equal(actual, EXPECTED_SHA256);
});
