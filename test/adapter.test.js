// Contract conformance for every bundled backend.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adapterProblems, numericAdapterProblems, ADAPTER_OPS } from '../src/adapter.js';
import { numberAdapter, makeF32Adapter } from '../src/number.js';
import { dualAdapter, dualInputs } from '../src/dual.js';

test('numberAdapter is structurally and numerically conformant', () => {
  assert.deepEqual(adapterProblems(numberAdapter), []);
  assert.deepEqual(numericAdapterProblems(numberAdapter), []);
});

test('f32 adapter is conformant within f32 tolerance', () => {
  const A = makeF32Adapter();
  assert.deepEqual(adapterProblems(A), []);
  assert.deepEqual(numericAdapterProblems(A, (v) => v, 1e-6), []);
});

test('dual adapter is conformant reading the value channel', () => {
  assert.deepEqual(adapterProblems(dualAdapter), []);
  assert.deepEqual(numericAdapterProblems(dualAdapter, (v) => (typeof v === 'number' ? v : v.v)), []);
});

test('a broken backend is caught, with the op named', () => {
  const bad = { ...numberAdapter, mul: (a, b) => a + b };
  const problems = numericAdapterProblems(bad);
  assert.ok(problems.some((p) => p.startsWith('mul(')), problems.join('; '));
  const missing = { ...numberAdapter };
  delete missing.smooth;
  assert.deepEqual(adapterProblems(missing), ['missing op: smooth']);
});

test('ADAPTER_OPS is the full 15-op contract', () => {
  assert.equal(ADAPTER_OPS.length, 15);
});

test('dual inputs seed unit derivatives on the right axes', () => {
  const { x, z } = dualInputs(3, 4);
  assert.deepEqual(x, { v: 3, dx: 1, dz: 0 });
  assert.deepEqual(z, { v: 4, dx: 0, dz: 1 });
});

test('dual product rule: d/dx (x*x) = 2x, d/dx (x*z) = z', () => {
  const { x, z } = dualInputs(3, 4);
  const xx = dualAdapter.mul(x, x);
  assert.equal(xx.v, 9);
  assert.equal(xx.dx, 6);
  const xz = dualAdapter.mul(x, z);
  assert.equal(xz.dx, 4);
  assert.equal(xz.dz, 3);
});

test('dual smooth: zero slope outside the window, 1.5/(e1-e0) at centre', () => {
  const mk = (v) => ({ v, dx: 1, dz: 0 });
  assert.equal(dualAdapter.smooth(0, 2, mk(-1)).dx, 0);
  assert.equal(dualAdapter.smooth(0, 2, mk(3)).dx, 0);
  // s'(0.5) = 6*0.5*0.5 = 1.5, chain rule / (e1-e0) = 2 -> 0.75
  assert.equal(dualAdapter.smooth(0, 2, mk(1)).dx, 0.75);
});

test('dual floor and hash are piecewise constant (zero derivative)', () => {
  const { x } = dualInputs(2.7, 0);
  assert.equal(dualAdapter.floor(x).dx, 0);
  const ix = dualAdapter.latt(dualAdapter.floor(x));
  const h = dualAdapter.hash01(ix, ix, 0, 0);
  assert.equal(h.dx, 0);
  assert.equal(h.dz, 0);
});

test('the dual backend catches naked arithmetic (the lint property)', () => {
  const { x, z } = dualInputs(1, 2);
  // A field that bypasses the adapter with a bare `+` produces NaN on duals.
  const broken = (A, a, b) => A.mul(A.f(1), a + b);
  const out = broken(dualAdapter, x, z);
  assert.ok(Number.isNaN(out.v));
});
