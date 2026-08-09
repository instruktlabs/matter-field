// matter-field parity: GPU probe TEMPLATE (browser + WebGPU required).
//
// NOT runnable in a headless sandbox - this file documents the working method
// (proven in OBJEKT-62's Fence A lane, dev/bench-terrain-parity-gpu.mjs +
// dev/rd/terrain-parity/gpu-probe-entry.js, where it measured max 0.43 mm /
// 28 ulp CPU<->GPU divergence on NVIDIA Turing WebGPU) so a standalone repo
// can wire it to its own bundler + Playwright.
//
// Method:
//   1. Build the SAME field twice in the page: number backend for reference,
//      TSL backend for the graph.
//   2. Upload golden points as a storage buffer; evaluate the TSL field in a
//      WebGPU compute pass (one invocation per point) writing heights to an
//      output storage buffer.
//   3. Read the output buffer back, compare against the number backend with
//      ulpDelta32 / abs error, and emit a JSON report next to the CPU assay.
//
// Matrix to fill before making public parity claims (each row is one run of
// this probe): NVIDIA / AMD / Intel / Apple silicon, WebGPU; plus the WebGL2
// fallback if your engine has one. Metal (Apple) is the highest-value cell:
// its shader compiler defaults to fast-math and is the one documented
// sub-spec hazard class (gpuweb/gpuweb#2076).
//
// Sketch (Three.js r16x; adapt imports to the host app):
//
//   import { WebGPURenderer, StorageBufferAttribute } from 'three/webgpu';
//   import * as tsl from 'three/tsl';
//   import { makeTslAdapter } from 'matter-field/backend-tsl';
//   import { numberAdapter } from 'matter-field';
//   import { ulpDelta32 } from 'matter-field/parity/golden';
//
//   export async function runGpuProbe(field, points) {
//     const renderer = new WebGPURenderer();
//     await renderer.init();
//
//     const n = points.length;
//     const inArr = new Float32Array(n * 2);
//     points.forEach((p, i) => { inArr[i * 2] = p.x; inArr[i * 2 + 1] = p.z; });
//     const inAttr = new StorageBufferAttribute(inArr, 2);
//     const outAttr = new StorageBufferAttribute(new Float32Array(n), 1);
//
//     const { Fn, instanceIndex, storage } = tsl;
//     const probe = Fn(() => {
//       const A = makeTslAdapter(tsl);
//       const pts = storage(inAttr, 'vec2', n);
//       const out = storage(outAttr, 'float', n);
//       const p = pts.element(instanceIndex);
//       out.element(instanceIndex).assign(field(A, p.x, p.y));
//     })().compute(n);
//
//     await renderer.computeAsync(probe);
//     const gpu = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
//
//     return points.map((p, i) => {
//       const cpu = field(numberAdapter, p.x, p.z);
//       return { id: p.id, cpu, gpu: gpu[i],
//                ulp: ulpDelta32(cpu, gpu[i]), abs: Math.abs(cpu - gpu[i]) };
//     });
//   }
//
// Report fields worth keeping per run: adapter/GPU name (from
// navigator.gpu.requestAdapter() info), browser + version, OS, maxUlp,
// maxAbs, point count, field version/hash of the golden set.

export const GPU_PROBE_STATUS = 'template - requires browser + WebGPU; see file header';
