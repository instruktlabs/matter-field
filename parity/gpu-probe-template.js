// matter-field parity: real browser GPU assay.
//
// The filename is retained from the incubator extraction so the implementation
// is a reviewable replacement of the documented template. It now executes the
// same four scalar example outputs as the CPU assay through Three.js TSL on
// either WebGPU compute or the WebGL2 transform-feedback fallback.

import { StorageBufferAttribute, WebGPURenderer } from 'three/webgpu';
import * as tsl from 'three/tsl';
import { makeTslAdapter, makeTslHashU32 } from '../src/backend-tsl.js';
import { hashU32 } from '../src/hash.js';
import { numberAdapter } from '../src/number.js';
import { ulpDelta32 } from './golden.js';
import { dunesField } from '../examples/dunes.js';
import { swellField } from '../examples/swell.js';
import { windField } from '../examples/wind.js';

export const GPU_PROBE_STATUS = 'implemented - run npm run probe:gpu or npm run probe:webgl2';

export const FIELD_SPECS = Object.freeze([
  Object.freeze({ name: 'dunes', budget: 4e-3 }),
  Object.freeze({ name: 'swell-t2.5', budget: 1e-3 }),
  Object.freeze({ name: 'wind.wx-t1', budget: 1e-4 }),
  Object.freeze({ name: 'wind.wz-t1', budget: 1e-4 }),
]);

const HASH_VECTORS = Object.freeze([
  [0, 0, 0, 0],
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [131072, 131072, 0, 0],
  [131072, 131072, 1, 0],
  [131072, 131072, 0, 1],
  [131072, 131072, 1, 1],
  [262143, 1, 0, 0],
  [123456, 654321, 3, 22],
  [2147483647, 2147483647, 1, 1],
  [0xfffffffb, 0xfffffff9, 0, 0],
]);

function browserGpuInfo(renderer, actualBackend) {
  if (actualBackend === 'webgl2') {
    const gl = renderer.backend?.gl;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      api: 'WebGL2',
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl?.getParameter(gl.VENDOR) ?? '',
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) ?? '',
      version: gl?.getParameter(gl.VERSION) ?? '',
      shadingLanguageVersion: gl?.getParameter(gl.SHADING_LANGUAGE_VERSION) ?? '',
    };
  }
  return { api: 'WebGPU' };
}

function webGpuAdapterInfo(adapter) {
  const info = adapter?.info ?? {};
  return {
    vendor: info.vendor || 'unknown',
    architecture: info.architecture || 'unknown',
    device: info.device || 'unknown',
    description: info.description || 'unknown',
  };
}

function compareFields(points, cpu, gpu) {
  return FIELD_SPECS.map((spec, fieldIndex) => {
    let maxAbs = 0;
    let maxUlp = 0;
    let maxAbsSample = null;
    let maxUlpSample = null;
    for (let i = 0; i < points.length; i++) {
      const want = cpu[i * 4 + fieldIndex];
      const got = gpu[i * 4 + fieldIndex];
      const abs = Math.abs(want - got);
      const ulp = ulpDelta32(want, got);
      if (abs > maxAbs) {
        maxAbs = abs;
        maxAbsSample = { ...points[i], cpu: want, gpu: got, abs, ulp };
      }
      if (ulp > maxUlp) {
        maxUlp = ulp;
        maxUlpSample = { ...points[i], cpu: want, gpu: got, abs, ulp };
      }
    }
    return {
      ...spec,
      maxAbs,
      maxUlp,
      pass: maxAbs <= spec.budget,
      maxAbsSample,
      maxUlpSample,
    };
  });
}

async function runHashProbe(renderer) {
  const n = HASH_VECTORS.length;
  const inputArray = new Uint32Array(n * 4);
  HASH_VECTORS.forEach((v, i) => inputArray.set(v, i * 4));
  const inputAttribute = new StorageBufferAttribute(inputArray, 4);
  const outputAttribute = new StorageBufferAttribute(new Uint32Array(n), 1);
  const input = tsl.storage(inputAttribute, 'uvec4', n);
  const output = tsl.storage(outputAttribute, 'uint', n);
  const gpuHash = makeTslHashU32(tsl, { fnName: 'mfProbeHashU32' });
  const kernel = tsl.Fn(() => {
    const v = input.element(tsl.instanceIndex);
    output.element(tsl.instanceIndex).assign(gpuHash(v.x, v.y, v.z, v.w));
  })().compute(n);

  renderer.compute(kernel);
  const raw = await renderer.getArrayBufferAsync(outputAttribute);
  const gpu = new Uint32Array(raw, 0, n);
  const samples = HASH_VECTORS.map((v, i) => {
    const cpu = hashU32(...v);
    return { input: v, cpu, gpu: gpu[i], exact: cpu === gpu[i] };
  });
  return {
    bitExact: samples.every((s) => s.exact),
    count: samples.length,
    samples,
  };
}

/**
 * Execute the numeric parity assay in a real browser renderer.
 * Points must already be f32 coordinates so CPU and GPU receive identical
 * inputs and the report isolates expression-tree drift from upload rounding.
 */
export async function runGpuProbe({ backend = 'webgpu', points, goldenSet }) {
  if (!Array.isArray(points) || points.length === 0) throw new Error('GPU probe requires points');
  if (!['webgpu', 'webgl2'].includes(backend)) throw new Error(`Unsupported backend: ${backend}`);

  let selectedAdapter = null;
  let selectedDevice = null;
  if (backend === 'webgpu') {
    if (!navigator.gpu) throw new Error('WebGPU is not available in this browser');
    selectedAdapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
      featureLevel: 'compatibility',
    });
    if (!selectedAdapter) throw new Error('No WebGPU adapter was available');
    selectedDevice = await selectedAdapter.requestDevice({
      requiredFeatures: [...selectedAdapter.features],
    });
  }

  const renderer = new WebGPURenderer({
    antialias: false,
    forceWebGL: backend === 'webgl2',
    powerPreference: 'high-performance',
    ...(selectedDevice ? { device: selectedDevice } : {}),
  });
  renderer.setSize(16, 16);
  renderer.domElement.hidden = true;
  document.body.appendChild(renderer.domElement);
  await renderer.init();

  const actualBackend = renderer.backend?.isWebGPUBackend
    ? 'webgpu'
    : renderer.backend?.isWebGLBackend
      ? 'webgl2'
      : 'unknown';
  if (actualBackend !== backend) {
    renderer.dispose();
    renderer.domElement.remove();
    throw new Error(`Requested ${backend}, renderer initialized ${actualBackend}`);
  }

  const n = points.length;
  const coordinates = new Float32Array(n * 2);
  const cpu = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = Math.fround(points[i].x);
    const z = Math.fround(points[i].z);
    coordinates[i * 2] = x;
    coordinates[i * 2 + 1] = z;
    const wind = windField(numberAdapter, x, z, 1);
    cpu[i * 4] = dunesField(numberAdapter, x, z);
    cpu[i * 4 + 1] = swellField(numberAdapter, x, z, 2.5);
    cpu[i * 4 + 2] = wind.wx;
    cpu[i * 4 + 3] = wind.wz;
  }

  const inputAttribute = new StorageBufferAttribute(coordinates, 2);
  const outputAttribute = new StorageBufferAttribute(new Float32Array(n * 4), 4);
  const input = tsl.storage(inputAttribute, 'vec2', n);
  const output = tsl.storage(outputAttribute, 'vec4', n);
  const A = makeTslAdapter(tsl, { fnName: 'mfProbeHash01' });
  const kernel = tsl.Fn(() => {
    const point = input.element(tsl.instanceIndex);
    const wind = windField(A, point.x, point.y, A.f(1));
    output.element(tsl.instanceIndex).assign(tsl.vec4(
      dunesField(A, point.x, point.y),
      swellField(A, point.x, point.y, A.f(2.5)),
      wind.wx,
      wind.wz,
    ));
  })().compute(n);

  const t0 = performance.now();
  renderer.compute(kernel);
  const raw = await renderer.getArrayBufferAsync(outputAttribute);
  const dispatchAndReadbackMs = performance.now() - t0;
  const gpu = new Float32Array(raw, 0, n * 4);
  const fields = compareFields(points, cpu, gpu);
  const hash = await runHashProbe(renderer);
  const adapter = actualBackend === 'webgpu'
    ? { ...browserGpuInfo(renderer, actualBackend), ...webGpuAdapterInfo(selectedAdapter) }
    : browserGpuInfo(renderer, actualBackend);
  renderer.dispose();
  renderer.domElement.remove();
  selectedDevice?.destroy();

  return {
    schema: 'matter-field-gpu-parity/v2',
    backend: actualBackend,
    adapter,
    goldenSet,
    pointCount: n,
    sampleSemantics: `maximum observed over ${n} committed points; not a universal numeric bound`,
    dispatchAndReadbackMs,
    pass: fields.every((f) => f.pass) && hash.bitExact,
    passCriterion: 'absolute drift in field units; ULP is diagnostic only',
    fields,
    hash,
  };
}
