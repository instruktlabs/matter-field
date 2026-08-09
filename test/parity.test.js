// The assay kit, exercised end to end on the example fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCpuAssay, assayVerdict } from '../parity/harness.js';
import {
  f32Bits, ulpDelta32, makeGoldenPoints, captureGolden, compareToGolden, makeLcg,
} from '../parity/golden.js';
import { numberAdapter } from '../src/number.js';
import { dunesField } from '../examples/dunes.js';
import { swellField } from '../examples/swell.js';
import { windField } from '../examples/wind.js';
import { compareFields } from '../parity/gpu-probe-template.js';

test('ulp arithmetic: identities and known distances', () => {
  assert.equal(ulpDelta32(1.0, 1.0), 0);
  assert.equal(ulpDelta32(0, -0), 0); // orderable line maps both zeros to 0
  assert.equal(ulpDelta32(1.0, 1.0000001), 1); // next f32 after 1.0
  // Straddling zero: distance is the sum of each side's steps from zero.
  // Smallest f32 subnormals are 1 step each side -> 2 total.
  assert.equal(ulpDelta32(-1e-45, 1e-45), 2);
  // The corollary the assay design leans on: NORMAL values straddling zero
  // are astronomically many ulps apart even when absolutely tiny - which is
  // why the verdict budgets absolute drift, not ulps.
  assert.ok(ulpDelta32(-1e-20, 1e-20) > 1e6);
  assert.equal(f32Bits(1.0), 0x3f800000);
  assert.equal(f32Bits(-2.0), 0xc0000000);
});

test('golden points are deterministic across calls and seeds differ', () => {
  const a = makeGoldenPoints(10);
  const b = makeGoldenPoints(10);
  assert.deepEqual(a, b);
  const c = makeGoldenPoints(10, { seed: 999 });
  assert.notDeepEqual(a, c);
  const lcg = makeLcg(1);
  assert.equal(lcg(), makeLcg(1)());
});

test('capture/compare golden round-trips at zero ulp against itself', () => {
  const points = makeGoldenPoints(50);
  const sample = (x, z) => dunesField(numberAdapter, x, z);
  const golden = captureGolden(sample, points);
  const cmp = compareToGolden(sample, golden);
  assert.equal(cmp.maxUlp, 0);
  assert.equal(cmp.maxAbs, 0);
  assert.equal(cmp.n, 50);
});

test('compareToGolden detects a perturbed field', () => {
  const points = makeGoldenPoints(20);
  const sample = (x, z) => dunesField(numberAdapter, x, z);
  const golden = captureGolden(sample, points);
  const cmp = compareToGolden((x, z) => sample(x, z) + 1e-4, golden);
  assert.ok(cmp.maxUlp > 0);
  assert.ok(cmp.worst);
});

// Full assays. These are the package's own guarantee tiers applied to its
// own examples - if one regresses, the pattern (or an example) broke.
// Budgets are ABSOLUTE drift in field units over a +-20 km golden extent,
// set ~4x above the measured values (dunes 9.5e-4, swell 2.6e-4, wind
// 2.6e-5 on Node 22 x64) so real regressions fail and noise does not.
const FIELDS = [
  ['dunes', dunesField, 4e-3],
  ['swell', (A, x, z) => swellField(A, x, z, A.f(2.5)), 1e-3],
  ['wind.wx', (A, x, z) => windField(A, x, z, A.f(1)).wx, 1e-4],
  ['wind.wz', (A, x, z) => windField(A, x, z, A.f(1)).wz, 1e-4],
];

for (const [name, field, maxAbs] of FIELDS) {
  test(`assay: ${name} passes all tiers`, () => {
    const report = runCpuAssay(field, { points: makeGoldenPoints(300) });
    const verdict = assayVerdict(report, { maxAbs, maxGradMismatch: 0.05 });
    assert.ok(report.deterministic, 'deterministic');
    assert.ok(report.dual.bitExact, `dual bit-exact, worst: ${JSON.stringify(report.dual.worst)}`);
    assert.ok(
      report.gradient.mismatchFraction <= 0.05,
      `gradient mismatch ${report.gradient.mismatchFraction} (worst ${JSON.stringify(report.gradient.worst)})`,
    );
    assert.ok(verdict.pass, verdict.fails.join('; '));
    assert.ok(report.usPerSample < 1000, `implausible cost ${report.usPerSample}`);
  });
}

test('assay verdict fails loudly on a non-conformant field', () => {
  // A field with naked arithmetic: number backend works, dual backend NaNs -
  // exactly the drift the assay exists to catch.
  const cheat = (A, x, z) => A.mul(A.f(1), x + z);
  const report = runCpuAssay(cheat, { points: makeGoldenPoints(20) });
  assert.equal(report.dual.bitExact, false);
  const verdict = assayVerdict(report);
  assert.equal(verdict.pass, false);
});

test('GPU field comparison fails closed on non-finite output', () => {
  const points = [{ id: 'nan', x: 0, z: 0 }];
  const cpu = new Float64Array([1, 2, 3, 4]);
  const gpu = new Float32Array([Number.NaN, 2, 3, 4]);
  const fields = compareFields(points, cpu, gpu);
  assert.equal(fields[0].pass, false);
  assert.equal(fields[0].nonFiniteCount, 1);
  assert.equal(fields[0].finiteSamples, 0);
  assert.deepEqual(fields[0].firstNonFiniteSample, {
    id: 'nan', x: 0, z: 0, cpu: 1, gpu: Number.NaN,
  });
  assert.ok(fields.slice(1).every((field) => field.pass));
});

test('assay verdict fails closed on non-finite summaries', () => {
  const report = {
    deterministic: true,
    dual: { bitExact: true },
    f64VsF32: { maxAbs: Number.NaN, maxUlp: Number.NaN },
    gradient: { mismatchFraction: Number.NaN },
  };
  const verdict = assayVerdict(report, { maxUlp: 100 });
  assert.equal(verdict.pass, false);
  assert.deepEqual(verdict.fails, [
    'f32 drift is non-finite',
    'f32 ULP drift is non-finite',
    'gradient mismatch fraction is non-finite',
  ]);
});

test('CPU assay records and rejects a non-finite sampled materialization', () => {
  const isolatedNaN = (A, x, z) => {
    const value = A.add(x, z);
    return typeof value === 'number' && Object.is(value, 0) ? Number.NaN : value;
  };
  const report = runCpuAssay(isolatedNaN, {
    points: [{ id: 'bad', x: 0, z: 0 }, { id: 'good', x: 1, z: 2 }],
    benchN: 10,
  });
  assert.equal(report.f64VsF32.nonFiniteCount, 1);
  assert.deepEqual(report.f64VsF32.firstNonFinite, {
    id: 'bad', x: 0, z: 0, f64: Number.NaN, f32: Number.NaN,
  });
  const verdict = assayVerdict(report);
  assert.equal(verdict.pass, false);
  assert.match(verdict.fails.join('; '), /non-finite sampled materialization/u);
});

test('CPU assay records and rejects a non-finite gradient', () => {
  const malformedGradient = (A, x) => {
    const value = A.add(x, A.f(0));
    return typeof value === 'number' ? value : { ...value, dx: Number.NaN };
  };
  const report = runCpuAssay(malformedGradient, {
    points: [{ id: 'bad-gradient', x: 0, z: 0 }, { id: 'also-bad', x: 4, z: 0 }],
    benchN: 10,
  });
  assert.equal(report.gradient.nonFiniteCount, 2);
  assert.equal(report.gradient.firstNonFinite.id, 'bad-gradient');
  const verdict = assayVerdict(report);
  assert.equal(verdict.pass, false);
  assert.match(verdict.fails.join('; '), /gradient assay produced 2 non-finite/u);
});
