// Optional TSL smoke test: builds the shader graphs when three/tsl resolves.
// This proves the SAME field functions construct valid node graphs; actual
// GPU numeric parity needs the browser probe (parity/gpu-probe-template.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

let tsl = null;
try {
  tsl = await import('three/tsl');
} catch {
  // three not installed - the suite still passes; the demo says how to enable.
}

test('TSL backend builds graphs for every example field', { skip: !tsl ? 'three/tsl not installed' : false }, async () => {
  const { makeTslAdapter, makeTslHash } = await import('../src/backend-tsl.js');
  const { adapterProblems } = await import('../src/adapter.js');
  const { dunesField } = await import('../examples/dunes.js');
  const { swellField } = await import('../examples/swell.js');
  const { windField } = await import('../examples/wind.js');
  const { serpentSpine } = await import('../examples/serpent.js');

  const A = makeTslAdapter(tsl);
  assert.deepEqual(adapterProblems(A), []);

  const isNode = (n) => !!n && (n.isNode === true || typeof n.nodeType === 'string' || !!n.constructor?.name);

  const g1 = dunesField(A, tsl.float(100), tsl.float(-200));
  assert.ok(isNode(g1), 'dunes graph');

  const g2 = swellField(A, tsl.float(1), tsl.float(2), tsl.float(0.5));
  assert.ok(isNode(g2), 'swell graph');

  const g3 = windField(A, tsl.float(0), tsl.float(0), tsl.float(1));
  assert.ok(isNode(g3.wx) && isNode(g3.wz), 'wind graphs');

  const g4 = serpentSpine(A, tsl.float(0.5), tsl.float(1));
  assert.ok(isNode(g4.x) && isNode(g4.y) && isNode(g4.z), 'serpent graphs');

  // The hash factory alone also stands up (for raw use in user shaders).
  const hash = makeTslHash(tsl, { fnName: 'testHash' });
  const h = hash(tsl.uint(5), tsl.uint(9), 1, 0);
  assert.ok(isNode(h), 'hash graph');
});
