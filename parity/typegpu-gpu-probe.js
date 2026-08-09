// Native TypeGPU compute/readback receipt for the first-class TypeGPU spike.
// This intentionally does not route through Three: it tests TypeGPU's own
// resource and pipeline layer, then separately runs a Three bridge smoke.

import tgpu, { d } from 'typegpu';
import { WebGPURenderer } from 'three/webgpu';
import * as THREE from 'three/webgpu';
import * as tsl from 'three/tsl';
import { ulpDelta32 } from './golden.js';
import { hashU32 } from '../src/hash.js';
import { numberAdapter } from '../src/number.js';
import { dunesField as adapterDunes } from '../examples/dunes.js';
import { swellField as adapterSwell } from '../examples/swell.js';
import { windField as adapterWind } from '../examples/wind.js';
import {
  typegpuDunes,
  typegpuHashU32Kernel,
  typegpuKernels,
  typegpuSwell,
  typegpuWindX,
  typegpuWindZ,
} from '../dist-typegpu/index.js';
import {
  typegpuDunesNode,
  typegpuSerpentRadiusNode,
  typegpuSerpentSpineNode,
  typegpuSwellNode,
  typegpuWindNode,
} from '../dist-typegpu/three.js';

const FIELD_SPECS = Object.freeze([
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

function compareFields(points, cpu, gpu) {
  return FIELD_SPECS.map((spec, fieldIndex) => {
    let maxAbs = 0;
    let maxUlp = 0;
    let maxAbsSample = null;
    let maxUlpSample = null;
    let nonFiniteCount = 0;
    let firstNonFiniteSample = null;
    for (let i = 0; i < points.length; i++) {
      const want = cpu[i * 4 + fieldIndex];
      const got = gpu[i * 4 + fieldIndex];
      if (!Number.isFinite(want) || !Number.isFinite(got)) {
        nonFiniteCount++;
        firstNonFiniteSample ??= { ...points[i], cpu: want, gpu: got };
        continue;
      }
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
      finiteSamples: points.length - nonFiniteCount,
      nonFiniteCount,
      pass: nonFiniteCount === 0 && maxAbs <= spec.budget,
      maxAbsSample,
      maxUlpSample,
      firstNonFiniteSample,
    };
  });
}

function adapterInfo(adapter) {
  const info = adapter?.info ?? {};
  return {
    api: 'WebGPU',
    vendor: info.vendor || 'unknown',
    architecture: info.architecture || 'unknown',
    device: info.device || 'unknown',
    description: info.description || 'unknown',
  };
}

async function runNativeCompute(points) {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter was available to TypeGPU');
  const device = await adapter.requestDevice();
  const root = tgpu.initFromDevice({ device });

  try {
    const n = points.length;
    const inputValues = points.map((point) => d.vec2f(point.x, point.z));
    const input = root.createReadonly(d.arrayOf(d.vec2f, n), inputValues).$name('mfPoints');
    const output = root.createMutable(d.arrayOf(d.vec4f, n)).$name('mfOutputs');
    const pipeline = root.createGuardedComputePipeline((index) => {
      'use gpu';
      const point = input.$[index];
      output.$[index] = d.vec4f(
        typegpuKernels.dunes(point.x, point.y),
        typegpuKernels.swell(point.x, point.y, 2.5),
        typegpuKernels.windX(point.x, point.y, 1),
        typegpuKernels.windZ(point.x, point.y, 1),
      );
    }).$name('matterFieldAssay');

    const cpu = new Float64Array(n * 4);
    const typegpuCpu = new Float64Array(n * 4);
    let sourceMismatchCount = 0;
    let sourceNonFiniteCount = 0;
    let sourceMaxAbs = 0;
    let firstSourceMismatch = null;
    for (let i = 0; i < n; i++) {
      const x = Math.fround(points[i].x);
      const z = Math.fround(points[i].z);
      const wind = adapterWind(numberAdapter, x, z, 1);
      cpu[i * 4] = adapterDunes(numberAdapter, x, z);
      cpu[i * 4 + 1] = adapterSwell(numberAdapter, x, z, 2.5);
      cpu[i * 4 + 2] = wind.wx;
      cpu[i * 4 + 3] = wind.wz;
      typegpuCpu[i * 4] = typegpuDunes(x, z);
      typegpuCpu[i * 4 + 1] = typegpuSwell(x, z, 2.5);
      typegpuCpu[i * 4 + 2] = typegpuWindX(x, z, 1);
      typegpuCpu[i * 4 + 3] = typegpuWindZ(x, z, 1);
      for (let field = 0; field < 4; field++) {
        const want = cpu[i * 4 + field];
        const got = typegpuCpu[i * 4 + field];
        if (!Number.isFinite(want) || !Number.isFinite(got)) {
          sourceNonFiniteCount++;
          firstSourceMismatch ??= {
            ...points[i],
            field: FIELD_SPECS[field].name,
            adapter: want,
            typegpu: got,
            reason: 'non-finite source materialization',
          };
          continue;
        }
        const abs = Math.abs(want - got);
        sourceMaxAbs = Math.max(sourceMaxAbs, abs);
        if (!Object.is(want, got)) {
          sourceMismatchCount++;
          firstSourceMismatch ??= { ...points[i], field: FIELD_SPECS[field].name, adapter: want, typegpu: got, abs };
        }
      }
    }

    const started = performance.now();
    pipeline.dispatchThreads(n);
    const values = await output.read();
    const dispatchAndReadbackMs = performance.now() - started;
    const gpu = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      gpu[i * 4] = values[i].x;
      gpu[i * 4 + 1] = values[i].y;
      gpu[i * 4 + 2] = values[i].z;
      gpu[i * 4 + 3] = values[i].w;
    }

    const hashInput = root.createReadonly(
      d.arrayOf(d.vec4u, HASH_VECTORS.length),
      HASH_VECTORS.map((v) => d.vec4u(...v)),
    ).$name('mfHashInputs');
    const hashOutput = root.createMutable(d.arrayOf(d.u32, HASH_VECTORS.length)).$name('mfHashOutputs');
    const hashPipeline = root.createGuardedComputePipeline((index) => {
      'use gpu';
      const value = hashInput.$[index];
      hashOutput.$[index] = typegpuHashU32Kernel(value.x, value.y, value.z, value.w);
    }).$name('matterHashAssay');
    hashPipeline.dispatchThreads(HASH_VECTORS.length);
    const hashValues = await hashOutput.read();
    const hashSamples = HASH_VECTORS.map((inputValue, index) => {
      const cpuValue = hashU32(...inputValue);
      const gpuValue = hashValues[index];
      return { input: inputValue, cpu: cpuValue, gpu: gpuValue, exact: cpuValue === gpuValue };
    });

    return {
      adapter: adapterInfo(adapter),
      dispatchAndReadbackMs,
      fields: compareFields(points, cpu, gpu),
      hash: {
        bitExact: hashSamples.every((sample) => sample.exact),
        count: hashSamples.length,
        samples: hashSamples,
      },
      migration: {
        bitExactAtSampledPoints: sourceMismatchCount === 0 && sourceNonFiniteCount === 0,
        scalarCount: n * 4,
        mismatchCount: sourceMismatchCount,
        nonFiniteCount: sourceNonFiniteCount,
        maxAbs: sourceMaxAbs,
        firstMismatch: firstSourceMismatch,
        reference: 'existing adapter f64 oracle',
      },
    };
  } finally {
    root.destroy();
    device.destroy();
  }
}

function inspectThreeReadback(pixels, width, height) {
  const channels = 4;
  const bytesPerTexel = channels * pixels.BYTES_PER_ELEMENT;
  const rowStrideElements = Math.ceil((width * bytesPerTexel) / 256) * 256 / pixels.BYTES_PER_ELEMENT;
  const requiredElements = (height - 1) * rowStrideElements + width * channels;
  if (pixels.length < requiredElements) {
    throw new Error(`Three readback was too short: expected at least ${requiredElements}, got ${pixels.length}`);
  }

  let min = Infinity;
  let max = -Infinity;
  let spatiallyNonconstant = false;
  let firstPixel = null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * rowStrideElements + x * channels;
      const color = [pixels[index], pixels[index + 1], pixels[index + 2]];
      min = Math.min(min, ...color);
      max = Math.max(max, ...color);
      firstPixel ??= color;
      if (!spatiallyNonconstant && color.some((value, channel) => value !== firstPixel[channel])) {
        spatiallyNonconstant = true;
      }
    }
  }
  return {
    pass: spatiallyNonconstant,
    pixelArrayType: pixels.constructor.name,
    readbackElements: pixels.length,
    sampledPixels: width * height,
    rowStrideElements,
    spatiallyNonconstant,
    minChannel: min,
    maxChannel: max,
  };
}

async function runThreeBridgeSmoke() {
  const width = 32;
  const height = 32;
  const renderer = new WebGPURenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.domElement.hidden = true;
  document.body.appendChild(renderer.domElement);
  const target = new THREE.RenderTarget(width, height);
  try {
    await renderer.init();
    if (!renderer.backend?.isWebGPUBackend) throw new Error('@typegpu/three smoke did not initialize WebGPU');

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 2;
    const renders = [
      {
        name: 'dunes',
        color: (uv, p) => {
          const value = typegpuDunesNode(p.x, p.y).mul(0.025).add(0.5);
          return tsl.vec3(value, 0.25, 0.2);
        },
      },
      {
        name: 'swell',
        color: (uv, p) => {
          const value = typegpuSwellNode(p.x.mul(0.1), p.y.mul(0.1), uv.x.mul(4)).mul(0.2).add(0.5);
          return tsl.vec3(0.2, value, 0.35);
        },
      },
      {
        name: 'wind',
        color: (uv, p) => {
          const value = typegpuWindNode(p.x, p.y, uv.y.mul(2));
          return tsl.vec3(value.x.mul(0.05).add(0.2), value.y.mul(0.05).add(0.2), 0.4);
        },
      },
      {
        name: 'serpentSpine',
        color: (uv) => {
          const value = typegpuSerpentSpineNode(uv.x, uv.y.mul(4));
          return tsl.vec3(value.x.mul(0.01), value.y.mul(0.04).add(0.2), value.z.mul(0.04).add(0.5));
        },
      },
      {
        name: 'serpentRadius',
        color: (uv) => {
          const value = typegpuSerpentRadiusNode(uv.x).mul(0.15);
          return tsl.vec3(0.3, 0.25, value);
        },
      },
    ];
    const fields = [];
    for (const render of renders) {
      const scene = new THREE.Scene();
      const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
      const geometry = new THREE.PlaneGeometry(2, 2, 8, 8);
      const uv = tsl.uv();
      const p = uv.mul(800).sub(400);
      material.colorNode = render.color(uv, p);
      scene.add(new THREE.Mesh(geometry, material));
      try {
        await renderer.compileAsync(scene, camera);
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
        fields.push({ name: render.name, ...inspectThreeReadback(pixels, width, height) });
      } finally {
        geometry.dispose();
        material.dispose();
      }
    }
    return {
      pass: fields.every((field) => field.pass),
      backend: 'webgpu',
      adapterRelationship: 'separate Three renderer device; top-level adapter identity describes native TypeGPU compute only',
      criterion: 'each helper compiled and rendered spatially nonconstant valid pixels after excluding row padding; integration-only, not a numeric or finite-output assay',
      fields,
      compiledFields: fields.filter((field) => field.pass).map((field) => field.name),
    };
  } finally {
    renderer.setRenderTarget(null);
    target.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }
}

export async function runTypegpuProbe({ points, goldenSet }) {
  if (!navigator.gpu) throw new Error('WebGPU is unavailable; TypeGPU native execution requires WebGPU');
  if (!Array.isArray(points) || points.length === 0) throw new Error('TypeGPU probe requires points');

  const native = await runNativeCompute(points);
  const three = await runThreeBridgeSmoke();
  const pass = native.fields.every((field) => field.pass)
    && native.hash.bitExact
    && native.migration.bitExactAtSampledPoints
    && three.pass;
  return {
    schema: 'matter-field-typegpu-parity/v1',
    implementation: 'typegpu-first-class-spike',
    backend: 'webgpu',
    adapter: native.adapter,
    goldenSet,
    pointCount: points.length,
    sampleSemantics: `maximum observed over ${points.length} committed points; not a universal numeric bound`,
    dispatchAndReadbackMs: native.dispatchAndReadbackMs,
    pass,
    passCriterion: 'absolute drift in field units; ULP is diagnostic only; Three smoke is integration-only',
    fields: native.fields,
    hash: native.hash,
    migration: native.migration,
    three,
  };
}
