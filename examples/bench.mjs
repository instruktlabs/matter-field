// matter-field bench: total example-field consumer cost on this machine.
// Run: npm run bench
//
// This is a quick developer smoke, not publishable performance evidence. It
// does not isolate adapter overhead, compare a matched handwritten baseline,
// use fresh processes, counterbalance order, or report uncertainty. Treat its
// absolute numbers as machine-local diagnostics. The controlled harness under
// benchmarks/ is the path for reviewable comparisons.

import { numberAdapter, makeF32Adapter } from '../src/index.js';
import { evalWithGradient } from '../src/dual.js';
import { makeGoldenPoints } from '../parity/golden.js';
import { dunesField } from './dunes.js';

const N = 20000;
const points = makeGoldenPoints(N, { seed: 0xabcdef });

function time(label, fn) {
  let sink = 0;
  for (let i = 0; i < 500; i++) sink += fn(points[i % N]); // warmup
  const t0 = performance.now();
  for (const p of points) sink += fn(p);
  const ms = performance.now() - t0;
  if (!Number.isFinite(sink)) throw new Error('non-finite');
  console.log(`${label.padEnd(28)} ${((ms * 1000) / N).toFixed(2).padStart(7)} us/sample`);
}

const f32A = makeF32Adapter();
console.log(`matter-field bench - ${N} samples, example dunes field\n`);
time('number (f64 oracle)', (p) => dunesField(numberAdapter, p.x, p.z));
time('f32-emulated', (p) => dunesField(f32A, p.x, p.z));
time('dual (value + gradient)', (p) => evalWithGradient(dunesField, p.x, p.z).v);
