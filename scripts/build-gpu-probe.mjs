import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { makeGoldenPoints } from '../parity/golden.js';
import { cpuFieldBits } from './cpu-browser-parity-core.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIELD_IDENTITY = Object.freeze([
  'dunes',
  'swell(A,x,z,A.f(2.5))',
  'wind(A,x,z,A.f(1)).wx',
  'wind(A,x,z,A.f(1)).wz',
]);

const ASSAY_SOURCES = Object.freeze([
  'src/adapter.js',
  'src/number.js',
  'src/hash.js',
  'src/noise.js',
  'src/backend-tsl.js',
  'examples/dunes.js',
  'examples/swell.js',
  'examples/wind.js',
]);

const ADVERSARIAL_COORDINATES = Object.freeze([
  [0, 0], [Number.EPSILON, -Number.EPSILON], [-0, 0],
  [120, -340], [160, -340], [160.0001, -340], [210, -340], [210.0001, -340],
  [80, -340], [120, -300], [120, -380],
  [625, 625], [624.9999, 625.0001], [-625, -625],
  [250, -250], [249.9999, -249.9999],
  [12.5, -12.5], [12.49999, -12.50001],
  [90.90909, 357.14285], [-90.90909, -357.14285],
  [19999.999, 19999.999], [-19999.999, -19999.999], [20000, -20000], [-20000, 20000],
]);

function makeAssayPoints(count) {
  const fixed = ADVERSARIAL_COORDINATES.slice(0, count).map(([x, z], index) => ({
    id: `a${String(index).padStart(4, '0')}`,
    x: Math.fround(x),
    z: Math.fround(z),
  }));
  const random = makeGoldenPoints(Math.max(0, count - fixed.length)).map((point) => ({
    ...point,
    id: `r${point.id.slice(1)}`,
    x: Math.fround(point.x),
    z: Math.fround(point.z),
  }));
  return [...fixed, ...random];
}

export async function makeProbeGoldenSet(count = 300) {
  const points = makeAssayPoints(count);
  const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const threePackage = JSON.parse(await readFile(join(ROOT, 'node_modules', 'three', 'package.json'), 'utf8'));
  const sourceManifest = await Promise.all(ASSAY_SOURCES.map(async (path) => ({
    path,
    sha256: createHash('sha256').update(await readFile(join(ROOT, path))).digest('hex'),
  })));
  const coordinatePayload = {
    generator: 'matter-field-assay-points/v2',
    seed: '0x9e3779b9',
    extent: 20000,
    coordinateType: 'f32',
    composition: `${Math.min(count, ADVERSARIAL_COORDINATES.length)} adversarial + ${Math.max(0, count - ADVERSARIAL_COORDINATES.length)} deterministic LCG`,
    fields: FIELD_IDENTITY,
    points,
  };
  const coordinatesSha256 = createHash('sha256').update(JSON.stringify(coordinatePayload)).digest('hex');
  const valuesSha256 = createHash('sha256').update(JSON.stringify(cpuFieldBits(points))).digest('hex');
  const sourceSha256 = createHash('sha256').update(JSON.stringify(sourceManifest)).digest('hex');
  const identity = {
    schema: 'matter-field-assay-set/v2',
    generator: coordinatePayload.generator,
    seed: coordinatePayload.seed,
    extent: coordinatePayload.extent,
    coordinateType: coordinatePayload.coordinateType,
    composition: coordinatePayload.composition,
    pointCount: points.length,
    fields: FIELD_IDENTITY,
    coordinatesSha256,
    valuesSha256,
    sourceSha256,
    packageVersion: packageJson.version,
    threeVersion: threePackage.version,
  };
  identity.sha256 = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  return { points, identity };
}

export async function buildGpuProbe({ backend = 'webgpu', outDir, count = 300 } = {}) {
  const destination = resolve(outDir ?? join(ROOT, 'artifacts', 'gpu-probe', backend));
  const { points, identity } = await makeProbeGoldenSet(count);
  await mkdir(destination, { recursive: true });
  await build({
    entryPoints: [join(ROOT, 'scripts', 'gpu-probe-page.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile: join(destination, 'probe.js'),
    sourcemap: true,
    logLevel: 'info',
    banner: {
      js: `globalThis.__MATTER_FIELD_PROBE_CONFIG__=${JSON.stringify({ backend, points, goldenSet: identity })};`,
    },
  });
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="icon" href="data:,"><title>matter-field ${backend} parity probe</title></head>
<body style="margin:0;background:#0b0d0e;color:#d4ff52;font:14px/1.5 ui-monospace,monospace">
<pre id="status" style="white-space:pre-wrap;padding:24px">running ${backend} parity probe...</pre>
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
  return { outDir: destination, points, goldenSet: identity };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const arg = process.argv.find((value) => value.startsWith('--backend='));
  const backend = arg?.slice('--backend='.length) ?? 'webgpu';
  const result = await buildGpuProbe({ backend });
  console.log(`[matter-field] built ${backend} probe at ${result.outDir}`);
  console.log(`[matter-field] golden set sha256 ${result.goldenSet.sha256}`);
}
