// matter-field demo: four fields, four walls, one contract.
// Run: npm run assay   (or: node examples/demo.mjs)

import { numberAdapter, makeF32Adapter, surfaceNormal } from '../src/index.js';
import { evalWithGradient, dualInputs, dualAdapter } from '../src/dual.js';
import { runCpuAssay, assayVerdict } from '../parity/harness.js';
import { dunesField, DUNES_PAD } from './dunes.js';
import { swellField, buoyancy } from './swell.js';
import { windField, applyWind } from './wind.js';
import { serpentSpine, spineHitTest } from './serpent.js';

const N = numberAdapter;
const f32A = makeF32Adapter();
const line = (s = '') => console.log(s);

line('matter-field demo - one contract, four fields, every backend\n');

// ---------------------------------------------------------------- 1. dunes
line('1. DUNES - terrain: one authored field, measured f64/f32 materialization drift');
for (const p of [
  { label: 'open sand', x: 1500, z: -2200 },
  { label: 'pad centre', x: DUNES_PAD.cx, z: DUNES_PAD.cz },
]) {
  const h = dunesField(N, p.x, p.z);
  const n = surfaceNormal(dunesField, p.x, p.z);
  line(`   ${p.label.padEnd(11)} h=${h.toFixed(4).padStart(9)}  normal=(${n.x.toFixed(3)}, ${n.y.toFixed(3)}, ${n.z.toFixed(3)})  [dual backend]`);
}

// ---------------------------------------------------------------- 2. swell
line('\n2. SWELL - animated water: buoyancy samples what the GPU displaces');
const boat = { x: 30, z: -12, yaw: 0.4, halfL: 6, halfW: 2 };
for (const t of [0, 1.25, 2.5]) {
  const b = buoyancy(N, boat, t);
  line(`   t=${t.toFixed(2).padStart(5)}s  heave=${b.heave.toFixed(3).padStart(7)}  pitch=${(b.pitch * 57.2958).toFixed(2).padStart(6)} deg  roll=${(b.roll * 57.2958).toFixed(2).padStart(6)} deg`);
}
line('   (same authored field and clock, no per-frame readback; GPU drift is measured separately)');

// ----------------------------------------------------------------- 3. wind
line('\n3. WIND - vector field: one tree for gameplay forces and GPU particle advection');
const glider = { x: 0, z: 0, vx: 0, vz: 0 };
for (let t = 0; t < 6; t += 0.5) applyWind(N, glider, t, 0.5);
line(`   glider after 6 s of the field: pos=(${glider.x.toFixed(1)}, ${glider.z.toFixed(1)}) vel=(${glider.vx.toFixed(2)}, ${glider.vz.toFixed(2)})`);
const w = windField(N, N.f(glider.x), N.f(glider.z), N.f(6));
line(`   wind where it ended up: (${w.wx.toFixed(2)}, ${w.wz.toFixed(2)}) units/s - CPU gameplay samples this authored field while the GPU materializes the same tree`);

// -------------------------------------------------------------- 4. serpent
line('\n4. SERPENT - closed-form creature: one trajectory for the body and hit test');
const onSpine = serpentSpine(N, N.f(0.7), N.f(2.0));
for (const shot of [
  { x: onSpine.x + 0.8, y: onSpine.y + 1.1, z: onSpine.z - 0.5 }, // grazes the body
  { x: 55, y: 4, z: 1.5 }, // wide
]) {
  const hit = spineHitTest(N, shot, 2.0);
  line(`   shot at (${shot.x.toFixed(1)}, ${shot.y.toFixed(1)}, ${shot.z.toFixed(1)}) vs spine at t=2.0s: dist=${hit.dist.toFixed(2)} u=${hit.u.toFixed(3)} -> ${hit.hit ? 'HIT' : 'miss'}`);
}
// Tangent frame from the dual backend: seed u in the first input channel.
const seed = dualInputs(0.8, 2.0);
const sp = serpentSpine(dualAdapter, seed.x, seed.z);
line(`   tangent at u=0.8 (analytic, dual backend): (${sp.x.dx.toFixed(2)}, ${sp.y.dx.toFixed(2)}, ${sp.z.dx.toFixed(2)})`);

// ---------------------------------------------------- TSL backend (optional)
try {
  const tsl = await import('three/tsl');
  const { makeTslAdapter } = await import('../src/backend-tsl.js');
  const A = makeTslAdapter(tsl);
  const g1 = dunesField(A, tsl.float(100), tsl.float(-200));
  const g2 = swellField(A, tsl.float(1), tsl.float(2), tsl.float(0.5));
  const g3 = windField(A, tsl.float(0), tsl.float(0), tsl.float(1));
  const g4 = serpentSpine(A, tsl.float(0.5), tsl.float(1));
  const kind = (n) => n?.nodeType ?? n?.constructor?.name;
  line(`\nTSL backend: built all four shader graphs (${kind(g1)}, ${kind(g2)}, {wx:${kind(g3.wx)}}, {x:${kind(g4.x)}})`);
} catch {
  line('\nTSL backend: three/tsl not installed here - skipped (npm i three to see it)');
}

// -------------------------------------------------------------- CPU assays
line('\nCPU assay (determinism, f32 drift, dual exactness, gradients, cost):');
const FIELDS = [
  ['dunes', dunesField],
  ['swell (t=2.5)', (A, x, z) => swellField(A, x, z, A.f(2.5))],
  ['wind.wx (t=1)', (A, x, z) => windField(A, x, z, A.f(1)).wx],
];
for (const [name, field] of FIELDS) {
  const r = runCpuAssay(field);
  const v = assayVerdict(r);
  line(
    `   ${name.padEnd(14)} ${v.pass ? 'PASS' : 'FAIL'}  f32 drift ${String(r.f64VsF32.maxUlp).padStart(3)} ulp ` +
    `(${r.f64VsF32.maxAbs.toExponential(1)})  dual bit-exact: ${r.dual.bitExact}  ` +
    `grad mismatch: ${(r.gradient.mismatchFraction * 100).toFixed(1)}%  ${r.usPerSample.toFixed(1)} us/sample` +
    (v.fails.length ? `  [${v.fails.join('; ')}]` : ''),
  );
}
