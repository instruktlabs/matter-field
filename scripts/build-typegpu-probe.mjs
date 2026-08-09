import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import typegpu from 'unplugin-typegpu/esbuild';
import { makeAssayPoints, sourceContentSha256 } from './build-gpu-probe.mjs';
import { buildTypegpu } from './build-typegpu.mjs';
import {
  typegpuDunes,
  typegpuSwell,
  typegpuWindX,
  typegpuWindZ,
} from '../src/typegpu/index.js';
import { numberAdapter } from '../src/number.js';
import { dunesField as adapterDunes } from '../examples/dunes.js';
import { swellField as adapterSwell } from '../examples/swell.js';
import { windField as adapterWind } from '../examples/wind.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIELD_IDENTITY = Object.freeze([
  'typegpuDunes(x,z)',
  'typegpuSwell(x,z,2.5)',
  'typegpuWindX(x,z,1)',
  'typegpuWindZ(x,z,1)',
]);
const ASSAY_SOURCES = Object.freeze([
  'src/hash.js',
  'src/adapter.js',
  'src/number.js',
  'src/noise.js',
  'src/typegpu/primitives.js',
  'src/typegpu/fields.js',
  'src/typegpu/three.js',
  'examples/dunes.js',
  'examples/swell.js',
  'examples/wind.js',
  'parity/typegpu-gpu-probe.js',
  'scripts/typegpu-probe-page.js',
  'scripts/build-typegpu.mjs',
  'scripts/build-typegpu-probe.mjs',
  'scripts/run-gpu-probe.mjs',
]);

function f64Hex(value) {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, value, false);
  return `${view.getUint32(0, false).toString(16).padStart(8, '0')}${view.getUint32(4, false).toString(16).padStart(8, '0')}`;
}

function cpuFieldBits(points) {
  return points.map(({ x, z }) => [
    f64Hex(typegpuDunes(x, z)),
    f64Hex(typegpuSwell(x, z, 2.5)),
    f64Hex(typegpuWindX(x, z, 1)),
    f64Hex(typegpuWindZ(x, z, 1)),
  ]);
}

function adapterFieldBits(points) {
  return points.map(({ x, z }) => {
    const wind = adapterWind(numberAdapter, x, z, 1);
    return [
      f64Hex(adapterDunes(numberAdapter, x, z)),
      f64Hex(adapterSwell(numberAdapter, x, z, 2.5)),
      f64Hex(wind.wx),
      f64Hex(wind.wz),
    ];
  });
}

async function makeIdentity(points, publishDir) {
  const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const threePackage = JSON.parse(await readFile(join(ROOT, 'node_modules', 'three', 'package.json'), 'utf8'));
  const typegpuPackage = JSON.parse(await readFile(join(ROOT, 'node_modules', 'typegpu', 'package.json'), 'utf8'));
  const bridgePackage = JSON.parse(await readFile(join(ROOT, 'node_modules', '@typegpu', 'three', 'package.json'), 'utf8'));
  const pluginPackage = JSON.parse(await readFile(join(ROOT, 'node_modules', 'unplugin-typegpu', 'package.json'), 'utf8'));
  const esbuildPackage = JSON.parse(await readFile(join(ROOT, 'node_modules', 'esbuild', 'package.json'), 'utf8'));
  const sourceManifest = await Promise.all(ASSAY_SOURCES.map(async (path) => ({
    path,
    sha256: sourceContentSha256(await readFile(join(ROOT, path), 'utf8')),
  })));
  const publishManifest = await Promise.all(['index.js', 'three.js'].map(async (path) => ({
    path: `dist-typegpu/${path}`,
    sha256: sourceContentSha256(await readFile(join(publishDir, path), 'utf8')),
  })));
  const coordinatePayload = {
    generator: 'matter-field-assay-points/v2',
    seed: '0x9e3779b9',
    extent: 20000,
    coordinateType: 'f32',
    composition: `${Math.min(points.length, 24)} adversarial + ${Math.max(0, points.length - 24)} deterministic LCG`,
    fields: FIELD_IDENTITY,
    points,
  };
  const identity = {
    schema: 'matter-field-typegpu-assay-set/v1',
    generator: coordinatePayload.generator,
    seed: coordinatePayload.seed,
    extent: coordinatePayload.extent,
    coordinateType: coordinatePayload.coordinateType,
    composition: coordinatePayload.composition,
    pointCount: points.length,
    fields: FIELD_IDENTITY,
    coordinatesSha256: createHash('sha256').update(JSON.stringify(coordinatePayload)).digest('hex'),
    valuesSha256: createHash('sha256').update(JSON.stringify(adapterFieldBits(points))).digest('hex'),
    typegpuCpuValuesSha256: createHash('sha256').update(JSON.stringify(cpuFieldBits(points))).digest('hex'),
    sourceSha256: createHash('sha256').update(JSON.stringify(sourceManifest)).digest('hex'),
    publishArtifactsSha256: createHash('sha256').update(JSON.stringify(publishManifest)).digest('hex'),
    packageVersion: packageJson.version,
    typegpuVersion: typegpuPackage.version,
    typegpuThreeVersion: bridgePackage.version,
    unpluginTypegpuVersion: pluginPackage.version,
    esbuildVersion: esbuildPackage.version,
    threeVersion: threePackage.version,
  };
  identity.sha256 = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  return identity;
}

export async function buildTypegpuProbe({ outDir, count = 300 } = {}) {
  const destination = resolve(outDir ?? join(ROOT, 'artifacts', 'gpu-probe', 'typegpu-webgpu'));
  const publishDir = await buildTypegpu({
    outDir: join(ROOT, 'dist-typegpu'),
    logLevel: 'silent',
  });
  const points = makeAssayPoints(count);
  const goldenSet = await makeIdentity(points, publishDir);
  await mkdir(destination, { recursive: true });
  await build({
    entryPoints: [join(ROOT, 'scripts', 'typegpu-probe-page.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile: join(destination, 'probe.js'),
    sourcemap: true,
    plugins: [typegpu()],
    logLevel: 'info',
    banner: {
      js: `globalThis.__MATTER_FIELD_PROBE_CONFIG__=${JSON.stringify({ points, goldenSet })};`,
    },
  });
  const bundleSha256 = sourceContentSha256(await readFile(join(destination, 'probe.js'), 'utf8'));
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="icon" href="data:,"><title>matter-field TypeGPU parity probe</title></head>
<body style="margin:0;background:#0b0d0e;color:#d4ff52;font:14px/1.5 ui-monospace,monospace">
<pre id="status" style="white-space:pre-wrap;padding:24px">running TypeGPU parity probe...</pre>
<script type="module" src="./probe.js"></script>
<script type="module">
  const status = document.querySelector('#status');
  const started = performance.now();
  while (!globalThis.__MATTER_FIELD_GPU_REPORT__ && performance.now() - started < 90000) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  status.textContent = JSON.stringify(globalThis.__MATTER_FIELD_GPU_REPORT__ ?? { error: 'probe timeout' }, null, 2);
</script>
</body></html>`;
  await writeFile(join(destination, 'index.html'), html, 'utf8');
  return { outDir: destination, points, goldenSet, bundleSha256 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildTypegpuProbe();
  console.log(`[matter-field] built TypeGPU probe at ${result.outDir}`);
  console.log(`[matter-field] golden set sha256 ${result.goldenSet.sha256}`);
}
