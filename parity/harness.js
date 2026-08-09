// matter-field parity: the CPU assay.
//
// Everything about a field that can be verified WITHOUT a GPU, in one call:
//
//   determinism   - re-evaluation is bit-identical (Tier 1 precondition)
//   f32 drift     - f64 oracle vs f32-emulated backend, in ulps and units
//                   (a CPU-side bound on the CPU<->GPU divergence to expect)
//   dual exactness- dual backend .v is BIT-identical to the number backend
//                   (proves the gradient rides the exact same field)
//   gradient truth- dual gradients vs central finite differences
//   cost          - microseconds per sample through the adapter
//
// The GPU half of the assay (real WGSL/GLSL through a compute pass) needs a
// browser/GPU and lives in gpu-probe-template.js (the incubator filename is
// retained so its replacement is an obvious reviewable diff).

import { numberAdapter, makeF32Adapter } from '../src/number.js';
import { evalWithGradient } from '../src/dual.js';
import { makeGoldenPoints, ulpDelta32 } from './golden.js';

/**
 * Run the full CPU assay on a field.
 *
 * @param {(A: object, x: any, z: any) => any} field  single-output field
 *        written against the adapter contract (returns V)
 * @param {object} [opts]
 *        points   - golden points (default: 500 generated, extent 20000)
 *        fdEps    - finite-difference epsilon in world units (default 0.01)
 *        benchN   - samples for the cost measurement (default 2000)
 * @returns assay report (plain serializable object)
 */
export function runCpuAssay(field, opts = {}) {
  const points = opts.points ?? makeGoldenPoints(500);
  const fdEps = opts.fdEps ?? 0.01;
  const benchN = opts.benchN ?? 2000;
  const f32A = makeF32Adapter();

  const sampleF64 = (x, z) => field(numberAdapter, x, z);
  const sampleF32 = (x, z) => field(f32A, x, z);

  // -- determinism: bit-identical re-evaluation
  let deterministic = true;
  for (const p of points.slice(0, 50)) {
    if (!Object.is(sampleF64(p.x, p.z), sampleF64(p.x, p.z))) {
      deterministic = false;
      break;
    }
  }

  // -- f64 vs f32-emulated drift
  let drift = { maxUlp: 0, maxAbs: 0, worst: null };
  for (const p of points) {
    const a = sampleF64(p.x, p.z);
    const b = sampleF32(p.x, p.z);
    const ulp = ulpDelta32(a, b);
    const abs = Math.abs(a - b);
    if (ulp > drift.maxUlp) {
      drift = { maxUlp: ulp, maxAbs: Math.max(drift.maxAbs, abs), worst: { ...p, f64: a, f32: b } };
    } else if (abs > drift.maxAbs) {
      drift.maxAbs = abs;
    }
  }

  // -- dual backend value exactness (bit-for-bit vs number backend)
  let dualBitExact = true;
  let dualWorst = null;
  for (const p of points) {
    const n = sampleF64(p.x, p.z);
    const d = evalWithGradient(field, p.x, p.z).v;
    if (!Object.is(n, d)) {
      dualBitExact = false;
      dualWorst = { ...p, number: n, dual: d };
      break;
    }
  }

  // -- dual gradients vs central finite differences.
  // Kinks (abs/min/max/clamp/smooth edges) give one-sided derivatives, so a
  // small fraction of points near a kink may legitimately disagree with a
  // straddling finite difference; report the mismatch fraction, not just max.
  let gradChecked = 0;
  let gradMismatch = 0;
  let gradWorst = { relErr: 0 };
  for (const p of points) {
    const g = evalWithGradient(field, p.x, p.z);
    const fdx = (sampleF64(p.x + fdEps, p.z) - sampleF64(p.x - fdEps, p.z)) / (2 * fdEps);
    const fdz = (sampleF64(p.x, p.z + fdEps) - sampleF64(p.x, p.z - fdEps)) / (2 * fdEps);
    const scale = Math.max(1, Math.abs(fdx), Math.abs(fdz));
    const relErr = Math.max(Math.abs(g.dx - fdx), Math.abs(g.dz - fdz)) / scale;
    gradChecked++;
    if (relErr > 0.05) gradMismatch++;
    if (relErr > gradWorst.relErr) gradWorst = { ...p, dual: { dx: g.dx, dz: g.dz }, fd: { dx: fdx, dz: fdz }, relErr };
  }

  // -- cost
  const benchPoints = makeGoldenPoints(benchN, { seed: 0x1234567 });
  for (let i = 0; i < 100; i++) sampleF64(benchPoints[i % benchN].x, benchPoints[i % benchN].z); // warmup
  let sink = 0;
  const t0 = performance.now();
  for (const p of benchPoints) sink += sampleF64(p.x, p.z);
  const t1 = performance.now();
  if (!Number.isFinite(sink)) throw new Error('field produced non-finite values during bench');

  return {
    schema: 'matter-field-cpu-assay/v1',
    n: points.length,
    deterministic,
    f64VsF32: { maxUlp: drift.maxUlp, maxAbs: drift.maxAbs, worst: drift.worst },
    dual: { bitExact: dualBitExact, worst: dualWorst },
    gradient: {
      checked: gradChecked,
      mismatchFraction: gradMismatch / Math.max(1, gradChecked),
      worst: gradWorst,
      fdEps,
    },
    usPerSample: ((t1 - t0) * 1000) / benchN,
  };
}

/**
 * One-line verdict for humans. Thresholds are the package's guarantee tiers:
 * determinism and dual bit-exactness must hold outright; f32 drift and
 * gradient mismatch have field-dependent budgets the caller sets.
 *
 * The float-drift budget is ABSOLUTE, in field units (`maxAbs`), because
 * that is the criterion games actually live by ("does collision disagree
 * with render by more than a millimetre"). Ulp counts are reported but
 * unbudgeted by default: near a zero crossing of the field, ulps shrink
 * toward zero, so a physically negligible absolute drift can measure as
 * thousands of ulps - budgeting ulps naively fails healthy fields at their
 * zero crossings. Pass `maxUlp` only when your field's range excludes zero.
 */
export function assayVerdict(report, { maxAbs = 0.01, maxUlp = null, maxGradMismatch = 0.05 } = {}) {
  const fails = [];
  if (!report.deterministic) fails.push('non-deterministic re-evaluation');
  if (!report.dual.bitExact) fails.push('dual backend diverges from number backend');
  if (report.f64VsF32.maxAbs > maxAbs) {
    fails.push(`f32 drift ${report.f64VsF32.maxAbs.toExponential(2)} units exceeds budget ${maxAbs}`);
  }
  if (maxUlp !== null && report.f64VsF32.maxUlp > maxUlp) {
    fails.push(`f32 drift ${report.f64VsF32.maxUlp} ulp exceeds budget ${maxUlp}`);
  }
  if (report.gradient.mismatchFraction > maxGradMismatch) {
    fails.push(`gradient mismatch fraction ${report.gradient.mismatchFraction.toFixed(3)} exceeds ${maxGradMismatch}`);
  }
  return { pass: fails.length === 0, fails };
}
